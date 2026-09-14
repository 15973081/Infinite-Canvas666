"""Read-only protocol suggestions never infer support from a generic error page."""
import asyncio
import os

import httpx
import pytest

from test_cloud_member_gateway import operator, world, PASSWORD
from test_cloud_management import platform
from test_cloud_managed_providers import create, KEY
from test_cloud_provider_probes import transport

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def diagnose(platform, pid, version=1):
    return platform['client'].post('/api/providers/' + pid + '/probe',
        json={'mode': 'protocols', 'expected_version': version, 'reason': '本地只读协议诊断'})


@pytest.mark.parametrize('suffix', ['', '/v1', '/v1beta', '/api/v3'])
def test_diagnostics_preserve_origin_and_proxy_prefix_and_never_post(platform, monkeypatch, suffix):
    from app.storage.database import connection
    pid, config, _ = create(platform)
    config['base_url'] = 'https://supplier.test/proxy' + suffix
    assert platform['client'].put('/api/providers/' + pid, json={'config': config, 'expected_version': 1, 'reason': '路径前缀'}).status_code == 200
    def upstream(request):
        if request.url.path == '/proxy/v1/models':
            return httpx.Response(200, json={'data': ['gpt-diagnostic']})
        return httpx.Response(404, text='<html>route not found</html>')
    calls, options = transport(monkeypatch, upstream)
    response = diagnose(platform, pid, 2)
    assert response.status_code == 200, response.text
    result = response.json()
    assert len(result['checks']) == 5
    assert result['suggestions'] == [{'protocol': 'openai', 'base_url':'https://supplier.test/proxy/v1', 'evidence':'openai_models'}]
    assert len(calls) == 5 and all(r.method == 'GET' and r.url.host == 'supplier.test' and r.url.path.startswith('/proxy/') and not r.url.query and not r.content for r in calls)
    assert sum('healthcheck_probe_do_not_submit_' in r.url.path for r in calls) == 2
    assert all(not opts['follow_redirects'] and not opts['trust_env'] for opts in options)
    assert KEY not in response.text and 'gpt-diagnostic' not in response.text
    with connection() as conn:
        assert conn.execute('SELECT version FROM managed_providers WHERE id=%s', (pid,)).fetchone()['version'] == 2
        audits = conn.execute("SELECT details FROM management_events WHERE target_id=%s AND action='provider.probe.finished'", (pid,)).fetchall()
        assert audits[0]['details']['mode'] == 'protocols' and len(audits[0]['details']['checks']) == 5
        assert KEY not in str(audits)


@pytest.mark.parametrize(('message','kind','expected'), [('Invalid task ID','invalid_request_error',True),
    ('无效的任务ID','invalid_request_error',True), ('Invalid task ID','generic_error',False), ('invalid API key','invalid_request_error',False)])
def test_apimart_requires_documented_validation_shape_and_remains_a_hint(platform, monkeypatch, message, kind, expected):
    pid, _, _ = create(platform)
    def upstream(request):
        if '/v1/tasks/' in request.url.path:
            return httpx.Response(400, json={'error': {'code':400, 'type':kind, 'message':message}})
        return httpx.Response(404, json={'error': {'code':'not_found','message':'generic route'}})
    transport(monkeypatch, upstream)
    response = diagnose(platform, pid)
    result = response.json()
    assert [s['protocol'] for s in result['suggestions']] == (['apimart'] if expected else [])
    check = next(c for c in result['checks'] if c['id'] == 'apimart_tasks')
    assert check['compatible'] is expected
    assert not next(c for c in result['checks'] if c['id'] == 'volcengine_tasks')['compatible']


@pytest.mark.parametrize(('status','body','code'), [(404, {'error': {'code':'not_found','message':'route ' + KEY}}, 'task_error_response'),
    (400, {'message':'missing'}, 'task_endpoint_inconclusive'), (200, {'id':'private-task','output':KEY}, 'unexpected_task_response'),
    (302, {'error':KEY}, 'upstream_redirect'), (401, {'error':KEY}, 'upstream_auth_rejected'),
    (500, {'error':KEY}, 'upstream_error')])
