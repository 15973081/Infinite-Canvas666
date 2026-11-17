import asyncio
import io
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from PIL import Image

from app.storage import database, tasks, worker, finalization
from app.storage.workspace import workspace_scope
from app.services import credit_wallet, image_credits, provider_control
from app.services.canvas_tasks import save_canvas_task, update_canvas_task
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_finalization import image_supplier

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
PID = 'api-dfe9075f'
PRICES = {'gpt-image-2.5':(8,0), 'gpt-image-2.5-sunburst':(8,0), 'gpt-image-2':(9,3),
          'gpt-image-2-vip':(9,3), 'nano-banana-pro':(14,0), 'nano-banana-2.1':(8,0)}


@pytest.fixture
def images(world):
    actor = world['operator']
    existing = next((p for p in provider_control.catalog(actor)['providers'] if p['id']==PID), None)
    if not existing:
        provider_control.save(actor, PID, {'enabled':True,'name':'Image billing test','protocol':'openai',
            'base_url':'https://supplier.invalid/v1','image_models':list(PRICES),'video_models':[],'chat_models':[],
            'model_prices':[{'kind':'image','model':m,'billing_type':'per_image','unit_price':'0.05'} for m in PRICES]},
            0,secrets={'api_key':'test-only'},reason='图片积分验收')
    assignment = provider_control.assignments(actor, world['a']['id'])
    provider_control.assign(actor, world['a']['id'], ['comfly', PID], PID, assignment['version'], reason='图片积分验收')
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    return {**world, 'path':path, 'canvas':canvas, 'lease':lease, 'member':world['people'][0]['id']}


def fund(env, amount=10000):
    with database.connection() as conn:
        credit_wallet.record_grant(conn, env['member'], source='PLATFORM_GIFT', amount=amount,
            reference=uuid.uuid4().hex,validity='PERMANENT')


def submit(env, model='gpt-image-2', count=4, **changes):
    body = {'client_task_id':'canvas_img_'+uuid.uuid4().hex,'canvas_id':env['canvas']['id'],
            'provider_id':PID,'model':model,'prompt':'private image prompt','size':'1024x1024','quality':'auto','n':count, **changes}
    return env['editor'].post('/api/canvas-image-tasks', headers=proof(env, env['lease']), json=body), body


def hold(tid):
    with database.connection() as conn:
        return conn.execute("SELECT * FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s", (tid,)).fetchone()


def claim(env, tid):
    with workspace_scope(env['a']['id']), database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at='2000-01-01' WHERE id=%s", (tid,))
        row = tasks.claim('image-credit-test')
        assert row and row['id']==tid
        return row


def finish_again(env, tid, **changes):
    with workspace_scope(env['a']['id']), database.connection() as conn:
        token = uuid.uuid4()
        conn.execute("UPDATE tasks SET lease_owner='callback-test',lease_token=%s,lease_until=now()+interval '1 minute' WHERE id=%s", (token,tid))
        context = tasks.lease_context.set((tid, token))
        try:
            return update_canvas_task(tid, **changes)
        finally:
            tasks.lease_context.reset(context)
            conn.execute('UPDATE tasks SET lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s', (tid,))


@pytest.mark.parametrize('model', PRICES)
@pytest.mark.parametrize('count', [1,4])
def test_image_credits_six_models_quote_and_freeze_before_submission(images, model, count):
    fund(images)
    stream=io.BytesIO();Image.new('RGB',(8,8),'blue').save(stream,format='PNG')
    uploaded=images['editor'].post('/api/ai/upload',headers=headers(images['a']),files={'files':('ref.png',stream.getvalue(),'image/png')})
    assert uploaded.status_code==200,uploaded.text
    refs=[{'url':uploaded.json()['files'][0]['url'],'kind':'image'}]
    response, body=submit(images,model,count,reference_images=refs)
    assert response.status_code==200,response.text
    record=hold(body['client_task_id'])
    unit, extra=PRICES[model]
    assert record['frozen_credits']==unit*count+extra and record['status']=='FROZEN'
    assert record['member_id']==images['member'] and record['workspace_id']==images['a']['id']
    assert record['quote_snapshot']['input']['input_image_count']==1
    duplicate=images['editor'].post('/api/canvas-image-tasks',headers=proof(images,images['lease']),json=body)
    assert duplicate.status_code==200 and hold(body['client_task_id'])['id']==record['id']
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM task_submissions WHERE task_id=%s',(body['client_task_id'],)).fetchone()
    finish_again(images,body['client_task_id'],status='cancelled')


