"""Private upload, sharing and physical deletion against isolated storage."""
import json
import os
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_chat import chat_world
from test_prompt_skills import MD

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def upload_private(w, name='分镜.txt'):
    response=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),
                              files={'files':(name,'沉锋分镜内容'.encode('utf-8'),'text/plain')})
    assert response.status_code==200,response.text
    return response.json()['files'][0]


def asset_row(w, asset_id):
    from app.storage.database import connection
    with connection() as conn:
        return conn.execute('SELECT * FROM assets WHERE workspace_id=%s AND id=%s',(w['a']['id'],asset_id)).fetchone()


def test_chat_private_upload_isolated_and_explicit_shared_access(world):
    w=world; file=upload_private(w); aid=file['media_asset_id']
    assert file['private'] is True
    assert w['editor'].get(file['url'],headers=headers(w['a'])).status_code==200
    assert w['editor'].get(file['url'],headers=headers(w['a'])).headers['cache-control']=='private, no-store'
    assert w['viewer'].get(file['url'],headers=headers(w['a'])).status_code==404
    assert w['outsider'].get(file['url'],headers=headers(w['b'])).status_code==404
    assert w['viewer'].get('/api/chat/attachments',headers=headers(w['a'])).json()['files']==[]
    assert w['viewer'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==404
    assert w['viewer'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==404
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==200
    assert w['viewer'].get(file['url'],headers=headers(w['a'])).status_code==200
    assert w['outsider'].get(file['url'],headers=headers(w['b'])).status_code==404
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':False}).status_code==200
    assert w['viewer'].get(file['url'],headers=headers(w['a'])).status_code==404


def test_chat_private_preview_inherits_access_and_is_physically_deleted(world):
    from io import BytesIO
    from PIL import Image
    from app.storage.database import connection
    from app.storage import media
    w=world; raw=BytesIO(); Image.new('RGB',(64,48),'blue').save(raw,'PNG')
    r=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':('private.png',raw.getvalue(),'image/png')})
    assert r.status_code==200,r.text
    file=r.json()['files'][0]; aid=file['media_asset_id']; preview='/api/media/'+aid+'/content?variant=preview'
    original_redirect=w['editor'].get(file['url'],headers=headers(w['a']),follow_redirects=False)
    assert original_redirect.headers['location'].startswith('/api/media/'+aid+'/content?workspace=')
    owner=w['editor'].get(preview,headers=headers(w['a']))
    assert owner.status_code==200,owner.text
    assert owner.headers['cache-control']=='private, no-store'
    assert 'content-disposition' not in owner.headers
    with connection() as conn:
        child=conn.execute('SELECT * FROM assets WHERE workspace_id=%s AND parent_asset_id=%s',(w['a']['id'],aid)).fetchone()
    assert child['metadata']['chat_owner']==asset_row(w,aid)['metadata']['chat_owner']
    child_url=media.stable_url(child)
    assert w['viewer'].get(child_url,headers=headers(w['a'])).status_code==404
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==200
    assert w['viewer'].get(child_url,headers=headers(w['a'])).status_code==200
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':False}).status_code==200
    assert w['viewer'].get(child_url,headers=headers(w['a'])).status_code==404
    objects=[media.store().path(row['object_key'],row['object_version_id']) for row in [asset_row(w,aid),child]]
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200
    assert all(not path.exists() for path in objects)
    assert asset_row(w,child['id'])['status']=='deleted'


@pytest.mark.parametrize('path',['/api/chat','/api/chat/stream'])
def test_chat_private_foreign_attachment_denied_before_history(chat_world,path):
    w=chat_world; file=upload_private(w)
    from app.services import members
    members.assign_roles(w['operator'],w['people'][1]['id'],[w['a']['roles']['editor']],w['a']['id'])
    before=w['viewer'].get('/api/conversations',headers=headers(w['a'])).json()
    r=w['viewer'].post(path,headers=headers(w['a']),json={**w['payload'],'reference_images':[file]})
    assert r.status_code==404,r.text
    assert w['viewer'].get('/api/conversations',headers=headers(w['a'])).json()==before
    assert not w['calls']


def test_chat_private_unused_file_deleted_with_object_and_retryable_failure(world,monkeypatch):
    w=world; file=upload_private(w); aid=file['media_asset_id']; row=asset_row(w,aid)
    from app.services import canvas_asset_purge
    from app.storage import media
    from pathlib import Path
    object_path=media.store().path(row['object_key'],row['object_version_id'])
    original=canvas_asset_purge.delete_object
    monkeypatch.setattr(canvas_asset_purge,'delete_object',lambda asset: (_ for _ in ()).throw(OSError('storage unavailable')))
    r=w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a']))
    assert r.status_code==503,r.text
    assert asset_row(w,aid)['status']=='deleting' and object_path.exists()
    assert w['editor'].get(file['url'],headers=headers(w['a'])).status_code==404
    monkeypatch.setattr(canvas_asset_purge,'delete_object',original)
    r=w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a']))
    assert r.status_code==200,r.text
    assert not object_path.exists()
    assert asset_row(w,aid)['status']=='deleted' and asset_row(w,aid)['display_name']==''
    assert w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()['files']==[]


def test_chat_private_file_excluded_from_shared_workspace_export(world,tmp_path):
    from app.storage import workspace_export
    w=world; file=upload_private(w); aid=file['media_asset_id']
    private=tmp_path/'private-export'
    manifest=workspace_export.export(private,w['a']['id'])
    assert manifest['counts']['assets']==0 and manifest['object_count']==0
    assert aid not in (private/'assets.jsonl').read_text()
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==200
    shared=tmp_path/'shared-export'
    manifest=workspace_export.export(shared,w['a']['id'])
    assert manifest['counts']['assets']==1 and manifest['object_count']==1
    assert aid in (shared/'assets.jsonl').read_text()


def test_chat_delete_conversation_only_cleans_unreferenced_owned_files(chat_world):
    w=chat_world; file=upload_private(w); aid=file['media_asset_id']
    ids=[]
    for _ in range(2):
        r=w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'reference_images':[file]})
        assert r.status_code==200,r.text
        ids.append(r.json()['conversation']['id'])
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==409
    assert w['viewer'].delete('/api/conversations/'+ids[0]+'?delete_unused_attachments=true',headers=headers(w['a'])).status_code==404
    first=w['editor'].delete('/api/conversations/'+ids[0]+'?delete_unused_attachments=true',headers=headers(w['a']))
    assert first.status_code==200,first.text
    assert first.json()['attachment_cleanup'][0]['deleted'] is False
    assert asset_row(w,aid)['status']=='ready'
    last=w['editor'].delete('/api/conversations/'+ids[1]+'?delete_unused_attachments=true',headers=headers(w['a']))
    assert last.status_code==200,last.text
    assert last.json()['attachment_cleanup']==[{'id':aid,'deleted':True}]
    assert asset_row(w,aid)['status']=='deleted'


