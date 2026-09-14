"""Maintenance enforcement through real HTTP, database transactions and workers."""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import io
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, headers, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture(autouse=True)
def reset_maintenance():
    yield
    from app.storage.database import connection, schema_name
    assert schema_name().startswith('cloud_test_')
    with connection() as conn:
        conn.execute("UPDATE maintenance_controls SET mode='normal',version=version+1,planned_at=NULL,drain_started_at=NULL,drain_deadline=NULL")


def change(actor, workspace, mode, **kwargs):
    from app.services import maintenance_control as control
    version = control.snapshot(actor, workspace)['control']['version']
    return control.change(actor, workspace, mode, version, reason='隔离维护验收', message='测试维护公告', **kwargs)


def recover(actor, workspace):
    change(actor, workspace, 'recovering')
    return change(actor, workspace, 'normal', confirm_recovery=True)


def test_http_space_maintenance_platform_precedence_and_minimal_status(world):
    from app.services import maintenance_control as control
    op, a, b = world['operator'], world['a'], world['b']
    change(op, a['id'], 'draining')
    assert world['editor'].post('/api/canvases', headers=headers(a), json={'title': 'blocked'}).status_code == 503
    assert world['viewer'].get('/api/canvases', headers=headers(a)).status_code == 200
    assert world['outsider'].post('/api/canvases', headers=headers(b), json={'title': 'unaffected'}).status_code == 200
    change(op, a['id'], 'read_only')
    assert world['editor'].post('/api/conversations', headers=headers(a), json={'title': 'blocked'}).status_code == 503
    change(op, a['id'], 'offline')
    assert world['editor'].get('/api/canvases', headers=headers(a)).status_code == 503
    status = world['editor'].get('/api/maintenance/status', headers=headers(a))
    assert status.status_code == 200 and status.json()['maintenance']['mode'] == 'offline'
    assert status.json()['task_counts'] == {}
    with world['editor'].websocket_connect('/ws/stats?workspace=' + a['id'], headers={'Origin': os.environ['PUBLIC_BASE_URL']}) as ws:
        assert ws.receive_json()['maintenance']['mode'] == 'offline'
    change(op, None, 'draining')
    recover(op, a['id'])
    assert control.snapshot(op, a['id'])['effective']['mode'] == 'draining'
    assert world['editor'].post('/api/canvases', headers=headers(a), json={'title': 'still blocked'}).status_code == 503
    recover(op, None)
    assert world['editor'].post('/api/canvases', headers=headers(a), json={'title': 'resumed'}).status_code == 200


def test_due_schedule_is_enforced_without_scheduler_and_reconciles_once(operator):
    from app.services import members, maintenance_control as control
    from app.storage.database import connection, close
    space = members.create_workspace(operator, '计划维护', operator.member_id)['id']
    result = change(operator, space, 'scheduled', planned_at=datetime.now(timezone.utc) + timedelta(minutes=10), grace_seconds=20)
    assert result['effective']['mode'] == 'scheduled'
    with pytest.raises(HTTPException) as stale:
        control.change(operator, space, 'normal', result['control']['version'] - 1, reason='stale')
    assert stale.value.status_code == 409
    with connection() as conn:
        conn.execute("UPDATE maintenance_controls SET planned_at=clock_timestamp()-interval '1 second' WHERE workspace_id=%s", (space,))
        assert control.current(conn, space)['mode'] == 'draining'
        assert conn.execute('SELECT mode FROM maintenance_controls WHERE workspace_id=%s', (space,)).fetchone()['mode'] == 'scheduled'
        with pytest.raises(HTTPException):
            control.ensure(conn, space, 'write')
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(lambda _: control.tick(), range(4))) == 1
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='maintenance.scheduled.start' AND workspace_id=%s", (space,)).fetchone()['n'] == 1
    close()
    assert control.snapshot(operator, space)['control']['mode'] == 'draining'
    with pytest.raises(HTTPException):
        change(operator, space, 'normal')
    change(operator, space, 'recovering')
    with pytest.raises(HTTPException):
        change(operator, space, 'normal')
    assert change(operator, space, 'normal', confirm_recovery=True)['control']['mode'] == 'normal'


