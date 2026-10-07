import json
import os
from copy import deepcopy
import httpx
import pytest
from test_cloud_chat import chat_world, operator, world, headers
from test_cloud_llm_tasks import prepared, submit, execute, supplier

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
CLIENT=httpx.AsyncClient
TOKEN={'kind':'chat','model':'deepseek-test','billing_type':'per_million_tokens','input_price':'2','output_price':'8','cached_input_price':'0.5'}
USAGE={'prompt_tokens':1000,'completion_tokens':500,'prompt_tokens_details':{'cached_tokens':200}}


def configure(w,price):
    from app.services import provider_control as pc
    row=next(p for p in pc.catalog(w['operator'])['providers'] if p['id']==w['payload']['provider'])
    config={k:deepcopy(v) for k,v in row['config'].items() if k in pc.CONFIG_FIELDS};config['model_prices']=[price]
    return pc.save(w['operator'],row['id'],config,row['version'],reason='隔离计费验收')


def mock_upstream(monkeypatch,usage=USAGE,*,status=200,complete=True,change=None,timeout=False):
    from app.routers import chat
    calls=[]
    def upstream(req):
        body=json.loads(req.content);calls.append(body)
        if change: change()
        if timeout: raise httpx.ReadTimeout('response lost',request=req)
        if status!=200:return httpx.Response(status,json={'error':{'message':'rate limit'}})
        if body.get('stream'):
            chunks=[{'choices':[{'delta':{'content':'计费测试回复'}}]}]
            if usage is not None:chunks.append({'choices':[],'usage':usage})
            return httpx.Response(200,text=''.join('data: '+json.dumps(c)+'\n\n' for c in chunks)+('data: [DONE]\n\n' if complete else ''))
        return httpx.Response(200,json={'choices':[{'message':{'content':'计费测试回复'}}],'usage':usage})
    monkeypatch.setattr(chat.httpx,'AsyncClient',lambda **kw:CLIENT(**kw,transport=httpx.MockTransport(upstream)))
    return calls


def result(response,path):
    assert response.status_code==200,response.text
    return [json.loads(s[5:]) for s in response.text.splitlines() if s.startswith('data:')][-1] if path.endswith('stream') else response.json()


@pytest.mark.parametrize('path',['/api/chat','/api/chat/stream'])
@pytest.mark.parametrize('price,expected',[(TOKEN,5700),
    ({'kind':'chat','model':'deepseek-test','billing_type':'per_call','unit_price':'0.2'},200000),
    ({'kind':'chat','model':'deepseek-test','billing_type':'disabled'},0)])
def test_chat_billing_modes_are_server_owned_private_and_idempotent(chat_world,monkeypatch,path,price,expected):
    from app.storage.database import connection
    from app.services import chat_billing
    w=chat_world;configure(w,price);calls=mock_upstream(monkeypatch)
    res=result(w['editor'].post(path,headers={**headers(w['a']),'X-User-ID':w['people'][1]['id']},json=w['payload']),path)
    cost=res['message']['cost'];assert cost.get('amount_micros',0)==expected
    assert cost['billing_type']==price['billing_type']
    assert len(calls)==1
    if path.endswith('stream') and price['billing_type']=='per_million_tokens':assert calls[0]['stream_options']=={'include_usage':True}
    report=w['editor'].get('/api/account/billing').json();assert report['records']==1
    entry=report['entries'][0];assert entry['member_id']==w['people'][0]['id'] and entry['attribution']=='server_chat'
    assert entry['token_usage']['input_tokens']==1000 and entry['conversation_id']==res['conversation']['id']
    assert w['editor'].get('/api/account/billing',params={'canvas_query':res['conversation']['id']}).json()['records']==1
    assert w['editor'].get('/api/account/billing',params={'canvas_query':'no-matching-conversation'}).json()['records']==0
    assert w['viewer'].get('/api/account/billing').json()['records']==0
    with connection() as conn:
        row=conn.execute('SELECT * FROM ai_chat_calls WHERE id=%s',(entry['chat_call_id'],)).fetchone()
        assert row['member_id']==w['people'][0]['id'] and row['status']=='succeeded'
    assert chat_billing.finish({'workspace':w['a']['id'],'id':row['id']},None,'uncertain')==cost
    assert w['editor'].get('/api/account/billing').json()['records']==1
    assert w['editor'].delete('/api/conversations/'+res['conversation']['id'],headers=headers(w['a'])).status_code==200
    assert w['editor'].get('/api/account/billing').json()['records']==1


def test_price_changes_while_chat_runs_do_not_change_call_snapshot(chat_world,monkeypatch):
    w=chat_world;configure(w,TOKEN)
    changed={**TOKEN,'input_price':'20','output_price':'80'}
    mock_upstream(monkeypatch,change=lambda:configure(w,changed))
    res=result(w['editor'].post('/api/chat',headers=headers(w['a']),json=w['payload']),'/api/chat')
    assert res['message']['cost']['amount_micros']==5700


@pytest.mark.parametrize('path',['/api/chat','/api/chat/stream'])
def test_missing_usage_is_pending_and_per_call_does_not_need_usage(chat_world,monkeypatch,path):
    w=chat_world;configure(w,TOKEN);mock_upstream(monkeypatch,None)
    res=result(w['editor'].post(path,headers=headers(w['a']),json=w['payload']),path)
    assert res['message']['cost']['status']=='unknown' and res['message']['cost']['reason']=='missing_usage'
    configure(w,{'kind':'chat','model':'deepseek-test','billing_type':'per_call','unit_price':'0.1'})
    res=result(w['editor'].post(path,headers=headers(w['a']),json=w['payload']),path)
    assert res['message']['cost']['amount_micros']==100000


