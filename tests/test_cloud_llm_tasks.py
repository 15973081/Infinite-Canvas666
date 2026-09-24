"""Real member admission, paid submission fencing and durable text recovery."""
import asyncio
import copy
import os
import uuid
from unittest.mock import patch

import httpx
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
REPLY = '已保存的回复 <script>alert(1)</script> 中文 🌱'
USAGE = {'prompt_tokens': 12, 'completion_tokens': 7, 'total_tokens': 19}


def prepared(world, kind='classic'):
    path, canvas = setup_canvas(world, kind)
    lease = acquire(world, path)
    node = {'id': 'source', 'type': 'llm' if kind == 'classic' else 'smart-prompt', 'text': 'original', 'userInput': 'original'}
    response = world['editor'].put(path, headers=proof(world, lease), json={
        'title': 'LLM acceptance', 'nodes': [node], 'connections': [], 'base_revision': canvas['revision']})
    assert response.status_code == 200, response.text
    canvas = response.json()['canvas']
    body = {'canvas_id': canvas['id'], 'client_task_id': 'canvas_llm_' + uuid.uuid4().hex,
            'provider_id': 'comfly', 'model': 'test', 'message': 'original',
            'canvas_target': {'source_node_id': 'source', 'target_node_id': 'source', 'base_revision': canvas['revision']}}
    return path, canvas, lease, body


def submit(world, body, lease):
    return world['editor'].post('/api/canvas-llm-tasks', headers=proof(world, lease, (body.get('canvas_target') or {}).get('base_revision', lease['revision'])), json=body)


def execute(world, tid):
    from app.storage import tasks, database, worker
    from app.storage.workspace import workspace_scope
    with workspace_scope(world['a']['id']):
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET available_at='2000-01-01' WHERE id=%s", (tid,))
        row = tasks.claim('llm-acceptance')
        assert row and row['id'] == tid
        asyncio.run(worker.execute(row))
        return tasks.get(tid)


def supplier(calls):
    async def respond(client, url, **kwargs):
        calls.append(copy.deepcopy(kwargs['json']))
        return httpx.Response(200, request=httpx.Request('POST', url), json={
            'choices': [{'message': {'content': REPLY}}], 'usage': USAGE})
    return respond


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_llm_worker_retains_text_usage_and_joins_after_target_deleted(world, kind):
    from app.storage.database import connection
    from app.services import canvas_ledger
    from app.storage.workspace import workspace_scope
    path, canvas, lease, body = prepared(world, kind)
    created = submit(world, body, lease)
    assert created.status_code == 200, created.text
    tid = created.json()['task_id']
    assert created.json()['canvas_binding']['version'] == 3
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)):
        task = execute(world, tid)
    assert task['status'] == 'succeeded', task
    assert task['result']['text'] == REPLY and task['result']['raw_usage'] == USAGE
    assert len(calls) == 1 and calls[0]['messages'][-1]['content'] == 'original'
    assert world['viewer'].get('/api/canvas-llm-tasks/' + tid, headers=headers(world['a'])).json()['result'] == task['result']
    with workspace_scope(world['a']['id']):
        page = canvas_ledger.read_page(canvas['id'])
        assert page['totals']['records'] == 1 and page['totals']['unknown'] == 1
        assert page['logs'][0]['billingKind'] == 'chat' and page['logs'][0]['raw_usage'] == USAGE
    with connection() as conn:
        before = conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone()
        fees = conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s', (canvas['id'],)).fetchall()
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (tid,)).fetchone()['n'] == 1
    kept = {'id': 'new-input', 'type': 'prompt', 'text': 'newer edits'}
    saved = world['editor'].put(path, headers=proof(world, lease, canvas['revision']), json={
        'title': 'newer title', 'nodes': [kept], 'connections': [], 'base_revision': canvas['revision']})
    assert saved.status_code == 200, saved.text
    revision = saved.json()['canvas']['revision']
    catalog = world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results']
    assert catalog[0]['state'] == 'in_canvas' and catalog[0]['binding']['state'] == 'missing'
    assert 'raw_usage' not in str(catalog)
    joined = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease, revision))
    assert joined.status_code == 200, joined.text
    assert joined.json()['already_in_canvas']  # The worker, not this click, delivered the text.
    document = joined.json()['canvas']
    assert document['nodes'][0] == kept and document['nodes'][1]['text'] == REPLY
    assert document['nodes'][1]['type'] == ('smart-prompt' if kind == 'smart' else 'prompt')
    again = world['editor'].post(path + '/task-results/' + tid + '/join', headers=proof(world, lease, document['revision']))
    assert again.status_code == 200 and again.json()['already_in_canvas']
    with connection() as conn:
        assert conn.execute('SELECT * FROM tasks WHERE id=%s', (tid,)).fetchone() == before
        assert conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s', (canvas['id'],)).fetchall() == fees


