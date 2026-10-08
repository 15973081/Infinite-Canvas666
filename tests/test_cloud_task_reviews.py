"""Task review against real PostgreSQL, worker fences and isolated media."""
import asyncio
import base64
import io
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, PASSWORD
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
PRIVATE = 'private-upstream-error-and-prompt'


def requester(world):
    from app.services import members
    login=members.login(world['people'][0]['username'],PASSWORD,audience='workbench',source='review-fixture-'+uuid.uuid4().hex)
    return members.resolve_session(login['token'],'workbench')


def make_task(world, *, status='needs_review', kind='video', upstream=None, workspace=None, paid=False):
    from app.storage import tasks, database
    from app.storage.workspace import workspace_scope
    wid = workspace or world['a']['id']
    tid = 'review-' + uuid.uuid4().hex
    with workspace_scope(wid):
        from app.services.member_context import access_scope
        principal=requester(world)
        with access_scope(principal,wid,()):
            tasks.save({'id': tid, 'type': kind, 'status': status, 'upstream_task_id': upstream,
                        'provider_id': 'comfly', 'error': PRIVATE},
                       {'provider_id': 'comfly', 'model': 'test', 'prompt': PRIVATE})
        with database.connection() as c:
            c.execute('UPDATE tasks SET requested_by=%s,error_message=%s WHERE id=%s', (world['people'][0]['id'], PRIVATE, tid))
            if paid:
                c.execute("INSERT INTO task_submissions(id,task_id,workspace_id,outcome) VALUES(%s,%s,%s,'uncertain')", (uuid.uuid4(), tid, wid))
    return tid


def detail(platform, world, tid):
    response = platform['client'].get('/api/tasks/' + tid, params={'workspace': world['a']['id']})
    assert response.status_code == 200, response.text
    assert PRIVATE not in response.text
    return response.json()


def payload(row, action, **extra):
    return {'request_id': str(uuid.uuid4()), 'expected_version': row['review_version'],
            'action': action, 'note': '隔离任务核对依据', **extra}


def submit(platform, world, tid, body):
    return platform['client'].post('/api/tasks/' + tid + '/review', params={'workspace': world['a']['id']}, json=body)


def test_task_catalog_is_scoped_paginated_and_redacts_execution_internals(world, platform):
    ids = [make_task(world) for _ in range(3)]
    foreign = make_task(world, workspace=world['b']['id'])
    c = platform['client']
    response = c.get('/api/tasks', params={'workspace': world['a']['id'], 'limit': 2})
    assert response.status_code == 200 and PRIVATE not in response.text
    first = response.json()
    second = c.get('/api/tasks', params={'workspace': world['a']['id'], 'limit': 2, 'after': first['next']}).json()
    assert {r['id'] for r in first['tasks'] + second['tasks']} == set(ids)
    assert foreign not in response.text
    assert c.get('/api/tasks/' + foreign, params={'workspace': world['a']['id']}).status_code == 404
    row = detail(platform, world, ids[0])
    assert not {'request','result','legacy_metadata','lease_token','provider_account_ref','error_message'} & row.keys()
    assert c.get('/api/tasks', params={'workspace': world['a']['id'], 'status': 'unknown'}).status_code == 400


def test_cancel_unsubmitted_is_idempotent_and_preserves_request_and_fees(world, platform):
    from app.storage.database import connection
    tid = make_task(world, status='queued')
    row = detail(platform, world, tid)
    body = payload(row, 'cancel_unsubmitted')
    with connection() as c:
        before = c.execute('SELECT request,result,request_sha256 FROM tasks WHERE id=%s', (tid,)).fetchone()
        ledger_count = c.execute('SELECT count(*) AS n FROM ledger_entries').fetchone()['n']
    result = submit(platform, world, tid, body)
    assert result.status_code == 200 and result.json()['status'] == 'cancelled'
    assert submit(platform, world, tid, body).json() == result.json()
    assert submit(platform, world, tid, {**body,'note':'different'}).status_code == 409
    with connection() as c:
        assert c.execute('SELECT request,result,request_sha256 FROM tasks WHERE id=%s', (tid,)).fetchone() == before
        assert c.execute('SELECT count(*) AS n FROM ledger_entries').fetchone()['n'] == ledger_count
        assert c.execute('SELECT count(*) AS n FROM task_reviews WHERE task_id=%s', (tid,)).fetchone()['n'] == 1
        assert c.execute("SELECT count(*) AS n FROM management_events WHERE target_id=%s AND action='task.review'", (tid,)).fetchone()['n'] == 1


