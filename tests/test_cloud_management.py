"""Independent management application, real PostgreSQL and HTTP contracts."""
import os
import subprocess
import sys
import uuid

import pytest

from test_cloud_member_gateway import operator, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture
def platform(operator, monkeypatch, tmp_path):
    from app.services import members
    from app.storage.database import connection
    from app.management.application import create_app
    from fastapi.testclient import TestClient
    from tools.build_management import build
    monkeypatch.setenv('MANAGEMENT_BASE_URL', 'http://localhost:8766')
    directory = build(tmp_path / 'management-dist')
    app = create_app(directory)
    with connection() as conn:
        username = conn.execute('SELECT username FROM members WHERE id=%s', (operator.member_id,)).fetchone()['username']
    # Independent scenarios must not share the source-IP login budget.
    address = uuid.uuid4().bytes
    peer = (f'198.19.{address[0]}.{address[1]}', 50000)
    with TestClient(app, base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}, client=peer) as client:
        result = client.post('/api/auth/login', json={'username': username, 'password': PASSWORD})
        assert result.status_code == 200, result.text
        yield {'client': client, 'app': app, 'operator': operator, 'username': username, 'directory': directory}


def invite(client, name='新成员'):
    response = client.post('/api/members', json={'username': 'm2-' + uuid.uuid4().hex, 'display_name': name})
    assert response.status_code == 201, response.text
    return response.json()


