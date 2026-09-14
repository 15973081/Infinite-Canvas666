"""Workspace-scoped task review. No generation API is invoked by management."""
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import authorization as az, provider_control
from app.storage import finalization, tasks, image_receipts
from app.storage.workspace import workspace_scope

ACTIONS = {'retry_finalization', 'resume_polling', 'cancel_unsubmitted', 'confirm_failed'}
STATUSES = set(tasks.ACTIVE + tasks.TERMINAL)


def require_reviewer(conn, actor, workspace):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, 'task.review', workspace)


def result_source(conn, row):
    return bool(conn.execute("""SELECT 1 FROM assets WHERE workspace_id=%s AND id=%s
        AND status='ready' AND deleted_at IS NULL AND role='task-result-source'""",
        (row['workspace_id'], finalization.source_id(row['id']))).fetchone())


def submission_counts(conn, row):
    records = conn.execute("""SELECT outcome,count(*) AS count FROM task_submissions
        WHERE workspace_id=%s AND task_id=%s GROUP BY outcome""", (row['workspace_id'], row['id'])).fetchall()
    return {record['outcome']: record['count'] for record in records}


def account_status(conn, row):
    if provider_control.retired(row['provider_id']):
        return 'retired'
    if not row['provider_account_ref'] or not row['provider_account_ref'].startswith('managed:'):
        return 'unverified'
    provider = conn.execute('SELECT * FROM managed_providers WHERE id=%s', (row['provider_id'],)).fetchone()
    if not provider:
        return 'missing'
    try:
        return 'matched' if provider_control.binding(provider) == row['provider_account_ref'] else 'changed'
    except HTTPException:
        return 'unavailable'


def capabilities(row, checkpoint, submissions, account, images=None):
    if row['leased']:
        return []
    actions = []
    if checkpoint and row['status'] in {'needs_review', 'failed', 'finalizing'}:
        actions.append('retry_finalization')
    queryable = (row['kind'] == 'video' and row['upstream_task_id']) or bool(images and images['complete'])
    if (not checkpoint and row['status'] in {'needs_review', 'failed'} and queryable and account == 'matched'):
        actions.append('resume_polling')
    if (row['status'] in {'queued', 'needs_review'} and not checkpoint and not submissions
            and not row['upstream_task_id'] and not (images and (images['saved_results'] or images['queryable'])) and row['requested_by'] and row['provider_account_ref']
            and row['provider_account_ref'].startswith('managed:')
            and not row['legacy_metadata'].get('submission_unknown')):
        actions.append('cancel_unsubmitted')
    if row['status'] == 'needs_review' and not checkpoint:
        actions.append('confirm_failed')
    return actions


def public(row):
    # Never return request, raw supplier responses, signed URLs, lease tokens,
    # account fingerprints, or untrusted upstream error text.
    fields = ('id', 'workspace_id', 'canvas_id', 'kind', 'status', 'provider_id', 'model',
              'requested_by', 'upstream_task_id', 'created_at', 'updated_at', 'review_version')
    return {**{key: row[key] for key in fields}, 'leased': bool(row['leased']),
            'has_error': bool(row['error_message'])}


def listing(actor, workspace, status='needs_review', after='', limit=50):
    if status != 'all' and status not in STATUSES or not 1 <= limit <= 100:
        az.fail('invalid_task_review_query', 400)
    with az.policy_transaction() as conn:
        require_reviewer(conn, actor, workspace)
        clause = '' if status == 'all' else ' AND status=%s'
        args = [workspace, after, *([] if status == 'all' else [status]), limit + 1]
        rows = conn.execute("""SELECT id,workspace_id,canvas_id,kind,status,provider_id,model,requested_by,
            upstream_task_id,created_at,updated_at,review_version,error_message,
            lease_until>clock_timestamp() AS leased FROM tasks
            WHERE workspace_id=%s AND id>%s""" + clause + ' ORDER BY id LIMIT %s', args).fetchall()
        counts = {r['status']: r['count'] for r in conn.execute(
            'SELECT status,count(*) AS count FROM tasks WHERE workspace_id=%s GROUP BY status', (workspace,))}
        return {'tasks': [public(row) for row in rows[:limit]], 'counts': counts,
                'next': rows[limit-1]['id'] if len(rows) > limit else None}


