"""Managed online works; metadata changes never copy or regenerate media."""
import base64
import hashlib
import json
import math

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.services.member_context import current_access
from app.services import authorization as az


def is_canvas_task(task):
    return bool(task and (task.get('canvas_id') or (task.get('request') or {}).get('canvas_id')
                         or (task.get('legacy_metadata') or {}).get('canvas_id')))


def can_manage_all(conn):
    access = current_access.get()
    return not access or 'space.members.manage' in az.effective_permissions(conn, access.principal.member_id, current_workspace())


def authorize(conn, row):
    access = current_access.get()
    if access:
        az.require(conn, access.principal, 'asset.manage', current_workspace())
        if row['owner_id'] != access.principal.member_id and not can_manage_all(conn):
            raise HTTPException(403, '只能管理自己的作品；历史归属不明的作品请联系空间管理员')


def register(conn, history_id, value):
    if not isinstance(value, dict) or value.get('type') != 'online':
        return
    task = conn.execute('SELECT * FROM tasks WHERE workspace_id=%s AND id=%s',
                        (current_workspace(), history_id[5:] if history_id.startswith('task:') else '')).fetchone()
    if is_canvas_task(task):
        return
    access = current_access.get()
    owner = task['requested_by'] if task else access.principal.member_id if access else None
    from app.services.canvas_asset_catalog import aliases_for, key_for
    aliases = aliases_for(conn)
    for index, raw in enumerate(value.get('images') or []):
        url = raw if isinstance(raw, str) else raw.get('url') if isinstance(raw, dict) else None
        if not url:
            continue
        key = key_for(url, aliases)
        asset = conn.execute('SELECT id,status FROM assets WHERE workspace_id=%s AND id=%s', (current_workspace(), key)).fetchone()
        if asset and asset['status'] in {'deleting', 'deleted'}:
            continue
        snapshot = {k: value.get(k) for k in ('prompt','timestamp','type','model','provider_name','provider_id','params')}
        snapshot['images'] = [url]
        stamp = value.get('timestamp')
        stamp = float(stamp) if isinstance(stamp, (int,float)) and math.isfinite(stamp) and 0 <= stamp <= 32503680000 else None
        identity = f'{current_workspace()}:{history_id}:{index}'
        conn.execute('''INSERT INTO online_works(id,workspace_id,history_id,image_index,asset_id,task_id,owner_id,name,snapshot,created_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,coalesce(to_timestamp(%s),now())) ON CONFLICT DO NOTHING''',
            ('work_'+hashlib.md5(identity.encode()).hexdigest(),current_workspace(),history_id,index,
             asset['id'] if asset else None,task['id'] if task else None,owner,
             str(value.get('prompt') or '在线生成作品')[:100],Jsonb(snapshot),stamp))


def summary(conn):
    # Count each immutable asset once even if several entries refer to it.
    rows = conn.execute('''SELECT w.state,count(*) AS count FROM online_works w
        WHERE w.workspace_id=%s AND w.state<>'purged' GROUP BY w.state''', (current_workspace(),)).fetchall()
    counts = {r['state']:r['count'] for r in rows}
    usage = conn.execute('''WITH physical AS (
        SELECT a.id,a.size_bytes,CASE WHEN bool_or(w.state='saved') THEN 'saved'
          WHEN bool_or(w.state='inbox') THEN 'inbox' ELSE 'trash' END AS category
        FROM online_works w JOIN assets a ON a.workspace_id=w.workspace_id AND a.id=w.asset_id
        WHERE w.workspace_id=%s AND w.state<>'purged' AND a.status<>'deleted'
        GROUP BY a.id,a.size_bytes)
        SELECT category,coalesce(sum(size_bytes),0) AS bytes FROM physical GROUP BY category''', (current_workspace(),)).fetchall()
    return {'counts':counts,'bytes':{r['category']:int(r['bytes']) for r in usage},'automatic_cleanup':False}


def mark_library_saved(conn,value):
    from app.storage.media import referenced_ids
    ids=sorted(referenced_ids(value))
    if not ids: return
    access=current_access.get()
    restriction='' if can_manage_all(conn) else ' AND owner_id=%s'
    args=[current_workspace(),ids]
    if restriction: args.append(access.principal.member_id)
    conn.execute("UPDATE online_works SET state='saved',revision=revision+1,updated_at=now() WHERE workspace_id=%s AND asset_id=ANY(%s) AND state='inbox'"+restriction,args)


