"""Draft recovery copies through real HTTP, PostgreSQL and local object storage."""
import copy
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
PATH = '/api/canvas-draft-copies'


def payload(kind='classic'):
    return {'request_id': str(uuid.uuid4()), 'document': {'title': '旧草稿', 'kind': kind,
        'id': 'untrusted-original', 'revision': 999, 'folder_id': 'foreign', 'deleted_at': 1,
        'logs': [{'id': 'do-not-rebill', 'cost': 99}],
        'nodes': [{'id': 'n', 'prompt': '保留的内容', 'running': True, 'pending': 2,
                   '_pending': [{'canvasTaskId': 'old'}], 'pendingTasks': [{'taskId': 'old'}],
                   'runSettings': {'params': {'task_id': 'workflow-input'}}}],
        'connections': [], 'settings': {'model': 'selected'}}}


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_draft_copy_preserves_graph_and_retries_without_replaying_tasks_or_fees(world, kind):
    from app.storage.database import connection
    request = payload(kind)
    client, space = world['editor'], world['a']
    original = client.post('/api/canvases', headers=headers(space), json={'title': '原画布', 'kind': kind}).json()['canvas']
    request['document']['id'] = original['id']
    lease = client.post('/api/canvases/' + original['id'] + '/edit-lease/acquire', headers=headers(space), json={}).json()
    created = client.post(PATH, headers=headers(space), json=request)
    assert created.status_code == 200, created.text
    result = created.json()
    assert result['replayed'] is False and result['canvas']['id'] != original['id']
    path = '/api/canvases/' + result['canvas']['id']
    value = client.get(path, headers=headers(space)).json()['canvas']
    assert value['kind'] == kind and value['revision'] == 1 and value['folder_id'] == ''
    assert value['logs'] == [] and 'deleted_at' not in value
    assert value['nodes'][0]['prompt'] == '保留的内容'
    assert value['nodes'][0]['runSettings']['params']['task_id'] == 'workflow-input'
    assert not {'running', 'pending', '_pending', 'pendingTasks'} & value['nodes'][0].keys()
    assert value['settings'] == {'model': 'selected'}
    replay = client.post(PATH, headers=headers(space), json=request).json()
    assert replay['replayed'] is True and replay['canvas'] == result['canvas']
    assert client.get('/api/canvases/' + original['id'], headers=headers(space)).json()['canvas'] == original
    assert client.get('/api/canvases/' + original['id'] + '/edit-lease', headers=headers(space)).json()['generation'] == lease['generation']
    with connection() as conn:
        assert conn.execute('SELECT created_by FROM canvases WHERE id=%s', (value['id'],)).fetchone()['created_by'] == world['people'][0]['id']
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE target_id=%s AND action='canvas.draft_copy'", (value['id'],)).fetchone()['n'] == 1
        assert conn.execute('SELECT count(*) AS n FROM canvas_edit_leases WHERE canvas_id=%s', (value['id'],)).fetchone()['n'] == 0
    changed = copy.deepcopy(request)
    changed['document']['nodes'][0]['prompt'] = 'different'
    conflict = client.post(PATH, headers=headers(space), json=changed)
    assert conflict.status_code == 409 and conflict.json()['detail']['code'] == 'draft_copy_request_conflict'


def test_concurrent_duplicate_copy_requests_commit_one_canvas(world):
    from app.storage.database import connection
    request, barrier = payload(), Barrier(4)
    def submit(_):
        barrier.wait(timeout=10)
        return world['editor'].post(PATH, headers=headers(world['a']), json=request)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, range(4)))
    assert all(result.status_code == 200 for result in results), [result.text for result in results]
    assert len({result.json()['canvas']['id'] for result in results}) == 1
    assert sum(not result.json()['replayed'] for result in results) == 1
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_draft_copies WHERE request_id=%s', (request['request_id'],)).fetchone()['n'] == 1


