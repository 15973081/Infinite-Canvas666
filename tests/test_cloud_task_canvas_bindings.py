"""Task target binding is captured with the current member lease in PostgreSQL."""
import copy
import os
import uuid
import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def setup_bound_canvas(world, kind='classic'):
    path, canvas = setup_canvas(world, kind)
    lease = acquire(world, path)
    body = {'title': 'binding test', 'nodes': [
        {'id': 'prompt', 'type': 'prompt', 'text': 'private original input'},
        {'id': 'source', 'type': 'generator' if kind == 'classic' else 'smart-image', 'model': 'test'},
        {'id': 'target', 'type': 'output' if kind == 'classic' else 'smart-image', 'images': []}],
        'connections': [{'from': 'prompt', 'to': 'source'}, {'from': 'source', 'to': 'target'}],
        'base_revision': canvas['revision']}
    response = world['editor'].put(path, headers=proof(world, lease), json=body)
    assert response.status_code == 200, response.text
    return path, response.json()['canvas'], lease


def payload(canvas, kind='image'):
    tid = ('canvas_img_' if kind == 'image' else 'canvas_vid_') + uuid.uuid4().hex
    return {'canvas_id': canvas['id'], 'client_task_id': tid, 'prompt': 'private original input', 'provider_id': 'comfly', 'model': 'test',
            'canvas_target': {'source_node_id': 'source', 'target_node_id': 'target', 'base_revision': canvas['revision']}}


def submit(world, body, lease, kind='image', revision=None):
    return world['editor'].post('/api/canvas-' + kind + '-tasks', json=body,
        headers=proof(world, lease, revision if revision is not None else body['canvas_target']['base_revision']))


def finish(world, tid, tmp_path, kind='image'):
    from app.storage import tasks, media
    from app.storage.workspace import workspace_scope
    source = tmp_path / ('result.mp4' if kind == 'video' else 'result.png')
    source.write_bytes(b'isolated result')
    with workspace_scope(world['a']['id']):
        item = media.publish(source)
        claimed = tasks.claim('binding-test-worker')
        assert claimed['id'] == tid
        token = tasks.lease_context.set((tid, claimed['lease_token']))
        try:
            task = tasks.get(tid)
            task.update(status='succeeded', result={'videos' if kind == 'video' else 'images': [media.stable_url(item)]},
                        canvas_binding={'graph_sha256': 'worker cannot replace binding'})
            stored = tasks.save(task)
            assert stored['canvas_binding']['graph_sha256'] != 'worker cannot replace binding'
        finally:
            tasks.lease_context.reset(token)
            tasks.release(tid, claimed['lease_token'])
    return item


@pytest.mark.parametrize('canvas_kind', ['classic', 'smart'])
@pytest.mark.parametrize('media_kind', ['image', 'video'])
def test_bound_request_persists_input_and_target_under_current_lease(world, tmp_path, canvas_kind, media_kind):
    from app.storage import database, tasks
    from app.storage.workspace import workspace_scope
    from app.storage.task_canvas_bindings import graph_fingerprint
    path, canvas, lease = setup_bound_canvas(world, canvas_kind)
    body = payload(canvas, media_kind)
    created = submit(world, body, lease, media_kind)
    assert created.status_code == 200, created.text
    tid = created.json()['task_id']
    with workspace_scope(world['a']['id']), database.connection() as conn:
        row = conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone()
        binding = row['request']['_canvas_binding']
        assert binding['source_node_id'] == 'source' and binding['target_node_id'] == 'target'
        assert binding['graph_sha256'] == graph_fingerprint(canvas, 'source', 'target')
        from app.models import OnlineImageRequest, CanvasVideoRequest
        request_model = OnlineImageRequest if media_kind == 'image' else CanvasVideoRequest
        assert binding['request_sha256'] == row['request_sha256'] == tasks.fingerprint(request_model(**body).model_dump())
        assert row['canvas_revision'] == canvas['revision'] and row['canvas_edit_generation'] == lease['generation']
        assert row['requested_by'] == world['people'][0]['id']
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (tid,)).fetchone()['n'] == 0
    finish(world, tid, tmp_path, media_kind)
    fetched = world['editor'].get('/api/canvas-' + media_kind + '-tasks/' + tid, headers=headers(world['a']))
    assert fetched.status_code == 200 and fetched.json()['canvas_binding'] == binding
    rows = world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results']
    assert rows[0]['binding']['state'] == 'unchanged'
    assert 'private original input' not in str(rows) and 'graph_sha256' not in str(rows)


