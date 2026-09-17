"""Storage-scope integration, separate from membership/API authorization."""
import os
import asyncio
import hashlib
import io
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def spaces():
    from app.storage.database import connection
    values = ['space_' + uuid.uuid4().hex for _ in range(2)]
    with connection() as conn:
        for wid in values:
            conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)', (wid, wid))
    return values


def test_canvas_queries_and_conflict_details_do_not_cross_spaces():
    from app.storage import canvases
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    value = {'id': uuid.uuid4().hex, 'title': 'A private title', 'nodes': [], 'connections': []}
    with workspace_scope(a):
        canvases.save(value)
        assert [r['id'] for r in canvases.list_records()] == [value['id']]
    with workspace_scope(b):
        assert list(canvases.list_records()) == []
        assert list(canvases.all_documents()) == []
        with pytest.raises(HTTPException) as missing:
            canvases.get(value['id'])
        assert missing.value.status_code == 404
        for candidate in [dict(value), {k: v for k, v in value.items() if k != 'revision'}]:
            with pytest.raises(HTTPException) as conflict:
                canvases.save(candidate)
            assert conflict.value.status_code == 409
            assert conflict.value.detail['canvas'] is None
    with workspace_scope(a):
        assert canvases.get(value['id'])['revision'] == 1


def test_document_versions_and_deletion_are_scoped():
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    version_token = documents.read_versions.set({})
    try:
        with workspace_scope(a):
            documents.put('folders', 'same-id', {'space': 'A'})
            documents.put('folders', 'same-id', {'space': 'A2'})
            assert documents.get('folders', 'same-id') == {'space': 'A2'}
        with workspace_scope(b):
            assert documents.get('folders', 'same-id') is None
            assert documents.put('folders', 'same-id', {'space': 'B'}) == 1
            assert [r['value'] for r in documents.list_values('folders')] == [{'space': 'B'}]
        with workspace_scope(a):
            assert documents.put('folders', 'same-id', {'space': 'A3'}) == 3
            documents.delete('folders', 'same-id')
        with workspace_scope(b):
            assert documents.get('folders', 'same-id') == {'space': 'B'}
    finally:
        documents.read_versions.reset(version_token)


def test_history_pages_cursor_and_delete_are_scoped():
    from app.storage import documents, history
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    for wid in (a, b):
        with workspace_scope(wid):
            for n in range(3):
                documents.put('history', str(n), {'timestamp': n, 'images': [{'url': wid}]})
    with workspace_scope(a):
        first = history.page(limit=1)
        assert first['items'][0]['images'][0]['url'] == a
        assert history.page(limit=1, cursor=first['next_cursor'])['items'][0]['timestamp'] == 1
        assert history.delete_timestamp(2)
    with workspace_scope(b):
        with pytest.raises(HTTPException) as wrong_cursor:
            history.page(limit=1, cursor=first['next_cursor'])
        assert wrong_cursor.value.status_code == 400
        assert len(history.legacy_list()) == 3
        assert all(r['images'][0]['url'] == b for r in history.page()['items'])


def test_parallel_storage_scopes_and_exception_unwind():
    from app.storage import documents
    from app.storage.workspace import current_workspace, workspace_scope
    a, b = spaces()
    barrier = threading.Barrier(2)

    def write(wid):
        with workspace_scope(wid):
            barrier.wait(timeout=10)
            documents.put('concurrent', 'same-id', {'workspace': wid})
            barrier.wait(timeout=10)
            return documents.get('concurrent', 'same-id')

    with ThreadPoolExecutor(2) as pool:
        assert list(pool.map(write, [a, b])) == [{'workspace': a}, {'workspace': b}]
    with workspace_scope(a):
        with pytest.raises(ValueError):
            with workspace_scope(b):
                raise ValueError('leave nested context')
        assert current_workspace() == a
    assert current_workspace() == 'default'


def test_member_storage_without_explicit_scope_fails_closed(monkeypatch):
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    monkeypatch.setenv('AUTH_MODE', 'members')
    with pytest.raises(RuntimeError, match='explicit authorized workspace'):
        documents.get('folders')
    with pytest.raises(ValueError):
        with workspace_scope(None):
            pass


