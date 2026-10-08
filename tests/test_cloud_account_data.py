"""Personal data export uses server identity, including exited and archived spaces."""
import io
import json
import os
import zipfile

import pytest
from test_cloud_member_gateway import operator,world,headers
from test_cloud_member_gateway import PASSWORD

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def upload(client,space,text):
    response=client.post('/api/chat/attachments',headers=headers(space),files={'files':('script.txt',text.encode(),'text/plain')})
    assert response.status_code==200,response.text
    return response.json()['files'][0]


def seed_conversation(client,space,text,ref=None):
    from app.storage.workspace import workspace_scope
    from app.services.chat import new_conversation,save_conversation
    from app.services import members
    from app.services.member_context import access_scope
    from app.services.member_gateway import COOKIE
    actor=members.resolve_session(client.cookies.get(COOKIE))
    with workspace_scope(space['id']),access_scope(actor,space['id'],()):
        conversation=new_conversation(actor.member_id,persist=False)
        conversation['messages']=[{'role':'user','content':text,'skill_refs':[{'name':'own-snapshot','content':{'instructions':'personal-skill-snapshot'}}],
                                  'attachments':[ref] if ref else []}]
        save_conversation(actor.member_id,conversation)
    return conversation


def unpack(response):
    assert response.status_code==200,response.text if response.headers.get('content-type','').startswith('application/json') else response.status_code
    assert response.headers['cache-control']=='private, no-store'
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        return {name:archive.read(name) for name in archive.namelist()}


def test_personal_export_contains_owned_data_across_exited_archived_spaces_without_foreign_files(world):
    from app.services import members
    from app.storage import media
    w=world; owner=w['people'][0]['id']
    own_a=upload(w['editor'],w['a'],'owner-file-a')
    assert w['editor'].patch('/api/chat/attachments/'+own_a['media_asset_id'],headers=headers(w['a']),json={'shared':True}).status_code==200
    other=upload(w['outsider'],w['b'],'other-private-secret')
    members.assign_roles(w['operator'],owner,[w['b']['roles']['editor']],w['b']['id'])
    own_b=upload(w['editor'],w['b'],'owner-file-b')
    seed_conversation(w['editor'],w['a'],'owner-conversation-a',own_a)
    seed_conversation(w['editor'],w['b'],'owner-conversation-b',own_b)
    seed_conversation(w['viewer'],w['a'],'other-conversation-secret')
    members.remove_workspace_member(w['operator'],owner,w['b']['id'])
    members.archive_workspace(w['operator'],w['b']['id'])
    response=w['editor'].get('/api/account/data')
    assert response.status_code==200,response.text
    assert response.json()['conversations']==2 and response.json()['objects']==2
    assert {s['id'] for s in response.json()['workspaces']}=={w['a']['id'],w['b']['id']}
    temp_before=set(media.temp_root().glob('op-*'))
    exported=unpack(w['editor'].post('/api/account/data/export',data={'member_id':owner}))
    manifest=json.loads(exported['manifest.json'])
    assert manifest['member']['id']==owner and len(manifest['attachments'])==2
    assert {a['id'] for a in manifest['attachments']}=={own_a['media_asset_id'],own_b['media_asset_id']}
    assert b'owner-conversation-a' in exported['conversations.json'] and b'personal-skill-snapshot' in exported['conversations.json']
    all_bytes=b' '.join(exported.values())
    assert b'other-conversation-secret' not in all_bytes and b'other-private-secret' not in all_bytes
    assert other['media_asset_id'].encode() not in all_bytes
    assert b'owner-file-a' in all_bytes and b'owner-file-b' in all_bytes
    assert 'password' not in json.dumps(manifest).lower() and 'token' not in json.dumps(manifest).lower()
    assert set(media.temp_root().glob('op-*'))==temp_before
    assert w['viewer'].get('/api/account/data',headers={'X-Member-ID':owner}).status_code==409
    assert w['viewer'].post('/api/account/data/export',data={'member_id':owner}).status_code==409
    viewer=unpack(w['viewer'].post('/api/account/data/export'))
    assert json.loads(viewer['manifest.json'])['attachments']==[]


def test_personal_export_reports_pending_capacity_and_storage_failures_without_partial_zip(world,monkeypatch):
    from app.storage import database,media
    w=world; uploaded=upload(w['editor'],w['a'],'export-content')
    monkeypatch.setenv('ACCOUNT_EXPORT_MAX_BYTES','1')
    assert w['editor'].post('/api/account/data/export').status_code==413
    monkeypatch.delenv('ACCOUNT_EXPORT_MAX_BYTES')
    with database.connection() as conn:
        conn.execute("UPDATE assets SET status='deleting' WHERE id=%s",(uploaded['media_asset_id'],))
    assert w['editor'].post('/api/account/data/export').status_code==409
    with database.connection() as conn:
        conn.execute("UPDATE assets SET status='ready' WHERE id=%s",(uploaded['media_asset_id'],))
    monkeypatch.setattr(media.FilesystemStore,'download',lambda *args:(_ for _ in ()).throw(OSError('secret-storage-password')))
    failure=w['editor'].post('/api/account/data/export')
    assert failure.status_code==502 and 'secret-storage-password' not in failure.text