def test_upload_grace_and_preissued_signed_put_cannot_publish_after_deadline(world):
    from app.storage.database import connection
    client, a = world['editor'], world['a']
    body = b'isolated upload bytes'
    uploads = []
    for index in range(2):
        result = client.post('/api/media/uploads', headers=headers(a), json={'name': 'maintenance.txt', 'size': len(body), 'idempotency_key': uuid.uuid4().hex})
        assert result.status_code == 200, result.text
        asset_id = result.json()['media_asset_id']
        signed = client.post(f'/api/media/uploads/{asset_id}/parts/1', headers=headers(a), json={'sha256': hashlib.sha256(body).hexdigest()})
        assert signed.status_code == 200, signed.text
        uploads.append((asset_id, signed.json()['url']))
    change(world['operator'], a['id'], 'draining', grace_seconds=120)
    assert client.post('/api/media/uploads', headers=headers(a), json={'name': 'new.txt', 'size': 1, 'idempotency_key': uuid.uuid4().hex}).status_code == 503
    asset_id, signed = uploads[0]
    assert client.put(signed, content=body).status_code == 200
    assert client.post(f'/api/media/uploads/{asset_id}/parts/1/complete', headers=headers(a)).status_code == 200
    finished = client.post(f'/api/media/uploads/{asset_id}/complete', headers=headers(a))
    assert finished.status_code == 200 and finished.json()['status'] == 'ready', finished.text
    with connection() as conn:
        conn.execute("UPDATE maintenance_controls SET drain_deadline=clock_timestamp()-interval '1 second' WHERE workspace_id=%s", (a['id'],))
    asset_id, signed = uploads[1]
    assert client.put(signed, content=body).status_code == 503
    assert client.post(f'/api/media/uploads/{asset_id}/complete', headers=headers(a)).status_code == 503
    with connection() as conn:
        assert conn.execute('SELECT object_version_id FROM media_upload_parts WHERE asset_id=%s', (asset_id,)).fetchone()['object_version_id'] is None


def task(world, n=1, canvas_id=''):
    response = world['editor'].post('/api/canvas-image-tasks', headers=headers(world['a']), json={'prompt': 'maintenance test', 'provider_id': 'comfly', 'model': 'test', 'n': n, 'canvas_id': canvas_id})
    assert response.status_code == 200, response.text
    return response.json()['task_id']


def test_claimed_unsubmitted_task_pauses_but_known_upstream_remains_claimable(world):
    from app.storage import tasks, worker
    from app.storage.workspace import workspace_scope
    from app.routers import providers
    from app.storage.database import connection
    wid = world['a']['id']
    tid = task(world)
    with workspace_scope(wid):
        row = tasks.claim('maintenance-race')
        assert row['id'] == tid
        change(world['operator'], wid, 'draining')
        with patch.object(providers, 'generate_ai_image', side_effect=AssertionError('paid request forbidden')):
            asyncio.run(worker.execute(row))
        assert tasks.get(tid)['status'] == 'queued'
        assert tasks.claim('paused') is None
        # Simulate an upstream task whose identifier was durably checkpointed.
        with connection() as conn:
            conn.execute("UPDATE tasks SET kind='video',status='polling',upstream_task_id='known-upstream',available_at='2000-01-01' WHERE id=%s", (tid,))
        change(world['operator'], wid, 'offline')
        row = tasks.claim('recover-paid')
        assert row['id'] == tid and row['status'] == 'polling'
        tasks.release(tid, row['lease_token'])


def test_each_paid_post_rechecks_maintenance_and_member_revocation(world):
    import httpx
    from app.services import members
    from app.storage import tasks, submission
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    wid, tid = world['a']['id'], task(world)
    class Supplier:
        calls = 0
        async def post(self, url, **kwargs):
            self.calls += 1
            return httpx.Response(200, json={'accepted': True}, request=httpx.Request('POST', url))
    supplier = Supplier()
    with workspace_scope(wid):
        row = tasks.claim('per-post')
        token = tasks.lease_context.set((tid, row['lease_token']))
        try:
            current = tasks.get(tid)
            current['status'] = 'submitting'
            tasks.save(current)
            asyncio.run(submission.paid_post(supplier, 'https://fake.invalid/generate'))
            change(world['operator'], wid, 'draining')
            with pytest.raises(HTTPException):
                asyncio.run(submission.paid_post(supplier, 'https://fake.invalid/fallback'))
            recover(world['operator'], wid)
            members.set_member_status(world['operator'], world['people'][0]['id'], 'disabled')
            with pytest.raises(HTTPException):
                asyncio.run(submission.paid_post(supplier, 'https://fake.invalid/another'))
            assert supplier.calls == 1
            with connection() as conn:
                rows = conn.execute('SELECT outcome,response_status FROM task_submissions WHERE task_id=%s', (tid,)).fetchall()
                assert rows == [{'outcome': 'responded', 'response_status': 200}]
        finally:
            tasks.lease_context.reset(token)
            tasks.release(tid, row['lease_token'])