def test_generic_errors_successes_and_redirects_never_confirm_task_protocol(platform, monkeypatch, status, body, code):
    pid, _, _ = create(platform)
    transport(monkeypatch, lambda request: httpx.Response(status, json=body, headers={'Location':'https://other.test?key=' + KEY}))
    response = diagnose(platform, pid)
    result = response.json()
    assert response.status_code == 200 and not result['suggestions']
    assert all(c['code'] == code and not c['compatible'] for c in result['checks'] if c['id'].endswith('_tasks'))
    assert KEY not in response.text and 'private-task' not in response.text and 'other.test' not in response.text


def test_partial_timeout_keeps_completed_model_evidence(platform, monkeypatch):
    from app.services import provider_probes, provider_diagnostics
    pid, _, _ = create(platform)
    transport(monkeypatch, lambda request: httpx.Response(200, json={'data':['test-model']}))
    cancelled = []
    async def stall(*args):
        try:
            await asyncio.sleep(60)
        finally:
            cancelled.append(True)
    monkeypatch.setattr(provider_diagnostics, 'check_task', stall)
    monkeypatch.setattr(provider_probes, 'TOTAL_TIMEOUT', .5)
    response = diagnose(platform, pid)
    result = response.json()
    assert response.status_code == 200 and len(result['suggestions']) == 3 and len(result['checks']) == 5
    assert all(c['code'] == 'upstream_timeout' for c in result['checks'] if c['id'].endswith('_tasks'))
    assert len(cancelled) == 2


@pytest.mark.parametrize('change', ['config','revoke'])
def test_diagnostics_revalidate_after_network_without_blocking_changes(world, platform, monkeypatch, change):
    from fastapi.testclient import TestClient
    from app.services import members, provider_control
    pid, config, _ = create(platform)
    actor = world['operator']; person = world['people'][1]
    role = members.create_role(actor, '协议诊断-' + pid, ['provider.configure'])
    members.assign_roles(actor, person['id'], [role])
    def alter():
        if change == 'config':
            provider_control.save(actor, pid, {**config,'name':'changed'}, 1, reason='诊断期间修改')
        else:
            members.assign_roles(actor, person['id'], [])
    changed = False
    async def upstream(request):
        nonlocal changed
        if not changed:
            changed = True
            await asyncio.wait_for(asyncio.to_thread(alter), timeout=3)
        return httpx.Response(200, json={'data':['test-model']})
    transport(monkeypatch, upstream)
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin':'http://localhost:8766'}) as client:
        assert client.post('/api/auth/login', json={'username': person['username'],'password':PASSWORD}).status_code == 200
        response = client.post('/api/providers/' + pid + '/probe', json={'mode':'protocols','expected_version':1,'reason':'并发变更'})
    assert response.status_code == (409 if change == 'config' else 403), response.text
    assert 'suggestions' not in response.text


def test_unknown_probe_mode_and_stale_version_do_not_contact_upstream(platform, monkeypatch):
    pid, _, _ = create(platform)
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json={'data':[]}))
    assert diagnose(platform,pid,4).status_code == 409
    response = platform['client'].post('/api/providers/' + pid + '/probe', json={'mode':'paid-generation','expected_version':1,'reason':'invalid'})
    assert response.status_code == 422 and not calls


def test_fixed_volcengine_id_never_offers_a_protocol_the_registry_would_override(monkeypatch):
    from app.services.provider_diagnostics import diagnose as run_diagnostics
    transport(monkeypatch, lambda request: httpx.Response(200, json={'data':['test-model']}))
    result = asyncio.run(run_diagnostics({'id':'volcengine', 'key':KEY, 'config':{'base_url':'https://supplier.test/api/v3','protocol':'volcengine'}}))
    assert len(result['checks']) == 5
    assert [item['protocol'] for item in result['suggestions']] == ['volcengine']
