"""Member-owned chat uploads and explicit, reference-checked deletion."""
import uuid
import os
from datetime import datetime,timezone,timedelta
from pathlib import Path
from psycopg.types.json import Jsonb

from fastapi import HTTPException
from app.services.member_context import current_access
from app.storage.settings import postgres_enabled
from app.storage.workspace import current_workspace
from app.storage.database import connection
from app.storage import media


def quota_bytes():
    return max(1,int(os.getenv('CHAT_MEMBER_QUOTA_BYTES',str(1024**3))))


def usage(conn,owner):
    used=conn.execute('''SELECT coalesce(sum(greatest(size_bytes,coalesce((metadata->>'expected_bytes')::bigint,0))),0) AS bytes,
        count(*) AS count FROM assets WHERE metadata->>'chat_owner'=%s AND status<>'deleted' ''',(owner,)).fetchone()
    reserved=conn.execute('''SELECT coalesce(sum(size_bytes),0) AS bytes FROM chat_upload_reservations
        WHERE owner_id=%s AND expires_at>now()''',(owner,)).fetchone()['bytes']
    return {'used_bytes':int(used['bytes']),'reserved_bytes':int(reserved),'quota_bytes':quota_bytes(),
            'remaining_bytes':max(0,quota_bytes()-int(used['bytes'])-int(reserved)),'object_count':used['count']}


def audit(conn,action,asset_id,details=None):
    from app.services import authorization as az
    access=current_access.get()
    az.audit(conn,access.principal if access else None,action,asset_id,current_workspace(),details)


def _upload(files,owner):
    results=[]
    for file in files:
        name=Path(file.filename or 'attachment.bin').name
        path=Path(media.scratch_directory('input'))/(uuid.uuid4().hex+Path(name).suffix[:12])
        size=0
        asset_id='ast_'+uuid.uuid4().hex
        try:
            with path.open('xb') as stream:
                while chunk:=file.file.read(1024*1024):
                    size+=len(chunk)
                    if size>50*1024*1024:
                        raise HTTPException(413,f'{name} 超过 50 MB，无法上传。')
                    media.check_budget(len(chunk))
                    stream.write(chunk)
            if not size:
                raise HTTPException(400,f'{name} 是空文件。')
            asset=media.publish(path,name,asset_id=asset_id,role='chat-attachment',metadata={'chat_owner':owner,'chat_shared':False,'expected_bytes':size})
            with connection() as conn:
                audit(conn,'chat.attachment.uploaded',asset['id'],{'size_bytes':size})
            results.append({'url':media.stable_url(asset),'media_asset_id':asset['id'],'name':name,
                            'kind':asset['kind'],'size':size,'private':True})
        except Exception as exc:
            with connection() as conn:
                failed=conn.execute("UPDATE assets SET metadata=jsonb_set(metadata,'{chat_upload_failed}','true'::jsonb),updated_at=now() WHERE workspace_id=%s AND id=%s AND status='uploading' AND metadata->>'chat_owner'=%s RETURNING id",(current_workspace(),asset_id,owner)).fetchone()
                if failed: audit(conn,'chat.attachment.upload_failed',asset_id)
            if isinstance(exc,HTTPException): raise
            raise HTTPException(502,'附件上传失败，可在附件管理中清理残留文件后重试。') from exc
        finally:
            path.unlink(missing_ok=True)
            file.file.close()
    return {'files':results}


def cleanup_available(asset):
    return (asset['status'] in {'ready','deleting','deleted'} or
            (asset['status']=='uploading' and ((asset.get('metadata') or {}).get('chat_upload_failed') or
             asset['updated_at']<datetime.now(timezone.utc)-timedelta(hours=1))))


def member_id():
    access = current_access.get()
    if not postgres_enabled() or access is None:
        raise HTTPException(503, '私有附件管理需要 PostgreSQL 存储和成员登录。')
    return access.principal.member_id