def test_binding_refuses_stale_revision_missing_node_forged_digest_and_cross_canvas(world):
    from app.storage.database import connection
    path, canvas, lease = setup_bound_canvas(world)
    for changes, expected in [({'base_revision': canvas['revision'] - 1}, 409), ({'source_node_id': 'deleted'}, 409),
                              ({'target_node_id': 'deleted'}, 409), ({'graph_sha256': 'forged'}, 422)]:
        body = payload(canvas)
        body['canvas_target'].update(changes)
        response = submit(world, body, lease, revision=canvas['revision'])
        assert response.status_code == expected, response.text
        with connection() as conn:
            assert not conn.execute('SELECT 1 FROM tasks WHERE id=%s', (body['client_task_id'],)).fetchone()
    other_path, other = setup_canvas(world)
    body = payload(other)
    body['canvas_target']['base_revision'] = canvas['revision']
    assert submit(world, body, lease).status_code == 409
    assert world['outsider'].post('/api/canvas-image-tasks', json=payload(canvas), headers=proof(world, lease, canvas['revision'])).status_code == 403


def test_idempotent_retry_keeps_original_binding_after_input_edit_and_rejects_new_target(world):
    from app.storage.database import connection
    path, canvas, lease = setup_bound_canvas(world)
    body = payload(canvas)
    response = submit(world, body, lease)
    assert response.status_code == 200, response.text
    tid = body['client_task_id']
    with connection() as conn: before = conn.execute('SELECT request,request_sha256 FROM tasks WHERE id=%s', (tid,)).fetchone()
    edited = copy.deepcopy(canvas)
    edited['nodes'][0]['text'] = 'newer input'
    edited['base_revision'] = canvas['revision']
    response = world['editor'].put(path, headers=proof(world, lease, canvas['revision']), json=edited)
    assert response.status_code == 200, response.text
    revision = response.json()['canvas']['revision']
    repeated = submit(world, body, lease, revision=revision)
    assert repeated.status_code == 200, repeated.text
    changed = copy.deepcopy(body)
    changed['canvas_target']['target_node_id'] = 'source'
    assert submit(world, changed, lease, revision=revision).status_code == 409
    with connection() as conn:
        assert conn.execute('SELECT request,request_sha256 FROM tasks WHERE id=%s', (tid,)).fetchone() == before
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE id=%s', (tid,)).fetchone()['n'] == 1


def test_catalog_distinguishes_input_change_from_layout_and_join_preserves_newer_graph(world, tmp_path):
    from app.storage.database import connection
    path, canvas, lease = setup_bound_canvas(world)
    body = payload(canvas)
    response = submit(world, body, lease)
    assert response.status_code == 200, response.text
    tid = body['client_task_id']
    finish(world, tid, tmp_path)
    with connection() as conn:
        before_task = conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone()
        before_fees = conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall()
    def save(doc):
        revision = doc['revision']
        response = world['editor'].put(path, headers=proof(world, lease, revision), json={**doc, 'base_revision': revision})
        assert response.status_code == 200, response.text
        return response.json()['canvas']
    def current():
        return world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['binding']['state']
    canvas['nodes'][0]['x'] = 700
    canvas = save(canvas)
    assert current() == 'unchanged'
    canvas['nodes'][0]['text'] = 'keep this newer prompt'
    canvas = save(canvas)
    assert current() == 'changed'
    canvas['nodes'] = [n for n in canvas['nodes'] if n['id'] != 'target']
    canvas['connections'] = [e for e in canvas['connections'] if e['to'] != 'target']
    canvas = save(canvas)
    assert current() == 'missing'
    joined = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease, canvas['revision']))
    assert joined.status_code == 200, joined.text
    assert joined.json()['canvas']['nodes'][0]['text'] == 'keep this newer prompt'
    assert len(joined.json()['canvas']['nodes']) == 3
    with connection() as conn:
        assert conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone() == before_task
        assert conn.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall() == before_fees


def test_capture_failure_rolls_back_task_creation(world, monkeypatch):
    from app.storage import task_canvas_bindings
    from app.storage.database import connection
    path, canvas, lease = setup_bound_canvas(world)
    body = payload(canvas)
    def fail(*args): raise RuntimeError('injected binding failure')
    monkeypatch.setattr(task_canvas_bindings, 'capture', fail)
    with pytest.raises(RuntimeError, match='injected binding failure'): submit(world, body, lease)
    with connection() as conn:
        assert not conn.execute('SELECT 1 FROM tasks WHERE id=%s', (body['client_task_id'],)).fetchone()