def test_personal_export_rechecks_deletion_before_publishing(world,monkeypatch):
    from app.storage import media,database
    w=world; uploaded=upload(w['editor'],w['a'],'deleted-during-export')
    original=media.FilesystemStore.download
    def deleted_while_copying(store,asset,path):
        result=original(store,asset,path)
        with database.connection() as conn:
            conn.execute("UPDATE assets SET status='deleting' WHERE id=%s",(uploaded['media_asset_id'],))
        return result
    monkeypatch.setattr(media.FilesystemStore,'download',deleted_while_copying)
    rejected=w['editor'].post('/api/account/data/export')
    assert rejected.status_code==409,rejected.text
    assert rejected.headers['content-type'].startswith('application/json')


@pytest.mark.parametrize('change',['conversation','session','checksum'])
def test_personal_export_never_publishes_changed_source_or_revoked_session(world,monkeypatch,change):
    from app.storage import media,database
    from app.services.member_gateway import COOKIE
    from app.services import members
    w=world; actor=members.resolve_session(w['editor'].cookies.get(COOKIE))
    uploaded=upload(w['editor'],w['a'],'export-source')
    conversation=seed_conversation(w['editor'],w['a'],'original-conversation',uploaded)
    original=media.FilesystemStore.download
    def change_during_copy(store,asset,path):
        result=original(store,asset,path)
        if change=='checksum': path.write_bytes(b'wrong-data')
        else:
            with database.connection() as conn:
                if change=='conversation':
                    conn.execute("UPDATE workspace_documents SET revision=revision+1 WHERE kind='conversation' AND id=%s",
                                 (actor.member_id+'/'+conversation['id'],))
                else: conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE id=%s',(actor.session_id,))
        return result
    monkeypatch.setattr(media.FilesystemStore,'download',change_during_copy)
    response=w['editor'].post('/api/account/data/export')
    assert response.status_code=={'conversation':409,'session':401,'checksum':502}[change],response.text
    assert response.headers['content-type'].startswith('application/json')


def closure(client,password=PASSWORD,confirmation='注销并删除本人数据'):
    return client.post('/api/account/data/close',json={'password':password,'confirmation':confirmation})


def test_account_closure_removes_private_snapshots_revokes_sessions_and_retries_objects(world):
    from app.services import members,chat_attachment_cleanup
    from app.storage import database,media,deletion_ledger
    w=world; owner=w['people'][0]['id']
    original_token=members.login(w['people'][0]['username'],PASSWORD)['token']
    own=upload(w['editor'],w['a'],'own-to-delete')
    seed_conversation(w['editor'],w['a'],'private-history-snapshot',own)
    foreign=seed_conversation(w['viewer'],w['a'],'keep-foreign-history')
    result=closure(w['editor'])
    assert result.status_code==200,result.text
    assert result.json()['closed'] and result.json()['pending_attachments']==1
    assert result.headers['cache-control']=='private, no-store'
    assert members.resolve_session(original_token) is None
    assert w['editor'].post('/api/auth/login',json={'username':w['people'][0]['username'],'password':PASSWORD}).status_code==401
    assert deletion_ledger.member_blocked(owner)
    with database.connection() as conn:
        row=conn.execute('SELECT * FROM members WHERE id=%s',(owner,)).fetchone()
        assert row['status']=='closed' and row['closed_at'] and not row['password_digest'] and not row['password_salt']
        assert row['display_name']=='已注销成员' and row['username'].startswith('closed_')
        assert conn.execute('SELECT count(*) AS n FROM workspace_members WHERE member_id=%s',(owner,)).fetchone()['n']==0
        assert conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(owner+'/',)).fetchone()['n']==0
        assert conn.execute('SELECT state FROM chat_attachment_deletions WHERE asset_id=%s',(own['media_asset_id'],)).fetchone()['state']=='queued'
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='account.closed' AND target_id=%s",(owner,)).fetchone()['n']==1
        assert conn.execute("SELECT value FROM workspace_documents WHERE kind='conversation' AND id=%s",(w['people'][1]['id']+'/'+foreign['id'],)).fetchone()
    assert chat_attachment_cleanup.run_pending()==[{'deleted':True}]
    with database.connection() as conn:
        assert conn.execute('SELECT status FROM assets WHERE id=%s',(own['media_asset_id'],)).fetchone()['status']=='deleted'
    with pytest.raises(Exception): members.set_member_status(w['operator'],owner,'active')
    with pytest.raises(Exception): members.reset_member(w['operator'],owner)