def upload(files):
    owner = member_id()
    if not 1 <= len(files) <= 4:
        raise HTTPException(400, '每次最多上传 4 个附件。')
    total=0
    for file in files:
        file.file.seek(0,2); size=file.file.tell(); file.file.seek(0)
        if not 0<size<=50*1024*1024:
            raise HTTPException(413 if size else 400,'附件必须为非空文件，单文件不超过 50 MB。')
        total+=size
    reservation=uuid.uuid4()
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('chat-quota:'+owner,))
        conn.execute('DELETE FROM chat_upload_reservations WHERE owner_id=%s AND expires_at<=now()',(owner,))
        if total>usage(conn,owner)['remaining_bytes']:
            raise HTTPException(413,'个人附件容量不足，请先清理附件后再上传。')
        conn.execute('INSERT INTO chat_upload_reservations(id,owner_id,size_bytes) VALUES(%s,%s,%s)',(reservation,owner,total))
    try:
        return _upload(files,owner)
    finally:
        with connection() as conn:
            conn.execute('DELETE FROM chat_upload_reservations WHERE id=%s',(reservation,))


def list_owned(offset=0, limit=50, sort='newest', unreferenced=False):
    owner = member_id()
    with connection() as conn:
        summary=usage(conn,owner)
        order='a.size_bytes DESC,a.id DESC' if sort=='size' else 'a.created_at DESC,a.id DESC'
        rows=conn.execute('''SELECT a.id,a.display_name AS name,a.kind,a.size_bytes AS size,a.status,a.metadata,a.created_at,
            j.state AS deletion_state,j.attempts,j.last_error,j.available_at AS next_retry_at,a.updated_at
            FROM assets a LEFT JOIN chat_attachment_deletions j ON j.workspace_id=a.workspace_id AND j.asset_id=a.id
            WHERE a.workspace_id=%s AND a.role='chat-attachment' AND a.metadata->>'chat_owner'=%s
            AND a.status<>'deleted' ORDER BY '''+order,(current_workspace(),owner)).fetchall()
        from app.services.canvas_asset_purge import referenced_asset_ids
        references=referenced_asset_ids(conn)
        families=conn.execute('''WITH RECURSIVE family AS (
            SELECT id AS root_id,id FROM assets WHERE workspace_id=%s AND role='chat-attachment'
                AND metadata->>'chat_owner'=%s AND status<>'deleted'
            UNION SELECT f.root_id,a.id FROM assets a JOIN family f ON a.parent_asset_id=f.id WHERE a.workspace_id=%s)
            SELECT root_id,array_agg(id) AS ids FROM family GROUP BY root_id''',
            (current_workspace(),owner,current_workspace())).fetchall()
        referenced={f['root_id'] for f in families if references.intersection(f['ids'])}
        for row in rows:
            row['referenced']=row['id'] in referenced
        if unreferenced:
            rows=[row for row in rows if not row['referenced']]
    return {'files':[{'id':row['id'],'name':row['name'],'kind':row['kind'],'size':row['size'],
                     'status':row['status'],'shared':row['metadata'].get('chat_shared',False),
                     'referenced':row['referenced'],'deletion_state':row['deletion_state'],'attempts':row['attempts'] or 0,
                     'cleanup_available':cleanup_available(row),'upload_failed':bool(row['metadata'].get('chat_upload_failed')),
                     'last_error':row['last_error'] or '', 'next_retry_at':row['next_retry_at'].isoformat() if row['next_retry_at'] else None,
                     'url':media.stable_url({**row,'display_name':row['name']})} for row in rows[offset:offset+limit]],
            'usage':summary,'next_offset':offset+limit if len(rows)>offset+limit else None}


def _owned(conn, asset_id, owner):
    row = conn.execute('''SELECT * FROM assets WHERE workspace_id=%s AND id=%s
        AND role='chat-attachment' AND metadata->>'chat_owner'=%s FOR UPDATE''',
        (current_workspace(),asset_id,owner)).fetchone()
    if not row:
        raise HTTPException(404, '附件不存在或不属于当前成员。')
    return row


AUDIT_LABELS = {
    'chat.attachment.uploaded':'上传完成',
    'chat.attachment.upload_failed':'上传失败',
    'chat.attachment.shared':'共享给空间',
    'chat.attachment.unshared':'撤销共享',
    'chat.attachment.delete_requested':'请求彻底删除',
    'chat.attachment.delete_retry':'后台重试删除',
    'chat.attachment.deleted':'原文件清理完成',
    'chat.attachment.delete_replayed':'恢复备份后重放删除',
}