def test_explicit_management_origins_preserve_cross_site_rejection(platform, monkeypatch):
    client = platform['client']
    alternate = 'http://localhost:18779'
    assert client.post('/api/auth/logout', headers={'Origin': alternate}).status_code == 403
    monkeypatch.setenv('MANAGEMENT_ALLOWED_ORIGINS', ' , ' + alternate + ' , ')
    assert client.post('/api/auth/logout', headers={'Origin': alternate, 'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    assert client.post('/api/auth/logout', headers={'Origin': 'https://evil.test'}).status_code == 403
    assert client.post('/api/auth/logout', headers={'Origin': alternate}).status_code == 200


def test_member_search_status_and_cursor_are_applied_together(platform):
    from app.services import members
    c = platform['client']
    prefix = 'filter-' + uuid.uuid4().hex[:10]
    people = [invite(c, prefix + suffix) for suffix in ('Alpha', 'Beta', 'Gamma')]
    members.activate(people[0]['activation_token'], PASSWORD)
    members.activate(people[1]['activation_token'], PASSWORD)
    members.set_member_status(platform['operator'], people[1]['member']['id'], 'disabled')
    for status, person in zip(('active', 'disabled', 'invited'), people):
        response = c.get('/api/members', params={'search': prefix, 'status': status})
        assert response.status_code == 200
        assert [row['id'] for row in response.json()['members']] == [person['member']['id']]
    username = people[0]['member']['username']
    assert c.get('/api/members', params={'search': username.upper()}).json()['members'][0]['id'] == people[0]['member']['id']
    first = c.get('/api/members', params={'search': prefix, 'limit': 1}).json()
    second = c.get('/api/members', params={'search': prefix, 'limit': 1, 'after': first['next']}).json()
    assert first['members'][0]['id'] != second['members'][0]['id']
    assert c.get('/api/members', params={'status': 'invalid'}).status_code == 422
    assert not c.get('/api/members', params={'search': prefix + '%'}).json()['members']
    wid = space(c, platform['operator'].member_id)['id']
    assert not c.get('/api/members', params={'workspace': wid, 'search': prefix, 'status': 'invited'}).json()['members']


def space(client, administrator):
    response = client.post('/api/workspaces', json={'name': '管理验收空间', 'administrator_id': administrator})
    assert response.status_code == 201, response.text
    return response.json()


def test_separate_application_build_and_authentication_audience(platform):
    from fastapi.testclient import TestClient
    from app.services import members
    from app.management.application import COOKIE
    c = platform['client']
    assert c.get('/').status_code == 200
    assert c.get('/static/management.js').status_code == 200
    assert c.get('/static/runninghub/api_providers.json').status_code == 404
    for path in ('/api/canvases', '/api/auth/setup', '/docs', '/openapi.json'):
        assert c.get(path).status_code == 404
    headers = c.get('/api/me').headers
    assert headers['x-frame-options'] == 'DENY' and 'no-store' in headers['cache-control']
    cookie = c.cookies.get(COOKIE)
    assert members.resolve_session(cookie, 'management')
    assert members.resolve_session(cookie, 'workbench') is None
    workbench = members.login(platform['username'], PASSWORD)['token']
    with TestClient(platform['app'], base_url='http://localhost:8766') as stranger:
        stranger.cookies.set(COOKIE, workbench)
        assert stranger.get('/api/me').status_code == 401
        stranger.cookies.clear()
        assert stranger.get('/api/me', auth=(platform['username'], PASSWORD)).status_code == 401
    assert c.post('/api/members', headers={'Origin': 'http://localhost:8765'}, json={'username': 'bad', 'display_name': 'bad'}).status_code == 403
    assert c.post('/api/members', headers={'Origin': ''}, json={'username': 'bad', 'display_name': 'bad'}).status_code == 403
    result = subprocess.run([sys.executable, '-c', 'import sys;sys.path.insert(0,".");import management_main;assert "main" not in sys.modules;assert "app.storage.worker" not in sys.modules;print("independent")'], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == 'independent'


def test_member_space_role_lifecycle_and_stale_updates(platform):
    from app.services import members
    c = platform['client']
    person = invite(c)
    members.activate(person['activation_token'], PASSWORD)
    wid = space(c, platform['operator'].member_id)['id']
    query = '?workspace=' + wid
    made = c.post('/api/roles' + query, json={'name': '审核员', 'permissions': ['canvas.read', 'asset.read']})
    assert made.status_code == 201, made.text
    rid = made.json()['id']
    member = c.get('/api/member-lookup' + query, params={'username': person['member']['username'], 'workspace': wid}).json()
    assert member['role_ids'] == []
    path = '/api/members/' + member['id'] + '/roles' + query
    payload = {'role_ids': [rid], 'expected_version': member['auth_version']}
    assert c.put(path, json=payload).status_code == 200
    assert c.put(path, json=payload).status_code == 409
    assert c.patch('/api/roles/' + rid + query, json={'name': '素材审核', 'permissions': ['canvas.read'], 'expected_version': 1}).json()['version'] == 2
    assert c.patch('/api/roles/' + rid + query, json={'name': 'stale', 'permissions': [], 'expected_version': 1}).status_code == 409
    impact = c.get('/api/roles/' + rid + '/impact' + query).json()
    assert impact['member_ids'] == [member['id']]
    assert impact['members'][0]['display_name'] == '新成员'
    assert c.post('/api/roles/' + rid + '/retire' + query, json={'confirmation': 'stale', 'revoke': True}).status_code == 409
    assert c.post('/api/roles/' + rid + '/retire' + query, json={'confirmation': impact['confirmation'], 'revoke': True}).status_code == 200
    rows = c.get('/api/members' + query).json()['members']
    current = next(m for m in rows if m['id'] == member['id'])
    assert current['role_ids'] == []
    assert c.delete('/api/workspaces/' + wid + '/members/' + member['id'], params={'expected_version': current['auth_version']}).status_code == 200
    actions = {e['action'] for e in c.get('/api/audit' + query).json()['events']}
    assert {'space.create', 'role.create', 'role.assign', 'role.update', 'role.retire', 'space.member.remove'} <= actions


def test_space_administrator_cannot_browse_global_directory_or_other_space(platform):
    from app.services import members
    from fastapi.testclient import TestClient
    c = platform['client']
    person = invite(c, '空间管理员')
    members.activate(person['activation_token'], PASSWORD)
    a = space(c, person['member']['id'])
    b = space(c, platform['operator'].member_id)
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}) as scoped:
        assert scoped.post('/api/auth/login', json={'username': person['member']['username'], 'password': PASSWORD}).status_code == 200
        snapshot = scoped.get('/api/me').json()
        assert snapshot['permissions'] == []
        assert [s['id'] for s in snapshot['workspaces']] == [a['id']]
        for path in ('/api/members', '/api/roles', '/api/audit'):
            assert scoped.get(path).status_code == 403
            assert scoped.get(path, params={'workspace': b['id']}).status_code == 403
            assert scoped.get(path, params={'workspace': a['id']}).status_code == 200
        assert scoped.post('/api/roles', json={'name': '非法平台角色', 'permissions': ['member.manage']}).status_code == 403
        assert scoped.post('/api/roles', params={'workspace': a['id']}, json={'name': '错层级', 'permissions': ['member.manage']}).status_code == 400
        assert scoped.patch('/api/workspaces/' + b['id'], json={'archived': True}).status_code == 403
        events = scoped.get('/api/audit', params={'workspace': a['id'], 'limit': 1}).json()
        assert all(e['workspace_id'] == a['id'] for e in events['events'])
        # Removing the sole space administrator is refused; grant another first.
        members.assign_roles(platform['operator'], platform['operator'].member_id, [a['roles']['admin']], a['id'])
        members.remove_workspace_member(platform['operator'], person['member']['id'], a['id'])
        assert scoped.get('/api/me').status_code == 403
        assert scoped.post('/api/auth/logout').status_code == 200


def test_editor_management_login_is_refused_and_session_revocation_effective(platform):
    from app.services import members
    from fastapi.testclient import TestClient
    c = platform['client']
    person = invite(c)
    members.activate(person['activation_token'], PASSWORD)
    a = space(c, platform['operator'].member_id)
    members.assign_roles(platform['operator'], person['member']['id'], [a['roles']['editor']], a['id'])
    login = {'username': person['member']['username'], 'password': PASSWORD}
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}) as editor:
        assert editor.post('/api/auth/login', json=login).status_code == 403
        assert editor.get('/api/me').status_code == 401
        members.assign_roles(platform['operator'], person['member']['id'], [a['roles']['admin']], a['id'])
        assert editor.post('/api/auth/login', json=login).status_code == 200
        workbench = members.login(person['member']['username'], PASSWORD)['token']
        assert c.post('/api/members/' + person['member']['id'] + '/revoke-sessions').status_code == 200
        assert editor.get('/api/me').status_code == 401
        assert members.resolve_session(workbench) is None