def test_media_aliases_output_slots_and_canvas_references_are_scoped(tmp_path):
    from app.storage import media, canvases, task_requests, database
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    path = tmp_path / 'example.bin'
    path.write_bytes(b'original bytes')
    alias = '/assets/shared-name.bin'
    with workspace_scope(a):
        asset_a = media.publish(path, legacy_ref=alias)
        canvas = {'id': uuid.uuid4().hex, 'nodes': [{'url': media.stable_url(asset_a)}], 'connections': []}
        canvases.save(canvas)
        signed = media.browser_url(asset_a)
        assert asset_a['object_key'].startswith('media/' + a + '/')
    with workspace_scope(b):
        assert media.get_asset(alias) is None
        asset_b = media.publish(path, legacy_ref=alias)
        assert asset_b['id'] != asset_a['id']
        assert media.get_asset(alias)['id'] == asset_b['id']
        with pytest.raises(HTTPException):
            media.get_asset(asset_a['id'])
        with patch.object(media.FilesystemStore, 'put', side_effect=AssertionError('must reject before object write')):
            with pytest.raises(HTTPException) as conflict:
                media.publish(path, asset_id=asset_a['id'])
            assert conflict.value.status_code == 409
        with pytest.raises(HTTPException):
            media.browser_url(asset_a)
        with pytest.raises(HTTPException):
            canvases.save({'id': uuid.uuid4().hex, 'nodes': [{'url': media.stable_url(asset_a)}], 'connections': []})
        with pytest.raises(HTTPException):
            with database.connection() as conn:
                task_requests.lock_ready(conn, [asset_a['id']])
    # Signed capabilities work independently of the current browser space.
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as client:
        assert client.get(signed).content == path.read_bytes()
        assert client.get(signed.replace('workspace=' + a, 'workspace=' + b)).status_code == 404
        assert client.get(signed + 'bad').status_code == 403
    with workspace_scope(a):
        assert media.get_asset(alias)['object_version_id'] == asset_a['object_version_id']


def test_upload_idempotency_signatures_completion_and_cleanup_are_scoped():
    from app.storage import uploads, media, database
    from app.storage.workspace import workspace_scope
    from fastapi.testclient import TestClient
    from main import app
    a, b = spaces()
    raw = b'independent space upload'
    key = uuid.uuid4().hex
    values = []
    for wid in (a, b):
        with workspace_scope(wid):
            upload = uploads.create('data.bin', len(raw), key)
            aid = upload['media_asset_id']
            signed = uploads.sign_part(aid, 1, hashlib.sha256(raw).hexdigest())
            values.append((aid, signed))
    assert values[0][0] != values[1][0]
    with workspace_scope(b):
        for operation in (uploads.get, uploads.abort, uploads.complete):
            with pytest.raises(HTTPException) as forbidden:
                operation(values[0][0])
            assert forbidden.value.status_code == 404
        assert uploads.parts(values[0][0]) == []
    with TestClient(app) as client:
        for wid, (aid, signed) in zip((a, b), values):
            response = client.put(signed['url'], content=raw, headers=signed['headers'])
            assert response.status_code == 200, response.text
            other = b if wid == a else a
            assert client.put(signed['url'].replace('workspace=' + wid, 'workspace=' + other), content=raw).status_code == 404
            with workspace_scope(wid), media.operation_scope():
                uploads.confirm_part(aid, 1)
                result = uploads.complete(aid)
                asset = media.get_asset(aid)
                assert asset['workspace_id'] == wid
                assert asset['object_key'].startswith('media/' + wid + '/')
                assert uploads.create('data.bin', len(raw), key) == result
                assert client.get(media.browser_url(asset)).content == raw
    with database.connection() as conn:
        conn.execute("UPDATE media_uploads SET expires_at=now()-interval '2 hours' WHERE asset_id=ANY(%s)", ([v[0] for v in values],))
        conn.execute("UPDATE assets SET upload_expires_at=now()-interval '2 hours' WHERE id=ANY(%s)", ([v[0] for v in values],))
    with workspace_scope(a):
        assert uploads.cleanup(apply=True)['completed'] == 1
        assert media.get_asset(values[0][0])['status'] == 'ready'
    with workspace_scope(b):
        assert uploads.get(values[1][0])['cleaned_at'] is None
    assert uploads.cleanup(all_workspaces=True,apply=True)['completed'] == 1


def test_ledger_aliases_amounts_revisions_and_updates_are_scoped():
    from app.services import canvas_ledger as ledger
    from app.storage.workspace import workspace_scope
    from app.storage.ledger import connection
    a, b = spaces()
    cid = 'historical-' + uuid.uuid4().hex
    def log(amount):
        return {'id': 'same-log', 'createdAt': 1789000000000, 'status': 'success',
                'cost': {'status': 'priced', 'kind': 'image', 'currency': 'CNY', 'amount_micros': amount}}
    with patch.object(ledger, 'provider_list', return_value=[]):
        for wid, amount in ((a, 12345), (b, 98765)):
            with workspace_scope(wid):
                ledger.import_canvas_logs(cid, [log(amount)])
                ledger.import_canvas_logs(cid, [log(amount)])
                page = ledger.read_page(cid)
                assert page['totals']['total'] == amount
                assert page['totals']['records'] == 1
        with workspace_scope(a):
            ledger.append_logs(cid, [log(77777)])
            assert ledger.read_page(cid)['totals']['total'] == 12345
            with connection() as conn:
                entry = conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=?', (cid,)).fetchone()['id']
                assert conn.execute('SELECT * FROM ledger_conflicts WHERE canvas_id=?', (cid,)).fetchall()
        with workspace_scope(b):
            assert ledger.read_page(cid)['totals']['total'] == 98765
            with connection() as conn:
                assert conn.execute('SELECT * FROM ledger_entries WHERE id=?', (entry,)).fetchone() is None
                assert conn.execute('UPDATE ledger_entries SET status=? WHERE id=?', ('failed', entry)).rowcount == 0
                assert not conn.execute('SELECT * FROM ledger_conflicts WHERE canvas_id=?', (cid,)).fetchall()


