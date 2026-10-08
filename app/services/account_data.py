"""Self-service private data access across workspaces, bound to a verified member."""
import json
import os
from pathlib import Path
import re
import zipfile

from fastapi import HTTPException
from app.services import authorization as az
from app.services.member_context import access_scope
from app.storage import media
from app.storage.workspace import workspace_scope


RETAINED = [
    '共享画布、空间素材、已发布 Skill 和他人对话由各空间继续管理。',
    '费用账本、任务归属和必要审计记录独立保留，不因删除个人对话而消失。',
    '已下载或导出的副本、旧备份字节和模型供应商收到的内容需分别处理。',
]


def _member(conn,actor):
    if not isinstance(actor,az.Principal) or actor.audience!='workbench': az.fail('authentication_required',401)
    return az.active_member(conn,actor)


def summary(actor):
    with az.policy_transaction() as conn:
        profile=_member(conn,actor); owner=actor.member_id
        docs=conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(owner+'/',)).fetchone()['n']
        files=conn.execute("SELECT count(*) AS n,coalesce(sum(size_bytes),0) AS bytes FROM assets WHERE metadata->>'chat_owner'=%s AND status<>'deleted'",(owner,)).fetchone()
        spaces=conn.execute('''SELECT w.id,w.name,w.status FROM workspaces w WHERE w.id IN (
            SELECT workspace_id FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)
            UNION SELECT workspace_id FROM assets WHERE metadata->>'chat_owner'=%s AND status<>'deleted') ORDER BY w.id''',(owner+'/',owner)).fetchall()
    return {'member':{key:profile[key] for key in ('id','username','display_name','avatar')},
            'conversations':docs,'objects':files['n'],'bytes':int(files['bytes']),'workspaces':spaces,'retained':RETAINED}


def _json(value):
    return json.dumps(value,ensure_ascii=False,indent=2,default=lambda obj:obj.isoformat()).encode('utf-8')


def export(actor):
    """Build a complete ZIP in the response's temporary directory, or fail explicitly."""
    with az.policy_transaction() as conn:
        profile=_member(conn,actor)
        owner=actor.member_id
        docs=conn.execute("SELECT workspace_id,id,value,revision FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s) ORDER BY workspace_id,id",(owner+'/',)).fetchall()
        assets=conn.execute("SELECT * FROM assets WHERE metadata->>'chat_owner'=%s AND status<>'deleted' ORDER BY workspace_id,id",(owner,)).fetchall()
        preferences=conn.execute('SELECT workspace_id,skill_id,enabled FROM member_skill_preferences WHERE member_id=%s ORDER BY workspace_id,skill_id',(owner,)).fetchall()
    from app.storage.deletion_ledger import document_blocked
    docs=[doc for doc in docs if not document_blocked(doc['workspace_id'],doc['id'])]
    # No omissions presented as a complete export: uploads and pending deletes require retry.
    if any(a['status']!='ready' or a['deleted_at'] for a in assets):
        raise HTTPException(409,'附件仍在上传或清理，请完成处理后重新导出。')
    manifest={'version':1,'member':{key:profile[key] for key in ('id','username','display_name','avatar')},
              'conversations':len(docs),'attachments':[],'preferences':preferences,'retained':RETAINED}
    document_bytes=_json(docs)
    limit=max(1,int(os.getenv('ACCOUNT_EXPORT_MAX_BYTES',str(5*1024**3))))
    total=len(document_bytes)+sum(a['size_bytes'] for a in assets)
    if total>limit:
        raise HTTPException(413,'个人导出超过服务器单次导出容量，请联系管理员进行完整导出。')
    media.check_budget(total*2+1024*1024)
    root=media.operation()['root']; output=root/'personal-data.zip'
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,allowZip64=True) as archive:
        archive.writestr('conversations.json',document_bytes)
        for snapshot in assets:
            with workspace_scope(snapshot['workspace_id']),access_scope(actor,snapshot['workspace_id'],()):
                with az.policy_transaction() as conn:
                    _member(conn,actor)
                    current=media.get_asset(snapshot['id'])
                    if current['metadata'].get('chat_owner')!=owner or current['object_version_id']!=snapshot['object_version_id']:
                        raise HTTPException(409,'附件已变化，请重新导出。')
                path=root/(snapshot['id']+'.download')
                try:
                    media.store().download(snapshot,path)
                    size,digest=media.file_digest(path)
                except HTTPException: raise
                except Exception as exc:
                    raise HTTPException(502,'读取附件失败，未生成完整导出，请稍后重试。') from exc
                if size!=snapshot['size_bytes'] or digest!=snapshot['sha256']:
                    raise HTTPException(502,'附件校验失败，未生成完整导出。')
                suffix=Path(snapshot['display_name']).suffix
                if not re.fullmatch(r'\.[A-Za-z0-9]{1,10}',suffix): suffix='.bin'
                name='attachments/'+snapshot['id']+suffix.lower()
                archive.write(path,name); path.unlink()
                manifest['attachments'].append({'id':snapshot['id'],'workspace_id':snapshot['workspace_id'],
                    'name':snapshot['display_name'],'role':snapshot['role'],'shared':bool(snapshot['metadata'].get('chat_shared')),
                    'path':name,'size_bytes':size,'sha256':digest})
        archive.writestr('manifest.json',_json(manifest))
    # Revalidate source identities and deletions before publishing the ZIP response.
    with az.policy_transaction() as conn:
        _member(conn,actor)
        for doc in docs:
            row=conn.execute("SELECT revision FROM workspace_documents WHERE workspace_id=%s AND kind='conversation' AND id=%s",(doc['workspace_id'],doc['id'])).fetchone()
            if not row or row['revision']!=doc['revision']:
                raise HTTPException(409,'对话已变化，请重新导出。')
        for snapshot in assets:
            row=conn.execute('SELECT * FROM assets WHERE id=%s AND workspace_id=%s',(snapshot['id'],snapshot['workspace_id'])).fetchone()
            from app.storage.deletion_ledger import blocked
            if (not row or row['status']!='ready' or row['deleted_at'] or row['metadata'].get('chat_owner')!=owner
                or row['object_version_id']!=snapshot['object_version_id'] or blocked(row)):
                raise HTTPException(409,'附件已变化或删除，请重新导出。')
        az.audit(conn,actor,'account.data.export_prepared',owner,details={'conversations':len(docs),'objects':len(assets),'bytes':total})
    return output
