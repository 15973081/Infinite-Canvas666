"""Confirmed account closure, private deletion and replay without deleting shared work."""
import hashlib
import hmac

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az,members,chat_attachments
from app.storage import deletion_ledger as ledger
from app.storage.workspace import workspace_scope

CONFIRMATION='注销并删除本人数据'


def apply_record(conn,record):
    """The authoritative accepted intent also repairs an interrupted DB commit."""
    owner=record['owner_id']
    if conn.execute('SELECT 1 FROM account_closures WHERE member_id=%s',(owner,)).fetchone(): return
    if not conn.execute('SELECT 1 FROM members WHERE id=%s FOR UPDATE',(owner,)).fetchone(): return
    for attachment in record['attachments']:
        for snapshot in attachment['objects']:
            row=conn.execute('SELECT * FROM assets WHERE id=%s FOR UPDATE',(snapshot['id'],)).fetchone()
            if row and (row['workspace_id']!=snapshot['workspace_id'] or row['metadata'].get('chat_owner')!=owner
                or row['object_key']!=snapshot['object_key'] or row['bucket']!=snapshot['bucket']
                or (snapshot.get('object_version_id') and row['object_version_id']!=snapshot['object_version_id'])):
                raise HTTPException(409,'注销对象版本不匹配，需要管理员核对。')
        ids=[s['id'] for s in attachment['objects']]
        conn.execute("UPDATE assets SET status='deleting',deleted_at=coalesce(deleted_at,now()),metadata=jsonb_set(metadata,'{chat_shared}','false'::jsonb),updated_at=now() WHERE id=ANY(%s) AND status<>'deleted'",(ids,))
        conn.execute('''INSERT INTO chat_attachment_deletions(workspace_id,asset_id,owner_id,objects)
            VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
            (attachment['workspace_id'],attachment['asset_id'],owner,Jsonb(attachment['objects'])))
    conn.execute("DELETE FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(owner+'/',))
    conn.execute('DELETE FROM member_skill_preferences WHERE member_id=%s',(owner,))
    conn.execute('DELETE FROM canvas_draft_copies WHERE member_id=%s',(owner,))
    conn.execute('DELETE FROM member_presence_sockets WHERE member_id=%s',(owner,))
    conn.execute('DELETE FROM canvas_page_reports WHERE member_id=%s',(owner,))
    conn.execute("UPDATE canvas_transfer_requests SET status='rejected',resolved_at=now() WHERE member_id=%s AND status='pending'",(owner,))
    conn.execute('''UPDATE canvas_edit_leases SET generation=generation+1,member_id=NULL,member_auth_version=NULL,
        login_session_id=NULL,edit_session_id=NULL,token_hash=NULL,expires_at=NULL,released_at=now() WHERE member_id=%s''',(owner,))
    conn.execute('DELETE FROM workspace_member_roles WHERE member_id=%s',(owner,))
    conn.execute('DELETE FROM workspace_members WHERE member_id=%s',(owner,))
    conn.execute('DELETE FROM platform_member_roles WHERE member_id=%s',(owner,))
    conn.execute("UPDATE prompt_skills SET uploader_name='已注销成员' WHERE uploader_id=%s",(owner,))
    conn.execute('UPDATE member_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE member_id=%s',(owner,))
    conn.execute('UPDATE member_activations SET consumed_at=coalesce(consumed_at,now()) WHERE member_id=%s',(owner,))
    index=0
    while True:
        alias='closed_'+hashlib.sha256((owner+':'+str(index)).encode()).hexdigest()[:32]
        if not conn.execute('SELECT 1 FROM members WHERE lower(username)=lower(%s) AND id<>%s',(alias,owner)).fetchone(): break
        index+=1
    conn.execute('''UPDATE members SET status='closed',closed_at=coalesce(closed_at,now()),username=%s,
        display_name='已注销成员',avatar='',password_salt=NULL,password_digest=NULL,auth_version=auth_version+1 WHERE id=%s''',
        (alias,owner))
    conn.execute('INSERT INTO account_closures(member_id) VALUES(%s) ON CONFLICT DO NOTHING',(owner,))
    az.audit(conn,None,'account.closed',owner,details={'owner_id':owner,'attachments':len(record['attachments'])})


def close(actor,password,confirmation):
    if confirmation!=CONFIRMATION: raise HTTPException(400,'请输入“'+CONFIRMATION+'”确认注销。')
    if not isinstance(actor,az.Principal) or actor.audience!='workbench': az.fail('authentication_required',401)
    owner=actor.member_id
    with az.policy_transaction(change=True) as conn:
        az.active_member(conn,actor)
        attempt=conn.execute('''INSERT INTO member_login_attempts VALUES(%s,1,now()+interval '5 minutes')
            ON CONFLICT(key) DO UPDATE SET count=CASE WHEN member_login_attempts.expires_at<=now() THEN 1 ELSE member_login_attempts.count+1 END,
            expires_at=CASE WHEN member_login_attempts.expires_at<=now() THEN now()+interval '5 minutes' ELSE member_login_attempts.expires_at END RETURNING count''',
            ('closure:'+owner,)).fetchone()['count']
    if attempt>10: raise HTTPException(429,'注销密码核对次数过多，请五分钟后重试。')
    with az.policy_transaction(change=True) as conn:
        az.active_member(conn,actor)
        from app.services.maintenance_control import ensure
        ensure(conn,None,'write')
        row=conn.execute('SELECT * FROM members WHERE id=%s FOR UPDATE',(owner,)).fetchone()
        candidate=members.password_hash(password,row['password_salt'])[1]
        if not hmac.compare_digest(candidate,row['password_digest']): raise HTTPException(403,'账号密码不正确。')
        # Administrator protection is evaluated before writing irreversible deletion intent.
        conn.execute("UPDATE members SET status='closed' WHERE id=%s",(owner,))
        az.assert_administrators(conn)
        if (conn.execute("SELECT 1 FROM tasks WHERE requested_by=%s AND status IN ('queued','running','submitting','polling','finalizing') LIMIT 1",(owner,)).fetchone()
            or conn.execute("SELECT 1 FROM ai_chat_calls WHERE member_id=%s AND status='pending' LIMIT 1",(owner,)).fetchone()
            or conn.execute("SELECT 1 FROM backup_jobs WHERE member_id=%s AND status IN ('queued','running') LIMIT 1",(owner,)).fetchone()):
            raise HTTPException(409,'仍有进行中的生成、对话或备份任务，请完成或核对后再注销。')
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        # Remove only the owner's conversations inside this transaction; blockers roll this back.
        conn.execute("DELETE FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(owner+'/',))
        roots=conn.execute("SELECT * FROM assets WHERE role='chat-attachment' AND metadata->>'chat_owner'=%s AND status<>'deleted' ORDER BY workspace_id,id",(owner,)).fetchall()
        attachments=[]
        from app.services.canvas_asset_purge import check_references
        for root in roots:
            with workspace_scope(root['workspace_id']):
                family=chat_attachments._family(conn,root['id'])
                if any(not chat_attachments.cleanup_available(a) or a['metadata'].get('chat_owner')!=owner for a in family):
                    raise HTTPException(409,'附件仍在处理或归属不一致，请先在附件管理中完成处理。')
                try: check_references(conn,{a['id'] for a in family},{})
                except HTTPException as exc:
                    raise HTTPException(409,'本人附件 '+root['id']+' 仍被共享资源或他人对话引用，请先处理引用或联系空间管理员完成交接。') from exc
                existing=conn.execute('SELECT objects FROM chat_attachment_deletions WHERE workspace_id=%s AND asset_id=%s',
                                      (root['workspace_id'],root['id'])).fetchone()
                objects=existing['objects'] if existing else [{**{k:a[k] for k in ('id','workspace_id','bucket','object_key','object_version_id')},
                    'unpublished':a['status']=='uploading'} for a in family if a['status']!='deleted']
                attachments.append({'version':1,'kind':'attachment','workspace_id':root['workspace_id'],
                                    'asset_id':root['id'],'owner_id':owner,'objects':objects})
        record={'version':1,'kind':'account','owner_id':owner,'objects':[],'attachments':attachments}
        # After all guards pass, accepted intent survives a DB commit failure or old snapshot.
        ledger.write_record(record)
        apply_record(conn,record)
    return {'closed':True,'pending_attachments':len(attachments),
            'message':'账号已注销，私有对话已清理；附件后台继续清理。费用、审计和空间共享资源独立保留。'}


def reconcile(limit=5):
    """Repair accepted closure intents if the original DB transaction was interrupted."""
    root=ledger.directory()
    if not root.exists(): return 0
    _,records=ledger.load(ledger.identity(root))
    count=0
    for record in records:
        if record['kind']=='attachment': continue
        with az.policy_transaction(change=True) as conn:
            if record['kind']=='account':
                if (conn.execute('SELECT 1 FROM account_closures WHERE member_id=%s',(record['owner_id'],)).fetchone()
                    or not conn.execute('SELECT 1 FROM members WHERE id=%s',(record['owner_id'],)).fetchone()): continue
                conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
                apply_record(conn,record)
            elif record['kind']=='conversation':
                deleted=conn.execute("DELETE FROM workspace_documents WHERE workspace_id=%s AND kind='conversation' AND id=%s",
                                     (record['workspace_id'],record['document_id'])).rowcount
                if not deleted: continue
                az.audit(conn,None,'chat.conversation.delete_replayed',record['document_id'],record['workspace_id'],{'owner_id':record['owner_id']})
            elif record['kind']=='skill':
                skill=conn.execute('SELECT * FROM prompt_skills WHERE id=%s FOR UPDATE',(record['skill_id'],)).fetchone()
                if not skill: continue
                if skill['origin_workspace_id']!=record['workspace_id'] or (skill['uploader_id'] or '')!=record['owner_id']:
                    raise HTTPException(409,'Skill 删除记录归属不匹配，请管理员核对。')
                conn.execute('DELETE FROM member_skill_preferences WHERE skill_id=%s',(record['skill_id'],))
                conn.execute('DELETE FROM workspace_skill_installs WHERE skill_id=%s',(record['skill_id'],))
                conn.execute('SET CONSTRAINTS prompt_skill_current_version DEFERRED')
                conn.execute('DELETE FROM prompt_skill_versions WHERE skill_id=%s',(record['skill_id'],))
                conn.execute('DELETE FROM prompt_skills WHERE id=%s',(record['skill_id'],))
                conn.execute("""UPDATE workspace_documents SET value=jsonb_set(value,'{skills}',coalesce((SELECT jsonb_agg(item)
                    FROM jsonb_array_elements(coalesce(value->'skills','[]'::jsonb)) item WHERE item->>'id'<>%s),'[]'::jsonb)),revision=revision+1
                    WHERE kind='skill_library' AND value->'skills' @> %s::jsonb""",(record['skill_id'],Jsonb([{'id':record['skill_id']}])) )
                az.audit(conn,None,'skill.purge_replayed',record['skill_id'],record['workspace_id'],{'owner_id':record['owner_id']})
        count+=1
        if count>=limit: break
    return count
