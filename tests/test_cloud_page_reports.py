"""Page diagnostics across HTTP, authorization and real maintenance state."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def setup(world):
    result = world['editor'].post('/api/canvases', headers=headers(world['a']), json={'title': '页面报告验收'})
    assert result.status_code == 200
    canvas = result.json()['canvas']
    return canvas, '/api/canvases/' + canvas['id'] + '/page-state'


def payload(sequence=1, dirty=True, closed=False, page_id=None):
    return {'page_id': page_id or str(uuid.uuid4()), 'sequence': sequence, 'dirty': dirty, 'closed': closed}


def activity(world, space=None):
    from app.services.maintenance_control import snapshot
    return snapshot(world['operator'], (space or world['a'])['id'])['activity']


def test_page_reports_preserve_newest_state_and_closed_pages_are_terminal(world):
    from app.storage.database import connection
    canvas, path = setup(world)
    client, head = world['viewer'], headers(world['a'])
    body = payload()
    assert client.post(path, headers=head, json=body).json() == {'accepted': True}
    state = activity(world)
    assert state['unsaved_pages'] == state['page_reports']['online_pages'] == 1
    assert state['database_stop_ready'] is False
    assert state['page_reports']['coverage'] == 'reported_pages_only'
    with connection() as conn:
        seen = conn.execute('SELECT seen_at FROM canvas_page_reports WHERE canvas_id=%s', (canvas['id'],)).fetchone()['seen_at']
    assert client.post(path, headers=head, json=body).json() == {'accepted': False}
    with connection() as conn:
        assert conn.execute('SELECT seen_at FROM canvas_page_reports WHERE canvas_id=%s', (canvas['id'],)).fetchone()['seen_at'] == seen
    assert client.post(path, headers=head, json={**body, 'sequence': 3, 'dirty': False}).json()['accepted']
    assert not client.post(path, headers=head, json={**body, 'sequence': 2}).json()['accepted']
    assert activity(world)['unsaved_pages'] == 0
    assert client.post(path, headers=head, json={**body, 'sequence': 4, 'closed': True}).json()['accepted']
    assert not client.post(path, headers=head, json={**body, 'sequence': 5, 'dirty': False}).json()['accepted']
    pages = activity(world)['page_reports']
    assert pages['online_pages'] == 0 and pages['closed_unsaved_pages'] == 1
    # Telemetry from a read-only role neither creates a lease nor changes content.
    assert world['editor'].get('/api/canvases/' + canvas['id'], headers=head).json()['canvas']['revision'] == canvas['revision']
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_edit_leases WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 0


def test_page_reports_bind_space_member_and_login_without_identity_fields(world):
    from fastapi.testclient import TestClient
    from main import app
    canvas, path = setup(world)
    body = payload()
    head = headers(world['a'])
    assert world['viewer'].post(path, headers=head, json=body).status_code == 200
    assert world['editor'].post(path, headers=head, json=body).status_code == 200
    with TestClient(app) as another:
        assert another.post('/api/auth/login', json={'username': world['people'][0]['username'], 'password': PASSWORD}).status_code == 200
        assert another.post(path, headers=head, json=body).status_code == 200
    assert activity(world)['page_reports']['online_pages'] == 3
    assert activity(world, world['b'])['page_reports']['online_pages'] == 0
    assert world['outsider'].post(path, headers=headers(world['b']), json=body).status_code == 404
    assert world['outsider'].post(path, headers=head, json=body).status_code == 403
    for extra in ({'member_id': world['people'][2]['id']}, {'workspace_id': world['b']['id']}, {'document': {'text': 'not telemetry'}}):
        assert world['editor'].post(path, headers=head, json={**body, **extra}).status_code == 422
    for extra in ({'sequence': 0}, {'sequence': True}, {'sequence': 9007199254740992}, {'dirty': 'false'}, {'page_id': 'bad'}):
        assert world['editor'].post(path, headers=head, json={**body, **extra}).status_code == 422


def test_page_reports_continue_during_maintenance_and_stale_is_not_clean(world):
    from app.storage.database import connection
    canvas, path = setup(world)
    head, body = headers(world['a']), payload()
    for seq, mode in enumerate(('draining', 'read_only', 'offline', 'recovering'), 1):
        change(world['operator'], world['a']['id'], mode)
        result = world['editor'].post(path, headers=head, json={**body, 'sequence': seq})
        assert result.status_code == 200, result.text
    with connection() as conn:
        conn.execute("UPDATE canvas_page_reports SET seen_at=clock_timestamp()-interval '36 seconds' WHERE canvas_id=%s", (canvas['id'],))
    state = activity(world)
    assert state['page_reports']['stale_pages'] == state['page_reports']['stale_unsaved_pages'] == 1
    assert state['unsaved_pages'] == 0 and state['database_stop_ready'] is False
    assert 'stale_or_closed_unsaved_pages' in state['pending_checks']
    assert world['editor'].post(path, headers=head, json={**body, 'sequence': 5, 'dirty': False}).status_code == 200
    assert activity(world)['page_reports']['online_pages'] == 1
    assert activity(world)['page_reports']['stale_pages'] == 0


@pytest.mark.parametrize('revoke', ['session', 'membership', 'role'])
def test_revoked_page_becomes_stale_and_cannot_report_clean(world, revoke):
    from app.services import members
    from app.services.member_gateway import COOKIE
    _, path = setup(world)
    head, body = headers(world['a']), payload()
    assert world['editor'].post(path, headers=head, json=body).status_code == 200
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    if revoke == 'session':
        members.logout(actor)
    elif revoke == 'membership':
        members.remove_workspace_member(world['operator'], actor.member_id, world['a']['id'])
    else:
        role = members.create_role(world['operator'], '无画布读取权限', ['asset.read'], world['a']['id'])
        members.assign_roles(world['operator'], actor.member_id, [role], world['a']['id'])
    assert world['editor'].post(path, headers=head, json={**body, 'sequence': 2, 'dirty': False}).status_code in {401, 403}
    pages = activity(world)['page_reports']
    assert pages['online_pages'] == 0 and pages['stale_unsaved_pages'] == 1


def test_parallel_page_reports_keep_highest_sequence(world):
    from app.services import members, canvas_page_reports
    from app.services.member_gateway import COOKIE
    from app.storage.workspace import workspace_scope
    from app.storage.database import connection
    canvas, _ = setup(world)
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    page = uuid.uuid4()
    def send(sequence):
        with workspace_scope(world['a']['id']):
            return canvas_page_reports.report(actor, canvas['id'], page, sequence, sequence != 8)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(send, [6, 2, 8, 1, 7, 5, 4, 3]))
    with connection() as conn:
        row = conn.execute('SELECT sequence,dirty FROM canvas_page_reports WHERE canvas_id=%s', (canvas['id'],)).fetchone()
    assert row == {'sequence': 8, 'dirty': False}