@pytest.mark.parametrize('blocker',['password','confirmation','shared_reference','workspace_admin','task'])
def test_account_closure_guards_leave_private_data_and_identity_unchanged(world,blocker):
    from app.services import members
    from app.storage import database,deletion_ledger
    from psycopg.types.json import Jsonb
    w=world; owner=w['people'][0]['id']; own=upload(w['editor'],w['a'],'keep-if-blocked')
    conversation=seed_conversation(w['editor'],w['a'],'keep-if-blocked',own)
    if blocker=='shared_reference':
        assert w['editor'].patch('/api/chat/attachments/'+own['media_asset_id'],headers=headers(w['a']),json={'shared':True}).status_code==200
        seed_conversation(w['viewer'],w['a'],'foreign-owner-reference',own)
    if blocker=='workspace_admin': members.create_workspace(w['operator'],'owned-admin-space',owner)
    if blocker=='task':
        with database.connection() as conn:
            conn.execute("INSERT INTO tasks(id,workspace_id,kind,status,idempotency_key,request_sha256,requested_by) VALUES(%s,%s,'video','queued',%s,%s,%s)",
                         ('close-task-'+owner,w['a']['id'],'close-task-'+owner,'0'*64,owner))
    result=closure(w['editor'],password='wrong-password-12345' if blocker=='password' else PASSWORD,
                   confirmation='错误确认' if blocker=='confirmation' else '注销并删除本人数据')
    assert result.status_code=={'password':403,'confirmation':400}.get(blocker,409),result.text
    assert not deletion_ledger.member_blocked(owner)
    with database.connection() as conn:
        assert conn.execute('SELECT status FROM members WHERE id=%s',(owner,)).fetchone()['status']=='active'
        assert conn.execute("SELECT value FROM workspace_documents WHERE kind='conversation' AND id=%s",(owner+'/'+conversation['id'],)).fetchone()
        assert conn.execute('SELECT status FROM assets WHERE id=%s',(own['media_asset_id'],)).fetchone()['status']=='ready'


def test_last_platform_administrator_cannot_close_own_account(world):
    from app.services import members
    from app.services.member_gateway import COOKIE
    w=world
    with __import__('app.storage.database',fromlist=['connection']).connection() as conn:
        username=conn.execute('SELECT username FROM members WHERE id=%s',(w['operator'].member_id,)).fetchone()['username']
    token=members.login(username,PASSWORD)['token']
    w['editor'].cookies.set(COOKIE,token)
    result=closure(w['editor'])
    assert result.status_code==409 and result.json()['detail']['code']=='last_platform_administrator'


def test_accepted_closure_intent_is_repaired_after_interrupted_transaction(world,monkeypatch):
    from fastapi import HTTPException
    from app.services import account_closure,members,chat_attachment_cleanup
    from app.storage import database,deletion_ledger
    w=world; owner=w['people'][0]['id']; own=upload(w['editor'],w['a'],'interrupted-close')
    seed_conversation(w['editor'],w['a'],'interrupted-private-history',own)
    original=account_closure.apply_record
    monkeypatch.setattr(account_closure,'apply_record',lambda *args:(_ for _ in ()).throw(HTTPException(503,'注销写入中断，后台将修复。')))
    result=closure(w['editor']);assert result.status_code==503
    assert deletion_ledger.member_blocked(owner)
    with database.connection() as conn:
        assert conn.execute('SELECT status FROM members WHERE id=%s',(owner,)).fetchone()['status']=='active'
    assert w['editor'].get('/api/account/data').status_code==401
    monkeypatch.setattr(account_closure,'apply_record',original)
    assert account_closure.reconcile()==1
    assert account_closure.reconcile()==0
    assert chat_attachment_cleanup.run_pending()==[{'deleted':True}]
    with database.connection() as conn:
        assert conn.execute('SELECT status FROM members WHERE id=%s',(owner,)).fetchone()['status']=='closed'
        assert conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(owner+'/',)).fetchone()['n']==0


def test_closure_ledger_write_failure_rolls_back_identity_and_private_data(world,monkeypatch):
    from fastapi import HTTPException
    from app.storage import deletion_ledger,database
    w=world; owner=w['people'][0]['id']; conversation=seed_conversation(w['editor'],w['a'],'keep-without-ledger')
    monkeypatch.setattr(deletion_ledger,'write_record',lambda *args:(_ for _ in ()).throw(HTTPException(503,'删除账本写入失败。')))
    response=closure(w['editor']);assert response.status_code==503
    assert not deletion_ledger.member_blocked(owner)
    with database.connection() as conn:
        assert conn.execute('SELECT status FROM members WHERE id=%s',(owner,)).fetchone()['status']=='active'
        assert conn.execute("SELECT 1 FROM workspace_documents WHERE kind='conversation' AND id=%s",(owner+'/'+conversation['id'],)).fetchone()
