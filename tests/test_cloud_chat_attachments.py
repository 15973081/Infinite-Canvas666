"""Private upload, sharing and physical deletion against isolated storage."""
import json
import os
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_chat import chat_world
from test_prompt_skills import MD
from test_document_attachments import docx,xlsx
from test_attachment_preview import chapters_docx

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


@pytest.mark.parametrize('endpoint',['/api/chat','/api/chat/stream'])
@pytest.mark.parametrize('document',['xlsx','chapters_docx'])
def test_chat_office_preview_and_selected_source_reach_model_only_after_validation(chat_world,request,document,endpoint):
    w=chat_world; path=request.getfixturevalue(document)
    uploaded=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':(path.name,path.read_bytes(),'application/octet-stream')})
    assert uploaded.status_code==200,uploaded.text
    ref=uploaded.json()['files'][0]
    initial=w['editor'].post('/api/chat/attachments/preview',headers=headers(w['a']),json=ref)
    assert initial.status_code==200,initial.text
    assert initial.headers['cache-control']=='private, no-store'
    assert w['viewer'].post('/api/chat/attachments/preview',headers=headers(w['a']),json=ref).status_code==404
    assert w['outsider'].post('/api/chat/attachments/preview',headers=headers(w['b']),json=ref).status_code==404
    meta=initial.json()
    selection={'kind':meta['kind'],'sha256':meta['sha256']}
    if document=='xlsx': selection['sheets']=[{'name':'人物','region':'A1:B1'}]; included='沉锋'; excluded='雨夜巷口'
    else: selection['sections']=[meta['sections'][0]['id']]; included='只选雨夜'; excluded='未选雪山'
    chosen={**ref,'selection':selection}
    check=w['editor'].post('/api/chat/attachments/preview',headers=headers(w['a']),json=chosen)
    assert check.status_code==200,check.text
    assert included in check.json()['text'] and excluded not in check.json()['text']
    payload={**w['payload'],'reference_images':[chosen]}
    before=w['editor'].get('/api/conversations',headers=headers(w['a'])).json()
    invalid={**payload,'reference_images':[{**ref,'selection':{**selection,'sha256':'0'*64}}]}
    for route in ['/api/chat/budget',endpoint]:
        rejected=w['editor'].post(route,headers=headers(w['a']),json=invalid)
        assert rejected.status_code==409,rejected.text
    assert not w['calls'] and w['editor'].get('/api/conversations',headers=headers(w['a'])).json()==before
    budget=w['editor'].post('/api/chat/budget',headers=headers(w['a']),json=payload)
    assert budget.status_code==200,budget.text
    response=w['editor'].post(endpoint,headers=headers(w['a']),json=payload)
    assert response.status_code==200,response.text
    assert len(w['calls'])==1
    upstream=json.loads(w['calls'][0].content)['messages'][-1]['content'][0]['text']
    assert included in upstream and excluded not in upstream
    if endpoint.endswith('/stream'):
        conversation=[json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')][-1]['conversation']
    else: conversation=response.json()['conversation']
    stored=w['editor'].get('/api/conversations/'+conversation['id'],headers=headers(w['a'])).json()['conversation']
    assert stored['messages'][0]['attachments'][0]['selection']['sha256']==selection['sha256']


def test_chat_private_quota_serializes_parallel_uploads_and_releases_reservations(world,monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from app.storage.database import connection
    w=world; content=b'1234567890'; monkeypatch.setenv('CHAT_MEMBER_QUOTA_BYTES','10')
    def upload(_):
        return w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':('quota.txt',content,'text/plain')})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(upload,range(2)))
    assert sorted(r.status_code for r in responses)==[200,413]
    listing=w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()
    assert listing['usage']=={'used_bytes':10,'reserved_bytes':0,'quota_bytes':10,'remaining_bytes':0,'object_count':1}
    assert w['viewer'].get('/api/chat/attachments',headers=headers(w['a'])).json()['usage']['used_bytes']==0
    from app.services import members
    members.assign_roles(w['operator'],w['people'][0]['id'],[w['b']['roles']['editor']],w['b']['id'])
    assert w['editor'].get('/api/chat/attachments',headers=headers(w['b'])).json()['usage']['used_bytes']==10
    assert w['editor'].post('/api/chat/attachments',headers=headers(w['b']),files={'files':('other-space.txt',b'x','text/plain')}).status_code==413
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM chat_upload_reservations').fetchone()['n']==0
    aid=listing['files'][0]['id']
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200
    assert w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()['usage']['remaining_bytes']==10
    assert upload(0).status_code==200


def test_chat_private_unused_filter_size_sort_and_audit(chat_world):
    from app.storage.database import connection
    w=chat_world; first=upload_private(w)
    second=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':('large.txt',b'x'*100,'text/plain')}).json()['files'][0]
    sent=w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'reference_images':[first]})
    assert sent.status_code==200,sent.text
    page=w['editor'].get('/api/chat/attachments?sort=size&limit=1',headers=headers(w['a'])).json()
    assert page['files'][0]['id']==second['media_asset_id'] and page['next_offset']==1
    unused=w['editor'].get('/api/chat/attachments?unreferenced=true',headers=headers(w['a'])).json()['files']
    assert [file['id'] for file in unused]==[second['media_asset_id']]
    assert unused[0]['referenced'] is False
    aid=second['media_asset_id']
    for shared in (True,False):
        assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':shared}).status_code==200
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200
    with connection() as conn:
        actions={r['action'] for r in conn.execute('SELECT action FROM management_events WHERE workspace_id=%s AND target_id=%s',(w['a']['id'],aid))}
    assert {'chat.attachment.uploaded','chat.attachment.shared','chat.attachment.unshared','chat.attachment.delete_requested','chat.attachment.deleted'}<=actions


