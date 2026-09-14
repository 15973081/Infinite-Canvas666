"""Independent overview with real permissions, multiple spaces and stored resources."""
import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from test_cloud_management import platform, invite, space
from test_cloud_member_gateway import operator, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def seed(platform, tmp_path):
    from app.services import members
    from app.storage import canvases, database, media, tasks
    from app.storage.workspace import workspace_scope
    c = platform['client']
    person = invite(c, '空间概览管理员')
    members.activate(person['activation_token'], PASSWORD)
    a = space(c, person['member']['id'])
    b = space(c, platform['operator'].member_id)
    source = tmp_path / 'secret-resource-name.bin'
    source.write_bytes(b'original-bytes')
    with workspace_scope(a['id']):
        for kind in ('classic', 'smart'):
            canvases.save({'id': uuid.uuid4().hex, 'title': 'private-canvas-body', 'kind': kind, 'nodes': [], 'connections': []})
        recycled = {'id': uuid.uuid4().hex, 'title': 'private-trash-body', 'kind': 'classic', 'nodes': [], 'connections': []}
        canvases.save(recycled)
        original = media.publish(source)
        media.publish(source, parent_asset_id=original['id'], role='preview')
        media.publish(source, role='task-result-source')
        for status in ('queued', 'polling', 'needs_review', 'succeeded'):
            tasks.save({'id': 'canvas_vid_' + uuid.uuid4().hex, 'type': 'video', 'status': status}, {'prompt': 'private-task-prompt'})
    with workspace_scope(b['id']):
        canvases.save({'id': uuid.uuid4().hex, 'title': 'other-space-canvas', 'kind': 'smart', 'nodes': [], 'connections': []})
        media.publish(source)
    with database.connection() as conn:
        conn.execute('UPDATE canvases SET deleted_at=clock_timestamp() WHERE id=%s', (recycled['id'],))
        conn.execute("INSERT INTO backup_jobs(id,workspace_id,member_id,session_id,kind,status,reason,summary) VALUES(%s,%s,%s,%s,'workspace_export','failed','private-backup-reason',%s)",
                     (uuid.uuid4(), a['id'], platform['operator'].member_id, platform['operator'].session_id, json.dumps({'path': 'private-backup-path'})))
    return a, b, person, len(source.read_bytes())


