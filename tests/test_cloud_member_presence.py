"""Presence across processes, sessions, spaces and real WebSocket lifetime."""
import json
import os
import subprocess
import sys
import time
import uuid

import pytest
from test_cloud_member_gateway import operator, world, headers, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def principal(world, key='editor'):
    from app.services import members
    from app.services.member_gateway import COOKIE
    return members.resolve_session(world[key].cookies.get(COOKIE))


def snapshot(world, key='viewer', space='a'):
    result = world[key].get('/api/maintenance/status', headers=headers(world[space]))
    assert result.status_code == 200, result.text
    return result.json()['presence']


def ids(value):
    return {row['id'] for row in value['members']}


def page(world, client='editor', canvas=None, **changes):
    if canvas is None:
        result = world['editor'].post('/api/canvases', headers=headers(world['a']), json={'title': '在线协作验收'})
        assert result.status_code == 200, result.text
        canvas = result.json()['canvas']['id']
    body = {'page_id': str(uuid.uuid4()), 'sequence': 1, 'dirty': False, **changes}
    result = world[client].post('/api/canvases/'+canvas+'/page-state', headers=headers(world['a']), json=body)
    assert result.status_code == 200, result.text
    return canvas, body, result.json()['presence']


def test_presence_written_by_one_process_is_visible_to_another_and_http(world):
    actor, socket_id = principal(world), str(uuid.uuid4())
    code = '''import sys,json
sys.path.insert(0,'.')
from app.services.authorization import Principal
from app.services.member_presence import status
from app.storage.workspace import workspace_scope
from app.storage import database
value=json.load(sys.stdin)
try:
 with workspace_scope(value['workspace']):
  result=status(Principal(value['member'],value['session'],'workbench'),value.get('socket'))
  print(json.dumps(result))
finally: database.close()
'''
    def child(register):
        payload = {'member': actor.member_id, 'session': actor.session_id, 'workspace': world['a']['id']}
        if register:
            payload['socket'] = socket_id
        result = subprocess.run([sys.executable, '-c', code], input=json.dumps(payload), env=os.environ.copy(),
            capture_output=True, text=True, encoding='utf-8', timeout=20,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    first, second = child(True), child(False)
    assert first['presence']['members'] == second['presence']['members']
    assert ids(snapshot(world)) == {actor.member_id}
    # Both child processes exited; no shared Python dictionary can satisfy this.
    assert snapshot(world, 'outsider', 'b')['online_members'] == 0
    from app.storage.database import connection
    with connection() as conn:
        conn.execute("UPDATE member_presence_sockets SET seen_at=clock_timestamp()-interval '36 seconds' WHERE id=%s", (socket_id,))
    assert snapshot(world)['members'] == []


def test_tabs_and_sockets_deduplicate_with_server_identity_and_canvas_scope(world):
    canvas, _, first = page(world)
    page(world, canvas=canvas)
    _, _, together = page(world, 'viewer', canvas)
    other, _, _ = page(world)
    assert first['online_members'] == 1 and together['online_members'] == 2
    assert {row['display_name'] for row in together['members']} == {'同名成员'}
    actor = principal(world)
    from app.services import member_presence
    from app.storage.workspace import workspace_scope
    with workspace_scope(world['a']['id']):
        member_presence.status(actor, uuid.uuid4())
    assert snapshot(world)['online_members'] == 2
    _, _, other_roster = page(world, canvas=other)
    assert ids(other_roster) == {actor.member_id}
    for row in together['members']:
        assert set(row) == {'id', 'display_name', 'avatar', 'is_self', 'activity'}
        assert row['activity'] == 'viewing'
    assert world['people'][2]['id'] not in json.dumps(together)


def test_editing_indicator_uses_current_lease_not_reported_or_online_state(world):
    from app.storage.database import connection
    canvas, body, _ = page(world)
    path = '/api/canvases/'+canvas
    head = headers(world['a'])
    lease = world['editor'].post(path+'/edit-lease/acquire', headers=head, json={}).json()
    assert lease['holder']['id'] == world['people'][0]['id']
    _, _, value = page(world, 'viewer', canvas)
    assert next(r for r in value['members'] if r['id']==world['people'][0]['id'])['activity']=='editing'
    # Closing the editor page removes presence, but cannot release its lease.
    page(world, canvas=canvas, **{**body, 'sequence': 2, 'closed': True})
    _, _, value = page(world, 'viewer', canvas)
    assert ids(value) == {world['people'][1]['id']}
    assert world['viewer'].get(path+'/edit-lease', headers=head).json()['holder'] is not None
    page(world, canvas=canvas)
    with connection() as conn:
        conn.execute("UPDATE canvas_edit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE canvas_id=%s", (canvas,))
    assert all(row['activity']=='viewing' for row in snapshot(world)['members'])


@pytest.mark.parametrize('revoke', ['logout', 'expire', 'disable', 'auth_version', 'membership', 'read_role', 'edit_role'])
def test_subject_revocation_is_visible_before_its_next_heartbeat(world, revoke):
    from app.services import members, member_presence
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    actor = principal(world)
    canvas, _, _ = page(world)
    world['editor'].post('/api/canvases/'+canvas+'/edit-lease/acquire', headers=headers(world['a']), json={})
    with workspace_scope(world['a']['id']):
        member_presence.status(actor, uuid.uuid4())
    if revoke == 'logout':
        members.logout(actor)
    elif revoke in {'expire', 'auth_version'}:
        with connection() as conn:
            if revoke == 'expire':
                conn.execute('UPDATE member_sessions SET expires_at=clock_timestamp() WHERE id=%s', (actor.session_id,))
            else:
                conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s', (actor.member_id,))
    elif revoke == 'disable':
        members.set_member_status(world['operator'], actor.member_id, 'disabled')
    elif revoke == 'membership':
        members.remove_workspace_member(world['operator'], actor.member_id, world['a']['id'])
    else:
        permissions = ['asset.read'] if revoke=='read_role' else ['canvas.read']
        role = members.create_role(world['operator'], '在线权限验证', permissions, world['a']['id'])
        members.assign_roles(world['operator'], actor.member_id, [role], world['a']['id'])
    value = snapshot(world)
    if revoke == 'edit_role':
        # Role changes fence the old auth-version observations. A fresh,
        # authorized heartbeat can advertise viewing, but never the old lease.
        assert value['members']==[]
        page(world, canvas=canvas)
        value=snapshot(world)
        assert ids(value)=={actor.member_id} and value['members'][0]['activity']=='viewing'
    else:
        assert value['members']==[]


def test_socket_disconnect_cleans_only_itself_and_never_releases_a_lease(world):
    from app.storage.database import connection
    actor = principal(world)
    canvas, _, _ = page(world)
    head = headers(world['a'])
    path = '/api/canvases/'+canvas
    lease = world['editor'].post(path+'/edit-lease/acquire', headers=head, json={}).json()
    address = '/ws/stats?workspace='+world['a']['id']+'&client_id=forged'
    origin = {'Origin':os.environ['PUBLIC_BASE_URL']}
    with world['editor'].websocket_connect(address, headers=origin) as first:
        assert first.receive_json()['online_members']==1
        with world['editor'].websocket_connect(address, headers=origin) as second:
            assert second.receive_json()['online_members']==1
            with connection() as conn:
                assert conn.execute('SELECT count(*) AS n FROM member_presence_sockets WHERE member_id=%s', (actor.member_id,)).fetchone()['n']==2
        deadline=time.monotonic()+2
        while True:
            with connection() as conn:
                remaining=conn.execute('SELECT count(*) AS n FROM member_presence_sockets WHERE member_id=%s', (actor.member_id,)).fetchone()['n']
            if remaining==1: break
            assert time.monotonic()<deadline, remaining
            time.sleep(.01)
        assert world['editor'].get(path+'/edit-lease', headers=head).json()['generation']==lease['generation']
    deadline=time.monotonic()+2
    while True:
        with connection() as conn:
            remaining=conn.execute('SELECT count(*) AS n FROM member_presence_sockets WHERE member_id=%s', (actor.member_id,)).fetchone()['n']
        if remaining==0: break
        assert time.monotonic()<deadline, remaining
        time.sleep(.01)
    assert world['editor'].get(path+'/edit-lease', headers=head).json()['holder'] is not None


def test_delayed_page_messages_cannot_reopen_closed_presence(world):
    canvas, body, _ = page(world)
    _, _, closed = page(world, canvas=canvas, **{**body, 'closed':True, 'sequence':3})
    assert closed['online_members']==0
    _, _, delayed = page(world, canvas=canvas, **{**body, 'sequence':2})
    assert delayed['online_members']==0
    _, _, replay = page(world, canvas=canvas, **{**body, 'sequence':4})
    assert replay['online_members']==0


def test_cancelled_socket_waits_for_inflight_heartbeat_before_cleanup(world, monkeypatch):
    import threading
    from app.services import member_presence
    from app.storage.database import connection
    actor = principal(world)
    original = member_presence.status
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    calls = 0
    def delayed(actor, socket_id=None):
        nonlocal calls
        calls += 1
        if calls == 2:
            entered.set()
            assert release.wait(3)
            result = original(actor, socket_id)
            finished.set()
            return result
        return original(actor, socket_id)
    monkeypatch.setattr(member_presence, 'status', delayed)
    address='/ws/stats?workspace='+world['a']['id']
    with world['editor'].websocket_connect(address, headers={'Origin':os.environ['PUBLIC_BASE_URL']}) as ws:
        assert ws.receive_json()['online_members']==1
        ws.send_text('ping')
        assert entered.wait(3)
        # TestClient cancels the ASGI socket at exit while the DB heartbeat is
        # still in flight. Cleanup must run after that write, never before it.
        timer=threading.Timer(.1, release.set)
        timer.start()
    assert finished.wait(3)
    timer.join()
    deadline=time.monotonic()+2
    while True:
        with connection() as conn:
            remaining=conn.execute('SELECT count(*) AS n FROM member_presence_sockets WHERE member_id=%s', (actor.member_id,)).fetchone()['n']
        if remaining==0: break
        assert time.monotonic()<deadline, remaining
        time.sleep(.01)