def test_task_lookup_creation_heartbeat_and_recovery_reject_other_spaces():
    from app.storage import tasks, database, finalization
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    tid = 'canvas_vid_' + uuid.uuid4().hex
    with workspace_scope(a):
        tasks.save({'id': tid, 'type': 'video', 'status': 'queued'}, {'prompt': 'space A'})
        row = tasks.claim('space-test')
        assert row['id'] == tid
    with workspace_scope(b):
        assert tasks.get(tid) == {} and tasks.request(tid) == {}
        assert tasks.list_tasks() == []
        assert not tasks.heartbeat(tid, row['lease_token'])
        tasks.release(tid, row['lease_token'])
        with pytest.raises(HTTPException):
            tasks.save({'id': tid, 'type': 'video'}, {'prompt': 'space B'})
        with pytest.raises(HTTPException) as retry:
            finalization.retry(tid)
        assert retry.value.status_code == 404
    with workspace_scope(a):
        assert tasks.heartbeat(tid, row['lease_token'])
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (tid,))
    with workspace_scope(b):
        tasks.recover_expired()
    with workspace_scope(a):
        assert tasks.get(tid)['status'] == 'running'
        tasks.recover_expired()
        assert tasks.get(tid)['status'] == 'queued'
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='cancelled' WHERE id=%s", (tid,))


def test_worker_restores_persisted_space_for_results_history_and_fees():
    from app.storage import canvases, tasks, worker, media, database, documents
    from app.storage.workspace import workspace_scope, current_workspace
    from app.models import OnlineImageRequest
    from app.routers import providers
    from app.services import canvas_ledger
    from PIL import Image
    import base64
    a, b = spaces()
    tid, cid = 'canvas_img_' + uuid.uuid4().hex, uuid.uuid4().hex
    with workspace_scope(a):
        canvases.save({'id': cid, 'nodes': [], 'connections': []})
        request = OnlineImageRequest(prompt='test', provider_id='comfly', model='test', n=1, canvas_id=cid).model_dump(mode='json')
        tasks.save({'id': tid, 'type': 'online-image', 'status': 'queued', 'canvas_id': cid,
                    'provider_id': 'comfly', 'model': 'test', 'billing_request': request,
                    'billing_price': {'unit_price': '0.05', 'billing_type': 'per_image', 'currency': 'CNY'}}, request)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET available_at='1900-01-01' WHERE id=%s", (tid,))
    paid = []
    async def generate(*args, **kwargs):
        assert current_workspace() == a
        assert await asyncio.to_thread(current_workspace) == a
        paid.append(tid)
        image = io.BytesIO()
        Image.new('RGB', (8, 8), 'blue').save(image, format='PNG')
        return {'type': 'b64', 'value': base64.b64encode(image.getvalue()).decode()}, {'id': 'fake-upstream'}
    with workspace_scope(b):
        row = tasks.claim('global-worker', all_workspaces=True)
        assert row['id'] == tid and row['workspace_id'] == a
        with patch.object(providers, 'generate_ai_image', side_effect=generate):
            asyncio.run(worker.execute(row))
        assert current_workspace() == b
        assert tasks.get(tid) == {}
        assert documents.get('history', 'task:' + tid) is None
        assert canvas_ledger.read_page(cid)['totals']['records'] == 0
    with workspace_scope(a):
        task = tasks.get(tid)
        assert task['status'] == 'succeeded', task
        assert paid == [tid]
        assert media.get_asset(task['result']['images'][0])['workspace_id'] == a
        assert documents.get('history', 'task:' + tid)
        assert canvas_ledger.read_page(cid)['totals']['total'] == 50000


