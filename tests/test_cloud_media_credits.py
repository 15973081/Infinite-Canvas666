import asyncio
import os
from pathlib import Path
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import media_credits, credit_wallet, video_duration, provider_control
from app.storage import database, media, tasks, worker
from app.storage.workspace import workspace_scope
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_image_credits import finish_again
from test_cloud_mediakit_tasks import Supplier
from test_cloud_management import platform

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
VIDEO=Path(__file__).parent/'fixtures'/'shadoxai-audio-source.mp4'


@pytest.fixture
def env(world):
    actor=world['operator']
    for pid, models in media_credits.bindings().items():
        old=next((p for p in provider_control.catalog(actor)['providers'] if p['id']==pid),None)
        provider_control.save(actor,pid,{'enabled':True,'name':pid,'protocol':pid,
            'base_url':'https://ark.cn-beijing.volces.com/api/v3' if pid=='volcengine' else 'https://mediakit.test',
            'video_models':[m for m in models if m!='video-understand-router'],
            'chat_models':['video-understand-router'] if pid=='mediakit' else [],'image_models':[]},
            old['version'] if old else 0,secrets={'api_key':'mediakit-test-only-secret'},reason='媒体积分隔离验收')
    assignment=provider_control.assignments(actor,world['a']['id'])
    provider_control.assign(actor,world['a']['id'],['volcengine','mediakit','comfly'],'volcengine',assignment['version'],reason='媒体积分验收')
    uploaded=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':('input.mp4',VIDEO.read_bytes(),'video/mp4')})
    assert uploaded.status_code==200,uploaded.text
    url=uploaded.json()['files'][0]['url']
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':[
        {'id':'source','type':'smart-image','images':[{'url':url,'kind':'video'}]},
        {'id':'target','type':'output','images':[]}], 'connections':[], 'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];lease={**lease,'revision':canvas['revision']}
    owner=world['people'][0]['id']
    with database.connection() as conn:
        credit_wallet.record_grant(conn,owner,source='PLATFORM_GIFT',amount=100000,reference=uuid.uuid4().hex,validity='PERMANENT')
    return {**world,'path':path,'canvas':canvas,'lease':lease,'url':url,'member':owner}


def submit(env,pid='volcengine',model='doubao-seedance-2-5-260628',**changes):
    tid=('canvas_mediakit_' if pid=='mediakit' else 'canvas_vid_')+uuid.uuid4().hex
    body={'provider_id':pid,'model':model,'canvas_id':env['canvas']['id'],'client_task_id':tid}
    if pid=='mediakit':
        body.update(mediakit=True,videos=[env['url']],canvas_target={
            'source_node_id':'source','target_node_id':'target','base_revision':env['canvas']['revision']})
        if model=='video-understand-router':body['prompt']='描述视频'
    else:body.update(prompt='生成视频',duration=5,resolution='720p')
    body.update(changes)
    response=env['editor'].post('/api/canvas-mediakit-tasks' if pid=='mediakit' else '/api/canvas-video-tasks',
        headers=proof(env,env['lease']),json=body)
    return response,body


def hold(tid):
    with database.connection() as conn:
        return conn.execute("SELECT * FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s",(tid,)).fetchone()


def execute(env,tid):
    with workspace_scope(env['a']['id']),database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at='2000-01-01' WHERE id=%s",(tid,))
        row=tasks.claim('media-credit-test');assert row and row['id']==tid
    asyncio.run(worker.execute(row))
    with workspace_scope(env['a']['id']):return tasks.get(tid)


def supplier_context(duration=8,resolution='720p'):
    from contextlib import ExitStack
    from app.routers import canvas
    from app.providers.registry import get_api_provider
    from app.services.volcengine_billing import pricing_context
    async def generate(payload,on_submitted=None):
        if on_submitted:on_submitted('upstream-video')
        raw={'id':'upstream-video','model':payload.model,'resolution':resolution,'usage':{'completion_tokens':10},
             'content':{'video_url':'https://result.test/video.mp4'}}
        if duration is not None:raw['duration']=duration
        provider=get_api_provider(payload.provider_id)
        return await canvas._finish_canvas_video(payload,provider,raw,'upstream-video',pricing_context(provider))
    async def download(*args,**kwargs):
        return media.stable_url(media.publish(VIDEO,asset_id=media.result_slot.get()))
    stack=ExitStack()
    stack.enter_context(patch.object(canvas,'canvas_video_impl',side_effect=generate))
    stack.enter_context(patch('app.services.media.save_remote_video_to_output',side_effect=download))
    return stack


