"""Real member gateway/conversation storage, with all upstream traffic mocked."""
import json
import os
import uuid

import httpx
import pytest
from test_cloud_member_gateway import operator, world, headers

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture
def chat_world(world, monkeypatch):
    from app.services import provider_control
    from app.routers import chat as routes
    provider_id = 'chat-' + uuid.uuid4().hex[:12]
    provider_control.save(world['operator'], provider_id, {
        'name': 'DeepSeek test', 'base_url': 'https://chat.invalid', 'enabled': True,
        'chat_models': ['deepseek-test', 'hidden-test', 'disabled-test'],
        'model_policies': {'chat:hidden-test': {'visible': False}, 'chat:disabled-test': {'enabled': False}},
    }, 0, secrets={'api_key': 'isolated-chat-key'}, reason='隔离聊天验收')
    assignments = provider_control.assignments(world['operator'], world['a']['id'])
    provider_control.assign(world['operator'], world['a']['id'], ['comfly', provider_id], provider_id,
                            assignments['version'], reason='隔离聊天验收')
    calls = []
    state = {'status': 200}

    def upstream(request):
        calls.append(request)
        assert request.url == 'https://chat.invalid/v1/chat/completions'
        assert request.headers['Authorization'] == 'Bearer isolated-chat-key'
        body = json.loads(request.content)
        assert body['model'] == 'deepseek-test'
        if state['status'] != 200:
            return httpx.Response(state['status'], json={'error': {'message': 'rate limit'}})
        if body.get('stream'):
            events = [{'choices': [{'delta': {'content': '模拟回复'}}]}, {'choices': [], 'usage': {'total_tokens': 7}}]
            return httpx.Response(200, text=''.join('data: ' + json.dumps(e) + '\n\n' for e in events) + 'data: [DONE]\n\n')
        return httpx.Response(200, json={'choices': [{'message': {'content': '模拟回复'}}], 'usage': {'total_tokens': 7}})

    client_class = httpx.AsyncClient
    monkeypatch.setattr(routes.httpx, 'AsyncClient', lambda **kw: client_class(**kw, transport=httpx.MockTransport(upstream)))
    return {**world, 'calls': calls, 'upstream': state, 'payload': {'provider': provider_id, 'model': 'deepseek-test', 'message': 'test'}}


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_member_chat_roundtrip_and_private_history(chat_world, path):
    w = chat_world
    response = w['editor'].post(path, headers={**headers(w['a']), 'X-User-ID': w['people'][1]['id']}, json=w['payload'])
    assert response.status_code == 200, response.text
    if path.endswith('/stream'):
        events = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
        assert [e['type'] for e in events] == ['meta', 'delta', 'done']
        result = events[-1]
    else:
        result = response.json()
    assert result['message']['content'] == '模拟回复'
    assert result['message']['raw_usage'] == {'total_tokens': 7}
    cid = result['conversation']['id']
    assert len(w['calls']) == 1
    assert w['editor'].get('/api/conversations/'+cid, headers=headers(w['a'])).status_code == 200
    assert w['viewer'].get('/api/conversations/'+cid, headers=headers(w['a'])).status_code == 404
    # Even an editor with an assigned provider cannot reuse someone else's conversation.
    own = w['viewer'].post('/api/conversations', headers=headers(w['a']), json={'title': 'private'}).json()
    other_id = own.get('id') or own['conversation']['id']
    assert w['editor'].post(path, headers=headers(w['a']), json={**w['payload'], 'conversation_id': other_id}).status_code == 404
    assert w['outsider'].get('/api/conversations/'+cid, headers=headers(w['b'])).status_code == 404
    assert len(w['calls']) == 1


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_member_chat_rejects_unauthorized_before_upstream_or_history(chat_world, path):
    w = chat_world
    before = w['editor'].get('/api/conversations', headers=headers(w['a'])).json()
    for who, space, payload, status in [
        ('viewer', w['a'], w['payload'], 403),
        ('outsider', w['a'], w['payload'], 403),
        ('outsider', w['b'], w['payload'], 403),
        ('editor', w['a'], {**w['payload'], 'provider': 'unassigned'}, 403),
        *[('editor', w['a'], {**w['payload'], 'model': m}, 403) for m in ['unknown', 'hidden-test', 'disabled-test']],
    ]:
        response = w[who].post(path, headers=headers(space), json=payload)
        assert response.status_code == status, response.text
    assert w['editor'].post(path, json=w['payload']).status_code == 400
    assert w['editor'].post(path, headers={**headers(w['a']), 'Origin': 'https://foreign.invalid'}, json=w['payload']).status_code == 403
    assert not w['calls']
    assert w['editor'].get('/api/conversations', headers=headers(w['a'])).json() == before
    w['editor'].post('/api/auth/logout')
    assert w['editor'].post(path, headers=headers(w['a']), json=w['payload']).status_code == 401


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_member_chat_maintenance_blocks_upstream(chat_world, path):
    from app.services import maintenance_control
    w = chat_world
    maintenance_control.change(w['operator'], w['a']['id'], 'draining', 0, reason='聊天维护测试')
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    assert response.status_code == 503, response.text
    assert response.json()['detail']['code'] == 'maintenance_restricted'
    assert not w['calls']


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_member_chat_upstream_failure_does_not_retry(chat_world, path):
    w = chat_world
    w['upstream']['status'] = 429
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    if path.endswith('/stream'):
        events = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
        assert [e['type'] for e in events] == ['meta', 'error']
        assert '限流' in events[-1]['detail']
    else:
        assert response.status_code == 429
        assert '限流' in response.json()['detail']
    assert len(w['calls']) == 1