def scoped_client(platform, person):
    client = TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'})
    response = client.post('/api/auth/login', json={'username': person['member']['username'], 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return client


def test_overview_counts_only_target_space_and_never_returns_resource_bodies(platform, tmp_path):
    from app.storage import database
    a, b, person, size = seed(platform, tmp_path)
    with scoped_client(platform, person) as client:
        response = client.get('/api/overview', params={'workspace': a['id']})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['workspace']['id'] == a['id']
        assert result['members']['total'] == result['members']['active'] == 1
        assert result['canvases'] == {'total': 2, 'classic': 1, 'smart': 1, 'recycled': 1}
        assert result['assets'] == {'originals': 1, 'previews': 1, 'ready_bytes': str(size * 2)}
        assert result['tasks']['total'] == 4 and result['tasks']['queued'] == result['tasks']['active'] == result['tasks']['needs_review'] == 1
        assert result['backup']['total'] == 1 and result['backup']['latest']['status'] == 'failed'
        assert result['maintenance']['mode'] == 'normal'
        assert 'no-store' in response.headers['cache-control']
        for forbidden in ('private-', 'secret-resource-name', 'object_key', 'object_version', 'session_id', 'other-space-canvas'):
            assert forbidden not in response.text
        assert client.get('/api/overview').status_code == 403
        assert client.get('/api/overview', params={'workspace': b['id']}).status_code == 403
        assert client.get('/api/overview', params={'workspace': 'guessed-space'}).status_code == 403
        with database.connection() as conn:
            before = conn.execute('SELECT count(*) AS n FROM management_events').fetchone()['n']
        client.get('/api/overview', params={'workspace': a['id']}).raise_for_status()
        with database.connection() as conn:
            assert conn.execute('SELECT count(*) AS n FROM management_events').fetchone()['n'] == before


def test_overview_permissions_are_independent_and_revocation_is_immediate(platform, tmp_path):
    from app.services import members
    a, b, person, _ = seed(platform, tmp_path)
    admin = platform['operator']
    members.assign_roles(admin, admin.member_id, [a['roles']['admin']], a['id'])
    limited = members.create_role(admin, '只管理成员及查看素材', ['space.members.manage', 'asset.read'], a['id'])
    members.assign_roles(admin, person['member']['id'], [limited], a['id'])
    with scoped_client(platform, person) as client:
        result = client.get('/api/overview', params={'workspace': a['id']}).json()
        assert result['members']['total'] == 2 and result['assets']['originals'] == 1
        for name in ('canvases', 'tasks', 'maintenance', 'services', 'backup'):
            assert result[name] is None
        members.remove_workspace_member(admin, person['member']['id'], a['id'])
        assert client.get('/api/overview', params={'workspace': a['id']}).status_code == 403


def test_platform_management_does_not_grant_resource_reads(platform, tmp_path):
    a, b, person, _ = seed(platform, tmp_path)
    c = platform['client']
    result = c.get('/api/overview', params={'workspace': a['id']}).json()
    assert result['members']['total'] == 1
    assert result['canvases'] is result['assets'] is result['tasks'] is None
    assert result['backup']['total'] == 1
    assert result['maintenance']['mode'] == 'normal'
    platform_view = c.get('/api/overview').json()
    assert platform_view['workspace'] is None and platform_view['members']['total'] >= 2
    assert platform_view['canvases'] is platform_view['assets'] is platform_view['tasks'] is None
    assert platform_view['backup']['latest'] is None or platform_view['backup']['latest']['kind'] == 'platform_backup'
    assert c.get('/api/overview', params={'workspace': ''}).status_code == 422
    assert c.get('/api/overview', params={'workspace': '../default'}).status_code == 422


def test_overview_zero_archival_and_service_freshness(platform):
    from app.storage import database
    from app.services import members
    c = platform['client']
    a = space(c, platform['operator'].member_id)
    with database.connection() as conn:
        before = dict(conn.execute("SELECT count(*) FILTER(WHERE stopped_at IS NULL AND seen_at>statement_timestamp()-interval '35 seconds') AS online,count(*) FILTER(WHERE stopped_at IS NULL AND seen_at<=statement_timestamp()-interval '35 seconds') AS unknown,count(*) FILTER(WHERE stopped_at IS NOT NULL) AS stopped FROM service_heartbeats WHERE kind='worker'").fetchone())
        for status in ('online', 'unknown', 'stopped'):
            conn.execute("INSERT INTO service_heartbeats(instance_id,kind,seen_at,stopped_at) VALUES(%s,'worker',clock_timestamp() - %s * interval '1 second',CASE WHEN %s THEN clock_timestamp() ELSE NULL END)",
                         ('overview-' + uuid.uuid4().hex, 120 if status == 'unknown' else 0, status == 'stopped'))
    result = c.get('/api/overview', params={'workspace': a['id']}).json()
    assert result['canvases']['total'] == 0 and result['assets']['ready_bytes'] == '0'
    assert result['tasks']['total'] == 0 and result['backup']['latest'] is None
    worker = next(row for row in result['services'] if row['kind'] == 'worker')
    for key in ('online', 'unknown', 'stopped'):
        assert worker[key] == before[key] + 1
    # Platform restriction is effective even when this space is normal.
    with database.connection() as conn:
        old = conn.execute("SELECT * FROM maintenance_controls WHERE scope_key='platform'").fetchone()
        conn.execute("UPDATE maintenance_controls SET mode='offline',message='平台停机',reason='private-maintenance-reason' WHERE scope_key='platform'")
    try:
        response = c.get('/api/overview', params={'workspace': a['id']})
        assert response.json()['maintenance']['mode'] == 'offline'
        assert 'private-maintenance-reason' not in response.text
    finally:
        with database.connection() as conn:
            conn.execute("UPDATE maintenance_controls SET mode=%s,message=%s,reason=%s WHERE scope_key='platform'", (old['mode'], old['message'], old['reason']))
    members.archive_workspace(platform['operator'], a['id'], archived=True)
    result = c.get('/api/overview', params={'workspace': a['id']}).json()
    assert result['workspace']['status'] == 'archived'
    assert all(result[key] is None for key in ('members', 'canvases', 'assets', 'tasks', 'maintenance', 'services', 'backup'))


def test_overview_authentication_and_dependency_failure(platform, monkeypatch):
    from app.management import resources
    from psycopg import OperationalError
    from app.services import members
    from app.management.application import COOKIE
    c = platform['client']
    with TestClient(platform['app'], base_url='http://localhost:8766') as anonymous:
        assert anonymous.get('/api/overview').status_code == 401
        anonymous.cookies.set(COOKIE, members.login(platform['username'], PASSWORD)['token'])
        assert anonymous.get('/api/overview').status_code == 401
    def unavailable(*args, **kwargs):
        raise OperationalError('private-database-password')
    monkeypatch.setattr(resources, 'overview', unavailable)
    response = c.get('/api/overview')
    assert response.status_code == 503 and 'private-database-password' not in response.text
