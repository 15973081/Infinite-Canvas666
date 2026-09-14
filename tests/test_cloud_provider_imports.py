"""Legacy import uses real PostgreSQL, private fixture files and no model calls."""
import json
import os
import uuid
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, PASSWORD
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
SECRET = 'fixture-only-import-secret'


@pytest.fixture
def source(tmp_path, monkeypatch):
    from app.providers.registry import provider_key_env
    pid = 'import-' + uuid.uuid4().hex[:16]
    config = {'id': pid, 'name': '原供应商', 'base_url': 'https://legacy.test/v1', 'protocol': 'openai',
              'enabled': True, 'primary': True, 'image_models': ['old-image'], 'chat_models': ['old-chat'],
              'model_prices': [{'kind': 'image', 'model': 'old-image', 'billing_type': 'per_image',
                                'unit_price': '0.25', 'currency': 'CNY', 'effective_from': 123, 'effective_to': 456}]}
    path, env = tmp_path / 'providers.json', tmp_path / 'keys.env'
    path.write_text(json.dumps([config]), encoding='utf-8')
    env.write_text(provider_key_env(pid) + '=' + SECRET + '\n', encoding='utf-8')
    monkeypatch.setenv('LEGACY_PROVIDER_CONFIG_FILE', str(path))
    monkeypatch.setenv('LEGACY_PROVIDER_ENV_FILE', str(env))
    return {'id': pid, 'config': config, 'file': path, 'env': env}


def preview(platform, source='local_file'):
    response = platform['client'].post('/api/provider-imports/preview', json={'source': source, 'reason': '显式迁移验收'})
    assert response.status_code == 200, response.text
    assert SECRET not in response.text
    return response.json()


def confirm(platform, report, ids, keys=()):
    return platform['client'].post('/api/provider-imports/' + report['id'] + '/confirm',
        json={'provider_ids': list(ids), 'credential_provider_ids': list(keys)})


def test_import_encrypts_only_selected_credentials_preserves_source_and_retries(world, platform, source):
    from app.services import provider_control
    from app.storage.database import connection
    original = (source['file'].read_bytes(), source['env'].read_bytes())
    report = preview(platform)
    assert report['items'][0]['configured_secrets'] == ['api_key']
    assert report['items'][0]['was_primary'] is True
    assert 'source_digest' not in report
    result = confirm(platform, report, [source['id']], [source['id']])
    assert result.status_code == 200, result.text
    assert SECRET not in result.text
    assert confirm(platform, report, [source['id']], [source['id']]).json() == result.json()
    assert confirm(platform, report, [source['id']]).status_code == 409
    assert original == (source['file'].read_bytes(), source['env'].read_bytes())
    with connection() as c:
        row = c.execute('SELECT * FROM managed_providers WHERE id=%s', (source['id'],)).fetchone()
        assert row['version'] == 1 and SECRET not in str(row)
        assert provider_control.decrypt(row) == {'api_key': SECRET}
        assert row['config']['image_models'] == ['old-image']
        assert row['config']['model_prices'][0]['effective_from'] == 123
        assert row['config']['model_prices'][0]['effective_to'] == 456
        assert c.execute('SELECT count(*) AS n FROM workspace_provider_grants WHERE provider_id=%s', (source['id'],)).fetchone()['n'] == 0
        staged = c.execute('SELECT * FROM provider_import_previews WHERE id=%s', (report['id'],)).fetchone()
        assert SECRET not in str(staged)
        events = c.execute('SELECT * FROM management_events WHERE target_id=%s ORDER BY id', (report['id'],)).fetchall()
        assert [event['action'] for event in events] == ['provider.import.preview', 'provider.import.complete']
        assert SECRET not in str(events)
    assert SECRET not in platform['client'].get('/api/providers').text
    assert source['id'] not in {p['id'] for p in world['editor'].get('/api/config', headers={'X-Workspace-Id': world['a']['id']}).json()['providers']}


def test_configuration_only_import_does_not_require_or_copy_credentials(platform, source, monkeypatch):
    from app.storage.database import connection
    monkeypatch.delenv('PROVIDER_SECRET_KEY')
    report = preview(platform)
    result = confirm(platform, report, [source['id']])
    assert result.status_code == 200, result.text
    with connection() as c:
        row = c.execute('SELECT secret_ciphertext,secret_fields FROM managed_providers WHERE id=%s', (source['id'],)).fetchone()
        assert row == {'secret_ciphertext': None, 'secret_fields': []}


