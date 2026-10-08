"""Member-owned chat uploads and explicit, reference-checked deletion."""
import uuid
from pathlib import Path

from fastapi import HTTPException
from app.services.member_context import current_access
from app.storage.settings import postgres_enabled
from app.storage.workspace import current_workspace
from app.storage.database import connection
from app.storage import media


def member_id():
    access = current_access.get()
    if not postgres_enabled() or access is None:
        raise HTTPException(503, '私有附件管理需要 PostgreSQL 存储和成员登录。')
    return access.principal.member_id


def upload(files):
    owner = member_id()
    if not 1 <= len(files) <= 4:
        raise HTTPException(400, '每次最多上传 4 个附件。')
    results = []
    for file in files:
        name = Path(file.filename or 'attachment.bin').name
        path = Path(media.scratch_directory('input')) / (uuid.uuid4().hex + Path(name).suffix[:12])
        size = 0
        try:
            with path.open('xb') as stream:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > 50 * 1024 * 1024:
                        raise HTTPException(413, f'{name} 超过 50 MB，无法上传。')
                    media.check_budget(len(chunk))
                    stream.write(chunk)
            if not size:
                raise HTTPException(400, f'{name} 是空文件。')
            asset = media.publish(path, name, role='chat-attachment',
                                  metadata={'chat_owner':owner, 'chat_shared':False})
            results.append({'url':media.stable_url(asset), 'media_asset_id':asset['id'],
                            'name':name, 'kind':asset['kind'], 'size':size, 'private':True})
        finally:
            path.unlink(missing_ok=True)
            file.file.close()
    return {'files':results}


def list_owned(offset=0, limit=50):
    owner = member_id()
    with connection() as conn:
        rows = conn.execute('''SELECT id,display_name AS name,kind,size_bytes AS size,status,metadata,created_at
            FROM assets WHERE workspace_id=%s AND role='chat-attachment' AND metadata->>'chat_owner'=%s
            AND status<>'deleted' ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s''',
            (current_workspace(),owner,limit+1,offset)).fetchall()
    return {'files':[{'id':row['id'],'name':row['name'],'kind':row['kind'],'size':row['size'],
                     'status':row['status'],'shared':row['metadata'].get('chat_shared',False),
                     'url':media.stable_url({**row,'display_name':row['name']})} for row in rows[:limit]],
            'next_offset':offset+limit if len(rows)>limit else None}


def _owned(conn, asset_id, owner):
    row = conn.execute('''SELECT * FROM assets WHERE workspace_id=%s AND id=%s
        AND role='chat-attachment' AND metadata->>'chat_owner'=%s FOR UPDATE''',
        (current_workspace(),asset_id,owner)).fetchone()
    if not row:
        raise HTTPException(404, '附件不存在或不属于当前成员。')
    return row


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
    return {'shared':shared}


def delete(asset_id, confirm=False):
    if not confirm:
        raise HTTPException(400, '请确认彻底删除附件。')
    owner = member_id()
    from app.services.canvas_asset_purge import check_references, delete_object
    with connection() as conn:
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        row = _owned(conn,asset_id,owner)
        if row['status'] == 'deleted':
            return {'deleted':True}
        family = _family(conn,asset_id)
        if any(asset['status'] not in {'ready','deleting','deleted'} for asset in family):
            raise HTTPException(409, '附件正在处理，请稍后重试。')
        check_references(conn,{asset['id'] for asset in family},{})
        conn.execute("UPDATE assets SET status='deleting',deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s) AND status<>'deleted'",
                     (current_workspace(),[asset['id'] for asset in family]))
    try:
        for asset in family:
            if asset['status'] != 'deleted':
                delete_object(asset)
    except Exception as exc:
        # Never report successful physical deletion while a storage version remains.
        raise HTTPException(503, '附件已停止访问，但原文件清理未完成，请在附件管理中重试删除。') from exc
    with connection() as conn:
        conn.execute("UPDATE assets SET status='deleted',display_name='',updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",
                     (current_workspace(),[asset['id'] for asset in family]))
    return {'deleted':True}
