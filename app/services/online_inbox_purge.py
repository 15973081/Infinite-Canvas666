"""Explicit release of terminal online outputs followed by versioned deletion.

No blanket exemption for historical tasks: request/input refs, canvas tasks,
backups and any other work/library refs continue to block deletion.
"""
import copy

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.services.member_context import current_access
from app.services import authorization as az
from app.services import online_inbox as inbox
from app.services.canvas_asset_catalog import aliases_for
from app.services.canvas_asset_purge import contains_ref, check_references, delete_object


def remove_outputs(result, ids, aliases):
    result = copy.deepcopy(result or {})
    images = result.get('images')
    if not isinstance(images,list): return result
    remaining = [item for item in images if not contains_ref(item,ids,aliases)]
    if len(remaining)!=len(images):
        result['images']=remaining
        result['media_expired']=True
        result['expired_image_count']=int(result.get('expired_image_count') or 0)+len(images)-len(remaining)
    return result


def release_outputs(conn, ids, aliases, history_ids, task_ids):
    workspace=current_workspace()
    for row in conn.execute('''SELECT * FROM tasks WHERE workspace_id=%s
            AND id=ANY(%s) AND kind='online-image' AND status='succeeded' AND canvas_id IS NULL
            AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY id FOR UPDATE''',(workspace,sorted(task_ids))):
        if inbox.is_canvas_task(row): continue
        result=remove_outputs(row['result'],ids,aliases)
        legacy=copy.deepcopy(row['legacy_metadata'])
        if isinstance(legacy.get('result'),dict): legacy['result']=remove_outputs(legacy['result'],ids,aliases)
        outputs=[key for key in row['output_asset_ids'] if key not in ids]
        if result!=row['result'] or legacy!=row['legacy_metadata'] or outputs!=row['output_asset_ids']:
            # Request, input IDs, fingerprint, requester and billing are untouched.
            conn.execute('''UPDATE tasks SET result=%s,legacy_metadata=%s,output_asset_ids=%s,updated_at=now()
                WHERE workspace_id=%s AND id=%s''',(Jsonb(result),Jsonb(legacy),Jsonb(outputs),workspace,row['id']))
    for row in conn.execute("SELECT id,value FROM workspace_documents WHERE workspace_id=%s AND kind='history' AND id=ANY(%s) FOR UPDATE",(workspace,sorted(history_ids))):
        value=remove_outputs(row['value'],ids,aliases)
        if value!=row['value']:
            conn.execute("UPDATE workspace_documents SET value=%s,revision=revision+1,updated_at=now() WHERE workspace_id=%s AND kind='history' AND id=%s",(Jsonb(value),workspace,row['id']))


def finish_files(assets):
    workspace=current_workspace()
    for asset in assets:
        if asset['status']!='deleted': delete_object(asset)
    with connection() as conn:
        conn.execute("UPDATE assets SET status='deleted',updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",(workspace,[a['id'] for a in assets]))
    from app.storage.uploads import cleanup
    result=cleanup(apply=True,asset_ids=[a['id'] for a in assets],limit=1000)
    if result['failed'] or result['remaining']:
        raise RuntimeError('正式文件已删除，上传暂存清理待重试')


def released_checkpoints(conn, task_ids):
    """Only after the last successful online output is explicitly released."""
    from app.storage import finalization,image_receipts
    assets=[]
    for task in conn.execute("SELECT * FROM tasks WHERE workspace_id=%s AND id=ANY(%s) AND status='succeeded' FOR UPDATE",(current_workspace(),sorted(task_ids))):
        if inbox.is_canvas_task(task) or (task['result'] or {}).get('images') or task['output_asset_ids']:
            continue
        if not (task['result'] or {}).get('media_expired'): continue
        keys=[finalization.source_id(task['id'])]+[image_receipts.asset_id(task['id'],i,kind) for i in range(8) for kind in ('upstream','result')]
        private=conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=ANY(%s) AND role='task-result-source' AND status IN ('ready','deleting','deleted')",(current_workspace(),keys)).fetchall()
        if not private: continue
        ids={a['id'] for a in private}
        legacy=copy.deepcopy(task['legacy_metadata'])
        if legacy.get('result_source_asset_id') in ids:
            legacy.pop('result_source_asset_id')
            conn.execute('UPDATE tasks SET legacy_metadata=%s WHERE workspace_id=%s AND id=%s',(Jsonb(legacy),current_workspace(),task['id']))
        assets.extend(private)
    return assets