def test_llm_idempotency_and_request_binding_reject_changed_input(world):
    from app.storage.database import connection
    _, _, lease, body = prepared(world)
    first = submit(world, body, lease)
    assert first.status_code == 200, first.text
    assert submit(world, body, lease).json() == first.json()
    changed = {**body, 'message': 'different'}
    assert submit(world, changed, lease).status_code == 409
    with connection() as conn:
        row = conn.execute('SELECT * FROM tasks WHERE id=%s', (body['client_task_id'],)).fetchone()
        assert row['requested_by'] == world['people'][0]['id'] and row['provider_account_ref']
        assert row['request']['message'] == 'original' and row['canvas_edit_generation'] == lease['generation']
        assert not conn.execute('SELECT 1 FROM task_submissions WHERE task_id=%s', (body['client_task_id'],)).fetchone()


def test_llm_members_permissions_edit_proof_and_foreign_scope(world):
    path, canvas, lease, body = prepared(world)
    assert world['editor'].post('/api/canvas-llm-tasks', headers=headers(world['a']), json=body).status_code == 428
    assert world['viewer'].post('/api/canvas-llm-tasks', headers=headers(world['a']), json=body).status_code == 403
    assert world['outsider'].post('/api/canvas-llm-tasks', headers=headers(world['b']), json=body).status_code == 404
    assert submit(world, body, lease).status_code == 200
    tid = body['client_task_id']
    assert world['outsider'].get('/api/canvas-llm-tasks/' + tid, headers=headers(world['b'])).status_code == 404
    current = acquire(world, path, takeover='self', expected_generation=lease['generation'], confirm=True)
    assert submit(world, {**body, 'client_task_id': 'canvas_llm_' + uuid.uuid4().hex}, lease).status_code == 409
    # The unmigrated synchronous endpoint remains unavailable to members.
    assert world['editor'].post('/api/canvas-llm', headers=headers(world['a']), json={'message': 'bypass'}).status_code == 403


@pytest.mark.parametrize('change', [
    {'canvas_target': None}, {'messages': [{'role': 'system', 'content': 'override'}]},
    {'messages': [{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': 'https://foreign.test/img'}}]}]},
    {'api_key': 'browser-secret'}, {'client_task_id': 'unsafe'},
])
def test_llm_request_rejects_unbound_or_untracked_history_media(world, change):
    _, _, lease, body = prepared(world)
    assert submit(world, {**body, **change}, lease).status_code == 422


def test_llm_unknown_submission_is_not_retried(world):
    from app.storage import database, tasks
    from app.storage.workspace import workspace_scope
    _, _, lease, body = prepared(world)
    assert submit(world, body, lease).status_code == 200
    calls = []
    async def lost(*args, **kwargs):
        calls.append(1)
        raise httpx.ReadTimeout('response lost')
    with patch.object(httpx.AsyncClient, 'post', lost):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'needs_review' and len(calls) == 1
    with workspace_scope(world['a']['id']), database.connection() as conn:
        tasks.recover_expired()
        assert tasks.claim('must-not-repeat') is None
        assert conn.execute('SELECT outcome FROM task_submissions WHERE task_id=%s', (task['id'],)).fetchone()['outcome'] == 'uncertain'


def test_llm_checkpoint_restores_reply_and_ledger_without_supplier_or_account(world):
    from app.services import canvas_ledger, provider_control
    from app.storage import finalization, media, database
    from app.storage.workspace import workspace_scope
    _, canvas, lease, body = prepared(world)
    assert submit(world, body, lease).status_code == 200
    tid = body['client_task_id']
    original = canvas_ledger.record_task
    def fail(task):
        if task['status'] == 'succeeded':
            raise OSError('ledger unavailable')
        return original(task)
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)), patch.object(canvas_ledger, 'record_task', fail):
        task = execute(world, tid)
    assert task['status'] == 'finalizing' and len(calls) == 1
    with workspace_scope(world['a']['id']):
        asset = media.get_asset(finalization.source_id(tid))
        with database.connection() as conn:
            assert not conn.execute('SELECT 1 FROM ledger_entries WHERE canvas_id=%s', (canvas['id'],)).fetchone()
            # Revoke assignment after the paid reply; the local checkpoint is sufficient.
            conn.execute('DELETE FROM workspace_provider_grants WHERE workspace_id=%s', (world['a']['id'],))
    with patch.object(httpx.AsyncClient, 'post', side_effect=AssertionError('duplicate paid submit')):
        task = execute(world, tid)
    assert task['status'] == 'succeeded' and task['result']['raw_usage'] == USAGE
    with workspace_scope(world['a']['id']):
        assert media.get_asset(asset['id'])['object_version_id'] == asset['object_version_id']
        assert canvas_ledger.read_page(canvas['id'])['totals']['records'] == 1


def test_llm_checkpoint_survives_status_commit_loss(world):
    from app.storage import tasks, finalization
    from app.storage.workspace import workspace_scope
    _, _, lease, body = prepared(world)
    assert submit(world, body, lease).status_code == 200
    real_save = tasks.save
    def interrupted(task, *args, **kwargs):
        if task.get('status') == 'finalizing':
            raise asyncio.CancelledError()
        return real_save(task, *args, **kwargs)
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)), patch.object(tasks, 'save', interrupted):
        with pytest.raises(asyncio.CancelledError):execute(world, body['client_task_id'])
    with workspace_scope(world['a']['id']):
        assert finalization.has_source(body['client_task_id'])
        tasks.recover_expired()
    with patch.object(httpx.AsyncClient, 'post', side_effect=AssertionError('duplicate paid submit')):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded' and task['result']['text'] == REPLY and len(calls) == 1