def test_uncertain_paid_submission_cannot_be_cancelled_as_unsubmitted(world, platform):
    from app.storage.database import connection
    tid = make_task(world, paid=True)
    row = detail(platform, world, tid)
    assert row['submission_counts'] == {'uncertain': 1}
    assert 'cancel_unsubmitted' not in row['actions']
    assert submit(platform, world, tid, payload(row, 'cancel_unsubmitted')).status_code == 409
    assert submit(platform, world, tid, payload(row, 'confirm_failed')).status_code == 400
    result = submit(platform, world, tid, payload(row, 'confirm_failed', upstream_verified=True))
    assert result.status_code == 200 and result.json()['status'] == 'failed'
    with connection() as c:
        assert c.execute('SELECT outcome FROM task_submissions WHERE task_id=%s', (tid,)).fetchone()['outcome'] == 'uncertain'
    assert 'resume_polling' not in detail(platform, world, tid)['actions']


def test_stale_form_and_worker_lease_block_review(world, platform):
    from app.storage import tasks, database
    from app.storage.workspace import workspace_scope
    tid = make_task(world, status='queued')
    initial = detail(platform, world, tid)
    with workspace_scope(world['a']['id']):
        row = tasks.claim('task-review-fence')
        assert row['id'] == tid
        assert submit(platform, world, tid, payload(initial, 'cancel_unsubmitted')).status_code == 409
        live = detail(platform, world, tid)
        assert live['leased'] and live['actions'] == []
        result = submit(platform, world, tid, payload(live, 'cancel_unsubmitted'))
        assert result.json()['detail']['code'] == 'task_review_busy'
        assert tasks.heartbeat(tid, row['lease_token'])
        assert detail(platform, world, tid)['review_version'] > live['review_version']
        with database.connection() as c:
            c.execute("UPDATE tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE id=%s", (tid,))
        tasks.recover_expired()
        recovered = detail(platform, world, tid)
        assert recovered['status'] == 'queued'
        assert submit(platform, world, tid, payload(recovered,'cancel_unsubmitted')).status_code == 200


def test_polling_recovery_requires_original_account_and_worker_never_generates(world, platform, monkeypatch, tmp_path):
    from app.storage import database, tasks, worker
    from app.storage.workspace import workspace_scope
    from app.routers import canvas
    tid = make_task(world, upstream='known-upstream', paid=True)
    initial = detail(platform, world, tid)
    assert initial['account_status'] == 'matched' and 'resume_polling' in initial['actions']
    with database.connection() as c:
        original = c.execute('SELECT provider_account_ref FROM tasks WHERE id=%s', (tid,)).fetchone()['provider_account_ref']
        c.execute("UPDATE tasks SET provider_account_ref='managed:comfly:wrong-account' WHERE id=%s", (tid,))
    changed = detail(platform, world, tid)
    assert changed['account_status'] == 'changed' and 'resume_polling' not in changed['actions']
    assert submit(platform, world, tid, payload(changed,'resume_polling')).status_code == 409
    with database.connection() as c:
        c.execute('UPDATE tasks SET provider_account_ref=%s WHERE id=%s', (original,tid))
    row = detail(platform, world, tid)
    assert submit(platform, world, tid, payload(row,'resume_polling')).json()['status'] == 'polling'
    calls = []
    async def resume(task_id, request):
        calls.append((task_id, request.provider_id))
        current = tasks.get(task_id)
        assert current['upstream_task_id'] == 'known-upstream'
        from app.storage import media
        result_path=tmp_path/'recovered.mp4'; result_path.write_bytes(b'isolated recovered video')
        output=media.publish(result_path)
        current.update(status='succeeded', result={'videos':[media.stable_url(output)]}, error='')
        tasks.save(current)
    new_generation = AsyncMock(side_effect=AssertionError('must not submit another paid task'))
    monkeypatch.setattr(canvas,'resume_canvas_video_task',resume)
    monkeypatch.setattr(canvas,'run_canvas_video_task',new_generation)
    with workspace_scope(world['a']['id']):
        claimed = tasks.claim('review-polling-worker')
        assert claimed['id'] == tid and claimed['status'] == 'polling'
        asyncio.run(worker.execute(claimed))
        assert tasks.get(tid)['status'] == 'succeeded'
    new_generation.assert_not_called()
    assert calls == [(tid,'comfly')]
    with database.connection() as c:
        assert c.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(tid,)).fetchone()['n'] == 1