def purge(payload):
    if not payload.get('confirm_permanent'): raise HTTPException(400,'请确认彻底删除；文件删除后无法恢复')
    items=payload['items'];selected_ids={item['id'] for item in items};workspace=current_workspace()
    groups={};external=[]
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('online-inbox:'+workspace,))
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        aliases=aliases_for(conn)
        rows=[]
        for item in sorted(items,key=lambda item:item['id']):
            row=conn.execute('SELECT * FROM online_works WHERE workspace_id=%s AND id=%s FOR UPDATE',(workspace,item['id'])).fetchone()
            if not row: raise HTTPException(404,'作品不存在')
            inbox.authorize(conn,row)
            if row['revision']!=item['revision']: raise HTTPException(409,'作品已更新，请刷新后重试')
            if row['state']=='purged': continue
            if row['state'] not in {'trash','purging'}: raise HTTPException(409,'请先移入回收站')
            rows.append(row)
            if row['asset_id']: groups.setdefault(row['asset_id'],{'rows':[]})['rows'].append(row)
            else: external.append(row)
        # Remove all selected works from the reference graph in the same transaction.
        conn.execute("UPDATE online_works SET state='purging',updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",(workspace,[r['id'] for r in rows]))
        for key,group in sorted(groups.items()):
            assets=conn.execute('''WITH RECURSIVE family AS (
                SELECT * FROM assets WHERE workspace_id=%s AND id=%s
                UNION SELECT a.* FROM assets a JOIN family f ON a.parent_asset_id=f.id WHERE a.workspace_id=%s)
                SELECT * FROM family ORDER BY id''',(workspace,key,workspace)).fetchall()
            if not assets or any(a['status'] not in {'ready','deleting','deleted'} for a in assets):
                raise HTTPException(409,'素材正在处理或不受平台托管，暂时无法清理')
            ids={a['id'] for a in assets}
            for other in conn.execute("SELECT id,state,name,snapshot,asset_id FROM online_works WHERE workspace_id=%s AND state<>'purged'",(workspace,)):
                if other['id'] not in selected_ids and (other['asset_id'] in ids or contains_ref(other['snapshot'],ids,aliases)):
                    raise HTTPException(409,f"素材仍被另一条作品「{other['name']}」引用，请先一起处理")
            history_ids={r['history_id'] for r in group['rows']}
            task_ids={r['task_id'] for r in group['rows'] if r['task_id']}
            release_outputs(conn,ids,aliases,history_ids,task_ids)
            assets.extend(released_checkpoints(conn,task_ids))
            ids={a['id'] for a in assets}
            # Refusal rolls back released outputs and purging state as well.
            check_references(conn,ids,aliases)
            conn.execute("UPDATE assets SET status='deleting',deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s) AND status<>'deleted'",(workspace,sorted(ids)))
            group['assets']=assets
        # External URLs are records only. Never delete files on remote hosts.
        for row in external:
            urls=set(row['snapshot'].get('images') or [])
            release_outputs(conn,urls,aliases,{row['history_id']},{row['task_id']} if row['task_id'] else set())
            conn.execute("UPDATE online_works SET state='purged',snapshot='{}'::jsonb,revision=revision+1,purged_at=now(),updated_at=now() WHERE workspace_id=%s AND id=%s",(workspace,row['id']))
        access=current_access.get()
        if access: az.audit(conn,access.principal,'online.works.purge_requested',workspace=workspace,details={'ids':[r['id'] for r in rows]})
    changed=len(external);failures=[];freed=0
    for key,group in groups.items():
        try:
            finish_files(group['assets'])
            with connection() as conn:
                conn.execute("UPDATE online_works SET state='purged',snapshot='{}'::jsonb,revision=revision+1,purged_at=now(),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",(workspace,[r['id'] for r in group['rows']]))
            changed+=len(group['rows'])
            freed+=sum(a['size_bytes'] or 0 for a in group['assets'] if a['status']!='deleted')
        except Exception:
            failures.append({'ids':[r['id'] for r in group['rows']],'message':'文件清理尚未完成，请刷新后重试；作品暂时不可恢复'})
    with connection() as conn:
        if access: az.audit(conn,access.principal,'online.works.purge',workspace=workspace,details={'changed':changed,'freed_bytes':freed,'failures':failures})
    return {'changed':changed,'freed_bytes':freed,'failures':failures,'records_only':len(external)}