@pytest.mark.parametrize('scenario',['truncated','timeout','rejected'])
def test_chat_failures_keep_one_auditable_call_without_retry(chat_world,monkeypatch,scenario):
    w=chat_world;configure(w,{'kind':'chat','model':'deepseek-test','billing_type':'per_call','unit_price':'0.1'})
    calls=mock_upstream(monkeypatch,None,complete=scenario!='truncated',timeout=scenario=='timeout',status=429 if scenario=='rejected' else 200)
    response=w['editor'].post('/api/chat/stream',headers=headers(w['a']),json=w['payload'])
    events=[json.loads(s[5:]) for s in response.text.splitlines() if s.startswith('data:')]
    assert events[-1]['type']=='error' and not any(e['type']=='done' for e in events)
    entry=w['editor'].get('/api/account/billing').json()['entries'][0]
    assert entry['cost_status']==('excluded' if scenario=='rejected' else 'unknown') and entry['amount_micros']=='0'
    assert len(calls)==1


@pytest.mark.parametrize('kind',['classic','smart'])
def test_canvas_llm_uses_same_pricing_and_submission_snapshot(world,kind):
    from app.services import provider_control as pc
    from unittest.mock import patch
    from app.services.canvas_ledger import record_task
    from app.storage.workspace import workspace_scope
    w=world
    row=next(p for p in pc.catalog(w['operator'])['providers'] if p['id']=='comfly')
    config={k:deepcopy(v) for k,v in row['config'].items() if k in pc.CONFIG_FIELDS};config['model_prices']=[{**TOKEN,'model':'test'}]
    saved=pc.save(w['operator'],'comfly',config,row['version'],reason='LLM 计费验收')
    _,canvas,lease,body=prepared(w,kind);assert submit(w,body,lease).status_code==200
    config={k:deepcopy(v) for k,v in saved['config'].items() if k in pc.CONFIG_FIELDS};config['model_prices']=[{'kind':'chat','model':'test','billing_type':'per_call','unit_price':'1'}]
    pc.save(w['operator'],'comfly',config,saved['version'],reason='切换计费模式验收')
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls)):task=execute(w,body['client_task_id'])
    assert task['status']=='succeeded'
    with workspace_scope(w['a']['id']):record_task(task);record_task(task)
    entries=w['editor'].get('/api/account/billing').json()['entries']
    assert len(entries)==1 and entries[0]['billing_type']=='per_million_tokens'
    assert entries[0]['amount_micros']=='80'  # 12 input * 2 + 7 output * 8


def test_management_rejects_double_mode_and_workbench_cannot_edit_prices(chat_world):
    from fastapi import HTTPException
    w=chat_world
    with pytest.raises(HTTPException):configure(w,{**TOKEN,'output_price':True})
    from app.services import provider_control as pc
    row=next(p for p in pc.catalog(w['operator'])['providers'] if p['id']==w['payload']['provider'])
    config={k:deepcopy(v) for k,v in row['config'].items() if k in pc.CONFIG_FIELDS};config['model_prices']=[TOKEN,{**TOKEN,'billing_type':'per_call','unit_price':'1'}]
    with pytest.raises(HTTPException):pc.save(w['operator'],row['id'],config,row['version'],reason='重复模式必须拒绝')
    assert w['editor'].patch('/api/providers/'+row['id'],headers=headers(w['a']),json={'model_prices':[TOKEN]}).status_code==403


def test_private_chat_billing_is_not_in_shared_workspace_export(chat_world,monkeypatch,tmp_path):
    from app.storage import workspace_export
    w=chat_world;configure(w,TOKEN);mock_upstream(monkeypatch)
    result(w['editor'].post('/api/chat',headers=headers(w['a']),json=w['payload']),'/api/chat')
    manifest=workspace_export.export(tmp_path/'shared',w['a']['id'])
    assert 'private_chat_billing' in manifest['excluded']
    assert manifest['counts']['ledger_entries']==0
    assert workspace_export.verify(tmp_path/'shared')['counts']['ledger_entries']==0
    assert w['editor'].get('/api/account/billing').json()['records']==1


@pytest.mark.parametrize('kind',['classic','smart'])
def test_empty_canvas_reply_does_not_charge_a_valid_per_call(world,kind):
    from app.services import provider_control as pc
    from unittest.mock import patch
    w=world
    row=next(p for p in pc.catalog(w['operator'])['providers'] if p['id']=='comfly')
    config={k:deepcopy(v) for k,v in row['config'].items() if k in pc.CONFIG_FIELDS}
    config['model_prices']=[{'kind':'chat','model':'test','billing_type':'per_call','unit_price':'1'}]
    pc.save(w['operator'],'comfly',config,row['version'],reason='空回复计费验收')
    _,_,lease,body=prepared(w,kind);assert submit(w,body,lease).status_code==200
    async def empty(client,url,**kwargs):
        return httpx.Response(200,request=httpx.Request('POST',url),json={'choices':[{'message':{'content':''}}]})
    with patch.object(httpx.AsyncClient,'post',empty):task=execute(w,body['client_task_id'])
    assert task['status']=='succeeded' and task['result']['billing_outcome']=='uncertain'
    entry=w['editor'].get('/api/account/billing').json()['entries'][0]
    assert entry['cost_status']=='unknown' and entry['amount_micros']=='0' and entry['cost_reason']=='uncertain_call'
