"""Managed provider credentials, explicit grants and paid-task account boundaries."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import world, operator, headers, PASSWORD
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
KEY = 'test-only-encrypted-provider-secret'


def create(platform):
    pid = 'managed-' + uuid.uuid4().hex[:16]
    config = {'name': '隔离供应商', 'base_url': 'https://supplier.test/v1', 'protocol': 'openai',
              'enabled': True, 'image_models': ['test-image'], 'video_models': ['test-video']}
    body = {'config': config, 'expected_version': 0, 'secrets': {'api_key': KEY}, 'reason': '隔离验收'}
    result = platform['client'].put('/api/providers/' + pid, json=body)
    assert result.status_code == 200, result.text
    return pid, config, result.json()


def assign(platform, world, pid, version=1, selected=True):
    return platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']},
        json={'expected_version': version, 'provider_ids': [pid] if selected else [],
              'primary_provider_id': pid if selected else None, 'reason': '隔离空间分配验收'})


def test_credentials_encrypted_and_write_only_in_catalog_errors_and_audit(world, platform):
    from app.storage.database import connection
    pid, config, result = create(platform)
    c = platform['client']
    assert result['configured_secrets'] == ['api_key'] and KEY not in str(result)
    with connection() as conn:
        row = conn.execute('SELECT * FROM managed_providers WHERE id=%s', (pid,)).fetchone()
        assert row['secret_ciphertext'] and KEY not in str(row)
    for response in (c.get('/api/providers'), c.get('/api/audit')):
        assert response.status_code == 200 and KEY not in response.text
    bad = c.put('/api/providers/' + pid, json={'config': config, 'expected_version': True,
        'secrets': {'api_key': KEY}, 'reason': 'invalid body'})
    assert bad.status_code == 422 and KEY not in bad.text
    assert c.put('/api/providers/' + pid, json={'config': config, 'expected_version': 0, 'reason': 'stale'}).status_code == 409


def test_explicit_grants_control_member_models_and_no_unknown_provider_fallback(world, platform):
    from app.storage.workspace import workspace_scope
    from app.storage.task_requests import normalize
    from app.providers.registry import get_api_provider
    pid, _, _ = create(platform)
    client = world['editor']
    assert pid not in {p['id'] for p in client.get('/api/config', headers=headers(world['a'])).json()['providers']}
    assert assign(platform, world, pid).status_code == 200
    summary = client.get('/api/config', headers=headers(world['a'])).json()
    assert [p['id'] for p in summary['providers']] == [pid]
    assert summary['image_models'] == ['test-image'] and summary['providers'][0]['primary']
    assert summary['providers'][0]['has_key'] is True and summary['providers'][0]['enabled'] is True
    assert not {'base_url', 'proxy_url', 'key_env', 'key_preview', 'secret_ciphertext'} & summary['providers'][0].keys()
    other = world['outsider'].get('/api/config', headers=headers(world['b'])).json()
    assert pid not in {p['id'] for p in other['providers']}
    with workspace_scope(world['a']['id']):
        assert normalize({'provider_id': ''})['provider_id'] == pid
        for resolve in (lambda: normalize({'provider_id': 'not-assigned'}), lambda: get_api_provider('not-assigned')):
            with pytest.raises(HTTPException) as failure:
                resolve()
            assert failure.value.status_code == 403
    assert assign(platform, world, pid, version=2, selected=False).status_code == 200
    assert client.get('/api/config', headers=headers(world['a'])).json()['providers'] == []


def test_credentials_replace_clear_and_never_fall_back_to_host_env(world, platform, monkeypatch):
    from app.storage.workspace import workspace_scope
    from app.providers.registry import provider_key_env, provider_env_key_value
    from app.services.media import api_headers
    pid, config, _ = create(platform)
    assert assign(platform, world, pid).status_code == 200
    monkeypatch.setenv(provider_key_env(pid), 'must-not-use-host-key')
    with workspace_scope(world['a']['id']):
        assert provider_env_key_value(pid) == KEY
        assert api_headers(provider={'id': pid})['Authorization'] == 'Bearer ' + KEY
        assert api_headers()['Authorization'] == 'Bearer ' + KEY
    result = platform['client'].put('/api/providers/' + pid, json={'config': config, 'expected_version': 1,
        'clear_secrets': ['api_key'], 'reason': '清除测试凭证'})
    assert result.status_code == 200 and result.json()['configured_secrets'] == []
    summary = world['editor'].get('/api/config', headers=headers(world['a'])).json()
    assert summary['providers'][0]['has_key'] is False
    with workspace_scope(world['a']['id']):
        assert provider_env_key_value(pid) == ''
        with pytest.raises(HTTPException):
            api_headers(provider={'id': pid})
    replaced = platform['client'].put('/api/providers/' + pid, json={'config': config, 'expected_version': 2,
        'secrets': {'api_key': 'replacement-test-key'}, 'reason': '替换测试凭证'})
    assert replaced.status_code == 200
    with workspace_scope(world['a']['id']):
        assert provider_env_key_value(pid) == 'replacement-test-key'


def test_binding_changes_only_for_account_or_endpoint_not_labels_and_models(world, platform):
    from app.storage.workspace import workspace_scope
    from app.storage.task_requests import account_ref
    pid, config, _ = create(platform)
    assert assign(platform, world, pid).status_code == 200
    with workspace_scope(world['a']['id']):
        original = account_ref(pid)
    c = platform['client']
    changed = {**config, 'name': '已改名', 'image_models': ['other-image']}
    assert c.put('/api/providers/' + pid, json={'config': changed, 'expected_version': 1, 'reason': '改名'}).status_code == 200
    with workspace_scope(world['a']['id']):
        assert account_ref(pid) == original
    assert c.put('/api/providers/' + pid, json={'config': {**changed, 'base_url': 'https://other.test'}, 'expected_version': 2, 'reason': '换接口'}).status_code == 200
    with workspace_scope(world['a']['id']):
        assert account_ref(pid) != original
    assert c.put('/api/providers/' + pid, json={'config': config, 'expected_version': 3, 'reason': '恢复原接口'}).status_code == 200
    with workspace_scope(world['a']['id']):
        assert account_ref(pid) == original


def task_with_lease(world, pid, *, upstream=False):
    from app.storage import tasks
    from app.storage.database import connection
    task_id = 'provider-task-' + uuid.uuid4().hex
    from app.services import members
    from app.services.member_context import access_scope
    from app.storage.workspace import current_workspace
    login=members.login(world['people'][0]['username'],PASSWORD,audience='workbench',source='provider-fixture-'+uuid.uuid4().hex)
    principal=members.resolve_session(login['token'],'workbench')
    with access_scope(principal,current_workspace(),()):
        tasks.save({'id': task_id, 'type': 'video', 'status': 'queued', 'provider_id': pid},
                   request_payload={'provider_id': pid, 'model': 'test-video', 'prompt': 'no real generation'})
    row = tasks.claim('provider-test')
    assert row['id'] == task_id
    token = tasks.lease_context.set((task_id, row['lease_token']))
    current = tasks.get(task_id)
    current.update(status='polling' if upstream else 'submitting')
    if upstream:
        current['upstream_task_id'] = 'known-upstream-test'
    tasks.save(current)
    with connection() as conn:
        conn.execute('UPDATE tasks SET requested_by=%s WHERE id=%s', (world['people'][0]['id'], task_id))
    return task_id, token


def test_revocation_blocks_paid_admission_but_known_upstream_can_query_original_account(world, platform):
    from app.storage import tasks, submission
    from app.storage.workspace import workspace_scope
    from app.storage.database import connection
    from app.storage.task_requests import validate_execution
    from app.providers.registry import provider_env_key_value, get_api_provider_exact
    pid, config, _ = create(platform)
    assert assign(platform, world, pid).status_code == 200
    with workspace_scope(world['a']['id']):
        task_id, token = task_with_lease(world, pid)
        try:
            assert assign(platform, world, pid, version=2, selected=False).status_code == 200
            with pytest.raises(HTTPException) as failure:
                submission.admit()
            assert failure.value.status_code == 403
            with connection() as conn:
                assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (task_id,)).fetchone()['n'] == 0
            # Simulate a previously known submission; this is not a new POST.
            current = tasks.get(task_id); current.update(status='polling', upstream_task_id='known-test-upstream'); tasks.save(current)
            assert provider_env_key_value(pid) == KEY
            assert get_api_provider_exact(pid)['id'] == pid
            with connection() as conn:
                row = conn.execute('SELECT * FROM tasks WHERE id=%s', (task_id,)).fetchone()
            assert validate_execution(row)['provider_id'] == pid
            assert platform['client'].put('/api/providers/' + pid, json={'config': {**config, 'enabled': False}, 'expected_version': 1, 'reason': '停用新调用'}).status_code == 200
            assert get_api_provider_exact(pid)['enabled'] is True
            assert platform['client'].put('/api/providers/' + pid, json={'config': config, 'expected_version': 2,
                'secrets': {'api_key': 'different-account-key'}, 'reason': '换账号'}).status_code == 200
            with pytest.raises(HTTPException) as changed:
                provider_env_key_value(pid)
            assert changed.value.detail['code'] == 'provider_account_changed'
        finally:
            tasks.lease_context.reset(token)
        with pytest.raises(HTTPException):
            provider_env_key_value(pid)


def test_provider_admin_and_assignment_permissions_are_separate(world, platform):
    from app.services import members
    from fastapi.testclient import TestClient
    pid, _, _ = create(platform)
    role = members.create_role(world['operator'], '供应商配置专员', ['provider.configure'])
    person = world['people'][1]
    members.assign_roles(world['operator'], person['id'], [role])
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}) as manager:
        assert manager.post('/api/auth/login', json={'username': person['username'], 'password': PASSWORD}).status_code == 200
        assert manager.get('/api/providers').status_code == 200
        result = manager.put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={'provider_ids': [pid],
            'primary_provider_id': pid, 'expected_version': 1, 'reason': '无空间分配权限'})
        assert result.status_code == 403
        members.assign_roles(world['operator'], person['id'], [])
        assert manager.get('/api/providers').status_code == 403
    assert world['editor'].put('/api/providers', headers=headers(world['a']), json=[]).status_code == 403


def test_provider_validation_and_missing_encryption_key_fail_closed(world, platform, monkeypatch):
    from app.storage.workspace import workspace_scope
    from app.providers.registry import provider_env_key_value
    pid, config, _ = create(platform)
    assert assign(platform, world, pid).status_code == 200
    c = platform['client']
    for patch in ({'base_url': 'https://user:secret@supplier.test'}, {'base_url': 'https://supplier.test?key=secret'},
                  {'image_generation_endpoint': '//other.test/path'}, {'api_key': KEY}, {'image_models': 'not-a-list'},
                  {'model_prices': 'not-a-list'}, {'protocol': []}, {'model_prices': [{'kind': 'image', 'model': 'x', 'billing_type': 'per_image', 'unit_price': '1', 'effective_from': 'bad'}]}):
        assert c.put('/api/providers/' + pid, json={'config': {**config, **patch}, 'expected_version': 1, 'reason': 'invalid'}).status_code == 400
    assert c.put('/api/providers/UpperCase', json={'config': config, 'expected_version': 0, 'reason': 'invalid identifier'}).status_code == 400
    with monkeypatch.context() as patcher:
        patcher.delenv('PROVIDER_SECRET_KEY')
        assert c.get('/api/providers').status_code == 200
        assert c.put('/api/providers/' + pid, json={'config': config, 'expected_version': 1, 'reason': 'missing key'}).status_code == 503
        with workspace_scope(world['a']['id']), pytest.raises(HTTPException):
            provider_env_key_value(pid)


def test_provider_updates_and_audit_are_atomic_and_stale_changes_rejected(world, platform, monkeypatch):
    from app.services import provider_control, authorization as az
    from app.storage.database import connection
    pid, config, _ = create(platform)
    def unavailable(*args, **kwargs):
        raise RuntimeError('audit unavailable')
    with monkeypatch.context() as patcher:
        patcher.setattr(az, 'audit', unavailable)
        with pytest.raises(RuntimeError):
            provider_control.save(world['operator'], pid, config, 1, secrets={'api_key': 'must-rollback'}, reason='rollback')
    with connection() as conn:
        assert conn.execute('SELECT version FROM managed_providers WHERE id=%s', (pid,)).fetchone()['version'] == 1
    def update(_):
        try:
            provider_control.save(world['operator'], pid, config, 1, reason='concurrent update')
            return 200
        except HTTPException as failure:
            return failure.status_code
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert sorted(pool.map(update, range(3))) == [200, 409, 409]
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='provider.save' AND target_id=%s", (pid,)).fetchone()['n'] == 2
