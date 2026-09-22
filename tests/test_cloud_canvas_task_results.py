"""Completed-result recovery uses current graph, scope, lease and immutable task outputs."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from psycopg.types.json import Jsonb
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_maintenance_control import reset_maintenance

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def result_task(world, canvas, tmp_path, kind='online-image'):
    from app.storage import media, tasks, database
    from app.storage.workspace import workspace_scope
    source = tmp_path / ('result.mp4' if kind == 'video' else 'result.png')
    source.write_bytes(b'local result bytes only')
    tid = 'result-' + uuid.uuid4().hex
    with workspace_scope(world['a']['id']):
        asset = media.publish(source)
        tasks.save({'id': tid, 'type': kind, 'status': 'succeeded', 'canvas_id': canvas['id'],
                    'result': {'videos' if kind == 'video' else 'images': [{'url': media.stable_url(asset)}],
                               'raw': {'private': 'upstream-secret'}, 'cost': {'amount': 7}}},
                   {'prompt': 'private-prompt', 'model': 'test'})
        with database.connection() as conn:
            conn.execute('UPDATE tasks SET canvas_revision=%s,canvas_edit_generation=1 WHERE id=%s', (canvas['revision'], tid))
    return tid, asset


@pytest.mark.parametrize('kind', ['online-image', 'video'])
def test_historical_duration_read_uses_server_timestamps_without_edit_or_fee_changes(world, tmp_path, kind):
    from app.storage import database, tasks
    from app.storage.workspace import workspace_scope
    from app.services import canvas_ledger
    path, canvas = setup_canvas(world)
    tid, _ = result_task(world, canvas, tmp_path, kind)
    with workspace_scope(world['a']['id']):
        canvas_ledger.record_task(tasks.get(tid))
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET created_at=to_timestamp(1789000000),completed_at=to_timestamp(1789000129),updated_at=to_timestamp(1789003600) WHERE id=%s", (tid,))
            conn.execute("UPDATE ledger_entries SET log_json=log_json || '{\"runMs\":0}'::jsonb WHERE canvas_id=%s", (canvas['id'],))
            before = conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s ORDER BY id', (canvas['id'],)).fetchall()
            before_task = conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone()
    response = world['viewer'].get(path + '/ledger', headers=headers(world['a']))
    assert response.status_code == 200, response.text
    assert response.json()['logs'][0]['runMs'] == 129000
    endpoint = 'video' if kind == 'video' else 'image'
    task_response = world['viewer'].get('/api/canvas-' + endpoint + '-tasks/' + tid, headers=headers(world['a']))
    assert task_response.status_code == 200, task_response.text
    assert task_response.json()['completed_at'] - task_response.json()['created_at'] == 129
    assert world['outsider'].get(path + '/ledger', headers=headers(world['b'])).status_code == 404
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s ORDER BY id', (canvas['id'],)).fetchall() == before
        assert conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone() == before_task


@pytest.mark.parametrize('kind', ['classic', 'smart'])
@pytest.mark.parametrize('media_kind', ['online-image', 'video'])
def test_result_join_after_target_deleted_preserves_graph_assets_task_and_fees(world, tmp_path, kind, media_kind):
    from app.storage.database import connection
    path, canvas = setup_canvas(world, kind)
    tid, asset = result_task(world, canvas, tmp_path, media_kind)
    lease = acquire(world, path)
    kept = {'id': 'new-user-node', 'type': 'prompt', 'text': 'newer edits', 'x': 50}
    saved = world['editor'].put(path, headers=proof(world, lease), json={'title': 'newer title', 'nodes': [kept], 'connections': [], 'base_revision': canvas['revision']})
    assert saved.status_code == 200, saved.text
    revision = saved.json()['canvas']['revision']
    with connection() as conn:
        before_task = conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone()
        before_fees = conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall()
    response = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease, revision))
    assert response.status_code == 200, response.text
    joined = response.json()['canvas']
    assert joined['title'] == 'newer title' and joined['nodes'][0] == kept and joined['revision'] == revision + 1
    added = joined['nodes'][1]
    assert added['result_task_id'] == tid and added['images'][0]['media_asset_id'] == asset['id']
    assert added['type'] == ('smart-image' if kind == 'smart' else 'output')
    repeat = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease, joined['revision']))
    assert repeat.status_code == 200 and repeat.json()['already_in_canvas'] and repeat.json()['canvas']['revision'] == joined['revision']
    with connection() as conn:
        assert conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone() == before_task
        assert conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall() == before_fees
        assert conn.execute('SELECT asset_id FROM canvas_assets WHERE canvas_id=%s', (canvas['id'],)).fetchone()['asset_id'] == asset['id']
        assert conn.execute("SELECT count(*) AS n FROM collaboration_events WHERE canvas_id=%s AND action='task.result.join'", (canvas['id'],)).fetchone()['n'] == 1


def test_result_catalog_scope_permissions_redaction_and_missing_media(world, tmp_path):
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    tid, asset = result_task(world, canvas, tmp_path)
    response = world['viewer'].get(path + '/task-results', headers=headers(world['a']))
    assert response.status_code == 200, response.text
    assert response.json()['results'][0]['state'] == 'ready'
    assert not any(secret in response.text for secret in ('upstream-secret', 'private-prompt', 'provider_account_ref', 'lease_token'))
    assert world['outsider'].get(path + '/task-results', headers=headers(world['b'])).status_code == 404
    assert world['outsider'].get(path + '/task-results', headers=headers(world['a'])).status_code == 403
    assert world['viewer'].post(path + '/task-results/' + tid + '/join', headers=headers(world['a'])).status_code == 403
    with connection() as conn:conn.execute("UPDATE assets SET deleted_at=now() WHERE id=%s", (asset['id'],))
    assert world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['state'] == 'unavailable'
    lease = acquire(world, path)
    assert world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease)).status_code == 409
    assert world['editor'].get(path, headers=headers(world['a'])).json()['canvas']['nodes'] == []


def test_result_join_rejects_old_edit_generation_stale_revision_and_wrong_canvas(world, tmp_path):
    path, canvas = setup_canvas(world)
    tid, _ = result_task(world, canvas, tmp_path)
    old = acquire(world, path)
    current = acquire(world, path, takeover='self', expected_generation=old['generation'], confirm=True)
    url = path + '/task-results/' + tid + '/join'
    assert world['editor'].post(url, headers=proof(world, old)).status_code == 409
    assert world['editor'].post(url, headers=proof(world, current, current['revision'] + 1)).status_code == 409
    another, other = setup_canvas(world)
    other_lease = acquire(world, another)
    assert world['editor'].post(another + '/task-results/' + tid + '/join', headers=proof(world, other_lease)).status_code == 404
    joined = world['editor'].post(url, headers=proof(world, current))
    assert joined.status_code == 200, joined.text
    assert len(joined.json()['canvas']['nodes']) == 1


def test_result_join_concurrent_requests_add_once_and_recovery_is_idempotent(world, tmp_path):
    path, canvas = setup_canvas(world)
    tid, _ = result_task(world, canvas, tmp_path)
    lease = acquire(world, path)
    url = path + '/task-results/' + tid + '/join'
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: world['editor'].post(url, headers=proof(world, lease)), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    body = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
    assert len(body['nodes']) == 1
    assert world['editor'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['state'] == 'in_canvas'


def test_result_join_audit_failure_rolls_back_graph_and_reference_index(world, tmp_path, monkeypatch):
    from app.services import canvas_task_results
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    tid, _ = result_task(world, canvas, tmp_path)
    lease = acquire(world, path)
    def fail(*args):raise RuntimeError('injected audit failure')
    monkeypatch.setattr(canvas_task_results, 'event', fail)
    with pytest.raises(RuntimeError, match='injected audit'):
        world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease))
    current = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
    assert current['revision'] == canvas['revision'] and current['nodes'] == []
    with connection() as conn:assert not conn.execute('SELECT * FROM canvas_assets WHERE canvas_id=%s', (canvas['id'],)).fetchall()


def test_existing_success_log_requires_actual_result_media_and_only_own_pending_is_removed(world, tmp_path):
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    tid, asset = result_task(world, canvas, tmp_path)
    lease = acquire(world, path)
    with connection() as conn:
        doc = conn.execute('SELECT document FROM canvases WHERE id=%s', (canvas['id'],)).fetchone()['document']
        doc['nodes'] = [{'id': 'pending', 'type': 'output', 'images': [], '_pending': [{'canvasTaskId': tid}, {'canvasTaskId': 'another'}]}]
        doc['logs'] = [{'canvas_task_id': tid, 'error': ''}]
        conn.execute('UPDATE canvases SET document=%s WHERE id=%s', (Jsonb(doc), canvas['id']))
    assert world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['state'] == 'ready'
    result = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease))
    assert result.status_code == 200, result.text
    assert result.json()['canvas']['nodes'][0]['_pending'] == [{'canvasTaskId': 'another'}]


def test_result_media_requests_require_bound_member_and_workspace_through_redirects(world, tmp_path):
    from app.storage import media
    path, canvas = setup_canvas(world)
    _, asset = result_task(world, canvas, tmp_path)
    url = media.stable_url(asset)
    params = {'workspace': world['a']['id'], 'member': world['people'][0]['id']}
    original = world['editor'].get(url, params=params, follow_redirects=False)
    assert original.status_code == 307, original.text
    assert 'member=' + world['people'][0]['id'] in original.headers['location']
    served = world['editor'].get(original.headers['location'])
    assert served.status_code == 200 and served.content == b'local result bytes only'
    assert 'no-store' in served.headers['cache-control']
    location = original.headers['location']
    assert world['viewer'].get(location).status_code == 409
    from urllib.parse import urlsplit, parse_qsl, urlencode
    from fastapi.testclient import TestClient
    from main import app
    query = dict(parse_qsl(urlsplit(location).query))
    anonymous = TestClient(app)
    assert anonymous.get(location).status_code == 401
    del query['member']
    assert anonymous.get(urlsplit(location).path + '?' + urlencode(query)).status_code == 403
    query['member'] = world['people'][1]['id']
    assert world['viewer'].get(urlsplit(location).path + '?' + urlencode(query)).status_code == 403
    assert world['editor'].get(url, params={**params, 'workspace': world['b']['id']}).status_code == 403


def test_result_join_requires_current_permission_and_refuses_maintenance(world, tmp_path, reset_maintenance):
    from app.services import members
    from test_cloud_maintenance_control import change, recover
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    tid, _ = result_task(world, canvas, tmp_path)
    lease = acquire(world, path)
    change(world['operator'], world['a']['id'], 'draining')
    response = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease))
    assert response.status_code == 503, response.text
    recover(world['operator'], world['a']['id'])
    members.assign_roles(world['operator'], world['people'][0]['id'], [world['a']['roles']['viewer']], world['a']['id'])
    assert world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease)).status_code == 403
    with connection() as conn:
        assert conn.execute('SELECT revision FROM canvases WHERE id=%s', (canvas['id'],)).fetchone()['revision'] == canvas['revision']
        assert conn.execute('SELECT status FROM tasks WHERE id=%s', (tid,)).fetchone()['status'] == 'succeeded'


def test_result_catalog_cursor_covers_more_than_one_page(world, tmp_path):
    path, canvas = setup_canvas(world)
    ids = {result_task(world, canvas, tmp_path)[0] for _ in range(31)}
    first = world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()
    assert len(first['results']) == 30 and first['next_after']
    second = world['viewer'].get(path + '/task-results', params={'after': first['next_after']}, headers=headers(world['a'])).json()
    assert len(second['results']) == 1 and second['next_after'] is None
    assert {row['id'] for row in first['results'] + second['results']} == ids


def test_result_recovery_tolerates_legacy_optional_media_metadata(world, tmp_path):
    from app.storage.database import connection
    path, canvas = setup_canvas(world)
    tid, asset = result_task(world, canvas, tmp_path)
    lease = acquire(world, path)
    with connection() as conn:
        doc = conn.execute('SELECT document FROM canvases WHERE id=%s', (canvas['id'],)).fetchone()['document']
        doc['nodes'] = [{'id': 'empty', 'type': 'output', 'images': None},
                        {'id': 'old', 'type': 'output', 'images': [{'url': '/missing.png', 'run': 'legacy'}],
                         '_pending': [None, {'canvasTaskId': tid}], 'pendingTasks': [None, {'taskId': tid}]}]
        doc['logs'] = None
        conn.execute('UPDATE canvases SET document=%s WHERE id=%s', (Jsonb(doc), canvas['id']))
    assert world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['state'] == 'ready'
    response = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease))
    assert response.status_code == 200, response.text
    nodes = response.json()['canvas']['nodes']
    assert len(nodes) == 3 and nodes[1]['_pending'] == [None] and nodes[1]['pendingTasks'] == [None]
