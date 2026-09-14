"""Page diagnostics across HTTP, authorization and real maintenance state."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_maintenance_control import change, reset_maintenance
from test_cloud_management import platform

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
    assert client.post(path, headers=head, json=body).json()['accepted'] is True
    state = activity(world)
    assert state['unsaved_pages'] == state['page_reports']['online_pages'] == 1
    assert state['database_stop_ready'] is False
    assert state['page_reports']['coverage'] == 'reported_pages_only'
    with connection() as conn:
        seen = conn.execute('SELECT seen_at FROM canvas_page_reports WHERE canvas_id=%s', (canvas['id'],)).fetchone()['seen_at']
    assert client.post(path, headers=head, json=body).json()['accepted'] is False
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



def reported(world, *, closed=True, dirty=True):
    from app.storage.database import connection
    canvas, path = setup(world)
    body = payload(closed=closed, dirty=dirty)
    assert world['editor'].post(path, headers=headers(world['a']), json=body).status_code == 200
    with connection() as conn:
        row = conn.execute('SELECT * FROM canvas_page_reports WHERE canvas_id=%s', (canvas['id'],)).fetchone()
    return row, path, body


def review_body(sequence=1):
    return {'expected_sequence': sequence, 'outcome': 'draft_exported', 'note': '已与成员核实，草稿已导出并保留。'}


def test_management_reviews_are_audited_without_changing_report_or_canvas(world, platform):
    from app.storage.database import connection
    row, _, _ = reported(world)
    c, scope = platform['client'], {'workspace': world['a']['id']}
    endpoint = '/api/maintenance/page-reports'
    before = c.get(endpoint, params=scope).json()
    assert len(before['reports']) == 1 and before['reports'][0]['id'] == str(row['id'])
    assert not {'login_session_id', 'page_id', 'member_auth_version', 'document', 'token'} & before['reports'][0].keys()
    result = c.post(endpoint + '/' + str(row['id']) + '/review', params=scope, json=review_body())
    assert result.status_code == 200, result.text
    assert c.get(endpoint, params=scope).json()['reports'] == []
    reviewed = c.get(endpoint, params={**scope, 'reviewed': True}).json()['reports']
    assert len(reviewed) == 1 and reviewed[0]['review_note'] == review_body()['note']
    state = activity(world)
    assert state['page_reports']['pending_review_pages'] == 0 and state['page_reports']['reviewed_pages'] == 1
    assert state['page_reports']['closed_unsaved_pages'] == 1
    assert state['database_stop_ready'] is False and 'unreported_pages' in state['pending_checks']
    assert 'stale_or_closed_unsaved_pages' not in state['pending_checks']
    with connection() as conn:
        after = conn.execute('SELECT * FROM canvas_page_reports WHERE id=%s', (row['id'],)).fetchone()
        assert all(after[key] == row[key] for key in ('sequence', 'dirty', 'closed', 'seen_at', 'member_auth_version'))
        assert conn.execute('SELECT revision FROM canvases WHERE id=%s', (row['canvas_id'],)).fetchone()['revision'] == 1
        assert conn.execute('SELECT count(*) AS n FROM canvas_edit_leases WHERE canvas_id=%s', (row['canvas_id'],)).fetchone()['n'] == 0
    events = c.get('/api/audit', params=scope).json()['events']
    event = next(e for e in events if e['action'] == 'maintenance.page.review')
    assert event['target_id'] == str(row['id']) and event['details']['sequence'] == 1
    assert event['details']['dirty'] is True and event['details']['note'] == review_body()['note']


def test_review_lists_page_within_scope_without_duplicate_rows(world, platform):
    rows = [reported(world)[0] for _ in range(3)]
    c, endpoint = platform['client'], '/api/maintenance/page-reports'
    scope = {'workspace': world['a']['id'], 'limit': 2}
    first = c.get(endpoint, params=scope).json()
    second = c.get(endpoint, params={**scope, 'after': first['next']}).json()
    assert len(first['reports']) == 2 and len(second['reports']) == 1 and second['next'] is None
    assert {r['id'] for r in first['reports'] + second['reports']} == {str(r['id']) for r in rows}
    assert c.get(endpoint, params={'workspace': world['b']['id'], 'after': first['next']}).json()['reports'] == []
    for params in ({'limit': 0}, {'limit': 101}, {'after': 'bad'}, {'reviewed': 'bad'}):
        assert c.get(endpoint, params=params).status_code == 422


def test_review_rejects_live_clean_closed_and_outdated_reports(world, platform):
    from app.storage.database import connection
    row, path, body = reported(world, closed=False)
    c, scope = platform['client'], {'workspace': world['a']['id']}
    endpoint = '/api/maintenance/page-reports/' + str(row['id']) + '/review'
    assert c.post(endpoint, params=scope, json=review_body()).json()['detail']['code'] == 'page_report_not_reviewable'
    with connection() as conn:
        conn.execute("UPDATE canvas_page_reports SET seen_at=clock_timestamp()-interval '36 seconds' WHERE id=%s", (row['id'],))
    assert c.post(endpoint, params=scope, json=review_body()).status_code == 200
    assert c.post(endpoint, params=scope, json=review_body()).json()['detail']['code'] == 'page_report_changed'
    assert world['editor'].post(path, headers=headers(world['a']), json={**body, 'sequence': 2}).status_code == 200
    assert c.post(endpoint, params=scope, json=review_body()).status_code == 409
    assert activity(world)['page_reports']['reviewed_pages'] == 0
    with connection() as conn:
        conn.execute("UPDATE canvas_page_reports SET seen_at=clock_timestamp()-interval '36 seconds' WHERE id=%s", (row['id'],))
    assert activity(world)['page_reports']['pending_review_pages'] == 1
    again = c.get('/api/maintenance/page-reports', params=scope).json()['reports'][0]
    assert again['sequence'] == 2 and again['reviewed_sequence'] == 1
    assert c.post(endpoint, params=scope, json=review_body(2)).status_code == 200
    clean, _, _ = reported(world, closed=True, dirty=False)
    assert c.post('/api/maintenance/page-reports/' + str(clean['id']) + '/review', params=scope, json=review_body()).status_code == 409


def test_review_scope_audience_origin_and_payload_boundaries(world, platform):
    from fastapi.testclient import TestClient
    from fastapi import HTTPException
    from app.services import members, canvas_page_reports
    from app.services.member_gateway import COOKIE
    row, _, _ = reported(world)
    endpoint = '/api/maintenance/page-reports'
    review_path = endpoint + '/' + str(row['id']) + '/review'
    role = members.create_role(world['operator'], '维护核对员', ['maintenance.space'], world['a']['id'])
    members.assign_roles(world['operator'], world['people'][1]['id'], [role], world['a']['id'])
    with TestClient(platform['app'], base_url='http://localhost:8766', headers={'Origin': 'http://localhost:8766'}) as manager:
        assert manager.post('/api/auth/login', json={'username': world['people'][1]['username'], 'password': PASSWORD}).status_code == 200
        for params in ({}, {'workspace': world['b']['id']}):
            assert manager.get(endpoint, params=params).status_code == 403
            assert manager.post(review_path, params=params, json=review_body()).status_code == 403
        assert manager.get(endpoint, params={'workspace': world['a']['id']}).status_code == 200
        assert manager.post(review_path, params={'workspace': world['a']['id']}, json=review_body(), headers={'Origin': 'https://wrong.test'}).status_code == 403
        assert manager.post(review_path, params={'workspace': world['a']['id']}, json=review_body()).status_code == 200
        members.remove_workspace_member(world['operator'], world['people'][1]['id'], world['a']['id'])
        assert manager.get(endpoint, params={'workspace': world['a']['id']}).status_code == 403
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    with pytest.raises(HTTPException) as failure:
        canvas_page_reports.review_list(actor, world['a']['id'])
    assert failure.value.detail['code'] == 'management_session_required'
    c = platform['client']
    assert c.post(review_path, params={'workspace': world['b']['id']}, json=review_body()).status_code == 404
    for change in ({'expected_sequence': True}, {'expected_sequence': 0}, {'outcome': 'saved'}, {'note': ''}, {'note': 'x' * 1001}, {'dirty': False}):
        assert c.post(review_path, json={**review_body(), **change}).status_code == 422
    assert c.post(review_path, json={**review_body(), 'note': '   '}).status_code == 400


def test_review_and_audit_rollback_together(world, monkeypatch):
    from app.services import authorization as az, canvas_page_reports
    from app.storage.database import connection
    row, _, _ = reported(world)
    def unavailable(*args, **kwargs):
        raise RuntimeError('audit unavailable')
    with monkeypatch.context() as patcher:
        patcher.setattr(az, 'audit', unavailable)
        with pytest.raises(RuntimeError, match='audit unavailable'):
            canvas_page_reports.review(world['operator'], row['id'], 1, 'draft_exported', '已核对', world['a']['id'])
    with connection() as conn:
        assert conn.execute('SELECT reviewed_sequence FROM canvas_page_reports WHERE id=%s', (row['id'],)).fetchone()['reviewed_sequence'] is None
    assert activity(world)['page_reports']['pending_review_pages'] == 1


def test_parallel_reviews_record_exactly_one_audit(world):
    from fastapi import HTTPException
    from app.services import canvas_page_reports
    from app.storage.database import connection
    row, _, _ = reported(world)
    def resolve(_):
        try:
            canvas_page_reports.review(world['operator'], row['id'], 1, 'draft_exported', '已核对', world['a']['id'])
            return 200
        except HTTPException as failure:
            return failure.status_code
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sorted(pool.map(resolve, range(4))) == [200, 409, 409, 409]
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE target_id=%s AND action='maintenance.page.review'", (str(row['id']),)).fetchone()['n'] == 1


def test_new_report_racing_review_is_never_covered_by_old_acknowledgement(world):
    from fastapi import HTTPException
    from app.services import members, canvas_page_reports
    from app.services.member_gateway import COOKIE
    from app.storage.workspace import workspace_scope
    from app.storage.database import connection
    row, _, body = reported(world, closed=False)
    actor = members.resolve_session(world['editor'].cookies.get(COOKIE))
    with connection() as conn:
        conn.execute("UPDATE canvas_page_reports SET seen_at=clock_timestamp()-interval '36 seconds' WHERE id=%s", (row['id'],))
    def review():
        try:
            canvas_page_reports.review(world['operator'], row['id'], 1, 'draft_exported', '已核对', world['a']['id'])
            return 200
        except HTTPException as failure:
            return failure.status_code
    def report():
        with workspace_scope(world['a']['id']):
            return canvas_page_reports.report(actor, row['canvas_id'], uuid.UUID(body['page_id']), 2, True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        reviewing, reporting = pool.submit(review), pool.submit(report)
        assert reviewing.result() in {200, 409}
        assert reporting.result()['accepted']
    with connection() as conn:
        latest = conn.execute('SELECT sequence,reviewed_sequence FROM canvas_page_reports WHERE id=%s', (row['id'],)).fetchone()
        assert latest['sequence'] == 2 and latest['reviewed_sequence'] in {None, 1}
        conn.execute("UPDATE canvas_page_reports SET seen_at=clock_timestamp()-interval '36 seconds' WHERE id=%s", (row['id'],))
    assert activity(world)['page_reports']['pending_review_pages'] == 1
    assert activity(world)['page_reports']['reviewed_pages'] == 0
