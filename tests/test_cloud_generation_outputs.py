"""Exact member -> task -> immutable output links, using isolated PostgreSQL."""
import os
import time
import uuid
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_task_canvas_bindings import setup_bound_canvas, payload, submit

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def queued(world, kind='image', canvas_kind='standalone'):
    if canvas_kind != 'standalone':
        _, canvas, lease = setup_bound_canvas(world, canvas_kind)
        body = payload(canvas, kind)
        response = submit(world, body, lease, kind)
    else:
        body = {'client_task_id': 'canvas_'+('img_' if kind == 'image' else 'vid_')+uuid.uuid4().hex,
                'prompt': 'attribution test', 'provider_id': 'comfly', 'model': 'test'}
        response = world['editor'].post('/api/canvas-'+kind+'-tasks', headers=headers(world['a']), json=body)
    assert response.status_code == 200, response.text
    return body['client_task_id']


def output(tmp_path, kind='image'):
    from app.storage import media
    source = tmp_path / ('output.png' if kind == 'image' else 'output.mp4')
    source.write_bytes(b'isolated immutable generated output')
    return media.publish(source)


def complete(tid, result):
    from app.storage import database, tasks
    from app.services.canvas_tasks import save_canvas_task
    token = uuid.uuid4()
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET lease_owner='attribution-test',lease_token=%s,lease_until=now()+interval '1 minute' WHERE id=%s", (token, tid))
    proof = tasks.lease_context.set((tid, token))
    try:
        task = tasks.get(tid)
        task.update(status='succeeded', result=result, requested_by='forged-worker-account')
        return save_canvas_task(task)
    finally:
        tasks.lease_context.reset(proof)
        tasks.release(tid, token)


@pytest.mark.parametrize('kind', ['image', 'video'])
@pytest.mark.parametrize('canvas_kind', ['classic', 'smart', 'standalone'])
def test_new_outputs_keep_authenticated_author_across_worker_and_retry(world, tmp_path, kind, canvas_kind):
    from app.storage import database, media, tasks
    from app.storage.workspace import workspace_scope
    tid = queued(world, kind, canvas_kind)
    with workspace_scope(world['a']['id']):
        asset = output(tmp_path, kind)
        result = {'type': 'online' if kind == 'image' else 'video',
                  'images' if kind == 'image' else 'videos': [media.stable_url(asset)], 'timestamp': time.time()}
        complete(tid, result)
        complete(tid, result)
        with database.connection() as conn:
            rows = conn.execute('SELECT * FROM generation_outputs WHERE task_id=%s', (tid,)).fetchall()
            assert len(rows) == 1
            row = rows[0]
            assert (row['workspace_id'], row['member_id'], row['asset_id'], row['media_kind'], row['output_index']) == (
                world['a']['id'], world['people'][0]['id'], asset['id'], kind, 0)
            assert tasks.get(tid)['requested_by'] == world['people'][0]['id']
            works = conn.execute('SELECT owner_id FROM online_works WHERE task_id=%s', (tid,)).fetchall()
            assert len(works) == (1 if canvas_kind == 'standalone' and kind == 'image' else 0)
            if works: assert works[0]['owner_id'] == row['member_id']
            billing = conn.execute('SELECT member_id FROM ledger_owners WHERE workspace_id=%s AND task_id=%s',
                                   (world['a']['id'], tid)).fetchone()
            assert billing['member_id'] == row['member_id']


@pytest.mark.parametrize('kind', ['online-image', 'video'])
def test_anonymous_member_task_is_rejected_before_storage(world, kind):
    from app.storage import database, tasks
    from app.storage.workspace import workspace_scope
    tid = 'anonymous-'+uuid.uuid4().hex
    with workspace_scope(world['a']['id']):
        with pytest.raises(HTTPException) as error:
            tasks.save({'id': tid, 'type': kind, 'status': 'queued', 'requested_by': world['people'][0]['id']}, {})
        assert error.value.detail['code'] == 'task_requester_required'
        with database.connection() as conn:
            assert not conn.execute('SELECT 1 FROM tasks WHERE id=%s', (tid,)).fetchone()


def test_success_and_attribution_roll_back_together(world, tmp_path):
    from app.storage import database, media, tasks, generation_outputs
    from app.storage.workspace import workspace_scope
    tid = queued(world)
    real = generation_outputs.record
    def broken(conn, task):
        real(conn, task)
        raise RuntimeError('injected after output attribution')
    with workspace_scope(world['a']['id']):
        asset = output(tmp_path)
        result = {'type': 'online', 'images': [media.stable_url(asset)]}
        with patch.object(generation_outputs, 'record', broken), pytest.raises(RuntimeError):
            complete(tid, result)
        assert tasks.get(tid)['status'] == 'queued'
        with database.connection() as conn:
            assert not conn.execute('SELECT 1 FROM generation_outputs WHERE task_id=%s', (tid,)).fetchone()
            assert not conn.execute('SELECT 1 FROM online_works WHERE task_id=%s', (tid,)).fetchone()
        complete(tid, result)
        with database.connection() as conn:
            assert conn.execute('SELECT count(*) n FROM generation_outputs WHERE task_id=%s', (tid,)).fetchone()['n'] == 1