def test_image_credits_insufficient_balance_has_no_task_hold_or_supplier_call(images):
    fund(images, 1)
    with patch('app.routers.providers.generate_ai_image', side_effect=AssertionError('must not call supplier')) as supplier:
        response, body=submit(images)
    assert response.status_code==402,response.text
    assert response.json()['detail']=={'code':'insufficient_credits','available_balance':1,'required_credits':36}
    assert supplier.call_count==0
    with database.connection() as conn:
        for table,column in [('tasks','id'),('credit_holds','source_id'),('task_submissions','task_id')]:
            assert not conn.execute('SELECT 1 FROM '+table+' WHERE '+column+'=%s',(body['client_task_id'],)).fetchone()
        assert conn.execute('SELECT frozen_balance FROM credit_wallets WHERE member_id=%s',(images['member'],)).fetchone()['frozen_balance']==0


@pytest.mark.parametrize('succeeded', [4,2,0])
def test_image_credits_batch_end_to_end_and_duplicate_callbacks(images,succeeded):
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id'];calls=[]
    async def supplier(*args,**kwargs):
        if len(calls)>=succeeded:
            calls.append('failed');raise HTTPException(400,'generation rejected')
        return await image_supplier(calls)(*args,**kwargs)
    with patch('app.routers.providers.generate_ai_image',side_effect=supplier):
        asyncio.run(worker.execute(claim(images,tid)))
    assert len(calls)==4
    result=hold(tid)
    assert result['status']==('SETTLED' if succeeded else 'RELEASED')
    assert (result['settled_credits'],result['released_credits'])==(9*succeeded,36-9*succeeded)
    with workspace_scope(images['a']['id']):
        task=tasks.get(tid)
        assert task['status']==('succeeded' if succeeded else 'failed')
        if succeeded:
            assert len(task['result']['images'])==succeeded
            assert bool(task['result'].get('partial'))==(succeeded<4)
    finish_again(images,tid,status=task['status'])
    finish_again(images,tid,status=task['status'])
    with database.connection() as conn:
        transactions=conn.execute("SELECT * FROM credit_transactions WHERE hold_id=%s",(result['id'],)).fetchall()
        assert len(transactions)==bool(succeeded)
        if succeeded:assert transactions[0]['amount']==9*succeeded
        cost=conn.execute('SELECT e.* FROM ledger_entries e JOIN ledger_owners o ON o.entry_id=e.id WHERE o.task_id=%s',(tid,)).fetchone()
        assert cost and cost['amount_micros']==succeeded*50000
    row=next(r for r in images['editor'].get('/api/account/tasks').json()['entries'] if r['id']==tid)
    assert row['credit_status']==result['status'] and row['credit_settled']==str(9*succeeded)
    bills=images['editor'].get('/api/account/billing').json()['entries']
    bill=next(b for b in bills if b['task_id']==tid)
    assert bill['credit_hold_id']==result['id'] and bill['credit_released']==str(36-9*succeeded)
    spending=images['editor'].get('/api/account/credits',params={'transaction_type':'SPEND'}).json()
    assert spending['records']==bool(succeeded)
    assert all(e['type']=='SPEND' for e in spending['entries'])


def test_image_credits_finalization_retry_keeps_hold_and_settles_without_regeneration(images):
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id'];calls=[]
    with patch('app.routers.providers.generate_ai_image',side_effect=image_supplier(calls)), \
         patch('app.services.media.save_ai_image_to_output',side_effect=OSError('storage unavailable')):
        asyncio.run(worker.execute(claim(images,tid)))
    assert len(calls)==4 and hold(tid)['status']=='FROZEN'
    with workspace_scope(images['a']['id']):assert tasks.get(tid)['status']=='finalizing'
    with patch('app.routers.providers.generate_ai_image',side_effect=AssertionError('no regeneration')):
        asyncio.run(worker.execute(claim(images,tid)))
    assert hold(tid)['settled_credits']==36


