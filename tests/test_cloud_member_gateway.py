"""Member-mode admission against the real ASGI app and isolated PostgreSQL."""
import os
import uuid
import asyncio
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
PASSWORD = 'test-only-password-12345'


@pytest.fixture(scope='module')
def operator():
    from app.services import members
    from app.storage.database import connection
    with connection() as conn:
        row = conn.execute("SELECT m.username FROM members m JOIN platform_member_roles g ON g.member_id=m.id JOIN roles r ON r.id=g.role_id WHERE r.builtin_key='superadmin' AND m.status='active' LIMIT 1").fetchone()
    if not row:
        row = members.bootstrap('gateway-' + uuid.uuid4().hex, '管理员', PASSWORD)
    token = members.login(row['username'], PASSWORD, audience='management', source='gateway-operator')['token']
    return members.resolve_session(token, 'management')


@pytest.fixture
def world(operator, monkeypatch):
    from app.services import members
    from fastapi.testclient import TestClient
    from main import app
    monkeypatch.setenv('AUTH_MODE', 'members')
    people = []
    for _ in range(3):
        invited = members.create_member(operator, 'browser-' + uuid.uuid4().hex, '同名成员')
        people.append(members.activate(invited['activation_token'], PASSWORD))
    a = members.create_workspace(operator, '浏览器空间 A', operator.member_id)
    b = members.create_workspace(operator, '浏览器空间 B', operator.member_id)
    from app.services import provider_control
    if not any(p['id'] == 'comfly' for p in provider_control.catalog(operator)['providers']):
        provider_control.save(operator, 'comfly', {'name': '测试供应商', 'base_url': 'https://provider.test',
                              'image_models': ['test'], 'video_models': ['test']}, 0,
                              secrets={'api_key': 'test-only-provider-key'}, reason='隔离成员验收夹具')
    for space in (a, b):
        provider_control.assign(operator, space['id'], ['comfly'], 'comfly', 0, reason='隔离成员验收夹具')
    members.assign_roles(operator, people[0]['id'], [a['roles']['editor']], a['id'])
    members.assign_roles(operator, people[1]['id'], [a['roles']['viewer']], a['id'])
    members.assign_roles(operator, people[2]['id'], [b['roles']['editor']], b['id'])
    # Isolate login-rate budgets between scenarios; all three members within
    # one scenario still share the same source address, as behind a NAT.
    source = uuid.uuid4().bytes
    peer = (f'198.18.{source[0]}.{source[1]}', 50000)
    with TestClient(app, client=peer) as editor, TestClient(app, client=peer) as viewer, TestClient(app, client=peer) as outsider:
        for client, person in zip((editor, viewer, outsider), people):
            response = client.post('/api/auth/login', json={'username': person['username'], 'password': PASSWORD})
            assert response.status_code == 200, response.text
            assert 'HttpOnly' in response.headers['set-cookie']
        yield {'a': a, 'b': b, 'people': people, 'editor': editor, 'viewer': viewer, 'outsider': outsider, 'operator': operator}


def headers(space):
    return {'X-Workspace-ID': space['id']}


def test_page_member_binding_rejects_account_switch_for_reads_writes_logout_and_socket(world):
    from starlette.websockets import WebSocketDisconnect
    client, space = world['editor'], world['a']
    bound = {**headers(space), 'X-Member-ID': world['people'][0]['id']}
    assert client.get('/api/canvases', headers=bound).status_code == 200
    assert client.post('/api/auth/login', json={'username': world['people'][1]['username'], 'password': PASSWORD}).status_code == 200
    for method, path, payload in [('GET', '/api/canvases', None), ('POST', '/api/canvases', {'title': 'old page'}),
                                  ('POST', '/api/auth/logout', None), ('PATCH', '/api/auth/profile', {'display_name': 'wrong account'})]:
        result = client.request(method, path, headers=bound, json=payload)
        assert result.status_code == 409 and result.json()['detail']['code'] == 'member_identity_changed'
    assert client.get('/api/auth/status').json()['member']['id'] == world['people'][1]['id']
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/ws/stats?workspace=' + space['id'] + '&member=' + world['people'][0]['id']):
            pass


def test_member_pages_install_workspace_gate_before_other_scripts(world):
    for path in ('/', '/static/canvas.html', '/static/smart-canvas.html'):
        page = world['editor'].get(path)
        assert page.status_code == 200, page.text[:200]
        script = page.text.index('/static/js/member-session.js')
        assert script < page.text.index('/static/js/auth-session.js')
        assert 'defer' not in page.text[page.text.rfind('<script', 0, script):page.text.index('</script>', script)]
    login = world['editor'].get('/login')
    assert 'activation-token' in login.text and '/static/js/member-session.js' not in login.text


