"""Real canvas subscriptions, cross-process writes and current authorization."""
import json
import os
import subprocess
import sys
import time

import pytest
from starlette.websockets import WebSocketDisconnect
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof, save
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


@pytest.fixture(autouse=True)
def fast_stream(monkeypatch):
    from app.services import canvas_subscriptions
    monkeypatch.setattr(canvas_subscriptions,'POLL_SECONDS',.03)
    monkeypatch.setattr(canvas_subscriptions,'HEARTBEAT_SECONDS',.1)


def connect(world, canvas, actor='viewer', space='a', **kwargs):
    return world[actor].websocket_connect('/ws/canvases/'+canvas['id']+'?workspace='+world[space]['id'],
        headers={'Origin':os.environ['PUBLIC_BASE_URL']}, **kwargs)


def receive(ws, predicate):
    deadline=time.monotonic()+5
    while True:
        value=ws.receive_json()
        if predicate(value):return value
        assert time.monotonic()<deadline,value


@pytest.mark.parametrize('kind',['classic','smart'])
def test_authorized_save_in_another_process_reaches_viewers_and_reconnect(world,kind):
    from app.services.member_gateway import COOKIE
    path,canvas=setup_canvas(world,kind)
    lease=acquire(world,path)
    with connect(world,canvas) as ws:
        first=ws.receive_json()
        code='''import sys,json
sys.path.insert(0,'.')
from fastapi.testclient import TestClient
from main import app
from app.services.member_gateway import COOKIE
from app.storage import database
value=json.load(sys.stdin)
try:
 with TestClient(app) as client:
  client.cookies.set(COOKIE,value['cookie'])
  result=client.put(value['path'],headers=value['headers'],json=value['body'])
  print(json.dumps({'status':result.status_code,'revision':result.json().get('canvas',{}).get('revision')}))
finally: database.close()
'''
        value={'cookie':world['editor'].cookies.get(COOKIE),'path':path,'headers':proof(world,lease),
            'body':{'base_revision':lease['revision'],'title':'来自另一个进程','nodes':[],'connections':[]}}
        result=subprocess.run([sys.executable,'-c',code],input=json.dumps(value),env=os.environ.copy(),capture_output=True,
            text=True,encoding='utf-8',timeout=20,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        assert result.returncode==0,result.stderr
        assert json.loads(result.stdout)=={'status':200,'revision':canvas['revision']+1}
        changed=receive(ws,lambda value:value['revision']>first['revision'])
        assert changed['sequence']>first['sequence'] and changed['generation']==lease['generation']
        assert set(changed)=={'type','workspace_id','canvas_id','revision','generation','maintenance','stamp','sequence'}
        assert lease['edit_token'] not in json.dumps(changed)
        assert world['viewer'].get(path,headers=headers(world['a'])).json()['canvas']['title']=='来自另一个进程'
    with connect(world,canvas) as ws:
        resumed=ws.receive_json()
        assert resumed['revision']==changed['revision'] and resumed['sequence']==1
    assert world['viewer'].get(path+'/edit-lease',headers=headers(world['a'])).json()['holder'] is not None


def test_subscription_is_bound_to_one_canvas_and_ignores_client_resubscribe(world):
    path,canvas=setup_canvas(world)
    other_path,other=setup_canvas(world)
    other_lease=acquire(world,other_path)
    with connect(world,canvas) as ws:
        initial=ws.receive_json()
        ws.send_json({'canvas_id':other['id'],'workspace':world['b']['id'],'member_id':world['people'][2]['id']})
        assert save(world,other_path,other_lease).status_code==200
        next_value=ws.receive_json()
        assert next_value['canvas_id']==canvas['id'] and next_value['workspace_id']==world['a']['id']
        assert next_value['revision']==initial['revision'] and next_value['stamp']==initial['stamp']
    for who,space,target in [('outsider','a',canvas),('outsider','b',canvas),('viewer','a',{'id':'not-found'})]:
        with pytest.raises(WebSocketDisconnect):
            with connect(world,target,who,space):pass
    address='/ws/canvases/'+canvas['id']+'?workspace='+world['a']['id']
    with pytest.raises(WebSocketDisconnect):
        with world['viewer'].websocket_connect(address,headers={'Origin':'https://untrusted.invalid'}):pass
    with pytest.raises(WebSocketDisconnect):
        with world['viewer'].websocket_connect(address+'&member='+world['people'][0]['id'],headers={'Origin':os.environ['PUBLIC_BASE_URL']}):pass


def test_transfer_and_takeover_change_notifications_without_exposing_requests(world):
    from app.services import members
    members.assign_roles(world['operator'],world['people'][1]['id'],[world['a']['roles']['editor']],world['a']['id'])
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    with connect(world,canvas,'editor') as ws:
        initial=ws.receive_json()
        request=world['viewer'].post(path+'/edit-lease/transfers',headers=headers(world['a'])).json()
        asked=receive(ws,lambda v:v['stamp']!=initial['stamp'])
        assert asked['generation']==lease['generation']
        assert request['id'] not in json.dumps(asked) and request['edit_token'] not in json.dumps(asked)
        result=world['editor'].post(path+'/edit-lease/transfers/'+request['id'],headers=proof(world,lease),json={'approve':True,'confirm':True})
        assert result.status_code==200,result.text
        transferred=receive(ws,lambda v:v['generation']>lease['generation'])
        assert transferred['generation']==lease['generation']+1
        assert save(world,path,lease).status_code==409


@pytest.mark.parametrize('action',['logout','disabled','membership','read_permission'])
def test_existing_subscription_closes_when_authorization_is_revoked(world,action):
    from app.services import members
    from app.services.member_gateway import COOKIE
    path,canvas=setup_canvas(world)
    actor=members.resolve_session(world['viewer'].cookies.get(COOKIE))
    with connect(world,canvas) as ws:
        assert ws.receive_json()['canvas_id']==canvas['id']
        if action=='logout':members.logout(actor)
        elif action=='disabled':members.set_member_status(world['operator'],actor.member_id,'disabled')
        elif action=='membership':members.remove_workspace_member(world['operator'],actor.member_id,world['a']['id'])
        else:
            role=members.create_role(world['operator'],'仅素材',['asset.read'],world['a']['id'])
            members.assign_roles(world['operator'],actor.member_id,[role],world['a']['id'])
        with pytest.raises(WebSocketDisconnect) as closed:
            receive(ws,lambda value:False)
        assert closed.value.code==1008
    assert world['viewer'].get(path,headers=headers(world['a'])).status_code in {401,403}


def test_maintenance_notifications_continue_without_serving_canvas_contents(world):
    path,canvas=setup_canvas(world)
    with connect(world,canvas) as ws:
        assert ws.receive_json()['maintenance']['mode']=='normal'
        for mode in ('draining','read_only','offline'):
            change(world['operator'],world['a']['id'],mode)
            value=receive(ws,lambda v:v['maintenance']['mode']==mode)
        assert 'document' not in value and 'requests' not in value and 'holder' not in value
        assert world['viewer'].get(path,headers=headers(world['a'])).status_code==503
        change(world['operator'],world['a']['id'],'recovering')
        assert receive(ws,lambda v:v['maintenance']['mode']=='recovering')
        change(world['operator'],world['a']['id'],'normal',confirm_recovery=True)
        assert receive(ws,lambda v:v['maintenance']['mode']=='normal')


def test_expired_lease_changes_stamp_even_without_new_generation_or_revision(world):
    from app.storage.database import connection
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    with connect(world,canvas) as ws:
        initial=ws.receive_json()
        with connection() as c:
            c.execute("UPDATE canvas_edit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE canvas_id=%s",(canvas['id'],))
        value=receive(ws,lambda v:v['stamp']!=initial['stamp'])
        assert value['generation']==lease['generation'] and value['revision']==canvas['revision']
        assert world['viewer'].get(path+'/edit-lease',headers=headers(world['a'])).json()['holder'] is None