def test_global_worker_pauses_new_work_in_archived_space_but_keeps_paid_results():
    from app.storage import tasks, database
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    ids = ['canvas_vid_' + uuid.uuid4().hex for _ in range(2)]
    for wid, tid in zip((a, b), ids):
        with workspace_scope(wid):
            tasks.save({'id': tid, 'type': 'video', 'status': 'queued'}, {'prompt': 'queue scope'})
    with database.connection() as conn:
        conn.execute("UPDATE workspaces SET status='archived' WHERE id=%s", (a,))
        conn.execute("UPDATE tasks SET available_at='1800-01-01' WHERE id=ANY(%s)", (ids,))
    row = tasks.claim('global-queue', all_workspaces=True)
    assert row['id'] == ids[1] and row['workspace_id'] == b
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='polling',upstream_task_id='already-paid' WHERE id=%s", (ids[0],))
    recovered = tasks.claim('global-queue', all_workspaces=True)
    assert recovered['id'] == ids[0] and recovered['workspace_id'] == a
    for wid, item in ((a, recovered), (b, row)):
        with workspace_scope(wid):
            context = tasks.lease_context.set((item['id'], item['lease_token']))
            try:
                tasks.save({**tasks.get(item['id']), 'status': 'cancelled'})
            finally:
                tasks.lease_context.reset(context)
                tasks.release(item['id'], item['lease_token'])


def test_upload_migration_backfills_space_without_changing_keys_or_versions():
    from app.storage import database
    from psycopg import sql
    name = 'upload_upgrade_' + uuid.uuid4().hex
    # Transactional DDL: failure rolls back this entire synthetic schema.
    with database.connection() as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(name)))
        conn.execute(sql.SQL('SET LOCAL search_path TO {}, public').format(sql.Identifier(name)))
        for version, source in database.migrations():
            if version <= 4:
                conn.execute(source.replace('canvas_cloud.', name + '.'), prepare=False)
        aid = 'ast_' + uuid.uuid4().hex
        conn.execute(sql.SQL('''INSERT INTO {}.assets
            (id,kind,status,bucket,region,object_key,object_version_id,size_bytes,sha256,content_type)
            VALUES(%s,'file','ready','local-simulation','local','media/default/retained','fixed-original-version',5,%s,'application/octet-stream')''').format(sql.Identifier(name)), (aid, '0' * 64))
        conn.execute(sql.SQL('''INSERT INTO {}.media_uploads
            (asset_id,idempotency_key,request_sha256,backend,size_bytes,part_size,part_count,status,expires_at)
            VALUES(%s,'same-client-key',%s,'filesystem',5,8,1,'ready',now()+interval '1 hour')''').format(sql.Identifier(name)), (aid, '1' * 64))
        source = dict(database.migrations())[5]
        conn.execute(source.replace('canvas_cloud.', name + '.'), prepare=False)
        row = conn.execute(sql.SQL('''SELECT u.workspace_id,u.idempotency_key,u.status,a.object_key,a.object_version_id
            FROM {}.media_uploads u JOIN {}.assets a ON a.id=u.asset_id WHERE u.asset_id=%s''').format(sql.Identifier(name), sql.Identifier(name)), (aid,)).fetchone()
        assert row == {'workspace_id': 'default', 'idempotency_key': 'same-client-key', 'status': 'ready',
                       'object_key': 'media/default/retained', 'object_version_id': 'fixed-original-version'}
        conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(name)))


def test_legacy_import_scopes_ledger_and_same_path_media(tmp_path):
    import json
    from app.storage import database, media
    from app.storage.migration import migrate_legacy
    from app.storage.workspace import workspace_scope
    from app.services import canvas_ledger as ledger
    ids, canvas_ids = [], []
    for index, wid in enumerate(spaces()):
        source = tmp_path / wid
        (source / 'data').mkdir(parents=True)
        (source / 'assets').mkdir()
        (source / 'assets/same.png').write_bytes(b'legacy media')
        cid = uuid.uuid4().hex
        canvas_ids.append(cid)
        amount = 912345 + index
        log = {'id': 'legacy', 'createdAt': 1789000000000, 'status': 'success',
               'billingKind': 'image', 'cost': {'status': 'priced', 'kind': 'image',
               'currency': 'CNY', 'amount_micros': amount}}
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'local',
             'CANVAS_LEDGER_DB_PATH': str(source / 'data/canvas_ledger.sqlite3')}), patch.object(ledger, 'provider_list', return_value=[]):
            ledger.import_canvas_logs(cid, [log])
        with workspace_scope(wid):
            migrate_legacy(source, apply=True, report_path=tmp_path / (wid + '.json'))
            migrate_legacy(source, apply=True, report_path=tmp_path / (wid + '.json'))
            ids.append(media.get_asset('/assets/same.png')['id'])
            assert ledger.read_page(cid)['totals']['total'] == amount
            report = json.loads((tmp_path / (wid + '.json')).read_text(encoding='utf-8'))
            target = report['ledger']['target_totals']
            assert len(target) == 1 and target[0]['records'] == 1
            assert int(target[0]['amount_micros']) == amount
            assert target[0]['currency'] == 'CNY'
    assert ids[0] != ids[1]
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE canvas_id=ANY(%s) AND workspace_id='default'", (canvas_ids,)).fetchone()['n'] == 0