def test_role_delegation_last_administrator_and_dependency_failure(platform, monkeypatch):
    from app.services import members
    from fastapi.testclient import TestClient
    from app.management import queries
    from psycopg import OperationalError
    c = platform['client']
    person = invite(c)
    members.activate(person['activation_token'], PASSWORD)
    a = space(c, platform['operator'].member_id)
    custom = members.create_role(platform['operator'], '仅角色维护', ['space.roles.manage'], a['id'])
    members.assign_roles(platform['operator'], person['member']['id'], [custom], a['id'])
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}) as delegate:
        assert delegate.post('/api/auth/login', json={'username': person['member']['username'], 'password': PASSWORD}).status_code == 200
        catalog = delegate.get('/api/roles', params={'workspace': a['id']}).json()['catalog']
        assert [p['id'] for p in catalog if p['delegatable']] == ['space.roles.manage']
        assert delegate.post('/api/roles', params={'workspace': a['id']}, json={'name': '越权', 'permissions': ['generation.submit']}).status_code == 403
    admin = c.get('/api/member-lookup', params={'workspace': a['id'], 'username': platform['username']}).json()
    assert c.put('/api/members/' + admin['id'] + '/roles', params={'workspace': a['id']}, json={'role_ids': [], 'expected_version': admin['auth_version']}).status_code == 409
    def unavailable(*args):
        raise OperationalError('private database connection information')
    monkeypatch.setattr(queries, 'snapshot', unavailable)
    response = c.get('/api/me')
    assert response.status_code == 503
    assert 'private database' not in response.text