def test_chat_private_personal_audit_is_paginated_owner_scoped_and_safe(world):
    from app.storage.database import connection
    from app.services import authorization as az
    w=world; aid=upload_private(w)['media_asset_id']
    assert w['editor'].patch('/api/chat/attachments/'+aid,headers=headers(w['a']),json={'shared':True}).status_code==200
    with connection() as conn:
        az.audit(conn,None,'chat.attachment.delete_retry',aid,w['a']['id'],
                 {'owner_id':w['people'][0]['id'],'attempts':2,'last_error':'secret-storage-key','content':'private-text'})
    page=w['editor'].get('/api/chat/attachments/audit?limit=1',headers=headers(w['a']))
    assert page.status_code==200,page.text
    assert page.headers['cache-control']=='private, no-store'
    data=page.json(); event=data['events'][0]
    assert event['label']=='后台重试删除' and event['actor']=='后台任务' and event['attempts']==2
    assert 'secret-storage-key' not in page.text and 'private-text' not in page.text and 'owner_id' not in page.text
    assert data['next_before']==event['id']
    older=w['editor'].get('/api/chat/attachments/audit?before='+data['next_before'],headers=headers(w['a'])).json()
    assert [e['action'] for e in older['events']]==['chat.attachment.shared','chat.attachment.uploaded']
    assert all(e['actor']=='本人' for e in older['events'])
    assert w['viewer'].get('/api/chat/attachments/audit',headers=headers(w['a'])).json()['events']==[]
    assert w['outsider'].get('/api/chat/attachments/audit',headers=headers(w['a'])).status_code==403
    assert w['editor'].get('/api/chat/attachments/audit?before=0',headers=headers(w['a'])).status_code==422
    assert w['editor'].get('/api/chat/attachments/audit?limit=101',headers=headers(w['a'])).status_code==422
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200
    final=w['editor'].get('/api/chat/attachments/audit',headers=headers(w['a'])).json()
    assert final['events'][0]['action']=='chat.attachment.deleted'
    assert w['viewer'].get('/api/chat/attachments/audit',headers=headers(w['a'])).json()['events']==[]


def test_chat_private_background_cleanup_recovers_after_failure_and_expired_lease(world,monkeypatch):
    from app.storage.database import connection
    from app.services import canvas_asset_purge,chat_attachment_cleanup
    w=world; file=upload_private(w); aid=file['media_asset_id']; original=canvas_asset_purge.delete_object
    monkeypatch.setattr(canvas_asset_purge,'delete_object',lambda _: (_ for _ in ()).throw(OSError('secret storage details')))
    response=w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a']))
    assert response.status_code==503 and 'secret storage details' not in response.text
    pending=w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()['files'][0]
    assert pending['deletion_state']=='retrying' and pending['attempts']==1 and pending['next_retry_at']
    assert '存储暂不可用' in pending['last_error'] and 'secret storage details' not in pending['last_error']
    monkeypatch.setattr(canvas_asset_purge,'delete_object',original)
    with connection() as conn:
        conn.execute("UPDATE chat_attachment_deletions SET available_at=now()-interval '1 hour',lease_token=%s,lease_until=now()+interval '1 hour' WHERE asset_id=%s",(__import__('uuid').uuid4(),aid))
    assert chat_attachment_cleanup.run_pending()==[]
    with connection() as conn:
        conn.execute("UPDATE chat_attachment_deletions SET lease_until=now()-interval '1 second' WHERE asset_id=%s",(aid,))
    assert chat_attachment_cleanup.run_pending()==[{'deleted':True}]
    assert asset_row(w,aid)['status']=='deleted'
    with connection() as conn:
        job=conn.execute('SELECT * FROM chat_attachment_deletions WHERE asset_id=%s',(aid,)).fetchone()
    assert job['state']=='succeeded' and job['attempts']==2 and job['completed_at'] and not job['last_error']
    assert chat_attachment_cleanup.run_pending()==[]


