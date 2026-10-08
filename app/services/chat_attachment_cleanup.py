"""Durable deletion of exact object versions; independent of browser lifetime."""
import uuid
import re

from fastapi import HTTPException
from app.storage.database import connection
from app.storage.workspace import workspace_scope, current_workspace


def failure_reason(exc, stage):
    """Expose actionable categories without provider messages or object keys."""
    if stage == 'ledger':
        return '删除记录写入失败，请管理员检查独立账本配置及写入权限；后台会自动重试。'
    if isinstance(exc, PermissionError) or getattr(exc, 'status_code', None) in (401, 403):
        return '存储删除权限不足，请管理员检查对象存储授权；后台会自动重试。'
    if isinstance(exc, HTTPException) and exc.status_code == 409:
        return '对象版本或存储位置校验不通过，请管理员核对清理记录；后台会自动重试。'
    if isinstance(exc, (OSError, TimeoutError)):
        return '存储暂不可用，原文件清理未完成；后台会自动重试。'
    return '原文件清理未完成，请管理员检查存储服务；后台会自动重试。'


def delete_snapshot(asset):
    from app.services.canvas_asset_purge import delete_object
    if asset.get('object_version_id'):
        return delete_object(asset)
    if not asset.get('unpublished') or asset['workspace_id']!=current_workspace():
        raise HTTPException(409,'缺少固定版本，无法安全清理。')
    prefix='media/'+current_workspace()+'/'+asset['id']+'/'
    if not re.fullmatch(r'ast_[a-f0-9]{32}',asset['id']) or not asset['object_key'].startswith(prefix):
        raise HTTPException(409,'上传对象键不匹配，无法安全清理。')
    from app.storage import media
    storage=media.store()
    if isinstance(storage,media.TosStore):
        if asset['bucket']!=storage.bucket: raise HTTPException(409,'对象桶不匹配。')
        from app.storage.upload_cleanup import exact_versions
        for entry in exact_versions(storage,asset['object_key']):
            storage.client.delete_object(storage.bucket,entry['key'],version_id=entry['version'])
    else:
        if asset['bucket']!='local-simulation': raise HTTPException(409,'对象桶不匹配。')
        directory=storage.path(asset['object_key'],'0'*32).parent
        if directory.exists():
            for path in directory.iterdir():
                if not re.fullmatch(r'[a-f0-9]{32}',path.name) or not path.is_file() or path.is_symlink():
                    raise HTTPException(409,'上传对象目录包含未知文件，停止清理。')
                path.unlink(missing_ok=True)


def process(asset_id, force=False):
    token=uuid.uuid4()
    with connection() as conn:
        job=conn.execute('''UPDATE chat_attachment_deletions
            SET lease_token=%s,lease_until=now()+interval '5 minutes',attempts=attempts+1
            WHERE workspace_id=%s AND asset_id=%s AND state<>'succeeded'
            AND (lease_until IS NULL OR lease_until<now()) AND (%s OR available_at<=now()) RETURNING *''',
            (token,current_workspace(),asset_id,force)).fetchone()
    if not job:
        return {'pending':True}
    stage = 'ledger'
    try:
        from app.storage.deletion_ledger import write
        write(job)
        stage = 'objects'
        for asset in job['objects']:
            delete_snapshot(asset)
    except Exception as exc:
        with connection() as conn:
            conn.execute('''UPDATE chat_attachment_deletions SET state='retrying',last_error=%s,
                available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int),
                lease_token=NULL,lease_until=NULL WHERE workspace_id=%s AND asset_id=%s AND lease_token=%s''',
                (failure_reason(exc, stage),current_workspace(),asset_id,token))
            from app.services import authorization as az
            az.audit(conn,None,'chat.attachment.delete_retry',asset_id,current_workspace(),{'owner_id':job['owner_id'],'attempts':job['attempts']})
        raise HTTPException(503,'附件已停止访问，后台将自动重试原文件清理，也可在附件管理中重试删除。') from exc
    with connection() as conn:
        owned=conn.execute('''SELECT 1 FROM chat_attachment_deletions
            WHERE workspace_id=%s AND asset_id=%s AND lease_token=%s FOR UPDATE''',
            (current_workspace(),asset_id,token)).fetchone()
        if not owned:
            return {'pending':True}
        conn.execute("UPDATE assets SET status='deleted',display_name='',updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)",
                     (current_workspace(),[asset['id'] for asset in job['objects']]))
        conn.execute('''UPDATE chat_attachment_deletions SET state='succeeded',completed_at=now(),
            last_error='',lease_token=NULL,lease_until=NULL WHERE workspace_id=%s AND asset_id=%s''',
            (current_workspace(),asset_id))
        from app.services import authorization as az
        az.audit(conn,None,'chat.attachment.deleted',asset_id,current_workspace(),{'owner_id':job['owner_id'],'attempts':job['attempts']})
    return {'deleted':True}


def run_pending(limit=5):
    with connection() as conn:
        jobs=conn.execute('''SELECT workspace_id,asset_id FROM chat_attachment_deletions
            WHERE state<>'succeeded' AND available_at<=now() AND (lease_until IS NULL OR lease_until<now())
            ORDER BY available_at,asset_id LIMIT %s''',(limit,)).fetchall()
    results=[]
    for job in jobs:
        with workspace_scope(job['workspace_id']):
            try:
                results.append(process(job['asset_id']))
            except HTTPException:
                results.append({'pending':True})
    return results