def test_member_mode_drops_shared_cookie_basic_and_public_setup(world):
    from fastapi.testclient import TestClient
    from main import app
    from app.services.member_gateway import COOKIE
    from app.services import members
    with TestClient(app) as client:
        assert client.get('/api/canvases', headers=headers(world['a']), auth=(os.environ['CLOUD_ACCESS_USER'], os.environ['CLOUD_ACCESS_PASSWORD'])).status_code == 401
        client.cookies.set('canvas_session', world['editor'].cookies.get(COOKIE))
        assert client.get('/api/canvases', headers=headers(world['a'])).status_code == 401
        assert client.post('/api/auth/login', json={'username': os.environ['CLOUD_ACCESS_USER'], 'password': os.environ['CLOUD_ACCESS_PASSWORD']}).status_code == 401
        management = members.login(world['people'][0]['username'], PASSWORD, audience='management')['token']
        client.cookies.set(COOKIE, management)
        assert client.get('/api/canvases', headers=headers(world['a'])).status_code == 401
    assert world['editor'].post('/api/auth/setup', json={'username': 'rogue', 'password': PASSWORD}).status_code == 403
    assert world['editor'].post('/api/auth/logout').status_code == 200
    assert world['editor'].get('/api/canvases', headers=headers(world['a'])).status_code == 401


def test_workspace_selector_and_viewer_write_permissions(world):
    editor, viewer, outsider = (world[k] for k in ('editor', 'viewer', 'outsider'))
    a, b = world['a'], world['b']
    assert [w['id'] for w in editor.get('/api/auth/workspaces').json()['workspaces']] == [a['id']]
    assert editor.get('/api/canvases').status_code == 400
    assert editor.get('/api/canvases?workspace=' + b['id'], headers=headers(a)).status_code == 400
    assert outsider.get('/api/canvases', headers=headers(a)).status_code == 403
    created = editor.post('/api/canvases', headers=headers(a), json={'title': 'A only', 'kind': 'classic'})
    assert created.status_code == 200, created.text
    canvas = created.json()['canvas']
    path = '/api/canvases/' + canvas['id']
    assert viewer.get(path, headers=headers(a)).status_code == 200
    assert viewer.put(path, headers=headers(a), json={'nodes': [], 'connections': [], 'base_revision': canvas['revision']}).status_code == 403
    assert outsider.get(path, headers=headers(b)).status_code == 404
    assert outsider.delete(path, headers=headers(b)).status_code == 404
    assert viewer.post('/api/canvases', headers=headers(a), json={'title': 'denied'}).status_code == 403


def test_conversation_identity_ignores_claimed_user_and_is_scoped(world):
    a = world['a']
    forged = {**headers(a), 'X-User-ID': world['people'][1]['id']}
    result = world['editor'].post('/api/conversations', headers=forged, json={'title': 'private A'})
    assert result.status_code == 200, result.text
    body = result.json()
    cid = body.get('id') or body.get('conversation', {}).get('id')
    assert cid, body
    path = '/api/conversations/' + cid
    assert world['editor'].get(path, headers=headers(a)).status_code == 200
    assert world['viewer'].get(path, headers={**headers(a), 'X-User-ID': world['people'][0]['id']}).status_code == 404
    assert world['outsider'].get(path, headers=headers(world['b'])).status_code == 404
    assert cid in str(world['editor'].get('/api/conversations', headers=headers(a)).json())
    assert cid not in str(world['viewer'].get('/api/conversations', headers=headers(a)).json())


def test_management_secrets_legacy_tools_and_unknown_routes_are_not_opened(world):
    editor = world['editor']
    for path in ('/api/config/token', '/api/shared-folders', '/api/comfyui/instances', '/api/workflows', '/api/unclassified-operation', '/static/runninghub/api_providers.json', '/static/api-settings.html'):
        assert editor.get(path, headers=headers(world['a'])).status_code == 403, path
    assert editor.post('/api/maintenance/start', headers=headers(world['a']), json={}).status_code == 403
    assert editor.get('/api/local-assets', headers=headers(world['a'])).status_code == 503
    assert editor.post('/api/local-assets/delete', headers=headers(world['a']), json={'names': ['original.png']}).status_code == 503
    result = editor.get('/api/config', headers=headers(world['a']))
    assert result.status_code == 200, result.text
    assert not {'base_url', 'comfy_instances', 'has_api_key'} & result.json().keys()
    assert 'api_key' not in result.text and 'key_env' not in result.text
    assert editor.post('/api/canvases', headers={**headers(world['a']), 'Origin': 'https://untrusted.invalid'}, json={}).status_code == 403