def test_no_cross_workspace_or_remote_url_output_attribution(world, tmp_path):
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    tid = queued(world)
    with workspace_scope(world['b']['id']):
        other = output(tmp_path)
    with workspace_scope(world['a']['id']):
        for url in [media.stable_url(other), 'https://external.test/output.png']:
            with pytest.raises(HTTPException): complete(tid, {'images': [url]})
        with database.connection() as conn:
            assert not conn.execute('SELECT 1 FROM generation_outputs WHERE task_id=%s', (tid,)).fetchone()


def test_existing_slot_cannot_be_reassigned_and_database_checks_requester(world, tmp_path):
    import psycopg
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    tid = queued(world)
    with workspace_scope(world['a']['id']):
        first, second = output(tmp_path), output(tmp_path)
        complete(tid, {'images': [media.stable_url(first)]})
        with pytest.raises(HTTPException) as error:
            complete(tid, {'images': [media.stable_url(second)]})
        assert error.value.detail['code'] == 'generation_output_attribution_conflict'
        with pytest.raises(psycopg.errors.ForeignKeyViolation), database.connection() as conn:
            conn.execute('UPDATE generation_outputs SET member_id=%s WHERE task_id=%s', (world['people'][1]['id'], tid))
        with database.connection() as conn:
            row = conn.execute('SELECT asset_id,member_id FROM generation_outputs WHERE task_id=%s', (tid,)).fetchone()
            assert row == {'asset_id': first['id'], 'member_id': world['people'][0]['id']}


def test_history_writer_is_never_inferred_as_author(world, tmp_path):
    from app.services import members
    from app.services.member_context import access_scope
    from app.storage import database, documents, media
    from app.storage.workspace import workspace_scope
    person = world['people'][0]
    token = members.login(person['username'], PASSWORD, audience='workbench', source='attribution-test')['token']
    actor = members.resolve_session(token, 'workbench')
    history = 'legacy-'+uuid.uuid4().hex
    with workspace_scope(world['a']['id']):
        asset = output(tmp_path)
        with access_scope(actor, world['a']['id'], ('asset.manage',)):
            documents.put('history', history, {'type': 'online', 'images': [media.stable_url(asset)]})
        with database.connection() as conn:
            row = conn.execute('SELECT owner_id,task_id FROM online_works WHERE history_id=%s', (history,)).fetchone()
            assert row == {'owner_id': None, 'task_id': None}


def test_history_cannot_claim_unrelated_asset_using_a_real_task_id(world, tmp_path):
    from app.storage import database, documents, media
    from app.storage.workspace import workspace_scope
    tid = queued(world)
    with workspace_scope(world['a']['id']):
        asset = output(tmp_path)
        result = {'type': 'online', 'images': [media.stable_url(asset)]}
        complete(tid, result)
        other = output(tmp_path)
        with pytest.raises(HTTPException) as error:
            documents.put('history', 'task:'+tid, {'type': 'online', 'images': [media.stable_url(other)]})
        assert error.value.detail['code'] == 'task_history_result_mismatch'
        assert documents.get('history', 'task:'+tid) == result
        with database.connection() as conn:
            assert conn.execute('SELECT asset_id FROM online_works WHERE task_id=%s', (tid,)).fetchone()['asset_id'] == asset['id']


def test_batch_records_only_output_slots_not_input_or_response_metadata(world, tmp_path):
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    tid = queued(world)
    with workspace_scope(world['a']['id']):
        source, first, second = output(tmp_path), output(tmp_path), output(tmp_path)
        result = {'type': 'online', 'images': [media.stable_url(first), {'url': media.stable_url(second), 'media_asset_id': second['id']}],
                  'params': {'reference_images': [media.stable_url(source)]}, 'raw': {'images': [media.stable_url(source)]}}
        complete(tid, result)
        with database.connection() as conn:
            rows = conn.execute('SELECT output_index,asset_id FROM generation_outputs WHERE task_id=%s ORDER BY output_index', (tid,)).fetchall()
            assert rows == [{'output_index': 0, 'asset_id': first['id']}, {'output_index': 1, 'asset_id': second['id']}]
