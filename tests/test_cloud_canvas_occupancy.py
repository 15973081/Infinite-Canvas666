"""Management lease revocation against real HTTP, PostgreSQL and subscriptions."""
import json
import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas, acquire, proof, save
from test_cloud_canvas_subscriptions import connect, receive, fast_stream
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def payload(lease, **changes):
    return {'expected_generation':lease['generation'],'expected_revision':lease['revision'],
            'confirm':True,'reason':'已联系编辑者，结束失去响应的页面占用',**changes}


def revoke(platform, world, canvas, lease, **changes):
    return platform['client'].post('/api/canvas-occupancy/'+canvas['id']+'/revoke',
        params={'workspace':world['a']['id']},json=payload(lease,**changes))


@pytest.mark.parametrize('kind',['classic','smart'])
def test_revoke_notifies_workbench_and_never_saves_or_grants_credentials(platform,world,kind):
    from app.storage.database import connection
    path,canvas=setup_canvas(world,kind)
    lease=acquire(world,path)
    query={'workspace':world['a']['id']}
    listing=platform['client'].get('/api/canvas-occupancy',params=query)
    assert listing.status_code==200,listing.text
    row=listing.json()['canvases'][0]
    assert row['state']=='active' and row['kind']==kind and row['title']==canvas['title']
    assert row['holder']['id']==world['people'][0]['id']
    for secret in ('token_hash','login_session_id','edit_session_id','nodes','connections',lease['edit_token']):
        assert secret not in listing.text
    with connection() as conn:
        before=conn.execute('SELECT * FROM canvases WHERE id=%s',(canvas['id'],)).fetchone()
    with connect(world,canvas,'editor') as ws:
        assert ws.receive_json()['generation']==lease['generation']
        result=revoke(platform,world,canvas,lease)
        assert result.status_code==200,result.text
        changed=receive(ws,lambda v:v['generation']>lease['generation'])
        assert changed['generation']==lease['generation']+1
        assert changed['revision']==lease['revision']
    assert set(result.json())=={'revoked','canvas_id','generation','revision'}
    assert save(world,path,lease).status_code==409
    assert world['editor'].post(path+'/edit-lease/renew',headers=proof(world,lease)).status_code==409
    assert revoke(platform,world,canvas,lease).status_code==409
    assert platform['client'].get('/api/canvas-occupancy',params=query).json()['canvases'][0]['state']=='released'
    with connection() as conn:
        assert conn.execute('SELECT * FROM canvases WHERE id=%s',(canvas['id'],)).fetchone()==before
        assert conn.execute('SELECT count(*) AS n FROM canvas_release_snapshots WHERE canvas_id=%s',(canvas['id'],)).fetchone()['n']==0
        events=conn.execute("SELECT * FROM collaboration_events WHERE canvas_id=%s AND action='management.revoke'",(canvas['id'],)).fetchall()
        audit=conn.execute("SELECT * FROM management_events WHERE target_id=%s AND action='canvas.occupancy.revoke'",(canvas['id'],)).fetchall()
        assert len(events)==len(audit)==1
        assert audit[0]['workspace_id']==world['a']['id'] and audit[0]['actor_id']==world['operator'].member_id
        assert audit[0]['details']['previous_member_id']==world['people'][0]['id']
        assert audit[0]['details']['reason']==payload(lease)['reason']
    new=acquire(world,path)
    assert new['generation']==lease['generation']+2
    assert revoke(platform,world,canvas,lease).status_code==409
    assert save(world,path,new).status_code==200


def test_scope_permission_audience_origin_and_current_grants(platform,world):
    from app.services import members
    from app.management.application import COOKIE
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    route='/api/canvas-occupancy/'+canvas['id']+'/revoke'
    client=platform['client']
    assert client.get('/api/canvas-occupancy').status_code==422
    assert client.post(route,params={'workspace':world['b']['id']},json=payload(lease)).status_code==404
    role=members.create_role(world['operator'],'只管理画布占用',['canvas.read','canvas.lock.takeover'],world['a']['id'])
    person=world['people'][1]
    members.assign_roles(world['operator'],person['id'],[role],world['a']['id'])
    with TestClient(platform['app'],base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as scoped:
        assert scoped.post('/api/auth/login',json={'username':person['username'],'password':PASSWORD}).status_code==200
        assert [s['id'] for s in scoped.get('/api/me').json()['workspaces']]==[world['a']['id']]
        assert scoped.get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).status_code==200
        assert scoped.get('/api/canvas-occupancy',params={'workspace':world['b']['id']}).status_code==403
        assert scoped.post(route,params={'workspace':world['a']['id']},json=payload(lease),headers={'Origin':'http://localhost:8765'}).status_code==403
        # Keep management access but remove the exact takeover permission.
        members.update_role(world['operator'],role,'审计和画布',['canvas.read','audit.read'],1,world['a']['id'])
        assert scoped.get('/api/me').status_code==200
        assert scoped.get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).status_code==403
        assert scoped.post(route,params={'workspace':world['a']['id']},json=payload(lease)).status_code==403
        from app.services.member_gateway import COOKIE as WORKBENCH_COOKIE
        scoped.cookies.clear()
        scoped.cookies.set(COOKIE,world['editor'].cookies.get(WORKBENCH_COOKIE))
        assert scoped.get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).status_code==401
    # Superadmin is not automatically a reader/takeover delegate for all spaces.
    members.assign_roles(world['operator'],world['people'][2]['id'],[world['b']['roles']['admin']],world['b']['id'])
    members.remove_workspace_member(world['operator'],world['operator'].member_id,world['b']['id'])
    assert client.get('/api/canvas-occupancy',params={'workspace':world['b']['id']}).status_code==403
    assert save(world,path,lease).status_code==200


