"""Authorize and record each paid POST immediately before dispatch.

Admission is the transaction boundary: changes after admission do not cancel
that in-flight call. They prevent further admissions, including batch siblings
and protocol fallbacks. Network ambiguity is recorded without automatic retry.
"""
from app.services.generation_kind import billing_kind
import asyncio
import uuid
import logging

from app.storage.settings import postgres_enabled, member_auth_enabled
from app.storage.workspace import current_workspace


def admit(record=True):
    from app.services import authorization as az
    from app.services.maintenance_control import ensure
    from app.storage import tasks
    lease = tasks.lease_context.get()
    with az.policy_transaction() as conn:
        workspace = current_workspace()
        ensure(conn, workspace, 'write')
        if not lease:
            if member_auth_enabled():
                az.fail('durable_generation_required')
            return None
        row = conn.execute('''SELECT * FROM tasks WHERE workspace_id=%s AND id=%s AND lease_token=%s
            AND lease_until>clock_timestamp() AND status='submitting' FOR UPDATE''', (workspace, *lease)).fetchone()
        if not row:
            az.fail('task_submission_lease_invalid', 409)
        member_id = row['requested_by']
        if member_id:
            member = conn.execute('SELECT status FROM members WHERE id=%s', (member_id,)).fetchone()
            space = conn.execute('SELECT status FROM workspaces WHERE id=%s', (workspace,)).fetchone()
            if (not member or member['status'] != 'active' or not space or space['status'] != 'active'
                    or not {'generation.submit', 'provider.use'} <= az.effective_permissions(conn, member_id, workspace)):
                az.fail('generation_permission_revoked')
        elif member_auth_enabled():
            az.fail('task_requester_unknown')
        from app.storage.task_requests import account_ref
        if row['provider_account_ref'] and row['provider_account_ref'] != account_ref(row['provider_id']):
            az.fail('provider_account_changed', 409)
        if row["provider_id"]:
            from app.providers.registry import get_api_provider_exact
            from app.services.model_commercial import enforce
            kind = billing_kind(row["kind"])
            enforce(get_api_provider_exact(row["provider_id"]), kind, row["request"])
            if row['kind'] == 'audio' and row['request'].get('mode') == 'clone':
                enforce(get_api_provider_exact(row['provider_id']), 'audio', {'model': row['request']['clone_preview_model']})
        voice_id = row['request'].get('timbre_id')
        if row['kind'] == 'audio' and row['request'].get('mode') == 'speech' and isinstance(voice_id, str) and voice_id.startswith('canvas-voice-'):
            if not conn.execute('''SELECT 1 FROM audio_voice_registrations WHERE workspace_id=%s
                AND provider_id=%s AND account_ref=%s AND voice_id=%s
                AND NOT EXISTS(SELECT 1 FROM audio_voice_deletions d WHERE d.workspace_id=audio_voice_registrations.workspace_id
                AND d.provider_id=audio_voice_registrations.provider_id AND d.account_ref=audio_voice_registrations.account_ref
                AND d.voice_id=audio_voice_registrations.voice_id AND d.state IN ('pending','unknown','deleted')) FOR SHARE''',
                (workspace, row['provider_id'], row['provider_account_ref'], voice_id)).fetchone():
                az.fail('audio_voice_not_registered', 403)
        if not record:
            return None
        identity = uuid.uuid4()
        conn.execute('INSERT INTO task_submissions(id,task_id,workspace_id) VALUES(%s,%s,%s)', (identity, row['id'], workspace))
        return identity


def finish(identity, outcome, response_status=None):
    if identity:
        from app.storage.database import connection
        with connection() as conn:
            conn.execute('UPDATE task_submissions SET outcome=%s,response_status=%s,finished_at=clock_timestamp() WHERE id=%s', (outcome, response_status, identity))


async def paid_post(client, *args, **kwargs):
    if not postgres_enabled():
        return await client.post(*args, **kwargs)
    identity = await asyncio.to_thread(admit)
    try:
        response = await client.post(*args, **kwargs)
    except BaseException:
        await asyncio.shield(asyncio.to_thread(finish, identity, 'uncertain'))
        raise
    try:
        await asyncio.to_thread(finish, identity, 'responded', response.status_code)
    except Exception:
        # Do not discard a known paid response because bookkeeping is briefly
        # unavailable. The durable task result path must still get that result.
        logging.error('Submission response bookkeeping unavailable; retaining response for finalization')
    return response


def pause_unsubmitted(task_id, error):
    if not isinstance(getattr(error, 'detail', None), dict) or error.detail.get('code') != 'maintenance_restricted':
        return False
    from app.storage.database import connection
    from app.storage import tasks
    with connection() as conn:
        if conn.execute('SELECT 1 FROM task_submissions WHERE task_id=%s LIMIT 1', (task_id,)).fetchone():
            return False
        current = tasks.get(task_id)
        if current.get('status') in {'running', 'submitting'} and not current.get('upstream_task_id'):
            current.update(status='queued', error='维护中，尚未提交付费请求')
            tasks.save(current)
            return True
    return False