@pytest.mark.parametrize('account_mode', ['assigned', 'unassigned', 'changed'])
def test_checkpoint_review_resumes_publication_even_during_maintenance(world, platform, monkeypatch, account_mode):
    from PIL import Image
    from app.storage import database, finalization, media, tasks, worker
    from app.storage.workspace import workspace_scope
    from app.services import maintenance_control
    from app.routers import providers
    from test_cloud_finalization import new_task, claim, assert_committed
    with workspace_scope(world['a']['id']):
        tid,cid = new_task(count=1,principal=requester(world))
        row = claim(tid)
        token = tasks.lease_context.set((tid,row['lease_token']))
        stream=io.BytesIO()
        Image.new('RGB',(8,8),'blue').save(stream,format='PNG')
        try:
            with media.operation_scope():
                finalization.checkpoint({'images':[]},[{'type':'b64','value':base64.b64encode(stream.getvalue()).decode()}],'images','comfly')
            with database.connection() as c:
                c.execute("UPDATE tasks SET status='needs_review',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s",(tid,))
        finally:
            tasks.lease_context.reset(token)
        if account_mode == 'unassigned':
            from app.services import provider_control
            provider_control.assign(platform['operator'], world['a']['id'], [], None, 1, reason='取消新调用分配')
        elif account_mode == 'changed':
            with database.connection() as c:
                c.execute("UPDATE tasks SET provider_account_ref='managed:comfly:changed-account' WHERE id=%s",(tid,))
        info=detail(platform,world,tid)
        assert info['result_checkpoint'] and info['actions']==['retry_finalization']
        assert submit(platform,world,tid,payload(info,'confirm_failed',upstream_verified=True)).status_code==409
        maintenance_control.change(platform['operator'],world['a']['id'],'draining',0,reason='维护结果收尾')
        assert submit(platform,world,tid,payload(info,'retry_finalization')).json()['status']=='finalizing'
        monkeypatch.setattr(providers,'generate_ai_image',AsyncMock(side_effect=AssertionError('duplicate generation')))
        if account_mode == 'changed':
            from app.services import media as helpers
            download = AsyncMock(side_effect=AssertionError('must not use another account'))
            monkeypatch.setattr(helpers,'save_ai_image_to_output',download)
            asyncio.run(worker.execute(claim(tid)))
            assert tasks.get(tid)['status'] == 'needs_review'
            download.assert_not_called()
        else:
            asyncio.run(worker.execute(claim(tid)))
            assert_committed(tid,cid,1)


def test_task_review_permissions_are_rechecked_and_do_not_cross_spaces(world, platform):
    from app.services import members
    from fastapi.testclient import TestClient
    tid=make_task(world)
    person=world['people'][1]
    role=members.create_role(platform['operator'],'审核员-'+uuid.uuid4().hex,['task.review'],world['a']['id'])
    members.assign_roles(platform['operator'],person['id'],[role],world['a']['id'])
    with TestClient(platform['app'],base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as c:
        assert c.post('/api/auth/login',json={'username':person['username'],'password':PASSWORD}).status_code==200
        info=c.get('/api/tasks/'+tid,params={'workspace':world['a']['id']}).json()
        assert c.get('/api/tasks',params={'workspace':world['b']['id']}).status_code==403
        members.assign_roles(platform['operator'],person['id'],[world['a']['roles']['viewer']],world['a']['id'])
        assert c.post('/api/tasks/'+tid+'/review',params={'workspace':world['a']['id']},json=payload(info,'cancel_unsubmitted')).status_code==403
    # The workbench audience does not gain management routes.
    assert world['editor'].post('/api/tasks/'+tid+'/review',headers={'X-Workspace-Id':world['a']['id']},json=payload(detail(platform,world,tid),'cancel_unsubmitted')).status_code==403


def test_concurrent_review_requests_share_one_receipt(world, platform):
    from app.services import task_reviews
    from app.storage.database import connection
    tid=make_task(world,status='queued')
    info=task_reviews.detail(platform['operator'],world['a']['id'],tid)
    request_id=uuid.uuid4()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(task_reviews.review,platform['operator'],world['a']['id'],tid,request_id,info['review_version'],'cancel_unsubmitted','并发确认') for _ in range(2)]
        results=[future.result(timeout=10) for future in futures]
    assert results[0]==results[1]
    with connection() as c:
        assert c.execute('SELECT count(*) AS n FROM task_reviews WHERE task_id=%s',(tid,)).fetchone()['n']==1