def test_chat_private_failed_upload_reclaims_unrecorded_object_versions(world,monkeypatch):
    from app.storage import media
    w=world; original=media.FilesystemStore.put
    def lost_response(storage,key,path,content_type):
        original(storage,key,path,content_type)
        raise OSError('lost upload response')
    monkeypatch.setattr(media.FilesystemStore,'put',lost_response)
    response=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':('failed.txt',b'orphan bytes','text/plain')})
    assert response.status_code==502
    listing=w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()
    failed=listing['files'][0]
    assert failed['upload_failed'] and failed['cleanup_available'] and failed['status']=='uploading'
    assert listing['usage']['used_bytes']==12 and listing['usage']['reserved_bytes']==0
    row=asset_row(w,failed['id']); directory=media.store().path(row['object_key'],'0'*32).parent
    assert len(list(directory.iterdir()))==1
    assert w['editor'].delete('/api/chat/attachments/'+failed['id']+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200
    assert list(directory.iterdir())==[]
    assert w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()['usage']['used_bytes']==0


def test_chat_private_interrupted_upload_only_deletable_after_processing_grace(world,monkeypatch):
    from app.storage.database import connection
    w=world; file=upload_private(w); aid=file['media_asset_id']
    with connection() as conn:
        conn.execute("UPDATE assets SET status='uploading',updated_at=now() WHERE id=%s",(aid,))
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==409
    with connection() as conn:
        conn.execute("UPDATE assets SET updated_at=now()-interval '2 hours' WHERE id=%s",(aid,))
    assert w['editor'].delete('/api/chat/attachments/'+aid+'?confirm_permanent=true',headers=headers(w['a'])).status_code==200


def test_chat_private_preview_respects_capacity_without_leaving_upload_row(world,monkeypatch):
    from io import BytesIO
    from PIL import Image
    raw=BytesIO(); Image.new('RGB',(64,48),'blue').save(raw,'PNG')
    monkeypatch.setenv('CHAT_MEMBER_QUOTA_BYTES',str(len(raw.getvalue())))
    w=world; response=w['editor'].post('/api/chat/attachments',headers=headers(w['a']),files={'files':('quota.png',raw.getvalue(),'image/png')})
    assert response.status_code==200,response.text
    aid=response.json()['files'][0]['media_asset_id']
    assert w['editor'].get('/api/media/'+aid+'/content?variant=preview',headers=headers(w['a'])).status_code==413
    assert w['editor'].get('/api/chat/attachments',headers=headers(w['a'])).json()['usage']['object_count']==1


def test_chat_private_cleanup_runs_independently_of_generation_consumers(monkeypatch):
    import asyncio
    import threading
    from app.storage import worker
    from app.services import chat_attachment_cleanup
    observed=threading.Event()
    async def busy_consumer(stop):
        await stop.wait()
    monkeypatch.setattr(worker,'consume',busy_consumer)
    monkeypatch.setattr(chat_attachment_cleanup,'run_pending',lambda:observed.set())
    async def run():
        handle=worker.start()
        try:
            assert await asyncio.to_thread(observed.wait,2)
        finally:
            await worker.shutdown(handle)
    asyncio.run(run())


def test_chat_private_tos_orphan_cleanup_only_deletes_complete_exact_key(world,monkeypatch):
    from types import SimpleNamespace
    from app.storage import media
    from app.storage.workspace import workspace_scope
    from app.services.chat_attachment_cleanup import delete_snapshot
    aid='ast_'+'a'*32; key='media/'+world['a']['id']+'/'+aid+'/unpublished.txt'
    store=media.TosStore.__new__(media.TosStore); store.bucket='test-private'; deleted=[]
    page=SimpleNamespace(versions=[SimpleNamespace(key=key,version_id='exact-version',size=12),
        SimpleNamespace(key=key+'-neighbor',version_id='other-version',size=12)],delete_markers=[],is_truncated=False)
    store.client=SimpleNamespace(list_object_versions=lambda *a,**kw:page,
        delete_object=lambda bucket,key,version_id:deleted.append((key,version_id)))
    monkeypatch.setattr(media,'store',lambda:store)
    with workspace_scope(world['a']['id']):
        delete_snapshot({'id':aid,'workspace_id':world['a']['id'],'bucket':'test-private',
                         'object_key':key,'object_version_id':None,'unpublished':True})
    assert deleted==[(key,'exact-version')]


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