def detail(actor, workspace, task_id):
    with az.policy_transaction() as conn:
        require_reviewer(conn, actor, workspace)
        row = conn.execute("""SELECT *,lease_until>clock_timestamp() AS leased FROM tasks
            WHERE workspace_id=%s AND id=%s""", (workspace, task_id)).fetchone()
        if not row:
            az.fail('task_review_not_found', 404)
        checkpoint, submissions, account = result_source(conn, row), submission_counts(conn, row), account_status(conn, row)
        reviews = conn.execute("""SELECT action,note,created_at,member_id FROM task_reviews
            WHERE workspace_id=%s AND task_id=%s ORDER BY created_at DESC LIMIT 20""", (workspace, task_id)).fetchall()
        return {**public(row), 'result_checkpoint': checkpoint, 'submission_counts': submissions,
                'account_status': account, 'image_receipts': image_receipts.summary(row, conn),
                'actions': capabilities(row, checkpoint, submissions, account, image_receipts.summary(row, conn)),
                'reviews': reviews}


def review(actor, workspace, task_id, request_id, expected_version, action, note, upstream_verified=False):
    if action not in ACTIONS or not isinstance(note, str) or not note.strip() or len(note) > 1000:
        az.fail('invalid_task_review', 400)
    if action == 'confirm_failed' and upstream_verified is not True:
        az.fail('task_upstream_confirmation_required', 400)
    with az.policy_transaction(change=True) as conn:
        require_reviewer(conn, actor, workspace)
        receipt = conn.execute('SELECT * FROM task_reviews WHERE request_id=%s', (request_id,)).fetchone()
        if receipt:
            expected = (workspace, task_id, actor.member_id, actor.session_id, action, expected_version, note.strip(), upstream_verified)
            recorded = tuple(receipt[key] for key in ('workspace_id','task_id','member_id','session_id','action','expected_version','note','upstream_verified'))
            if expected != recorded:
                az.fail('task_review_request_conflict', 409)
            return receipt['result']
        row = conn.execute("""SELECT *,lease_until>clock_timestamp() AS leased FROM tasks
            WHERE workspace_id=%s AND id=%s FOR UPDATE""", (workspace, task_id)).fetchone()
        if not row:
            az.fail('task_review_not_found', 404)
        if row['review_version'] != expected_version:
            az.fail('task_review_changed', 409)
        if row['leased']:
            az.fail('task_review_busy', 409)
        checkpoint, submissions, account = result_source(conn, row), submission_counts(conn, row), account_status(conn, row)
        if action not in capabilities(row, checkpoint, submissions, account, image_receipts.summary(row, conn)):
            az.fail('task_review_action_unavailable', 409)
        if action == 'retry_finalization':
            with workspace_scope(workspace):
                finalization.retry(task_id)
        else:
            status = {'resume_polling': 'polling', 'cancel_unsubmitted': 'cancelled', 'confirm_failed': 'failed'}[action]
            conn.execute("""UPDATE tasks SET status=%s,error_message=NULL,available_at=clock_timestamp(),
                updated_at=clock_timestamp(),completed_at=CASE WHEN %s THEN clock_timestamp() ELSE NULL END,
                lease_owner=NULL,lease_token=NULL,lease_until=NULL,
                legacy_metadata=legacy_metadata || jsonb_build_object('error', '') WHERE workspace_id=%s AND id=%s""",
                (status, status in {'failed', 'cancelled'}, workspace, task_id))
        updated = conn.execute('SELECT status,review_version FROM tasks WHERE workspace_id=%s AND id=%s', (workspace, task_id)).fetchone()
        result = {'request_id': str(request_id), 'task_id': task_id, 'workspace_id': workspace,
                  'action': action, **updated}
        conn.execute("""INSERT INTO task_reviews(request_id,task_id,workspace_id,member_id,session_id,
            action,expected_version,note,upstream_verified,result) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (request_id, task_id, workspace, actor.member_id, actor.session_id, action, expected_version,
             note.strip(), upstream_verified, Jsonb(result)))
        az.audit(conn, actor, 'task.review', task_id, workspace, {
            'request_id': str(request_id), 'action': action, 'from_status': row['status'],
            'status': updated['status'], 'version': updated['review_version'], 'note': note.strip(),
            'upstream_verified': upstream_verified})
        return result
