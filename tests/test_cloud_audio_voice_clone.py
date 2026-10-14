"""Recorded voice cloning uses real media/PG and isolated supplier responses."""
import io
import math
import struct
import uuid
import wave
from unittest.mock import patch
import httpx
import pytest
from test_cloud_audio_tasks import prepared, submit, execute, MP3, supplier as speech_supplier
from test_cloud_audio_voice_design import directory
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(__import__('os').getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def recording(seconds=12, silent=False):
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(16000)
        stream.writeframes(b'\0\0' * int(seconds*16000) if silent else b''.join(
            struct.pack('<h', int(16000*math.sin(index*2*math.pi*440/16000))) for index in range(int(seconds*16000))))
    return output.getvalue()


def prepare_clone(world, platform, sample=None):
    path, canvas, lease, original, config = prepared(world, platform, voice_clone=True)
    uploaded = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': ('voice.wav', sample or recording(), 'audio/wav')})
    assert uploaded.status_code == 200, uploaded.text
    with patch.object(httpx.AsyncClient, 'post', directory()):
        catalog = world['editor'].get('/api/canvas-audio-voices', params={'provider_id': original['provider_id'], 'model': original['model']}, headers=headers(world['a'])).json()
    assert catalog['can_clone']
    body = {**original, 'mode': 'clone', 'model': 'voice-clone', 'voice_catalog_id': catalog['catalog_id'],
            'sample_audio': uploaded.json()['files'][0]['url'], 'clone_preview_model': original['model'],
            'clone_terms_accepted': True, 'preview_text': '欢迎来到这座城市。'}
    return path, canvas, lease, body, catalog, original


def clone_supplier(calls, unknown=False):
    async def respond(client, url, **kwargs):
        if url.endswith('files/upload'):
            assert kwargs['data'] == {'purpose': 'voice_clone'}
            assert kwargs['files']['file'][1].read(3) in {b'ID3', b'\xff\xfb\x90', b'\xff\xf3\x88'}
            calls.append(('upload', None))
            return httpx.Response(200, request=httpx.Request('POST', url), json={'base_resp': {'status_code': 0}, 'file': {'file_id': 12345678}})
        assert url.endswith('/voice_clone')
        calls.append(('clone', kwargs['json']))
        if unknown:raise httpx.ReadTimeout('cloning outcome unknown')
        return httpx.Response(200, request=httpx.Request('POST', url), json={'base_resp': {'status_code': 0}, 'input_sensitive': False, 'demo_audio': 'https://supplier.test/preview.mp3'})
    return respond


async def download(url, prefix, **kwargs):
    from app.storage import media
    assert url == 'https://supplier.test/preview.mp3'
    target = media.operation()['root'] / 'clone-preview.mp3';target.write_bytes(MP3.read_bytes())
    kwargs['validate_file'](target)
    return media.stable_url(media.publish(target, asset_id=media.result_slot.get(), role='generated'))


def test_audio_voice_clone_records_one_paid_call_registers_and_deletes_as_cloning(world, platform):
    from app.storage import media, database
    from app.storage.workspace import workspace_scope
    path, canvas, lease, body, catalog, original = prepare_clone(world, platform)
    calls=[]
    assert submit(world, body, lease).status_code == 200
    assert submit(world, body, lease).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', clone_supplier(calls)), patch.object(media, 'download_remote', download):
        task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded',task
    assert [call[0] for call in calls]==['upload','clone']

    assert calls[1][1]['model']=='speech-2.8-hd' and calls[1][1]['file_id']==12345678
    voice_id=task['result']['audio_info']['voice_id'];assert calls[1][1]['voice_id']==voice_id
    assert world['viewer'].get(task['result']['audios'][0],headers=headers(world['a'])).content==MP3.read_bytes()
    assert world['editor'].get(path,headers=headers(world['a'])).json()['canvas']['nodes']==canvas['nodes']
    assert world['viewer'].get(path+'/task-results',headers=headers(world['a'])).json()['results']==[]
    assert world['viewer'].get('/api/canvas-generation-history',headers=headers(world['a'])).json()['items']==[]
    params={'provider_id':body['provider_id'],'model':original['model'],'canvas_id':canvas['id'],'node_id':'source','mode':'clone'}
    jobs=world['editor'].get('/api/canvas-audio-voices/design-tasks',params=params,headers=headers(world['a']));assert jobs.json()['tasks'][0]['task_id']==body['client_task_id']
    registration={'provider_id':body['provider_id'],'model':original['model'],'catalog_id':catalog['catalog_id'],'task_id':body['client_task_id'],'name':'本人旁白','language':'Chinese','gender':'MALE','age':'ADULT'}
    response=world['editor'].put('/api/canvas-audio-voices/registration',json=registration,headers=headers(world['a']));assert response.status_code==200,response.text
    with patch.object(httpx.AsyncClient,'post',directory([voice_id])):
        listed=world['editor'].get('/api/canvas-audio-voices',params={'provider_id':body['provider_id'],'model':original['model']},headers=headers(world['a'])).json()
    assert listed['voices'][0]['source']=='clone'
    speech={**original,'client_task_id':'canvas_audio_'+uuid.uuid4().hex,'timbre_id':voice_id};assert submit(world,speech,lease).status_code==200
    with patch.object(httpx.AsyncClient,'post',speech_supplier([])):assert execute(world,speech['client_task_id'])['status']=='succeeded'
    async def deletion(client,url,**kwargs):
        assert kwargs['json']=={'voice_type':'voice_cloning','voice_id':voice_id}
        return httpx.Response(200,request=httpx.Request('POST',url),json={'base_resp':{'status_code':0},'voice_id':voice_id})
    with patch.object(httpx.AsyncClient,'post',deletion):
        removed=world['editor'].post('/api/canvas-audio-voices/delete',json={key:registration[key] for key in ('provider_id','model','catalog_id')}|{'voice_id':voice_id},headers=headers(world['a']))
    assert removed.status_code==200 and removed.json()['state']=='deleted'
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(body['client_task_id'],)).fetchone()['n']==1
        assert len(conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s',(body['client_task_id'],)).fetchone()['input_asset_ids'])==1


@pytest.mark.parametrize('sample,code',[(recording(2),400),(recording(12,True),400),(recording(62),400)],ids=['too-short','silent','too-long'])
def test_audio_voice_clone_rejects_invalid_recordings_before_admission(world,platform,sample,code):
    _,_,lease,body,_,_=prepare_clone(world,platform,sample)
    assert submit(world,body,lease).status_code==code


def test_audio_voice_clone_unknown_submission_is_retained_without_another_clone(world,platform):
    from app.storage import media,database,tasks
    from app.storage.workspace import workspace_scope
    _,_,lease,body,_,_=prepare_clone(world,platform)
    assert submit(world,{**body,'clone_terms_accepted':False},lease).status_code==422
    assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',clone_supplier(calls,True)):
        task=execute(world,body['client_task_id'])
    assert task['status']=='needs_review',task
    assert [call[0] for call in calls]==['upload','clone']
    assert submit(world,body,lease).json()['task_id']==body['client_task_id']
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert not conn.execute('SELECT id FROM tasks WHERE id=%s AND status=\'queued\'',(body['client_task_id'],)).fetchone()


def test_audio_voice_clone_publication_recovery_downloads_without_another_paid_call(world,platform):
    from app.storage import media,database
    from app.storage.workspace import workspace_scope
    _,_,lease,body,_,_=prepare_clone(world,platform)
    assert submit(world,body,lease).status_code==200
    async def fail(*args,**kwargs):raise OSError('temporary publication failure')
    calls=[]
    with patch.object(httpx.AsyncClient,'post',clone_supplier(calls)),patch.object(media,'download_remote',fail):
        task=execute(world,body['client_task_id'])
    assert task['status']=='finalizing',task
    with patch.object(httpx.AsyncClient,'post',side_effect=AssertionError('must not clone again')),patch.object(media,'download_remote',download):
        recovered=execute(world,body['client_task_id'])
    assert recovered['status']=='succeeded',recovered
    assert [call[0] for call in calls]==['upload','clone']


def test_audio_voice_clone_respects_catalog_scope_and_revocation_between_upload_and_clone(world,platform):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    _,_,lease,body,_,_=prepare_clone(world,platform)
    assert submit(world,{**body,'voice_catalog_id':'0'*64},lease).status_code==409
    assert world['viewer'].post('/api/canvas-audio-tasks',headers=headers(world['a']),json=body).status_code==403
    assert submit(world,{**body,'sample_audio':'/assets/cloud/ast_'+'0'*32+'/unknown.wav'},lease).status_code==404
    assert submit(world,body,lease).status_code==200
    calls=[];respond=clone_supplier(calls)
    async def revoke(client,url,**kwargs):
        response=await respond(client,url,**kwargs)
        assert url.endswith('/files/upload')
        changed=platform['client'].put('/api/provider-assignments',params={'workspace':world['a']['id']},json={'expected_version':2,'provider_ids':[],'primary_provider_id':'','reason':'克隆上传后撤销供应商'})
        assert changed.status_code==200,changed.text
        return response
    with patch.object(httpx.AsyncClient,'post',revoke):
        task=execute(world,body['client_task_id'])
    assert task['status']=='needs_review',task
    assert [call[0] for call in calls]==['upload']
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(body['client_task_id'],)).fetchone()['n']==0
