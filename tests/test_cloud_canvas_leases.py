"""Canvas lease protocol against real HTTP and independent PostgreSQL clients."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def setup_canvas(world, kind='classic'):
    client, space = world['editor'], world['a']
    response = client.post('/api/canvases', headers=headers(space), json={'title': '租约验收', 'kind': kind})
    assert response.status_code == 200, response.text
    canvas = response.json()['canvas']
    return '/api/canvases/' + canvas['id'], canvas


def test_deleted_canvas_acknowledges_revision_and_releases_ownership_before_restore(world):
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    response=world['editor'].delete(path,headers=proof(world,lease,canvas['revision']))
    assert response.status_code==200,response.text
    deleted=response.json()['canvas'];assert deleted['id']==canvas['id'] and deleted['deleted_at'] and deleted['revision']>canvas['revision']
    assert world['editor'].post(path+'/edit-lease/release',headers=proof(world,lease,deleted['revision'])).status_code==200
    assert not any(item['id']==canvas['id'] for item in world['editor'].get('/api/canvases',headers=headers(world['a'])).json()['canvases'])
    acquired=world['editor'].post(path+'/edit-lease/acquire',headers=headers(world['a']),json={})
    assert acquired.status_code==200,acquired.text
    restored=world['editor'].post(path+'/restore',headers=proof(world,acquired.json(),deleted['revision']))
    assert restored.status_code==200 and not restored.json()['canvas'].get('deleted_at'),restored.text


def test_native_permanent_delete_hides_canvas_and_preserves_uploaded_assets(world):
    import io
    from PIL import Image
    from app.storage import database
    from app.storage.workspace import workspace_scope
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    content=io.BytesIO();Image.new('RGB',(16,16),'blue').save(content,format='PNG')
    uploaded=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':('retained.png',content.getvalue(),'image/png')})
    assert uploaded.status_code==200,uploaded.text
    source=uploaded.json()['files'][0]['url']
    saved=world['editor'].put(path,headers=proof(world,lease,canvas['revision']),json={'nodes':[{'id':'source','type':'smart-image','images':[{'url':source,'kind':'image'}]}],'connections':[],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    removed=world['editor'].delete(path,headers=proof(world,lease,saved.json()['canvas']['revision']))
    assert removed.status_code==200,removed.text
    revision=removed.json()['canvas']['revision']
    assert world['editor'].post(path+'/edit-lease/release',headers=proof(world,lease,revision)).status_code==200
    fresh=world['editor'].post(path+'/edit-lease/acquire',headers=headers(world['a']),json={});assert fresh.status_code==200,fresh.text
    purged=world['editor'].delete(path+'/purge',headers=proof(world,fresh.json(),revision));assert purged.status_code==200,purged.text
    assert world['editor'].post(path+'/restore',headers=proof(world,fresh.json(),revision)).status_code==404
    assert not any(item['id']==canvas['id'] for item in world['editor'].get('/api/canvases/trash',headers=headers(world['a'])).json()['canvases'])
    assert world['viewer'].get(source,headers=headers(world['a'])).content==content.getvalue()
    with workspace_scope(world['a']['id']),database.connection() as conn:
        retained=conn.execute('SELECT document FROM canvases WHERE id=%s',(canvas['id'],)).fetchone()['document']
        assert retained['purged_at'] and retained['nodes'][0]['images'][0]['url']


def test_retired_canvas_lock_routes_are_gone_and_workspace_lease_still_saves(world):
    from main import app
    from app import state
    assert not hasattr(state, 'canvas_lock_manager')
    assert not any(route.path.endswith(('/lock', '/lock/release')) for route in app.routes if hasattr(route, 'path'))
    path, canvas = setup_canvas(world)
    client = world['editor']
    head = headers(world['a'])
    assert client.get(path + '/lock', headers=head).status_code == 403
    lease = acquire(world, path)
    saved = save(world, path, lease, title='工作空间租约保存')
    assert saved.status_code == 200, saved.text
    revision = saved.json()['canvas']['revision']
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease, revision)).status_code == 200


def run_frontend_client(world, canvas, scenario='collaboration'):
    root = Path(__file__).resolve().parents[1]
    clients = {'owner': world['editor'], 'recipient': world['viewer']}
    process = subprocess.Popen(['node', str(root / 'tests/helpers/canvas-lease-http.cjs'), canvas['id'], scenario], cwd=root,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8',
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    done = None
    try:
        for line in process.stdout:
            message = json.loads(line)
            if message.get('done'):
                done = message
                break
            response = clients[message['actor']].request(message['method'], message['path'],
                headers={**headers(world['a']), **message['headers']}, content=message.get('body'))
            process.stdin.write(json.dumps({'id': message['id'], 'status': response.status_code, 'body': response.json()}) + '\n')
            process.stdin.flush()
        process.wait(timeout=5)
        assert process.returncode == 0, process.stderr.read()
        assert done
        return done
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            stream.close()


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_real_frontend_client_transfer_reject_takeover_and_final_save(world, kind):
    from app.services import members
    from app.storage.database import connection
    members.assign_roles(world['operator'], world['people'][0]['id'], [world['a']['roles']['admin']], world['a']['id'])
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['editor']], world['a']['id'])
    path, canvas = setup_canvas(world, kind)
    done = run_frontend_client(world, canvas)
    assert done['revision'] > canvas['revision']
    assert world['editor'].get(path, headers=headers(world['a'])).json()['canvas']['title'] == 'forced final'
    with connection() as conn:
        events = conn.execute('SELECT action,reason FROM collaboration_events WHERE canvas_id=%s', (canvas['id'],)).fetchall()
        assert [row['action'] for row in events].count('transfer.approve') == 1
        assert [row['action'] for row in events].count('transfer.reject') == 1
        assert [row['action'] for row in events].count('release') == 1
        assert next(row['reason'] for row in events if row['action'] == 'takeover.force') == 'client acceptance takeover'
        assert conn.execute('SELECT count(*) AS n FROM canvas_release_snapshots WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 2


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_real_frontend_failed_start_and_handoff_release_only_unused_grants(world, kind):
    from app.services import members
    from app.storage.database import connection
    for person in world['people'][:2]:
        members.assign_roles(world['operator'], person['id'], [world['a']['roles']['admin']], world['a']['id'])
    path, canvas = setup_canvas(world, kind)
    done = run_frontend_client(world, canvas, 'startup-recovery')
    assert done['revision'] == canvas['revision']
    stored = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
    assert stored['title'] == canvas['title'] and stored['revision'] == canvas['revision']
    assert world['editor'].get(path + '/edit-lease', headers=headers(world['a'])).json()['holder'] is None
    with connection() as conn:
        events = conn.execute('SELECT action FROM collaboration_events WHERE canvas_id=%s', (canvas['id'],)).fetchall()
        assert [row['action'] for row in events].count('release') == 4
        assert [row['action'] for row in events].count('takeover.force') == 1


def acquire(world, path, **body):
    response = world['editor'].post(path + '/edit-lease/acquire', headers=headers(world['a']), json=body)
    assert response.status_code == 200, response.text
    return response.json()


def proof(world, lease, revision=None):
    return {**headers(world['a']), 'X-Canvas-Edit-Token': lease['edit_token'],
            'X-Canvas-Generation': str(lease['generation']),
            'X-Canvas-Revision': str(lease['revision'] if revision is None else revision)}


def save(world, path, lease, revision=None, title='已保存'):
    revision = lease['revision'] if revision is None else revision
    return world['editor'].put(path, headers=proof(world, lease, revision),
                               json={'title': title, 'nodes': [], 'connections': [], 'base_revision': revision})


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_http_save_and_all_canvas_mutation_routes_require_bound_proof(world, kind):
    from app.storage.database import connection
    path, canvas = setup_canvas(world, kind)
    client, space = world['editor'], world['a']
    calls = [('PUT', path, {'base_revision': canvas['revision']}), ('POST', path + '/meta', {'title': 'forged'}),
             ('PATCH', path + '/folder', {'folder_id': ''}), ('DELETE', path, None),
             ('POST', path + '/restore', None), ('DELETE', path + '/purge', None),
             ('POST', path + '/backup', None), ('POST', path + '/backups/1.json/restore', None),
             ('DELETE', path + '/backups/1.json', None), ('POST', path + '/ledger/entries', {'logs': []}),
             ('POST', path + '/ledger/recovery/preview', None), ('POST', path + '/ledger/recovery/apply', {'preview_token': 'a' * 64})]
    for method, url, body in calls:
        response = client.request(method, url, headers=headers(space), json=body)
        assert response.status_code == 428, (url, response.text)
    lease = acquire(world, path)
    result = save(world, path, lease)
    assert result.status_code == 200, result.text
    revision = result.json()['canvas']['revision']
    assert revision == canvas['revision'] + 1
    assert save(world, path, lease).json()['detail']['code'] == 'canvas_revision_conflict'
    backup = client.post(path + '/backup', headers=proof(world, lease, revision))
    assert backup.status_code == 200, backup.text
    meta = client.post(path + '/meta', headers=proof(world, lease, revision), json={'title': '元数据'})
    assert meta.status_code == 200, meta.text
    restored = client.post(path + '/backups/' + backup.json()['filename'] + '/restore', headers=proof(world, lease, revision + 1))
    assert restored.status_code == 200, restored.text
    assert restored.json()['canvas']['title'] == '已保存'
    with connection() as conn:
        row = conn.execute('SELECT created_by,updated_by FROM canvases WHERE id=%s', (canvas['id'],)).fetchone()
        assert row['created_by'] == row['updated_by'] == world['people'][0]['id']


def test_token_is_private_bound_to_login_and_cross_space_cannot_read(world):
    from fastapi.testclient import TestClient
    from main import app
    path, canvas = setup_canvas(world)
    lease = acquire(world, path)
    state = world['viewer'].get(path + '/edit-lease', headers=headers(world['a']))
    assert state.status_code == 200, state.text
    assert state.json()['holder']['display_name'] == '同名成员'
    assert not {'token_hash', 'edit_token', 'login_session_id', 'ip', 'client_id'} & state.json().keys()
    assert lease['edit_token'] not in state.text
    assert all(secret not in json.dumps(state.json()['holder']) for secret in ('token', 'login_session', 'client_id', 'ip"'))
    assert world['viewer'].post(path + '/edit-lease/acquire', headers=headers(world['a']), json={}).status_code == 403
    assert world['outsider'].get(path + '/edit-lease', headers=headers(world['b'])).status_code == 404
    with TestClient(app) as other:
        assert other.post('/api/auth/login', json={'username': world['people'][0]['username'], 'password': PASSWORD}).status_code == 200
        assert other.post(path + '/edit-lease/renew', headers=proof(world, lease)).json()['detail']['code'] == 'canvas_lease_lost'
    forged = proof(world, lease)
    forged['X-Canvas-Edit-Token'] = 'forged'
    assert world['editor'].post(path + '/edit-lease/release', headers=forged).status_code == 409


def test_expiration_takeover_and_release_replay_do_not_reset_generation_or_duplicate_backup(world):
    from app.storage.database import connection, close
    path, canvas = setup_canvas(world)
    first = acquire(world, path)
    client = world['editor']
    renewed = client.post(path + '/edit-lease/renew', headers=proof(world, first))
    assert renewed.status_code == 200 and renewed.json()['generation'] == first['generation']
    second = acquire(world, path, takeover='self', expected_generation=first['generation'], confirm=True)
    assert second['generation'] == first['generation'] + 1
    assert client.post(path + '/edit-lease/release', headers=proof(world, first)).status_code == 409
    assert save(world, path, first).json()['detail']['code'] == 'canvas_lease_lost'
    assert client.post(path + '/edit-lease/release', headers=proof(world, second)).status_code == 200
    assert client.post(path + '/edit-lease/release', headers=proof(world, second)).status_code == 409
    third = acquire(world, path)
    assert third['generation'] == second['generation'] + 1
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_release_snapshots WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 1
        conn.execute("UPDATE canvas_edit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE canvas_id=%s", (canvas['id'],))
    assert save(world, path, third).status_code == 409  # Even though revision is unchanged.
    close()
    fourth = acquire(world, path)
    assert fourth['generation'] == third['generation'] + 1


def test_disabled_member_and_revoked_session_stop_save_and_renew(world):
    from app.services import members
    path, _ = setup_canvas(world)
    lease = acquire(world, path)
    members.assign_roles(world['operator'], world['people'][0]['id'], [world['a']['roles']['viewer']], world['a']['id'])
    assert save(world, path, lease).status_code == 403
    assert world['editor'].post(path + '/edit-lease/renew', headers=proof(world, lease)).status_code == 403
    assert world['viewer'].get(path + '/edit-lease', headers=headers(world['a'])).json()['holder'] is None
    members.assign_roles(world['operator'], world['people'][0]['id'], [world['a']['roles']['editor']], world['a']['id'])
    assert save(world, path, lease).json()['detail']['code'] == 'canvas_lease_lost'
    members.set_member_status(world['operator'], world['people'][0]['id'], 'disabled')
    assert save(world, path, lease).status_code == 401


def test_maintenance_allows_only_existing_holder_final_save_and_caps_renewal(world):
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    lease = acquire(world, path)
    change(world['operator'], world['a']['id'], 'draining', grace_seconds=30)
    client = world['editor']
    assert client.post(path + '/edit-lease/acquire', headers=headers(world['a']), json={}).status_code == 503
    assert save(world, path, lease).status_code == 200
    assert client.post(path + '/meta', headers=proof(world, lease, 2), json={'title': 'not a final save'}).status_code == 503
    renewed = client.post(path + '/edit-lease/renew', headers=proof(world, lease, 2))
    assert renewed.status_code == 200, renewed.text
    with connection() as conn:
        row = conn.execute('SELECT l.expires_at,m.drain_deadline FROM canvas_edit_leases l JOIN maintenance_controls m ON m.workspace_id=l.workspace_id WHERE l.canvas_id=%s', (canvas['id'],)).fetchone()
        assert row['expires_at'] <= row['drain_deadline']
        conn.execute("UPDATE maintenance_controls SET drain_deadline=clock_timestamp()-interval '1 second' WHERE workspace_id=%s", (world['a']['id'],))
    assert save(world, path, lease, 2).status_code == 503
    assert client.post(path + '/edit-lease/renew', headers=proof(world, lease, 2)).status_code == 503


def test_associated_generation_needs_lease_but_already_queued_task_survives_release(world):
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    payload = {'canvas_id': canvas['id'], 'prompt': 'no supplier call', 'model': 'test', 'provider_id': 'comfly', 'n': 1}
    client = world['editor']
    denied = client.post('/api/canvas-image-tasks', headers=headers(world['a']), json=payload)
    assert denied.status_code == 428, denied.text
    lease = acquire(world, path)
    accepted = client.post('/api/canvas-image-tasks', headers=proof(world, lease), json=payload)
    assert accepted.status_code == 200, accepted.text
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease)).status_code == 200
    with connection() as conn:
        row = conn.execute('SELECT status,requested_by,canvas_revision,canvas_edit_generation FROM tasks WHERE id=%s', (accepted.json()['task_id'],)).fetchone()
        assert row['status'] == 'queued' and row['requested_by'] == world['people'][0]['id']
        assert row['canvas_revision'] == lease['revision'] and row['canvas_edit_generation'] == lease['generation']


def test_independent_process_first_acquisition_has_one_winner(world):
    from app.services import members
    from app.services.member_gateway import COOKIE
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    source = '''import json,sys
sys.path.insert(0,'.')
from fastapi import HTTPException
from app.services.authorization import Principal
from app.services.canvas_leases import acquire
from app.storage.workspace import workspace_scope
from app.storage.database import close
v=json.load(sys.stdin)
try:
    with workspace_scope(v['workspace']):
        result=acquire(Principal(**v['actor']),v['canvas'])
    print(json.dumps({'ok':True,'generation':result['generation']}))
except HTTPException as e:
    print(json.dumps({'ok':False,'code':e.detail['code']}))
finally:
    close()
'''
    data = json.dumps({'workspace': world['a']['id'], 'canvas': canvas['id'], 'actor': actor.__dict__})
    def compete(_):
        result = subprocess.run([sys.executable, '-c', source], input=data, capture_output=True, text=True, timeout=30,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compete, range(4)))
    assert sum(r['ok'] for r in results) == 1, results
    assert all(r.get('code') == 'canvas_locked' for r in results if not r['ok'])
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM collaboration_events WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 1
        conn.execute("UPDATE canvas_edit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE canvas_id=%s", (canvas['id'],))
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compete, range(4)))
    assert [r['generation'] for r in results if r['ok']] == [2]


def test_designated_transfer_is_atomic_and_replay_has_no_snapshot_side_effect(world):
    from app.services import members
    from app.storage.database import connection
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['editor']], world['a']['id'])
    path, canvas = setup_canvas(world)
    lease = acquire(world, path)
    target, holder = world['viewer'], world['editor']
    transfer_path = path + '/edit-lease/transfers'
    request = target.post(transfer_path, headers=headers(world['a']))
    assert request.status_code == 200, request.text
    requested = request.json()
    listed = holder.get(transfer_path, headers=headers(world['a']))
    assert requested['id'] in listed.text and requested['edit_token'] not in listed.text
    decision_path = transfer_path + '/' + requested['id']
    assert holder.post(decision_path, headers=proof(world, lease), json={'approve': True}).status_code == 409
    granted = holder.post(decision_path, headers=proof(world, lease), json={'approve': True, 'confirm': True})
    assert granted.status_code == 200, granted.text
    transferred = {**granted.json()['lease'], 'edit_token': requested['edit_token']}
    assert transferred['holder']['id'] == world['people'][1]['id']
    assert transferred['generation'] == lease['generation'] + 1
    assert holder.post(path + '/edit-lease/acquire', headers=headers(world['a']), json={}).status_code == 409
    assert holder.post(decision_path, headers=proof(world, lease), json={'approve': True, 'confirm': True}).status_code == 409
    assert save(world, path, lease).status_code == 409
    saved = target.put(path, headers=proof(world, transferred), json={'title': '交接后的保存', 'nodes': [], 'base_revision': transferred['revision']})
    assert saved.status_code == 200, saved.text
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_release_snapshots WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 1
        assert conn.execute("SELECT count(*) AS n FROM collaboration_events WHERE canvas_id=%s AND action='transfer.approve'", (canvas['id'],)).fetchone()['n'] == 1


def test_expired_and_rejected_transfer_and_force_takeover_require_current_generation(world):
    from app.services import members
    from app.storage.database import connection
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['admin']], world['a']['id'])
    path, canvas = setup_canvas(world)
    lease = acquire(world, path)
    target, holder = world['viewer'], world['editor']
    transfer_path = path + '/edit-lease/transfers'
    request = target.post(transfer_path, headers=headers(world['a'])).json()
    decision = transfer_path + '/' + request['id']
    assert holder.post(decision, headers=proof(world, lease), json={'approve': False}).status_code == 200
    assert holder.post(decision, headers=proof(world, lease), json={'approve': True, 'confirm': True}).status_code == 409
    request = target.post(transfer_path, headers=headers(world['a'])).json()
    with connection() as conn:
        conn.execute("UPDATE canvas_transfer_requests SET expires_at=clock_timestamp()-interval '1 second' WHERE id=%s", (request['id'],))
    assert holder.post(transfer_path + '/' + request['id'], headers=proof(world, lease), json={'approve': True, 'confirm': True}).status_code == 409
    body = {'takeover': 'force', 'confirm': True, 'expected_generation': lease['generation']}
    assert target.post(path + '/edit-lease/acquire', headers=headers(world['a']), json=body).status_code == 400
    body['reason'] = '原成员离线，接管处理'
    granted = target.post(path + '/edit-lease/acquire', headers=headers(world['a']), json=body)
    assert granted.status_code == 200, granted.text
    assert target.post(path + '/edit-lease/acquire', headers=headers(world['a']), json=body).status_code == 409
    assert save(world, path, lease).status_code == 409
    with connection() as conn:
        event = conn.execute("SELECT reason,revision FROM collaboration_events WHERE canvas_id=%s AND action='takeover.force'", (canvas['id'],)).fetchone()
        assert event == {'reason': body['reason'], 'revision': canvas['revision']}
        assert conn.execute('SELECT count(*) AS n FROM canvas_release_snapshots WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 0


def test_save_takeover_race_is_serialized_at_canvas_row(world):
    from threading import Barrier
    from fastapi import HTTPException
    from app.services import members, canvas_leases
    from app.services.member_gateway import COOKIE
    from app.services.member_context import access_scope
    from app.storage import canvases
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    path, canvas = setup_canvas(world)
    lease = acquire(world, path)
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    wid, cid = world['a']['id'], canvas['id']
    barrier = Barrier(2)
    def writer():
        barrier.wait(timeout=5)
        try:
            with workspace_scope(wid), access_scope(actor, wid, ('canvas.edit',), 'canvas.finish', cid,
                    canvas_leases.Proof(lease['edit_token'], lease['generation'], lease['revision'])):
                with connection():
                    value = canvases.get(cid)
                    value['title'] = '已提交的并发保存'
                    canvases.save(value)
            return True
        except HTTPException as exc:
            assert exc.detail['code'] == 'canvas_lease_lost'
            return False
    def takeover():
        barrier.wait(timeout=5)
        with workspace_scope(wid):
            return canvas_leases.acquire(actor, cid, takeover='self', expected_generation=lease['generation'], confirm=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        saving, taking = pool.submit(writer), pool.submit(takeover)
        saved, taken = saving.result(), taking.result()
    with workspace_scope(wid):
        current = canvases.get(cid)
    assert taken['generation'] == 2
    assert taken['revision'] == current['revision'] == (2 if saved else 1)
    assert current['title'] == ('已提交的并发保存' if saved else canvas['title'])


def test_maintenance_recovery_does_not_revive_previous_edit_token(world):
    from test_cloud_maintenance_control import recover
    path, _ = setup_canvas(world)
    lease = acquire(world, path)
    change(world['operator'], world['a']['id'], 'draining')
    change(world['operator'], world['a']['id'], 'offline')
    recover(world['operator'], world['a']['id'])
    assert save(world, path, lease).json()['detail']['code'] == 'canvas_lease_lost'
    assert acquire(world, path)['generation'] == lease['generation'] + 1


def test_folder_delete_cannot_partially_move_canvases_without_their_lease(world):
    client = world['editor']
    head = headers(world['a'])
    folder = client.post('/api/canvas-folders', headers=head, json={'name': '有内容的目录'}).json()['folder']
    created = client.post('/api/canvases', headers=head, json={'title': '目录内画布', 'folder_id': folder['id']}).json()['canvas']
    result = client.delete('/api/canvas-folders/' + folder['id'], headers=head)
    assert result.status_code == 428, result.text
    assert folder['id'] in [f['id'] for f in client.get('/api/canvas-folders', headers=head).json()['folders']]
    assert client.get('/api/canvases/' + created['id'], headers=head).json()['canvas']['folder_id'] == folder['id']
    # Moving the canvas explicitly with its lease leaves an empty folder that can be removed.
    path = '/api/canvases/' + created['id']
    lease = acquire(world, path)
    assert client.patch(path + '/folder', headers=proof(world, lease), json={'folder_id': ''}).status_code == 200
    assert client.delete('/api/canvas-folders/' + folder['id'], headers=head).status_code == 200


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_directory_folder_move_returns_revision_and_preserves_canvas(world, kind):
    client, head = world['editor'], headers(world['a'])
    path, original = setup_canvas(world, kind)
    folder = client.post('/api/canvas-folders', headers=head, json={'name': '移动验收'}).json()['folder']
    for target in (folder['id'], ''):
        lease = acquire(world, path)
        moved = client.patch(path + '/folder', headers=proof(world, lease), json={'folder_id': target})
        assert moved.status_code == 200, moved.text
        record = moved.json()['canvas']
        assert record['folder_id'] == target
        assert record['revision'] == lease['revision'] + 1
        released = client.post(path + '/edit-lease/release', headers=proof(world, lease, record['revision']))
        assert released.status_code == 200, released.text
        persisted = client.get(path, headers=head).json()['canvas']
        assert persisted['folder_id'] == target
        for key in ('title', 'kind', 'nodes', 'connections', 'updated_at'):
            assert persisted[key] == original[key]
        rows = client.get('/api/canvases', headers=head).json()['canvases']
        assert next(row for row in rows if row['id'] == original['id'])['folder_id'] == target
        assert client.get(path + '/edit-lease', headers=head).json()['holder'] is None
    denied = world['viewer'].post(path + '/edit-lease/acquire', headers=head, json={})
    assert denied.status_code == 403


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_directory_rename_returns_revision_and_preserves_content(world, kind):
    client, head = world['editor'], headers(world['a'])
    path, original = setup_canvas(world, kind)
    lease = acquire(world, path)
    result = client.post(path + '/meta', headers=proof(world, lease), json={'title': '新的画布名称'})
    assert result.status_code == 200, result.text
    record = result.json()['canvas']
    assert record['title'] == '新的画布名称'
    assert record['revision'] == lease['revision'] + 1
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease, record['revision'])).status_code == 200
    saved = client.get(path, headers=head).json()['canvas']
    for key in ('kind', 'nodes', 'connections', 'updated_at'):
        assert saved[key] == original[key]


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_trash_restore_with_directory_lease_preserves_document(world, kind):
    client, head = world['editor'], headers(world['a'])
    path, original = setup_canvas(world, kind)
    lease = acquire(world, path)
    removed = client.delete(path, headers=proof(world, lease))
    assert removed.status_code == 200, removed.text
    revision = client.get(path + '/edit-lease', headers=head).json()['revision']
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease, revision)).status_code == 200
    assert client.get(path, headers=head).status_code == 404
    assert any(row['id'] == original['id'] for row in client.get('/api/canvases/trash', headers=head).json()['canvases'])
    assert client.post(path + '/restore', headers=head).status_code == 428
    lease = acquire(world, path)
    restored = client.post(path + '/restore', headers=proof(world, lease))
    assert restored.status_code == 200, restored.text
    record = restored.json()['canvas']
    assert not record.get('deleted_at')
    assert record['revision'] == lease['revision'] + 1
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease, record['revision'])).status_code == 200
    saved = client.get(path, headers=head).json()['canvas']
    for key in ('title', 'kind', 'nodes', 'connections'):
        assert saved[key] == original[key]
    assert not any(row['id'] == original['id'] for row in client.get('/api/canvases/trash', headers=head).json()['canvases'])
    assert client.get(path + '/edit-lease', headers=head).json()['holder'] is None


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_directory_cover_style_persists_without_changing_content(world, kind):
    client, head = world['editor'], headers(world['a'])
    path, original = setup_canvas(world, kind)
    lease = acquire(world, path)
    result = client.post(path + '/meta', headers=proof(world, lease), json={'cover_style': 'editorial'})
    assert result.status_code == 200, result.text
    record = result.json()['canvas']
    assert record['cover_style'] == 'editorial'
    assert record['revision'] == lease['revision'] + 1
    assert client.post(path + '/edit-lease/release', headers=proof(world, lease, record['revision'])).status_code == 200
    saved = client.get(path, headers=head).json()['canvas']
    for key in ('title', 'kind', 'nodes', 'connections', 'updated_at'):
        assert saved[key] == original[key]
    rows = client.get('/api/canvases', headers=head).json()['canvases']
    assert next(row for row in rows if row['id'] == original['id'])['cover_style'] == 'editorial'
    assert client.post(path + '/meta', headers=head, json={'cover_style': 'invalid'}).status_code == 422


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_graph_delta_saves_nodes_edges_and_preserves_metadata(world, kind):
    path, canvas = setup_canvas(world, kind); lease = acquire(world, path)
    client = world['editor']; head = headers(world['a'])
    assert client.get(path, headers=head).json()['save_protocol'] == 'graph-delta-v2'
    saved = client.put(path, headers=proof(world, lease), json={
        'base_revision': lease['revision'], 'title':'Keep title', 'settings':{'custom':'keep'},
        'nodes':[{'id':'a','x':0},{'id':'b','x':10}], 'connections':[{'from':'a','to':'b'}]})
    assert saved.status_code == 200, saved.text
    base = saved.json()['canvas']
    delta = {'base_revision':base['revision'], 'base_updated_at':base['updated_at'],
        'create':[{'id':'c','x':20}], 'update':[{'id':'a','x':7}], 'delete':['b'],
        'connections_remove':[{'from':'a','to':'b'}], 'connections_add':[{'from':'a','to':'c'}],
        'node_order':['c','a']}
    result = client.put(path + '/delta', headers=proof(world, lease, base['revision']), json={
        'base_revision':base['revision'], 'graph_delta':delta})
    assert result.status_code == 200, result.text
    doc = client.get(path, headers=head).json()['canvas']
    assert doc['revision'] == base['revision'] + 1
    assert doc['nodes'] == [{'id':'c','x':20},{'id':'a','x':7}]
    assert doc['connections'] == [{'from':'a','to':'c'}]
    assert doc['title'] == base['title'] and doc['settings'] == base['settings']
    # Even a current lease/revision cannot turn the old delta into a new one.
    stale = client.put(path + '/delta', headers=proof(world, lease, doc['revision']), json={
        'base_revision':doc['revision'], 'graph_delta':delta})
    assert stale.status_code == 409 and stale.json()['detail']['code'] == 'canvas_delta_conflict'
    assert client.get(path, headers=head).json()['canvas'] == doc


def test_graph_delta_requires_lease_scope_and_valid_graph(world):
    path, doc = setup_canvas(world, 'smart'); lease = acquire(world, path)
    delta = {'base_revision':doc['revision'], 'base_updated_at':doc['updated_at'], 'create':[{'id':'a'}]}
    body = {'base_revision':doc['revision'], 'graph_delta':delta}
    client = world['editor']; head = proof(world, lease)
    assert client.put(path + '/delta', headers=headers(world['a']), json=body).status_code == 428
    assert world['viewer'].put(path + '/delta', headers=head, json=body).status_code == 403
    assert world['outsider'].put(path + '/delta', headers={**head, **headers(world['b'])}, json=body).status_code == 404
    forged = {**head, 'X-Canvas-Edit-Token':'forged'}
    assert client.put(path + '/delta', headers=forged, json=body).status_code == 409
    invalid = {**delta, 'connections_add':[{'from':'a','to':'missing'}]}
    response = client.put(path + '/delta', headers=head, json={**body, 'graph_delta':invalid})
    assert response.status_code == 400, response.text
    assert client.get(path, headers=headers(world['a'])).json()['canvas'] == doc


def test_graph_delta_final_save_is_allowed_during_maintenance_drain(world):
    path, doc = setup_canvas(world, 'smart'); lease = acquire(world, path)
    change(world['operator'], world['a']['id'], 'draining', grace_seconds=30)
    response = world['editor'].put(path + '/delta', headers=proof(world, lease), json={
        'base_revision':doc['revision'], 'graph_delta':{
            'base_revision':doc['revision'], 'base_updated_at':doc['updated_at'], 'create':[{'id':'last'}]}})
    assert response.status_code == 200, response.text
    saved = response.json()['canvas']
    assert saved['nodes'] == [{'id':'last'}]
    assert world['editor'].post(path+'/edit-lease/release', headers=proof(world,lease,saved['revision'])).status_code == 200