def page(state='inbox', q='', owner='all', folder='', model='', cursor=None, limit=30, references='all'):
    if state not in {'inbox','saved','trash'} or owner not in {'all','mine'} or references not in {'all','unreferenced','referenced'} or not 1 <= limit <= 100:
        raise HTTPException(400, '无效的收件箱筛选')
    q,folder,model = q.strip()[:200],folder.strip()[:80],model.strip()[:240]
    signature = [current_workspace(),state,q,owner,folder,model,references]
    access = current_access.get()
    signature.append(access.principal.member_id if access else None)
    clauses,args = ['w.workspace_id=%s'],[current_workspace()]
    clauses.append("w.state IN ('trash','purging')" if state=='trash' else 'w.state=%s')
    if state!='trash': args.append(state)
    if owner=='mine':
        clauses.append('w.owner_id=%s');args.append(access.principal.member_id if access else None)
    if q:
        clauses.append("strpos(lower(w.name || ' ' || coalesce(w.snapshot->>'prompt','') || ' ' || w.tags::text),lower(%s))>0");args.append(q)
    if folder: clauses.append('w.folder=%s');args.append(folder)
    if model: clauses.append("w.snapshot->>'model'=%s");args.append(model)
    if cursor:
        try:
            if len(cursor)>4000: raise ValueError()
            stamp,key,scope = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            if scope!=signature or not isinstance(key,str) or not isinstance(stamp,(int,float)) or not math.isfinite(stamp): raise ValueError()
            clauses.append('(w.created_at,w.id)<(to_timestamp(%s),%s)');args.extend([stamp,key])
        except (ValueError,TypeError,UnicodeError):
            raise HTTPException(400,'无效的收件箱分页游标') from None
    with connection() as conn:
        if references != 'all':
            # Build one reference snapshot per filtered request, before SQL pagination.
            # No per-card calls, media reads, or changes to tasks/documents/files.
            from app.services.online_inbox_references import matching_work_ids
            clauses.append('w.id=ANY(%s)')
            args.append(matching_work_ids(conn, references))
        admin = can_manage_all(conn)
        writable = not access or 'asset.manage' in az.effective_permissions(conn,access.principal.member_id,current_workspace())
        rows = conn.execute('''SELECT w.*,coalesce(nullif(m.display_name,''),m.username,'历史成员') AS owner_name,
            a.size_bytes,a.status AS asset_status FROM online_works w LEFT JOIN members m ON m.id=w.owner_id
            LEFT JOIN assets a ON a.workspace_id=w.workspace_id AND a.id=w.asset_id WHERE '''+' AND '.join(clauses)+
            ' ORDER BY w.created_at DESC,w.id DESC LIMIT %s', [*args,limit+1]).fetchall()
        stats = summary(conn)
        facets = conn.execute("SELECT DISTINCT folder,snapshot->>'model' AS model FROM online_works WHERE workspace_id=%s AND state<>'purged' LIMIT 500",(current_workspace(),)).fetchall()
    more = len(rows)>limit;rows=rows[:limit]
    next_cursor = base64.urlsafe_b64encode(json.dumps([rows[-1]['created_at'].timestamp(),rows[-1]['id'],signature]).encode()).decode() if more else None
    for row in rows:
        row['can_manage'] = bool(writable and (admin or (access and row['owner_id']==access.principal.member_id)))
        row['owner_name'] = row['owner_name'] if row['owner_id'] else '历史作品 · 归属待确认'
    return {'items':rows,'next_cursor':next_cursor,'summary':stats,
            'folders':sorted({r['folder'] for r in facets if r['folder']}),'models':sorted({r['model'] for r in facets if r['model']})}


def mutate(payload):
    action = payload['action']; items = payload['items'];metadata = payload.get('metadata') or {}
    if action=='purge':
        from app.services.online_inbox_purge import purge
        return purge(payload)
    with connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",('online-inbox:'+current_workspace(),))
        rows=[]
        for selected in sorted(items,key=lambda item:item['id']):
            row = conn.execute('SELECT * FROM online_works WHERE workspace_id=%s AND id=%s FOR UPDATE',(current_workspace(),selected['id'])).fetchone()
            if not row: raise HTTPException(404,'作品不存在')
            authorize(conn,row)
            if row['revision']!=selected['revision']: raise HTTPException(409,'作品已更新，请刷新后重试')
            if row['state'] in {'purging','purged'}: raise HTTPException(409,'作品正在清理或已彻底删除')
            if action=='restore' and row['state']!='trash': raise HTTPException(409,'作品不在回收站')
            if action=='save' and row['state']=='trash': raise HTTPException(409,'请先恢复作品')
            if row['asset_id']:
                from app.storage.media import lock_retained_references
                lock_retained_references(conn,row['asset_id'])
            rows.append(row)
        for row in rows:
            state = 'saved' if action=='save' else 'trash' if action=='trash' else row['previous_state'] if action=='restore' else row['state']
            previous = row['state'] if action=='trash' and row['state']!='trash' else row['previous_state']
            conn.execute('''UPDATE online_works SET state=%s,previous_state=%s,name=%s,folder=%s,tags=%s,
                trashed_at=CASE WHEN %s='trash' THEN coalesce(trashed_at,now()) ELSE NULL END,
                revision=revision+1,updated_at=now() WHERE workspace_id=%s AND id=%s''',
                (state,previous,metadata.get('name',row['name']),metadata.get('folder',row['folder']),Jsonb(metadata.get('tags',row['tags'])),state,current_workspace(),row['id']))
        access = current_access.get()
        if access: az.audit(conn,access.principal,'online.works.'+action,workspace=current_workspace(),details={'ids':[r['id'] for r in rows]})
    return {'changed':len(rows)}


def trash_history(timestamp):
    """Compatibility endpoint: online deletion now means recoverable recycling."""
    from app.storage.history import STAMP
    with connection() as conn:
        rows = conn.execute(f'''SELECT w.id,w.revision FROM online_works w JOIN workspace_documents d
            ON d.workspace_id=w.workspace_id AND d.id=w.history_id AND d.kind='history'
            WHERE w.workspace_id=%s AND w.state NOT IN ('purging','purged')
              AND abs(({STAMP.replace('value','d.value')})-%s)<0.001''',(current_workspace(),timestamp)).fetchall()
    if not rows: return False
    if len(rows)>200: raise HTTPException(400,'匹配作品过多，请使用收件箱分批管理')
    mutate({'action':'trash','items':rows})
    return True