def test_copy_assets_are_same_space_ready_and_atomic_on_failure(world, tmp_path):
    from app.storage import media, canvases
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    asset_file = tmp_path / 'copy.bin'
    asset_file.write_bytes(b'copy original object bytes')
    with workspace_scope(world['a']['id']):
        own = media.publish(asset_file)
        internal = media.publish(asset_file, role='task-result-source')
    with workspace_scope(world['b']['id']):
        foreign = media.publish(asset_file)
    request = payload()
    for asset in (foreign, internal):
        request['document']['nodes'] = [{'media_asset_id': asset['id']}]
        response = world['editor'].post(PATH, headers=headers(world['a']), json=request)
        assert response.status_code == 400, response.text
    request['document']['nodes'] = [{'id': 'n', 'url': media.stable_url(own)}]
    real_save = canvases.save
    def fail_after_save(value):
        real_save(value)
        raise RuntimeError('simulated failure after canvas insert')
    with patch.object(canvases, 'save', side_effect=fail_after_save):
        with pytest.raises(RuntimeError, match='simulated failure'):
            world['editor'].post(PATH, headers=headers(world['a']), json=request)
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_draft_copies WHERE request_id=%s', (request['request_id'],)).fetchone()['n'] == 0
        assert conn.execute('SELECT count(*) AS n FROM canvases WHERE workspace_id=%s', (world['a']['id'],)).fetchone()['n'] == 0
    response = world['editor'].post(PATH, headers=headers(world['a']), json=request)
    assert response.status_code == 200, response.text
    with connection() as conn:
        assert conn.execute('SELECT asset_id FROM canvas_assets WHERE canvas_id=%s', (response.json()['canvas']['id'],)).fetchone()['asset_id'] == own['id']


def test_copy_revalidates_roles_scope_and_maintenance_even_on_replay(world):
    from app.services import members
    request = payload()
    for client, space in [(world['viewer'], world['a']), (world['outsider'], world['a']), (world['editor'], world['b'])]:
        assert client.post(PATH, headers=headers(space), json=request).status_code == 403
    assert world['editor'].post(PATH, json=request).status_code == 400
    assert world['editor'].post(PATH, headers=headers(world['a']), json=request).status_code == 200
    change(world['operator'], world['a']['id'], 'draining')
    assert world['editor'].post(PATH, headers=headers(world['a']), json=request).status_code == 503
    members.assign_roles(world['operator'], world['people'][0]['id'], [world['a']['roles']['viewer']], world['a']['id'])
    assert world['editor'].post(PATH, headers=headers(world['a']), json=request).status_code == 403


def test_same_request_key_is_private_to_member_and_space_and_trash_never_recreates(world):
    from app.services import members
    from app.storage.database import connection
    request = payload()
    first = world['editor'].post(PATH, headers=headers(world['a']), json=request).json()['canvas']
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['editor']], world['a']['id'])
    second = world['viewer'].post(PATH, headers=headers(world['a']), json=request).json()['canvas']
    third = world['outsider'].post(PATH, headers=headers(world['b']), json=request).json()['canvas']
    assert len({first['id'], second['id'], third['id']}) == 3
    with connection() as conn:
        conn.execute('UPDATE canvases SET title=%s,revision=revision+1 WHERE id=%s', ('edited copy', first['id']))
    retry = world['editor'].post(PATH, headers=headers(world['a']), json=request).json()
    assert retry['canvas']['title'] == 'edited copy' and retry['canvas']['revision'] == 2
    with connection() as conn:
        conn.execute('UPDATE canvases SET deleted_at=clock_timestamp() WHERE id=%s', (first['id'],))
    response = world['editor'].post(PATH, headers=headers(world['a']), json=request)
    assert response.status_code == 409 and response.json()['detail']['code'] == 'draft_copy_unavailable'


def test_copy_rejects_malformed_request_without_creating_receipt(world):
    request = payload()
    request['request_id'] = 'not-a-uuid'
    assert world['editor'].post(PATH, headers=headers(world['a']), json=request).status_code == 422
    request = payload()
    request['document']['nodes'] = 'not-a-graph'
    assert world['editor'].post(PATH, headers=headers(world['a']), json=request).status_code == 422