def test_chat_default_conversation_delete_keeps_original_attachment(chat_world):
    w=chat_world; file=upload_private(w)
    r=w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'reference_images':[file]})
    cid=r.json()['conversation']['id']
    assert w['editor'].delete('/api/conversations/'+cid,headers=headers(w['a'])).status_code==200
    assert asset_row(w,file['media_asset_id'])['status']=='ready'


def test_chat_shared_documents_protect_attachment_from_revocation_and_deletion(world):
    w=world; file=upload_private(w); aid=file['media_asset_id']
    from app.storage import media
    from app.storage.documents import put, delete
    from app.storage.workspace import workspace_scope
    from app.services.member_context import access_scope
    from app.services import members
    principal=members.resolve_session(members.login(w['people'][0]['username'],'test-only-password-12345',audience='workbench',source='private-test')['token'],'workbench')
    with workspace_scope(w['a']['id']),access_scope(principal,w['a']['id'],()):
        with pytest.raises(Exception,match='私有对话附件'):
            put('asset_library','test-private',{'url':file['url']})
        from app.storage import canvases
        from app.storage.task_requests import lock_ready
        from app.storage.database import connection
        with pytest.raises(Exception,match='私有对话附件'):
            canvases.save({'id':'canvas-private-boundary','nodes':[{'id':'n','type':'image','images':[file]}],'connections':[]})
        with pytest.raises(Exception,match='私有对话附件'):
            with connection() as conn:
                lock_ready(conn,[aid])
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==200
    with workspace_scope(w['a']['id']),access_scope(principal,w['a']['id'],()):
        put('asset_library','test-private',{'url':file['url']})
        with connection() as conn:
            lock_ready(conn,[aid])
    from app.storage.tasks import lease_context
    lease=lease_context.set(('test-trusted-task','test-lease'))
    try:
        with workspace_scope(w['a']['id']):
            assert media.get_asset(aid)['id']==aid
    finally:
        lease_context.reset(lease)
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':False}).status_code==409
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==409
    with workspace_scope(w['a']['id']):
        delete('asset_library','test-private')


def test_chat_skill_purge_requires_withdrawal_all_uninstalls_and_preserves_history(chat_world):
    w=chat_world
    response=w['editor'].post('/api/skills/import',headers=headers(w['a']),
        files={'file':('SKILL.md',MD)},data={'visibility':'shared'})
    sid=response.json()['id']
    purge='/api/skills/'+sid+'/purge'
    assert w['editor'].post(purge,headers=headers(w['a']),json={'confirm_permanent':True}).status_code==409
    sent=w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'skill_ids':[sid]})
    cid=sent.json()['conversation']['id']
    assert w['outsider'].post('/api/skills/'+sid+'/install',headers=headers(w['b'])).status_code==200
    assert w['editor'].delete('/api/skills/'+sid,headers=headers(w['a'])).status_code==200
    assert w['editor'].delete('/api/skills/'+sid+'/install',headers=headers(w['a'])).status_code==200
    assert w['editor'].post(purge,headers=headers(w['a']),json={'confirm_permanent':True}).status_code==409
    assert w['outsider'].post(purge,headers=headers(w['b']),json={'confirm_permanent':True}).status_code==404
    assert w['outsider'].delete('/api/skills/'+sid+'/install',headers=headers(w['b'])).status_code==200
    catalog=w['editor'].get('/api/skills',headers=headers(w['a'])).json()['skills']
    assert next(row for row in catalog if row['id']==sid)['can_purge']
    assert w['editor'].post('/api/skills/'+sid+'/install',headers=headers(w['a'])).status_code==404
    assert w['editor'].post(purge,headers=headers(w['a']),json={'confirm_permanent':True}).status_code==200
    from app.storage.database import connection
    with connection() as conn:
        assert conn.execute('SELECT 1 FROM prompt_skill_versions WHERE skill_id=%s',(sid,)).fetchone() is None
        assert conn.execute('SELECT 1 FROM prompt_skills WHERE id=%s',(sid,)).fetchone() is None
    history=w['editor'].get('/api/conversations/'+cid,headers=headers(w['a'])).json()['conversation']
    assert 'Ask for subject' in history['messages'][0]['skill_refs'][0]['context']
