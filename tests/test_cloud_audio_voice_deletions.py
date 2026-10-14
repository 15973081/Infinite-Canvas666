"""Own supplier voices are deleted once; audio originals and bills survive."""
import os
import uuid
from unittest.mock import patch
import httpx
import pytest
from test_cloud_audio_tasks import prepared,submit,execute,MP3
from test_cloud_audio_voice_design import design_body,directory
from test_cloud_member_gateway import operator,world,headers
from test_cloud_management import platform
pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def registered(world,platform):
    path,canvas,lease,original,_=prepared(world,platform,voice_design=True)
    params={'provider_id':original['provider_id'],'model':original['model']}
    with patch.object(httpx.AsyncClient,'post',directory()):
        catalog=world['editor'].get('/api/canvas-audio-voices',params=params,headers=headers(world['a'])).json()
    body=design_body(original);body['voice_catalog_id']=catalog['catalog_id']
    assert submit(world,body,lease).status_code==200
    async def supplier(client,url,**kwargs):
        return httpx.Response(200,request=httpx.Request('POST',url),json={'base_resp':{'status_code':0},'voice_id':kwargs['json']['voice_id'],'trial_audio':MP3.read_bytes().hex()})
    with patch.object(httpx.AsyncClient,'post',supplier):result=execute(world,body['client_task_id'])
    voice=result['result']['audio_info']['voice_id']
    registration={**params,'catalog_id':catalog['catalog_id'],'task_id':body['client_task_id'],'name':'城市旁白','language':'Chinese','gender':'MALE','age':'ADULT'}
    response=world['editor'].put('/api/canvas-audio-voices/registration',json=registration,headers=headers(world['a']));assert response.status_code==200,response.text
    return path,canvas,lease,original,result,registration,{**params,'catalog_id':catalog['catalog_id'],'voice_id':voice}


def reply(calls,voice,*,unknown=False,rejected=False):
    async def supplier(client,url,**kwargs):
        assert url.endswith('/delete_voice');calls.append(kwargs['json'])
        if unknown:raise httpx.ReadTimeout('test only')
        return httpx.Response(200,request=httpx.Request('POST',url),json={'base_resp':{'status_code':1004 if rejected else 0},'voice_id':voice})
    return supplier


def test_audio_voice_delete_is_idempotent_cleans_library_and_preserves_originals(world,platform):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    path,canvas,lease,original,result,registration,payload=registered(world,platform)
    with workspace_scope(world['a']['id']),database.connection() as conn:
        fees=conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall();assets=conn.execute('SELECT * FROM assets ORDER BY id').fetchall()
    favorite={**payload,'favorite':True};assert world['editor'].put('/api/canvas-audio-voices/favorite',json=favorite,headers=headers(world['a'])).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',reply(calls,payload['voice_id'])):
        first=world['editor'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a']));assert first.status_code==200,first.text
        second=world['editor'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a']))
    assert first.json()['state']==second.json()['state']=='deleted';assert len(calls)==1
    assert calls[0]=={'voice_id':payload['voice_id'],'voice_type':'voice_generation'}
    assert world['viewer'].get(result['result']['audios'][0],headers=headers(world['a'])).content==MP3.read_bytes()
    assert world['editor'].put('/api/canvas-audio-voices/registration',json=registration,headers=headers(world['a'])).status_code==409
    assert submit(world,{**original,'client_task_id':'canvas_audio_'+uuid.uuid4().hex,'timbre_id':payload['voice_id']},lease).status_code==403
    with patch.object(httpx.AsyncClient,'post',directory([payload['voice_id']])):
        listing=world['editor'].get('/api/canvas-audio-voices',params={k:payload[k] for k in ('provider_id','model')},headers=headers(world['a'])).json()
    assert listing['voices']==[] and listing['has_design_tasks'] is False
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert conn.execute('SELECT * FROM assets ORDER BY id').fetchall()==assets
        assert conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall()==fees
        assert conn.execute('SELECT count(*) AS n FROM audio_voice_favorites WHERE voice_id=%s',(payload['voice_id'],)).fetchone()['n']==0


def test_audio_voice_delete_unknown_queries_without_repeating_and_can_confirm_gone(world,platform):
    _,_,lease,original,_,registration,payload=registered(world,platform);calls=[]
    with patch.object(httpx.AsyncClient,'post',reply(calls,payload['voice_id'],unknown=True)):
        first=world['editor'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a']));assert first.json()['state']=='unknown'
        again=world['editor'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a']));assert again.json()['state']=='unknown'
    assert len(calls)==1
    assert world['editor'].put('/api/canvas-audio-voices/registration',json=registration,headers=headers(world['a'])).status_code==409
    assert submit(world,{**original,'client_task_id':'canvas_audio_'+uuid.uuid4().hex,'timbre_id':payload['voice_id']},lease).status_code==403
    with patch.object(httpx.AsyncClient,'post',directory([payload['voice_id']])):
        present=world['editor'].post('/api/canvas-audio-voices/delete-status',json=payload,headers=headers(world['a']));assert present.json()['state']=='unknown'
    with patch.object(httpx.AsyncClient,'post',directory()):
        gone=world['editor'].post('/api/canvas-audio-voices/delete-status',json=payload,headers=headers(world['a']));assert gone.json()['state']=='deleted'
    assert len(calls)==1


def test_audio_voice_delete_checks_owner_catalog_and_explicit_retry(world,platform):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    _,_,_,_,_,_,payload=registered(world,platform);calls=[]
    assert world['viewer'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a'])).status_code==403
    assert world['outsider'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['b'])).status_code in {403,404}
    assert world['editor'].post('/api/canvas-audio-voices/delete',json={**payload,'catalog_id':'0'*64},headers=headers(world['a'])).status_code==409
    assert world['editor'].post('/api/canvas-audio-voices/delete',json={**payload,'voice_id':'male-qn-qingse'},headers=headers(world['a'])).status_code==404
    with patch.object(httpx.AsyncClient,'post',reply(calls,payload['voice_id'],unknown=True)):
        assert world['editor'].post('/api/canvas-audio-voices/delete',json=payload,headers=headers(world['a'])).json()['state']=='unknown'
    with patch.object(httpx.AsyncClient,'post',reply(calls,payload['voice_id'])):
        confirmed=world['editor'].post('/api/canvas-audio-voices/delete',json={**payload,'retry':True},headers=headers(world['a']));assert confirmed.json()['state']=='deleted'
    assert len(calls)==2
    with workspace_scope(world['a']['id']),database.connection() as conn:
        row=conn.execute('SELECT * FROM audio_voice_deletions WHERE voice_id=%s',(payload['voice_id'],)).fetchone()
        assert row['state']=='deleted' and len(row['history'])==1 and row['history'][0]['state']=='unknown'
