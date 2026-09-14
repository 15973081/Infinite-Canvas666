"""Real PostgreSQL release observations must not mistake zero counts for stop approval."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, headers, PASSWORD
from test_cloud_management import platform
from test_cloud_maintenance_control import reset_maintenance, change, task

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def activity(world, workspace=None):
    from app.services import maintenance_control
    return maintenance_control.snapshot(world['operator'], workspace or world['a']['id'])['activity']


def checks(value):
    return {r['code']: r for r in value['release_checks']['checks']}


def test_empty_space_needs_restriction_and_never_approves_platform_stop(world):
    from app.services import maintenance_control as control
    from app.storage.database import connection
    wid = world['a']['id']
    assert checks(activity(world))['new_business_admission']['status'] == 'blocked'
    change(world['operator'], wid, 'scheduled', planned_at=datetime.now(timezone.utc)+timedelta(minutes=10))
    assert checks(activity(world))['new_business_admission']['status'] == 'blocked'
    with connection() as c:
        c.execute("UPDATE maintenance_controls SET planned_at=clock_timestamp()-interval '1 second' WHERE workspace_id=%s", (wid,))
        before = c.execute('SELECT * FROM maintenance_controls WHERE workspace_id=%s', (wid,)).fetchone()
    value = activity(world)['release_checks']
    assert value['observed_checks_passed'] is True
    assert value['database_stop_ready'] is False
    assert value['database_stop'] == {'status':'not_applicable','reason':'workspace_cannot_authorize_database_stop'}
    assert {'unreported_pages','backup_integrity_and_restore','release_compatibility'} <= set(value['operator_checks'])
    with connection() as c:
        assert c.execute('SELECT * FROM maintenance_controls WHERE workspace_id=%s', (wid,)).fetchone() == before
    # A stricter platform restriction is honored even when this space is normal.
    change(world['operator'], None, 'draining')
    assert checks(activity(world, world['b']['id']))['new_business_admission']['status'] == 'passed'


def test_terminal_task_leases_and_unfinished_submission_still_block(world):
    from app.storage.database import connection
    wid, tid = world['a']['id'], task(world)
    change(world['operator'], wid, 'draining')
    assert checks(activity(world))['queued_task_recovery']['status'] == 'review_required'
    with connection() as c:
        c.execute("UPDATE tasks SET status='succeeded',lease_owner='test',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 hour' WHERE id=%s", (tid,))
    value = activity(world)
    assert value['active_tasks'] == 0
    assert checks(value)['task_execution_leases']['count'] == 1
    with connection() as c:
        c.execute("UPDATE tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE id=%s", (tid,))
    assert checks(activity(world))['expired_task_leases']['count'] == 1
    sid = uuid.uuid4()
    with connection() as c:
        c.execute('UPDATE tasks SET lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s', (tid,))
        c.execute('INSERT INTO task_submissions(id,task_id,workspace_id) VALUES(%s,%s,%s)', (sid,tid,wid))
    assert checks(activity(world))['unfinished_submissions']['count'] == 1
    assert checks(activity(world,world['b']['id']))['unfinished_submissions']['count'] == 0
    with connection() as c:
        c.execute("UPDATE task_submissions SET outcome='responded',finished_at=clock_timestamp() WHERE id=%s", (sid,))
        c.execute("UPDATE tasks SET status='needs_review' WHERE id=%s", (tid,))
    assert checks(activity(world))['tasks_needing_review']['count'] == 1
    with connection() as c:
        c.execute("UPDATE tasks SET status='failed' WHERE id=%s", (tid,))
    assert activity(world)['release_checks']['observed_checks_passed'] is True


def test_expired_upload_and_processing_are_not_lost_from_drain_report(world):
    from app.storage.database import connection
    response=world['editor'].post('/api/media/uploads',headers=headers(world['a']),json={
        'name':'drain.txt','size':1,'idempotency_key':uuid.uuid4().hex})
    assert response.status_code == 200,response.text
    aid=response.json()['media_asset_id']
    change(world['operator'],world['a']['id'],'draining')
    assert checks(activity(world))['pending_uploads']['count'] == 1
    with connection() as c:
        c.execute("UPDATE media_uploads SET status='verifying',expires_at=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 hour' WHERE asset_id=%s",(aid,))
    value=activity(world)
    assert value['uploads']['pending']==0
    assert checks(value)['expired_unfinished_uploads']['count']==1
    assert checks(value)['upload_processing']['count']==1
    assert checks(activity(world,world['b']['id']))['expired_unfinished_uploads']['count']==0
    # Simulate completed cancellation/recovery; reading itself must never abort.
    with connection() as c:
        assert c.execute('SELECT status FROM media_uploads WHERE asset_id=%s',(aid,)).fetchone()['status']=='verifying'
        c.execute("UPDATE media_uploads SET status='aborted',lease_token=NULL,lease_until=NULL WHERE asset_id=%s",(aid,))
    assert activity(world)['release_checks']['observed_checks_passed'] is True


def test_backup_queue_and_execution_are_scoped_and_block_release(world,monkeypatch,tmp_path):
    from app.services import backup_control
    from app.storage.database import connection
    monkeypatch.setenv('MANAGEMENT_BACKUP_ROOT',str(tmp_path/'backups'))
    wid=world['a']['id'];bid=uuid.uuid4()
    backup_control.request(world['operator'],bid,'检查备份占用',wid)
    try:
        assert checks(activity(world))['pending_backups']['count']==1
        assert activity(world,world['b']['id'])['backup_jobs']=={'queued':0,'running':0}
        with connection() as c:
            c.execute("UPDATE backup_jobs SET status='running' WHERE id=%s",(bid,))
        assert activity(world)['backup_jobs']=={'queued':0,'running':1}
    finally:
        with connection() as c:
            c.execute("UPDATE backup_jobs SET status='failed',completed_at=clock_timestamp() WHERE id=%s",(bid,))
    assert checks(activity(world))['pending_backups']['count']==0


def test_stale_service_is_unknown_until_explicit_shutdown(world):
    from app.services import maintenance_control as control
    from app.storage.database import connection
    iid=uuid.uuid4().hex
    baseline=control.snapshot(world['operator'])['activity']['release_checks']['database_stop']
    with connection() as c:
        c.execute("INSERT INTO service_heartbeats(instance_id,kind,seen_at) VALUES(%s,'worker',clock_timestamp()-interval '1 hour')",(iid,))
    value=control.snapshot(world['operator'])['activity']['release_checks']
    assert value['database_stop']['unknown_business_services']==baseline['unknown_business_services']+1
    assert value['database_stop']['status']=='blocked' and value['database_stop_ready'] is False
    with connection() as c:
        c.execute('UPDATE service_heartbeats SET stopped_at=clock_timestamp() WHERE instance_id=%s',(iid,))
    value=control.snapshot(world['operator'])['activity']['release_checks']
    assert value['database_stop']['unknown_business_services']==baseline['unknown_business_services']
    assert 'stop_all_database_clients' in value['operator_checks']
    assert 'verify_no_inflight_transactions' in value['operator_checks']


def test_management_http_requires_current_scope_permission_and_hides_checks_from_members(world,platform):
    from app.services import members
    from app.management.application import COOKIE, create_app
    from fastapi.testclient import TestClient
    op=world['operator'];wid=world['a']['id'];person=world['people'][0]
    role=members.create_role(op,'维护检查', ['maintenance.space'],wid)
    members.assign_roles(op,person['id'],[role],wid)
    token=members.login(person['username'],PASSWORD,audience='management',source=uuid.uuid4().hex)['token']
    with TestClient(platform['app'],base_url='http://localhost:8766') as c:
        c.cookies.set(COOKIE,token)
        response=c.get('/api/maintenance',params={'workspace':wid})
        assert response.status_code==200,response.text
        report=response.json()['activity']['release_checks']
        assert report['scope']=='workspace' and report['workspace_id']==wid
        assert c.get('/api/maintenance').status_code==403
        assert c.get('/api/maintenance',params={'workspace':world['b']['id']}).status_code==403
        members.assign_roles(op,person['id'],[world['a']['roles']['viewer']],wid)
        assert c.get('/api/maintenance',params={'workspace':wid}).status_code==403
    member=world['viewer'].get('/api/maintenance/status',headers=headers(world['a']))
    assert member.status_code==200 and 'release_checks' not in member.text and 'backup_jobs' not in member.text