@pytest.mark.parametrize('change', ['config', 'credential'])
def test_source_changes_reject_confirmation_without_creating_anything(platform, source, change):
    from app.storage.database import connection
    report = preview(platform)
    target = source['file'] if change == 'config' else source['env']
    target.write_text(target.read_text() + '\n', encoding='utf-8')
    result = confirm(platform, report, [source['id']], [source['id']])
    assert result.status_code == 409 and result.json()['detail']['code'] == 'provider_import_source_changed'
    with connection() as c:
        assert not c.execute('SELECT 1 FROM managed_providers WHERE id=%s', (source['id'],)).fetchone()


def test_conflict_is_atomic_and_does_not_overwrite_existing_provider(platform, source):
    from app.services import provider_control
    from app.storage.database import connection
    second = 'import-' + uuid.uuid4().hex[:16]
    source['file'].write_text(json.dumps([source['config'], {**source['config'], 'id': second}]), encoding='utf-8')
    report = preview(platform)
    provider_control.save(platform['operator'], second, {'name': '管理员已新建'}, 0, reason='并发配置')
    result = confirm(platform, report, [source['id'], second])
    assert result.status_code == 409
    with connection() as c:
        assert not c.execute('SELECT 1 FROM managed_providers WHERE id=%s', (source['id'],)).fetchone()
        assert c.execute('SELECT config FROM managed_providers WHERE id=%s', (second,)).fetchone()['config']['name'] == '管理员已新建'


def test_secret_failure_rolls_back_the_entire_import(platform, source, monkeypatch):
    from app.storage.database import connection
    second = 'zz-import-' + uuid.uuid4().hex[:16]
    source['file'].write_text(json.dumps([source['config'], {**source['config'], 'id': second, 'api_key': SECRET}]), encoding='utf-8')
    report = preview(platform)
    monkeypatch.delenv('PROVIDER_SECRET_KEY')
    result = confirm(platform, report, [source['id'], second], [second])
    assert result.status_code == 503
    with connection() as c:
        assert c.execute('SELECT count(*) AS n FROM managed_providers WHERE id=ANY(%s)', ([source['id'], second],)).fetchone()['n'] == 0
        assert not c.execute('SELECT completed_at FROM provider_import_previews WHERE id=%s', (report['id'],)).fetchone()['completed_at']


def test_report_skips_retired_duplicate_invalid_and_existing_rows(platform, source):
    from app.services import provider_control
    provider_control.save(platform['operator'], source['id'], {'name': '已迁移'}, 0, reason='已有配置')
    rows = [source['config'], {'id': 'comfyui', 'api_key': SECRET}, {'id': 'modelscope'},
            {'id': 'runninghub'}, {'id': 'duplicate'}, {'id': 'duplicate'},
            {'id': 'invalid-url', 'base_url': 'https://user:' + SECRET + '@example.test'}, {'id': 'unknown-fields', 'private_key': SECRET}]
    source['file'].write_text(json.dumps(rows), encoding='utf-8')
    report = preview(platform)
    assert [r['status'] for r in report['items']] == ['existing', 'retired', 'retired', 'retired', 'duplicate', 'duplicate', 'invalid', 'invalid']
    assert confirm(platform, report, ['modelscope']).status_code == 409


def test_conflicting_inline_credentials_are_not_silently_chosen(platform, source):
    source['file'].write_text(json.dumps([{**source['config'], 'api_key': 'different-fixture-secret'}]), encoding='utf-8')
    report = preview(platform)
    assert report['items'][0]['status'] == 'credential_conflict'
    assert 'different-fixture-secret' not in json.dumps(report)


def test_default_workspace_is_an_explicit_source_and_keeps_its_original(platform, source):
    from app.storage.database import connection
    from psycopg.types.json import Jsonb
    with connection() as c:
        original = c.execute("SELECT value,revision FROM workspace_documents WHERE workspace_id='default' AND kind='api_providers' AND id='default'").fetchone()
        c.execute("""INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES('default','api_providers','default',%s)
            ON CONFLICT(workspace_id,kind,id) DO UPDATE SET value=excluded.value""", (Jsonb([source['config']]),))
    try:
        report = preview(platform, 'default_workspace')
        assert report['items'][0]['id'] == source['id']
        assert confirm(platform, report, [source['id']]).status_code == 200
        with connection() as c:
            assert c.execute("SELECT value FROM workspace_documents WHERE workspace_id='default' AND kind='api_providers' AND id='default'").fetchone()['value'] == [source['config']]
    finally:
        with connection() as c:
            if original:
                c.execute("UPDATE workspace_documents SET value=%s,revision=%s WHERE workspace_id='default' AND kind='api_providers' AND id='default'", (Jsonb(original['value']), original['revision']))
            else:
                c.execute("DELETE FROM workspace_documents WHERE workspace_id='default' AND kind='api_providers' AND id='default'")