@pytest.mark.parametrize('pid,model',[(p,m) for p,models in media_credits.bindings().items() for m in models])
def test_media_credits_all_twelve_models_freeze(env,pid,model):
    response,body=submit(env,pid,model)
    assert response.status_code==200,response.text
    stored=hold(body['client_task_id'])
    expected={'doubao-seedance-2-5-260628':210,'doubao-seedance-2-0-260128':140,
        'doubao-seedance-2-0-fast-260128':110,'doubao-seedance-2-0-mini-260615':70,
        'doubao-seedance-1-5-pro-251215':25,'doubao-seedance-1-0-pro-250528':50,
        'doubao-seedance-1-0-lite-t2v-250428':25,'doubao-seedance-1-0-lite-i2v-250428':25,
        'enhance-video':2,'erase-video-subtitle':4,'erase-video-subtitle-pro':8,'video-understand-router':4}
    assert stored['status']=='FROZEN' and stored['frozen_credits']==expected[model]
    if pid=='mediakit':
        with Supplier(model).context():task=execute(env,body['client_task_id'])
        assert task['status']=='succeeded',task
        assert hold(body['client_task_id'])['settled_credits']==(expected[model] if model=='video-understand-router' else expected[model]//2)
        entry = env['editor'].get('/api/account/billing').json()['entries'][0]
        if model == 'video-understand-router':
            assert entry['token_usage']['total_tokens'] == 30
        else:
            assert entry['duration_seconds'] == 1
    else:
        finish_again(env,body['client_task_id'],status='failed')
        assert hold(body['client_task_id'])['status']=='RELEASED'


def test_media_credits_auto_30_to_actual_8_releases_22_seconds(env):
    response,body=submit(env,duration=-1,resolution='')
    assert response.status_code==200,response.text
    tid=body['client_task_id'];assert hold(tid)['frozen_credits']==1260
    with supplier_context():task=execute(env,tid)
    assert task['status']=='succeeded',task
    settled=hold(tid)
    assert (settled['settled_credits'],settled['released_credits'])==(336,924)
    finish_again(env,tid,status='succeeded')
    with database.connection() as conn:
        assert conn.execute('SELECT count(*) n FROM credit_transactions WHERE hold_id=%s',(settled['id'],)).fetchone()['n']==1


@pytest.mark.parametrize('duration,resolution,code',[(31,'720p','credit_actual_exceeds_hold'),
    (30,'1080p','credit_actual_exceeds_hold'),(8,'8k','credit_output_spec_unpriced')])
def test_media_credits_excess_or_unpriced_output_keeps_result_and_hold(env,duration,resolution,code):
    response,body=submit(env,duration=-1);assert response.status_code==200,response.text
    tid=body['client_task_id']
    with supplier_context(duration,resolution):task=execute(env,tid)
    assert task['status']=='needs_review' and task['result']['videos']
    assert task['credit_review']['reason']==code
    assert hold(tid)['status']=='FROZEN'
    with workspace_scope(env['a']['id']):assert media.get_asset(task['result']['videos'][0])['status']=='ready'
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s',(hold(tid)['id'],)).fetchone()


def test_media_credits_missing_output_duration_probes_downloaded_file(env):
    response,body=submit(env,duration=-1);assert response.status_code==200,response.text
    with supplier_context(None):task=execute(env,body['client_task_id'])
    assert task['status']=='succeeded',task
    assert task['result']['video_info']['duration']==2
    assert task['result']['video_info']['duration_source']=='file_probe'
    assert hold(body['client_task_id'])['settled_credits']==84


def test_media_credits_unmeasurable_output_is_reviewable_without_losing_result(env):
    response,body=submit(env,duration=-1);assert response.status_code==200,response.text
    with supplier_context(None),patch('app.services.media.probe_video_duration',return_value=0):
        task=execute(env,body['client_task_id'])
    assert task['status']=='needs_review' and task['result']['videos']
    assert task['credit_review']['reason']=='credit_output_duration_missing'
    assert hold(body['client_task_id'])['status']=='FROZEN'
    from app.storage import finalization
    with workspace_scope(env['a']['id']):finalization.retry(body['client_task_id'])
    with patch('app.routers.canvas.canvas_video_impl',side_effect=AssertionError('must not regenerate')):
        recovered=execute(env,body['client_task_id'])
    assert recovered['status']=='succeeded' and 'credit_review' not in recovered
    assert hold(body['client_task_id'])['settled_credits']==84


def test_media_credits_manual_failure_releases_review_hold(env,platform):
    response,body=submit(env,duration=-1);assert response.status_code==200,response.text
    tid=body['client_task_id']
    with supplier_context(31):task=execute(env,tid)
    assert task['status']=='needs_review'
    info=platform['client'].get('/api/tasks/'+tid,params={'workspace':env['a']['id']}).json()
    response=platform['client'].post('/api/tasks/'+tid+'/review',params={'workspace':env['a']['id']},json={
        'request_id':str(uuid.uuid4()),'expected_version':info['review_version'],'action':'confirm_failed',
        'upstream_verified':True,'note':'核对后退回用户积分'})
    assert response.status_code==200,response.text
    assert hold(tid)['status']=='RELEASED'
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s',(hold(tid)['id'],)).fetchone()


def test_media_credits_historical_duration_backfill_and_external_rejection(env):
    with workspace_scope(env['a']['id']),database.connection() as conn:
        asset=media.get_asset(env['url'])
        assert asset['metadata']['duration_seconds']==2
        conn.execute("UPDATE assets SET metadata=metadata-'duration_seconds' WHERE id=%s",(asset['id'],))
        with patch('app.services.media.probe_video_duration',return_value=2.2) as probe:
            assert video_duration.asset_seconds(conn,env['url'])==3
            assert video_duration.asset_seconds(conn,env['url'])==3
            assert probe.call_count==1
        assert media.get_asset(env['url'])['metadata']['duration_seconds']==3
    response,body=submit(env,videos=['https://external.test/input.mp4'])
    assert response.status_code==400 and response.json()['detail']['code']=='credit_input_video_duration_required'
    assert hold(body['client_task_id']) is None


def test_media_credits_insufficient_funds_roll_back_new_task(env):
    with database.connection() as conn:
        conn.execute('UPDATE credit_grants SET remaining_amount=1 WHERE member_id=%s',(env['member'],))
        conn.execute('UPDATE credit_wallets SET gift_balance=1 WHERE member_id=%s',(env['member'],))
    response,body=submit(env,duration=-1)
    assert response.status_code==402,response.text
    assert response.json()['detail']['required_credits']==1260
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM tasks WHERE id=%s',(body['client_task_id'],)).fetchone()
    assert hold(body['client_task_id']) is None


def test_media_credits_old_saved_policy_gains_new_rules_without_overwriting(env):
    from app.services import credit_policy
    with database.connection() as conn:
        old=credit_policy.read(conn)
        config=credit_policy.defaults()
        config['creditsPerCNY']=31
        config['rules']=[r for r in config['rules'] if r['modelCode'] not in credit_policy.MEDIA_RULE_CODES]
        conn.execute("INSERT INTO credit_policy(id,config,version) VALUES(1,%s,27) ON CONFLICT(id) DO UPDATE SET config=excluded.config,version=27",(Jsonb(config),))
    try:
        response,body=submit(env,model='doubao-seedance-1-0-pro-250528')
        assert response.status_code==200,response.text
        assert hold(body['client_task_id'])['quote_version']==27
        assert hold(body['client_task_id'])['frozen_credits']==50
        public=env['editor'].get('/api/account/credit-policy').json()
        assert public['config']['creditsPerCNY']==31 and public['mode']=='active'
    finally:
        with database.connection() as conn:
            conn.execute('UPDATE credit_policy SET config=%s,version=%s WHERE id=1',(Jsonb(old['config']),old['version']))


def test_media_credits_draft_upgrade_reuses_original_input_metadata(env):
    response,body=submit(env,draft=True,resolution='480p',videos=[env['url']])
    assert response.status_code==200,response.text
    tid=body['client_task_id'];draft=hold(tid)
    assert draft['model_code']=='PIXDANCE_2_5_DRAFT' and draft['frozen_credits']==75
    with supplier_context(5,'480p'):task=execute(env,tid)
    assert task['status']=='succeeded',task
    current=env['editor'].get(env['path'],headers=headers(env['a'])).json()['canvas']
    env['canvas']=current;env['lease']['revision']=current['revision']
    with patch.object(video_duration,'asset_seconds',side_effect=AssertionError('must use source metadata')):
        upgraded,request=submit(env,draft_source_task_id=tid,resolution='1080p')
    assert upgraded.status_code==200,upgraded.text
    new=hold(request['client_task_id'])
    assert new['model_code']=='PIXDANCE_2_5'
    assert new['quote_snapshot']['input_video_metadata']==draft['quote_snapshot']['input_video_metadata']
    assert new['frozen_credits']==75*5+75*2


@pytest.mark.parametrize('route',['/api/chat','/api/chat/stream'])
@pytest.mark.parametrize('provider,model',[('mediakit','video-understand-router'),('mediakit','other'),('comfly','video-understand-router')])
def test_media_credits_chat_rejects_mediakit_before_billing_or_upstream(world,route,provider,model):
    with patch('app.services.chat_billing.begin',side_effect=AssertionError('no billing call')):
        response=world['editor'].post(route,headers=headers(world['a']),json={'provider':provider,'model':model,'message':'hello'})
    assert response.status_code==400,response.text
    assert 'MediaKit' in response.json()['detail']
