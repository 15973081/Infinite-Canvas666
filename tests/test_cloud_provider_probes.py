"""Independent provider discovery without paid upstream requests or secret echoes."""
import asyncio
import os

import httpx
import pytest

from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_management import platform
from test_cloud_managed_providers import create, KEY

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def transport(monkeypatch, handler):
    from app.services import provider_probes
    original = httpx.AsyncClient
    calls, options = [], []
    async def wrapped(request):
        calls.append(request)
        response = handler(request)
        return await response if asyncio.iscoroutine(response) else response
    def factory(**kwargs):
        options.append(kwargs)
        # A configured proxy is asserted but never connected during tests.
        kwargs.pop('proxy', None)
        return original(transport=httpx.MockTransport(wrapped), **kwargs)
    monkeypatch.setattr(provider_probes.httpx, 'AsyncClient', factory)
    return calls, options


def probe(platform, pid, version=1):
    return platform['client'].post('/api/providers/' + pid + '/probe',
        json={'expected_version': version, 'reason': '本地模拟连接验收'})


@pytest.mark.parametrize(('protocol','path'), [('openai','/v1/models'), ('apimart','/v1/models'),
    ('gemini','/v1beta/models'), ('volcengine','/api/v3/models')])
def test_protocols_use_saved_credentials_and_only_read_models(platform, monkeypatch, protocol, path):
    from app.storage.database import connection
    pid, config, _ = create(platform)
    config.update(protocol=protocol, base_url='https://supplier.test')
    assert platform['client'].put('/api/providers/' + pid, json={'config': config, 'expected_version': 1, 'reason': '选择协议'}).status_code == 200
    calls, options = transport(monkeypatch, lambda request: httpx.Response(200, json={'data': [{'id': 'gpt-4o'}, {'id': 'flux-1'}, {'id': 'veo3'}, {'id': 'gpt-4o'}]}))
    response = probe(platform, pid, 2)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['ok'] and result['model_count'] == 3 and result['version'] == 2
    assert result['image_models'] == ['flux-1'] and result['video_models'] == ['veo3'] and result['chat_models'] == ['gpt-4o']
    assert len(calls) == 1 and calls[0].method == 'GET' and calls[0].url.path == path
    assert not calls[0].url.query and not calls[0].content
    if protocol == 'gemini':
        assert calls[0].headers['x-goog-api-key'] == KEY and 'authorization' not in calls[0].headers
    else:
        assert calls[0].headers['authorization'] == 'Bearer ' + KEY
    assert options[0]['trust_env'] is False and options[0]['follow_redirects'] is False
    assert KEY not in response.text
    with connection() as conn:
        assert conn.execute('SELECT version FROM managed_providers WHERE id=%s', (pid,)).fetchone()['version'] == 2
        rows = conn.execute("SELECT action,details FROM management_events WHERE target_id=%s AND action LIKE 'provider.probe.%%' ORDER BY id", (pid,)).fetchall()
        assert [row['action'] for row in rows] == ['provider.probe.started','provider.probe.finished']
        assert KEY not in str(rows) and rows[1]['details']['model_count'] == 3


@pytest.mark.parametrize(('status','code'), [(302,'upstream_redirect'), (401,'upstream_auth_rejected'),
    (403,'upstream_auth_rejected'), (404,'upstream_models_unavailable'), (405,'upstream_models_unavailable'),
    (429,'upstream_rate_limited'), (500,'upstream_error')])
def test_upstream_failures_never_echo_body_or_redirect_credentials(platform, monkeypatch, status, code):
    pid, _, _ = create(platform)
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(status, text='error includes ' + KEY,
        headers={'Location': 'https://other.test/?secret=' + KEY}))
    response = probe(platform, pid)
    assert response.status_code == 200 and response.json()['code'] == code and not response.json()['ok']
    assert KEY not in response.text and 'other.test' not in response.text and len(calls) == 1


@pytest.mark.parametrize(('body','code'), [(b'<html>not JSON</html>', 'upstream_invalid_response'),
    (b'{"error":"wrong endpoint"}', 'upstream_invalid_response'), (b'{"data": []}', 'models_empty'),
    (b'[]','upstream_invalid_response'), (b'x' * (1024 * 1024 + 1), 'upstream_response_too_large')], ids=['html','error-json','empty','array','oversized'])