def test_partial_batch_retains_paid_output_and_cost_record_during_offline(world):
    from PIL import Image
    from app.storage import tasks, worker, media
    from app.storage.workspace import workspace_scope
    from app.routers import providers
    from app.storage.database import connection
    from psycopg.types.json import Jsonb
    from app.services import canvas_ledger
    created = world['editor'].post('/api/canvases', headers=headers(world['a']), json={'title': 'paid partial outputs'})
    assert created.status_code == 200
    cid = created.json()['canvas']['id']
    wid, tid = world['a']['id'], task(world, 2, cid)
    with connection() as conn:
        conn.execute("UPDATE tasks SET legacy_metadata=legacy_metadata || %s WHERE id=%s", (Jsonb({'billing_price': {'unit_price': '0.05', 'billing_type': 'per_image', 'currency': 'CNY'}}), tid))
    image = io.BytesIO()
    Image.new('RGB', (8, 8), 'blue').save(image, format='PNG')
    calls = []
    async def supplier(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            change(world['operator'], wid, 'draining')
            change(world['operator'], wid, 'offline')
            return {'type': 'b64', 'value': base64.b64encode(image.getvalue()).decode()}, {'id': 'paid-image', 'usage': {'count': 1}}
        raise HTTPException(503, {'code': 'maintenance_restricted'})
    with workspace_scope(wid):
        row = tasks.claim('partial')
        with patch.object(providers, 'generate_ai_image', side_effect=supplier):
            asyncio.run(worker.execute(row))
        result = tasks.get(tid)
        assert result['status'] == 'succeeded', result
        assert result['result']['partial'] is True
        assert result['result']['params']['n'] == 1 and result['result']['params']['requested_n'] == 2
        assert len(result['result']['images']) == 1
        assert media.get_asset(result['result']['images'][0])['status'] == 'ready'
        assert canvas_ledger.read_page(cid)['totals']['records'] == 1
        assert canvas_ledger.read_page(cid)['totals']['total'] == 50000


def test_transaction_rechecks_maintenance_after_http_preflight(world):
    from app.services.member_gateway import preflight, COOKIE
    from app.services.member_context import access_scope
    from app.services import members
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    wid = world['a']['id']
    preflight(actor, wid, ('canvas.edit',), 'write')
    change(world['operator'], wid, 'draining')
    with workspace_scope(wid), access_scope(actor, wid, ('canvas.edit',), 'write'):
        with pytest.raises(HTTPException) as denied:
            documents.put('maintenance-race', 'write', {'unexpected': True})
        assert denied.value.status_code == 503
    with workspace_scope(wid):
        assert documents.get('maintenance-race', 'write') is None


def test_independent_management_scope_permissions_restart_and_service_presence(world, monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.management.application import create_app
    from tools.build_management import build
    from app.services import members, maintenance_control as control
    from main import app as workbench
    monkeypatch.setenv('MANAGEMENT_BASE_URL', 'http://127.0.0.1:8766')
    role = members.create_role(world['operator'], '空间维护员', ['maintenance.space'], world['a']['id'])
    members.assign_roles(world['operator'], world['people'][0]['id'], [role], world['a']['id'])
    app = create_app(build(tmp_path / 'dist'))
    with TestClient(app, base_url='http://127.0.0.1:8766', headers={'Origin': 'http://127.0.0.1:8766'}) as client:
        assert client.post('/api/auth/login', json={'username': world['people'][0]['username'], 'password': PASSWORD}).status_code == 200
        assert client.get('/api/maintenance').status_code == 403
        assert client.get('/api/maintenance', params={'workspace': world['b']['id']}).status_code == 403
        status = client.get('/api/maintenance', params={'workspace': world['a']['id']}).json()
        assert 'reason' not in status['effective']['sources'][0]
        result = client.patch('/api/maintenance', params={'workspace': world['a']['id']}, json={'mode': 'draining', 'expected_version': status['control']['version'], 'reason': '维护验证'})
        assert result.status_code == 200, result.text
        assert result.json()['activity']['canvas_locks'] is None
        assert result.json()['activity']['database_stop_ready'] is False
    # Fresh workbench lifespan and independent management lifespan preserve it.
    with TestClient(workbench):
        state = control.snapshot(world['operator'], world['a']['id'])
        assert state['control']['mode'] == 'draining'
        assert any(s['kind'] == 'workbench' and s['online'] for s in state['activity']['services'])
    with TestClient(app):
        assert control.snapshot(world['operator'], world['a']['id'])['control']['mode'] == 'draining'