def test_preview_receipt_requires_same_session_and_live_permission(platform, source, monkeypatch):
    from app.services import members, provider_imports
    from app.storage.database import connection
    report = preview(platform)
    # The fixture's operator is a different management session for the same member.
    with pytest.raises(HTTPException) as denied:
        provider_imports.confirm(platform['operator'], report['id'], [source['id']], [])
    assert denied.value.status_code == 404
    reader = Mock(side_effect=AssertionError('must authorize before reading'))
    monkeypatch.setattr(provider_imports, 'source_snapshot', reader)
    person = members.create_member(platform['operator'], 'import-user-' + uuid.uuid4().hex, '无配置权限')
    members.activate(person['activation_token'], PASSWORD)
    token = members.login(person['member']['username'], PASSWORD, audience='management')['token']
    actor = members.resolve_session(token, 'management')
    with pytest.raises(HTTPException):
        provider_imports.preview(actor, 'local_file', '不得读取')
    reader.assert_not_called()
    with connection() as c:
        c.execute("UPDATE provider_import_previews SET expires_at=clock_timestamp()-interval '1 second' WHERE id=%s", (report['id'],))
    assert confirm(platform, report, [source['id']]).json()['detail']['code'] == 'provider_import_expired'
    reader.assert_not_called()


@pytest.mark.parametrize('content', ['{}', '[{"id":"ok","id":"duplicate"}]', '[NaN]', '['])
def test_bad_source_is_rejected_without_echoing_raw_data(platform, source, content):
    source['file'].write_text(content, encoding='utf-8')
    response = platform['client'].post('/api/provider-imports/preview', json={'source': 'local_file', 'reason': '测试'})
    assert response.status_code == 400 and response.json()['detail']['code'] == 'provider_import_source_invalid'


def test_revoked_admin_and_workbench_session_cannot_read_or_confirm_sources(platform, source, monkeypatch):
    from app.services import members, provider_imports
    person = members.create_member(platform['operator'], 'import-admin-' + uuid.uuid4().hex, '临时导入管理员')
    members.activate(person['activation_token'], PASSWORD)
    role = members.create_role(platform['operator'], '导入员-' + uuid.uuid4().hex, ['provider.configure'])
    members.assign_roles(platform['operator'], person['member']['id'], [role])
    login = members.login(person['member']['username'], PASSWORD, audience='management')
    actor = members.resolve_session(login['token'], 'management')
    report = provider_imports.preview(actor, 'local_file', '撤权前预览')
    members.assign_roles(platform['operator'], person['member']['id'], [])
    reader = Mock(side_effect=AssertionError('must not read after revocation'))
    monkeypatch.setattr(provider_imports, 'source_snapshot', reader)
    with pytest.raises(HTTPException) as denied:
        provider_imports.confirm(actor, report['id'], [source['id']], [source['id']])
    assert denied.value.status_code == 403
    login = members.login(platform['username'], PASSWORD, audience='workbench')
    workbench = members.resolve_session(login['token'], 'workbench')
    with pytest.raises(HTTPException) as denied:
        provider_imports.preview(workbench, 'local_file', '错误入口')
    assert denied.value.detail['code'] == 'management_session_required'
    reader.assert_not_called()


def test_concurrent_confirmations_share_one_atomic_receipt(platform, source):
    from concurrent.futures import ThreadPoolExecutor
    from app.services import provider_imports
    from app.storage.database import connection
    report = provider_imports.preview(platform['operator'], 'local_file', '并发重复确认')
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(provider_imports.confirm, platform['operator'], report['id'], [source['id']], [source['id']]) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert results[0] == results[1]
    with connection() as c:
        assert c.execute('SELECT version FROM managed_providers WHERE id=%s', (source['id'],)).fetchone()['version'] == 1
        assert c.execute("SELECT count(*) AS n FROM management_events WHERE target_id=%s AND action='provider.import.complete'", (report['id'],)).fetchone()['n'] == 1
