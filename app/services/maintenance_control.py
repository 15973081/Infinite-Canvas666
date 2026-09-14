"""Persistent platform/space maintenance, enforced using database time.

Business transactions take the same shared policy lock as role checks. State
changes take its exclusive counterpart. Scheduled restrictions do not depend
on a browser timer or scheduler availability: reads evaluate the due time.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import logging
import uuid

from fastapi import HTTPException
from app.services import authorization as az
from app.storage.database import connection

MODES = {'normal', 'scheduled', 'draining', 'read_only', 'offline', 'recovering'}
RANK = {'normal': 0, 'scheduled': 0, 'draining': 1, 'read_only': 2, 'recovering': 3, 'offline': 3}
TRANSITIONS = {'normal': {'scheduled', 'draining'}, 'scheduled': {'normal', 'draining'},
               'draining': {'read_only', 'offline', 'recovering'}, 'read_only': {'offline', 'recovering'},
               'offline': {'recovering'}, 'recovering': {'normal', 'offline', 'read_only'}}


def key(workspace):
    return 'space:' + workspace if workspace else 'platform'


def current(conn, workspace=None):
    row = conn.execute('SELECT *,clock_timestamp() AS server_time FROM maintenance_controls WHERE scope_key=%s', (key(workspace),)).fetchone()
    if not row:
        now = conn.execute('SELECT clock_timestamp() AS now').fetchone()['now']
        row = {'scope_key': key(workspace), 'workspace_id': workspace, 'mode': 'normal', 'version': 0,
               'message': '', 'reason': '', 'planned_at': None, 'drain_started_at': None, 'drain_deadline': None,
               'grace_seconds': 300, 'updated_by': None, 'updated_at': None, 'restored_at': None, 'server_time': now}
    row['stored_mode'] = row['mode']
    if row['mode'] == 'scheduled' and row['planned_at'] <= row['server_time']:
        row.update(mode='draining', drain_started_at=row['planned_at'],
                   drain_deadline=row['planned_at'] + timedelta(seconds=row['grace_seconds']))
    return row


def effective(conn, workspace):
    rows = [current(conn), current(conn, workspace)] if workspace else [current(conn)]
    strongest = max(rows, key=lambda r: (RANK[r['mode']], r['mode'] == 'scheduled', r['workspace_id'] is None))
    if strongest['mode'] == 'scheduled':
        strongest = min((r for r in rows if r['mode'] == 'scheduled'), key=lambda r: r['planned_at'])
    # Both scopes constrain finish/renew. Announce the first applicable
    # deadline, even when the platform notice wins the display precedence.
    deadline = min((r['drain_deadline'] for r in rows if r['mode'] == 'draining'), default=None)
    return {'mode': strongest['mode'], 'message': strongest['message'],
            'planned_at': strongest['planned_at'], 'drain_deadline': deadline if strongest['mode'] == 'draining' else strongest['drain_deadline'],
            'server_time': strongest['server_time'],
            'versions': {r['scope_key']: r['version'] for r in rows}, 'sources': rows}


def ensure(conn, workspace, operation, resource_id=None):
    conn.execute('SELECT pg_advisory_xact_lock_shared(%s)', (az.AUTH_LOCK,))
    state = effective(conn, workspace)
    if operation == 'observe':
        return state
    for row in state['sources']:
        mode = row['mode']
        if mode in {'normal', 'scheduled'}:
            continue
        if operation == 'read' and mode in {'draining', 'read_only'}:
            continue
        if operation == 'canvas.finish' and mode == 'draining' and row['server_time'] <= row['drain_deadline']:
            lease = conn.execute('SELECT acquired_at FROM canvas_edit_leases WHERE workspace_id=%s AND canvas_id=%s', (workspace, resource_id)).fetchone()
            if lease and lease['acquired_at'] and lease['acquired_at'] <= row['drain_started_at']:
                continue  # The caller also validates the bound credential and generation.
        if operation == 'upload.finish' and mode == 'draining' and row['server_time'] <= row['drain_deadline']:
            upload = conn.execute('SELECT created_at,status FROM media_uploads WHERE workspace_id=%s AND asset_id=%s', (workspace, resource_id)).fetchone()
            if upload and upload['created_at'] <= row['drain_started_at'] and upload['status'] in {'uploading', 'verifying', 'ready'}:
                continue
        raise HTTPException(503, {'code': 'maintenance_restricted', 'mode': mode,
                                  'scope': 'platform' if row['workspace_id'] is None else 'workspace',
                                  'message': row['message'], 'version': row['version']}, headers={'Retry-After': '30'})
    return state


def public_effective(state):
    # Space maintenance delegates need the platform restriction/notice, not
    # the platform operator's private reason or identity/audit metadata.
    visible = {'scope_key', 'workspace_id', 'mode', 'version', 'message', 'planned_at', 'drain_deadline'}
    return {**state, 'sources': [{k: v for k, v in row.items() if k in visible} for row in state['sources']]}


def counts(conn, workspace=None):
    from app.services.canvas_leases import active_count
    from app.services.canvas_page_reports import counts as page_counts
    pages = page_counts(conn, workspace)
    task_rows = list(conn.execute("""SELECT status,count(*) AS count,
        count(*) FILTER(WHERE lease_until>statement_timestamp()) AS leased,
        count(*) FILTER(WHERE lease_until<=statement_timestamp()) AS expired
        FROM tasks WHERE (%s::text IS NULL OR workspace_id=%s) GROUP BY status""", (workspace, workspace)))
    tasks = {r['status']: r['count'] for r in task_rows}
    task_leases = {'active': sum(r['leased'] for r in task_rows), 'expired': sum(r['expired'] for r in task_rows)}
    submissions = conn.execute("""SELECT count(*) AS n FROM task_submissions
        WHERE outcome='admitted' AND finished_at IS NULL AND (%s::text IS NULL OR workspace_id=%s)""",
        (workspace, workspace)).fetchone()['n']
    uploads = conn.execute("""SELECT count(*) FILTER (WHERE status IN ('initiating','uploading','verifying') AND expires_at>statement_timestamp()) AS pending,
        count(*) FILTER (WHERE lease_until>statement_timestamp()) AS processing,
        count(*) FILTER (WHERE status IN ('initiating','uploading','verifying') AND expires_at<=statement_timestamp()) AS expired_unfinished
        FROM media_uploads WHERE (%s::text IS NULL OR workspace_id=%s)""", (workspace, workspace)).fetchone()
    backups = conn.execute("""SELECT count(*) FILTER(WHERE status='queued') AS queued,
        count(*) FILTER(WHERE status='running') AS running FROM backup_jobs
        WHERE (%s::text IS NULL OR workspace_id=%s)""", (workspace, workspace)).fetchone()
    services = list(conn.execute("""SELECT kind,
        count(*) FILTER (WHERE stopped_at IS NULL AND seen_at>statement_timestamp()-interval '35 seconds') AS online,
        count(*) FILTER (WHERE stopped_at IS NULL AND seen_at<=statement_timestamp()-interval '35 seconds') AS unknown,
        count(*) FILTER (WHERE stopped_at IS NOT NULL) AS stopped,
        max(seen_at) AS last_seen FROM service_heartbeats GROUP BY kind"""))
    active = sum(tasks.get(s, 0) for s in ('running', 'submitting', 'polling', 'finalizing'))
    result = {'task_counts': tasks, 'active_tasks': active, 'queued_tasks': tasks.get('queued', 0),
              'task_leases': task_leases, 'unfinished_submissions': submissions,
              'needs_review': tasks.get('needs_review', 0), 'uploads': uploads, 'backup_jobs': backups,
              'services': services, 'canvas_locks': active_count(conn, workspace), 'unsaved_pages': pages['unsaved_pages'],
              'page_reports': pages, 'database_stop_ready': False,
              'pending_checks': ['unreported_pages', 'operator_backup_and_recovery_check'] +
                  (['stale_or_closed_unsaved_pages'] if pages['pending_review_pages'] else [])}
    from app.services.maintenance_readiness import report
    result['release_checks'] = report(effective(conn, workspace), result, workspace)
    return result


def snapshot(actor, workspace=None):
    with az.policy_transaction() as conn:
        az.require(conn, actor, 'maintenance.space' if workspace else 'maintenance.platform', workspace)
        return {'control': current(conn, workspace), 'effective': public_effective(effective(conn, workspace)), 'activity': counts(conn, workspace)}


def change(actor, workspace, mode, expected_version, *, message='', reason='', planned_at=None,
           grace_seconds=300, confirm_recovery=False):
    if mode not in MODES or not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        az.fail('invalid_maintenance_change', 400)
    if not isinstance(message, str) or len(message) > 1000 or not 0 <= grace_seconds <= 3600:
        az.fail('invalid_maintenance_change', 400)
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'maintenance.space' if workspace else 'maintenance.platform', workspace)
        previous = current(conn, workspace)
        if expected_version != previous['version']:
            az.fail('maintenance_version_conflict', 409)
        if mode != previous['mode'] and mode not in TRANSITIONS[previous['mode']]:
            az.fail('maintenance_transition_invalid', 409)
        if previous['mode'] == 'recovering' and mode == 'normal' and not confirm_recovery:
            az.fail('maintenance_recovery_confirmation_required', 409)
        now = previous['server_time']
        if mode == 'scheduled':
            if not isinstance(planned_at, datetime) or planned_at.tzinfo is None or planned_at <= now:
                az.fail('maintenance_future_time_required', 400)
        else:
            planned_at = previous['planned_at'] if mode == 'draining' else None
        started = previous['drain_started_at'] if previous['mode'] == 'draining' else now
        deadline = previous['drain_deadline'] if previous['mode'] == 'draining' else now + timedelta(seconds=grace_seconds)
        # Editing a drain notice never extends the original saving/upload grace.
        conn.execute('''INSERT INTO maintenance_controls(scope_key,workspace_id,mode,version,message,reason,planned_at,
            drain_started_at,drain_deadline,grace_seconds,updated_by,updated_at,restored_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,clock_timestamp(),%s)
            ON CONFLICT(scope_key) DO UPDATE SET mode=excluded.mode,version=excluded.version,message=excluded.message,
            reason=excluded.reason,planned_at=excluded.planned_at,drain_started_at=excluded.drain_started_at,
            drain_deadline=excluded.drain_deadline,grace_seconds=excluded.grace_seconds,updated_by=excluded.updated_by,
            updated_at=excluded.updated_at,restored_at=excluded.restored_at''',
            (key(workspace), workspace, mode, previous['version'] + 1, message.strip(), reason.strip(), planned_at,
             started if mode == 'draining' else None, deadline if mode == 'draining' else None, grace_seconds, actor.member_id,
             now if mode == 'normal' and previous['mode'] != 'normal' else previous['restored_at']))
        az.audit(conn, actor, 'maintenance.change', key(workspace), workspace,
                 {'before': previous['mode'], 'after': mode, 'version': previous['version'] + 1, 'reason': reason.strip()})
        if mode in {'read_only', 'offline', 'recovering'}:
            from app.services.canvas_leases import revoke_for_maintenance
            revoke_for_maintenance(conn, actor, workspace, mode)
        return {'control': current(conn, workspace), 'effective': public_effective(effective(conn, workspace)), 'activity': counts(conn, workspace)}


def tick():
    # Multiple processes may run this. Exclusive policy coordination and a
    # conditional UPDATE ensure one durable transition/event per due schedule.
    with az.policy_transaction(change=True) as conn:
        rows = conn.execute("""UPDATE maintenance_controls SET mode='draining',version=version+1,
            drain_started_at=planned_at,drain_deadline=planned_at+make_interval(secs=>grace_seconds),updated_at=clock_timestamp()
            WHERE mode='scheduled' AND planned_at<=clock_timestamp() RETURNING scope_key,workspace_id,version""").fetchall()
        for row in rows:
            az.audit(conn, None, 'maintenance.scheduled.start', row['scope_key'], row['workspace_id'], {'version': row['version']})
        return len(rows)


@asynccontextmanager
async def scheduler():
    stop = asyncio.Event()
    async def loop():
        while not stop.is_set():
            try:
                await asyncio.to_thread(tick)
            except Exception:
                logging.error('Maintenance schedule reconciliation failed; database checks remain authoritative')
            try:
                await asyncio.wait_for(stop.wait(), 1)
            except asyncio.TimeoutError:
                pass
    runner = asyncio.create_task(loop())
    try:
        yield
    finally:
        stop.set()
        await runner


@asynccontextmanager
async def service_presence(kind):
    instance = uuid.uuid4().hex
    stop = asyncio.Event()
    def beat(stopped=False):
        with connection() as conn:
            if stopped:
                conn.execute('UPDATE service_heartbeats SET stopped_at=clock_timestamp() WHERE instance_id=%s', (instance,))
            else:
                conn.execute('''INSERT INTO service_heartbeats(instance_id,kind) VALUES(%s,%s)
                    ON CONFLICT(instance_id) DO UPDATE SET seen_at=clock_timestamp(),stopped_at=NULL''', (instance, kind))
    await asyncio.to_thread(beat)
    async def loop():
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), 10)
            except asyncio.TimeoutError:
                try:
                    await asyncio.to_thread(beat)
                except Exception:
                    logging.error('Service heartbeat unavailable')
    runner = asyncio.create_task(loop())
    try:
        yield
    finally:
        stop.set()
        await runner
        await asyncio.to_thread(beat, True)