def test_image_credits_snapshot_survives_policy_and_mapping_changes(images,monkeypatch):
    from app.services import credit_policy
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id'];snapshot=hold(tid)['quote_snapshot']
    monkeypatch.setattr(credit_policy,'read',lambda conn: (_ for _ in ()).throw(AssertionError('must use frozen rule')))
    monkeypatch.setattr(image_credits,'bindings',lambda: {})
    calls=[]
    async def supplier(*args,**kwargs):
        if len(calls)>=2:raise HTTPException(400,'failed')
        return await image_supplier(calls)(*args,**kwargs)
    with patch('app.routers.providers.generate_ai_image',side_effect=supplier):
        asyncio.run(worker.execute(claim(images,tid)))
    assert hold(tid)['settled_credits']==18 and hold(tid)['quote_snapshot']==snapshot


def test_image_credits_exhausted_publication_keeps_hold_until_confirmed_failure(images,platform):
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id'];calls=[]
    with patch('app.routers.providers.generate_ai_image',side_effect=image_supplier(calls)), \
         patch('app.services.media.save_ai_image_to_output',side_effect=OSError('storage unavailable')):
        for _ in range(5):
            asyncio.run(worker.execute(claim(images,tid)))
            assert hold(tid)['status']=='FROZEN'
    assert len(calls)==4
    detail=platform['client'].get('/api/tasks/'+tid,params={'workspace':images['a']['id']}).json()
    assert detail['status']=='needs_review' and detail['result_checkpoint']
    assert 'confirm_failed' in detail['actions']
    result=platform['client'].post('/api/tasks/'+tid+'/review',params={'workspace':images['a']['id']},json={
        'request_id':str(uuid.uuid4()),'expected_version':detail['review_version'],
        'action':'confirm_failed','note':'无法交付，退回积分','upstream_verified':True})
    assert result.status_code==200,result.text
    assert hold(tid)['status']=='RELEASED'
    detail=platform['client'].get('/api/tasks/'+tid,params={'workspace':images['a']['id']}).json()
    assert 'retry_finalization' not in detail['actions']
    with workspace_scope(images['a']['id']),pytest.raises(HTTPException) as error:
        finalization.retry(tid)
    assert error.value.detail['code']=='credit_task_finalized'


def test_image_credits_delivery_transaction_failure_rolls_back_settlement(images):
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id']
    with patch('app.routers.providers.generate_ai_image',side_effect=image_supplier([])), \
         patch('app.storage.canvas_asset_groups.save_group',side_effect=OSError('canvas unavailable')):
        asyncio.run(worker.execute(claim(images,tid)))
    assert hold(tid)['status']=='FROZEN'
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s',(hold(tid)['id'],)).fetchone()
    with patch('app.routers.providers.generate_ai_image',side_effect=AssertionError('must not regenerate')):
        asyncio.run(worker.execute(claim(images,tid)))
    assert hold(tid)['settled_credits']==36


def test_image_credits_intermediate_states_zero_outputs_and_manual_failure(images,platform):
    fund(images)
    response,body=submit(images);assert response.status_code==200,response.text
    tid=body['client_task_id']
    for state in ['submitting','polling','finalizing','needs_review']:
        finish_again(images,tid,status=state)
        assert hold(tid)['status']=='FROZEN'
    detail=platform['client'].get('/api/tasks/'+tid,params={'workspace':images['a']['id']}).json()
    failed=platform['client'].post('/api/tasks/'+tid+'/review',params={'workspace':images['a']['id']},json={
        'request_id':str(uuid.uuid4()),'expected_version':detail['review_version'],
        'action':'confirm_failed','note':'确认生成失败','upstream_verified':True})
    assert failed.status_code==200,failed.text
    assert hold(tid)['status']=='RELEASED'
    response,body=submit(images);assert response.status_code==200,response.text
    finish_again(images,body['client_task_id'],status='succeeded',result={'images':[]})
    assert hold(body['client_task_id'])['status']=='RELEASED'