def test_new_save_takeover_or_expiration_rejects_stale_confirmation(platform,world):
    from app.storage.database import connection
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    assert save(world,path,lease).status_code==200
    assert revoke(platform,world,canvas,lease).status_code==409
    lease=acquire(world,path,takeover='self',expected_generation=lease['generation'],confirm=True)
    for changes in ({'confirm':False},{'reason':'   '},{'expected_generation':True},{'expected_revision':0}):
        assert revoke(platform,world,canvas,lease,**changes).status_code in {400,422}
    with connection() as conn:
        conn.execute("UPDATE canvas_edit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE canvas_id=%s",(canvas['id'],))
    assert revoke(platform,world,canvas,lease).status_code==409
    assert platform['client'].get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).json()['canvases'][0]['state']=='expired'


def test_current_invalid_holder_is_not_reported_as_editing_and_list_is_paginated(platform,world):
    from app.services import members
    from app.storage.database import connection
    made=[setup_canvas(world) for _ in range(3)]
    for path,canvas in made:acquire(world,path)
    members.assign_roles(world['operator'],world['people'][0]['id'],[world['a']['roles']['viewer']],world['a']['id'])
    ids=[];after=''
    while True:
        response=platform['client'].get('/api/canvas-occupancy',params={'workspace':world['a']['id'],'limit':1,'after':after})
        assert response.status_code==200,response.text
        body=response.json();row=body['canvases'][0]
        assert row['state']=='invalid' and row['holder'] is None
        ids.append(row['canvas_id'])
        after=body['next']
        if not after:break
    assert ids==sorted(c['id'] for _,c in made)
    with connection() as conn:
        conn.execute("UPDATE canvases SET document=jsonb_set(document,'{purged_at}','1') WHERE id=%s",(ids[0],))
    body=platform['client'].get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).json()
    assert [r['canvas_id'] for r in body['canvases']]==ids[1:]


def test_revoke_during_drain_keeps_maintenance_and_pending_transfer_invalid(platform,world):
    from app.services import members
    from app.storage.database import connection
    members.assign_roles(world['operator'],world['people'][1]['id'],[world['a']['roles']['editor']],world['a']['id'])
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    transfer=world['viewer'].post(path+'/edit-lease/transfers',headers=headers(world['a'])).json()
    change(world['operator'],world['a']['id'],'draining')
    assert revoke(platform,world,canvas,lease).status_code==200
    assert world['editor'].post(path+'/edit-lease/acquire',headers=headers(world['a']),json={}).status_code==503
    for mode in ('read_only','offline'):change(world['operator'],world['a']['id'],mode)
    assert platform['client'].get('/api/canvas-occupancy',params={'workspace':world['a']['id']}).status_code==200
    assert revoke(platform,world,canvas,lease).status_code==409
    assert world['editor'].get(path,headers=headers(world['a'])).status_code==503
    change(world['operator'],world['a']['id'],'recovering')
    change(world['operator'],world['a']['id'],'normal',confirm_recovery=True)
    status=world['viewer'].get(path+'/edit-lease/transfers',headers=headers(world['a'])).json()
    assert next(r for r in status['requests'] if r['id']==transfer['id'])['status']=='expired'
    assert world['editor'].post(path+'/edit-lease/transfers/'+transfer['id'],headers=proof(world,lease),json={'approve':True,'confirm':True}).status_code==409


def test_audit_failure_rolls_back_lease_and_collaboration_event(platform,world,monkeypatch):
    from app.services import authorization as az, canvas_occupancy
    from app.storage.database import connection
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    def fail(*args,**kwargs):raise RuntimeError('audit unavailable')
    with monkeypatch.context() as patch:
        patch.setattr(az,'audit',fail)
        with pytest.raises(RuntimeError,match='audit unavailable'):
            canvas_occupancy.revoke(world['operator'],world['a']['id'],canvas['id'],**payload(lease))
    with connection() as conn:
        assert conn.execute('SELECT generation FROM canvas_edit_leases WHERE canvas_id=%s',(canvas['id'],)).fetchone()['generation']==lease['generation']
        assert conn.execute("SELECT count(*) AS n FROM collaboration_events WHERE canvas_id=%s AND action='management.revoke'",(canvas['id'],)).fetchone()['n']==0
    assert save(world,path,lease).status_code==200


def test_concurrent_save_and_management_revoke_cannot_both_commit(platform,world):
    from threading import Barrier
    path,canvas=setup_canvas(world)
    lease=acquire(world,path)
    barrier=Barrier(2)
    def saving():barrier.wait(timeout=5);return save(world,path,lease)
    def revoking():barrier.wait(timeout=5);return revoke(platform,world,canvas,lease)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a=pool.submit(saving);b=pool.submit(revoking)
        results=[a.result(timeout=15),b.result(timeout=15)]
    assert sorted(r.status_code for r in results)==[200,409],[r.text for r in results]