def test_response_shape_and_size_are_bounded(platform, monkeypatch, body, code):
    pid, _, _ = create(platform)
    transport(monkeypatch, lambda request: httpx.Response(200, content=body))
    response = probe(platform, pid)
    assert response.status_code == 200 and response.json()['code'] == code


def test_model_ids_are_filtered_and_partial_lists_are_explicit(platform, monkeypatch):
    pid, _, _ = create(platform)
    items = [KEY, 'echo-' + KEY, {'id': {'nested': 'invalid'}}, 'line\nbreak', 'x' * 181]
    items += ['gpt-test-' + str(i) for i in range(1501)]
    transport(monkeypatch, lambda request: httpx.Response(200, json={'data': items, 'has_more': True}))
    response = probe(platform, pid)
    result = response.json()
    assert result['ok'] and result['truncated'] and result['filtered'] and result['model_count'] == 1500
    assert KEY not in response.text and 'nested' not in response.text


@pytest.mark.parametrize('error', [httpx.ReadTimeout('private ' + KEY), httpx.ConnectError('private ' + KEY)])
def test_transport_errors_are_sanitized(platform, monkeypatch, error):
    pid, _, _ = create(platform)
    def fail(request):
        raise error
    transport(monkeypatch, fail)
    response = probe(platform, pid)
    assert response.status_code == 200 and not response.json()['ok'] and KEY not in response.text
    assert response.json()['code'] in {'upstream_timeout','upstream_connection_failed'}


def test_total_deadline_cancels_slow_stream_and_records_outcome(platform, monkeypatch):
    from app.services import provider_probes
    pid, _, _ = create(platform)
    cancelled = []
    async def slow(snapshot):
        try:
            await asyncio.sleep(60)
        finally:
            cancelled.append(True)
    monkeypatch.setattr(provider_probes, 'fetch_models', slow)
    monkeypatch.setattr(provider_probes, 'TOTAL_TIMEOUT', .01)
    response = probe(platform, pid)
    assert response.status_code == 200 and response.json()['code'] == 'upstream_timeout' and cancelled


def test_authorization_version_and_saved_config_are_required_before_network(world, platform, monkeypatch):
    pid, config, _ = create(platform)
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json={'data': []}))
    assert probe(platform, pid, 3).status_code == 409
    assert world['editor'].post('/api/providers/' + pid + '/probe', headers=headers(world['a']), json={'expected_version': 1, 'reason': 'no'}).status_code == 403
    assert platform['client'].post('/api/providers/' + pid + '/probe', json={'expected_version': 1, 'reason': 'no', 'api_key': KEY}).status_code == 422
    assert platform['client'].put('/api/providers/' + pid, json={'config': config, 'clear_secrets': ['api_key'], 'expected_version': 1, 'reason': 'clear'}).status_code == 200
    response = probe(platform, pid, 2)
    assert response.status_code == 400 and response.json()['detail']['code'] == 'provider_key_required'
    assert not calls


@pytest.mark.parametrize('change', ['config', 'revoke'])
def test_inflight_changes_do_not_block_and_old_probe_results_are_rejected(world, platform, monkeypatch, change):
    from fastapi.testclient import TestClient
    from app.services import members, provider_control
    pid, config, _ = create(platform)
    actor = world['operator']
    role = members.create_role(actor, '检测专员-' + pid, ['provider.configure'])
    person = world['people'][1]
    members.assign_roles(actor, person['id'], [role])
    def alter():
        if change == 'config':
            provider_control.save(actor, pid, {**config, 'name': 'changed while probing'}, 1, reason='concurrent edit')
        else:
            members.assign_roles(actor, person['id'], [])
    async def upstream(request):
        # The network phase must not retain the authorization transaction lock.
        await asyncio.wait_for(asyncio.to_thread(alter), timeout=3)
        return httpx.Response(200, json={'data': ['sensitive-model-result']})
    transport(monkeypatch, upstream)
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin':'http://localhost:8766'}) as client:
        assert client.post('/api/auth/login', json={'username': person['username'], 'password': PASSWORD}).status_code == 200
        response = client.post('/api/providers/' + pid + '/probe', json={'expected_version': 1, 'reason': 'concurrent change'})
    assert response.status_code == (409 if change == 'config' else 403), response.text
    assert 'sensitive-model-result' not in response.text