def test_space_revocation_invalidates_http_and_connected_socket(world):
    from app.services import members
    from starlette.websockets import WebSocketDisconnect
    editor = world['editor']
    a = world['a']
    with editor.websocket_connect('/ws/stats?workspace=' + a['id'], headers={'Origin': os.environ['PUBLIC_BASE_URL']}) as ws:
        first = ws.receive_json()
        assert first['workspace_id'] == a['id'] and first['member']['id'] == world['people'][0]['id']
        assert 'ip' not in first and 'client_id' not in first
        members.remove_workspace_member(world['operator'], world['people'][0]['id'], a['id'])
        ws.send_text('ping')
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    assert editor.get('/api/canvases', headers=headers(a)).status_code == 403
    assert editor.get('/api/auth/workspaces').json()['workspaces'] == []
    with pytest.raises(WebSocketDisconnect):
        with editor.websocket_connect('/ws/stats?workspace=' + world['b']['id']):
            pass


def test_transaction_rechecks_revocation_after_request_admission(world):
    from app.services import members
    from app.services.member_gateway import preflight
    from app.services.member_context import access_scope
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    from fastapi import HTTPException
    from app.services.member_gateway import COOKIE
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    wid = world['a']['id']
    preflight(actor, wid, ('canvas.edit',))
    members.remove_workspace_member(world['operator'], actor.member_id, wid)
    with workspace_scope(wid), access_scope(actor, wid, ('canvas.edit',)):
        with pytest.raises(HTTPException):
            documents.put('test-revocation', 'write', {'must_not': 'commit'})
    with workspace_scope(wid):
        assert documents.get('test-revocation', 'write') is None


def test_queued_task_captures_trusted_member_and_rechecks_before_paid_submit(world):
    from app.storage import tasks, worker, database
    from app.storage.workspace import workspace_scope
    from app.services import members
    from app.routers import providers
    client, a = world['editor'], world['a']
    response = client.post('/api/canvas-image-tasks', headers={**headers(a), 'X-User-ID': world['people'][2]['id']},
                           json={'prompt': 'test only', 'model': 'test', 'provider_id': 'comfly', 'n': 1})
    assert response.status_code == 200, response.text
    tid = response.json()['task_id']
    with workspace_scope(a['id']):
        assert tasks.get(tid)['requested_by'] == world['people'][0]['id']
    members.set_member_status(world['operator'], world['people'][0]['id'], 'disabled')
    with workspace_scope(a['id']):
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET available_at='1900-01-01' WHERE id=%s", (tid,))
        row = tasks.claim('gateway-test')
        assert row['id'] == tid
        with patch.object(providers, 'generate_ai_image', side_effect=AssertionError('must not submit paid generation')) as generate:
            asyncio.run(worker.execute(row))
            generate.assert_not_called()
        assert tasks.get(tid)['status'] == 'needs_review'


def test_activation_profile_and_internal_checkpoint_are_not_identity_or_media_shortcuts(world, tmp_path):
    from app.services import members
    from app.storage import media
    from app.storage.workspace import workspace_scope
    from fastapi.testclient import TestClient
    from main import app
    from fastapi import HTTPException
    import time
    created = members.create_member(world['operator'], 'activate-http-' + uuid.uuid4().hex, '待激活')
    with TestClient(app) as client:
        result = client.post('/api/auth/activate', json={'token': created['activation_token'], 'password': PASSWORD})
        assert result.status_code == 200, result.text
        assert client.post('/api/auth/activate', json={'token': created['activation_token'], 'password': PASSWORD}).status_code == 400
        assert client.post('/api/auth/login', json={'username': created['member']['username'], 'password': PASSWORD}).status_code == 200
        assert client.get('/api/auth/workspaces').json()['workspaces'] == []
        changed = client.patch('/api/auth/profile', json={'display_name': '新昵称', 'avatar': 'purple'})
        assert changed.json()['member']['id'] == created['member']['id']
        assert client.get('/api/auth/status').json()['member']['display_name'] == '新昵称'
    source = tmp_path / 'supplier-result.json'
    source.write_text('{"private_source":"internal-only"}', encoding='utf-8')
    a = world['a']
    with workspace_scope(a['id']):
        asset = media.publish(source, role='task-result-source')
        with pytest.raises(HTTPException):
            media.browser_url(asset)
        expires = int(time.time()) + 300
        signed = f"/api/media/{asset['id']}/signed?workspace={a['id']}&expires={expires}&signature={media.signature(asset['id'], asset['object_version_id'], expires)}"
    assert world['editor'].get(media.stable_url(asset), headers=headers(a)).status_code == 404
    assert world['editor'].get(signed).status_code == 404
    assert world['editor'].get('/api/media-preview', params={'url': media.stable_url(asset)}, headers=headers(a)).status_code == 404