def list_audit(before=None,limit=50):
    """Only the owner's current-workspace events; never expose raw audit details."""
    owner=member_id()
    with connection() as conn:
        rows=conn.execute('''SELECT e.id,e.action,e.target_id,e.actor_id,e.created_at,e.details
            FROM management_events e WHERE e.workspace_id=%s AND e.action=ANY(%s)
            AND (%s::bigint IS NULL OR e.id<%s)
            AND (e.details->>'owner_id'=%s OR EXISTS (
                SELECT 1 FROM assets a WHERE a.workspace_id=e.workspace_id AND a.id=e.target_id
                    AND a.metadata->>'chat_owner'=%s))
            ORDER BY e.id DESC LIMIT %s''',
            (current_workspace(),list(AUDIT_LABELS),before,before,owner,owner,limit+1)).fetchall()
    events=[]
    for row in rows[:limit]:
        details=row['details'] or {}
        attempts=details.get('attempts')
        events.append({'id':str(row['id']),'action':row['action'],'label':AUDIT_LABELS[row['action']],
            'asset_id':row['target_id'],'created_at':row['created_at'].isoformat(),
            'actor':'后台任务' if row['actor_id'] is None else '本人' if row['actor_id']==owner else '空间成员',
            **({'attempts':attempts} if isinstance(attempts,int) and not isinstance(attempts,bool) and attempts>=0 else {})})
    return {'events':events,'next_before':str(rows[limit-1]['id']) if len(rows)>limit else None}


def _family(conn, asset_id):
    return conn.execute('''WITH RECURSIVE family AS (
        SELECT * FROM assets WHERE workspace_id=%s AND id=%s
        UNION SELECT a.* FROM assets a JOIN family f ON a.parent_asset_id=f.id WHERE a.workspace_id=%s)
        SELECT * FROM family ORDER BY id''', (current_workspace(),asset_id,current_workspace())).fetchall()


def share(asset_id, shared):
    owner = member_id()
    with connection() as conn:
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        row = _owned(conn,asset_id,owner)
        if row['status'] != 'ready':
            raise HTTPException(409, '附件尚未就绪或正在删除。')
        if not shared:
            from app.services.canvas_asset_purge import check_references
            check_references(conn,{a['id'] for a in _family(conn,asset_id)},{},ignored_document_kinds=('conversation',))
        ids = [asset['id'] for asset in _family(conn,asset_id)]
        conn.execute("UPDATE assets SET metadata=jsonb_set(metadata,'{chat_shared}',to_jsonb(%s::boolean)),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",
                     (shared,current_workspace(),ids))
        audit(conn,'chat.attachment.shared' if shared else 'chat.attachment.unshared',asset_id)
    return {'shared':shared}


def delete(asset_id, confirm=False):
    if not confirm:
        raise HTTPException(400, '请确认彻底删除附件。')
    owner = member_id()
    from app.services.canvas_asset_purge import check_references
    with connection() as conn:
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        row = _owned(conn,asset_id,owner)
        if row['status'] == 'deleted':
            return {'deleted':True}
        family = _family(conn,asset_id)
        if any(not cleanup_available(asset) for asset in family):
            raise HTTPException(409, '附件正在处理，请稍后重试。')
        check_references(conn,{asset['id'] for asset in family},{})
        conn.execute("UPDATE assets SET status='deleting',deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s) AND status<>'deleted'",
                     (current_workspace(),[asset['id'] for asset in family]))
        objects=[{**{key:a[key] for key in ('id','workspace_id','bucket','object_key','object_version_id')},
                  'unpublished':a['status']=='uploading'} for a in family if a['status']!='deleted']
        conn.execute('''INSERT INTO chat_attachment_deletions(workspace_id,asset_id,owner_id,objects)
            VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING''',(current_workspace(),asset_id,owner,Jsonb(objects)))
        audit(conn,'chat.attachment.delete_requested',asset_id)
    from app.services.chat_attachment_cleanup import process
    return process(asset_id,force=True)
