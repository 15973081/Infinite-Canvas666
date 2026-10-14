"""Member canvas leases. Writers lock policy -> directory -> canvas -> lease.

Directory membership writers use a shared directory lock; recursive deletion
uses its exclusive counterpart. Lease observation does not change membership.

Every mutation uses a short transaction; no WebSocket disconnect releases a
lease. Tokens are bound to a login and a page, and only their hashes are stored.
"""
import hashlib
import hmac
import os
import secrets
import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from app.services import authorization as az
from app.services.maintenance_control import ensure
from app.storage.workspace import current_workspace


@dataclass(frozen=True)
class Proof:
    token: str = ''
    generation: int | None = None
    revision: int | None = None


def proof_from_headers(headers):
    def number(key):
        value = headers.get(key, b'')
        if not value:
            return None
        if not value.isdigit() or len(value) > 18:
            az.fail('canvas_protocol_invalid', 400)
        return int(value)
    token = headers.get(b'x-canvas-edit-token', b'').decode('ascii', errors='ignore')
    if len(token) > 128:
        az.fail('canvas_protocol_invalid', 400)
    return Proof(token, number(b'x-canvas-generation'), number(b'x-canvas-revision'))


def ttl():
    return max(15, min(300, int(os.getenv('CANVAS_EDIT_LEASE_SECONDS', '60'))))


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def canvas_row(conn, workspace, canvas_id, *, include_document=True):
    columns = '*' if include_document else "id,workspace_id,revision,deleted_at,jsonb_build_object('purged_at',document->'purged_at') AS document"
    row = conn.execute(f'SELECT {columns} FROM canvases WHERE workspace_id=%s AND id=%s FOR UPDATE', (workspace, canvas_id)).fetchone()
    if not row or row['document'].get('purged_at'):
        az.fail('canvas_not_found', 404)
    return row


def lease_row(conn, workspace, canvas_id):
    # The canvas row serializes even the first INSERT across processes.
    conn.execute('INSERT INTO canvas_edit_leases(workspace_id,canvas_id) VALUES(%s,%s) ON CONFLICT DO NOTHING', (workspace, canvas_id))
    return conn.execute('SELECT *,clock_timestamp() AS server_time FROM canvas_edit_leases WHERE workspace_id=%s AND canvas_id=%s FOR UPDATE', (workspace, canvas_id)).fetchone()


def holder_active(conn, row):
    if not row['token_hash'] or row['released_at'] or row['expires_at'] <= row['server_time']:
        return False
    return holder_authorized(conn, row)


def holder_authorized(conn, row):
    """Use the same current identity/grant checks for leases and accounting."""
    try:
        member = az.require(conn, az.Principal(row['member_id'], row['login_session_id'], 'workbench'), 'canvas.edit', row['workspace_id'])
        if member['auth_version'] != row['member_auth_version']:
            return False
        az.require(conn, az.Principal(row['member_id'], row['login_session_id'], 'workbench'), 'canvas.read', row['workspace_id'])
        return True
    except HTTPException:
        return False


def active_count(conn, workspace=None):
    """Snapshot of occupied canvases, not proof that browser drafts are saved.

    Caller holds the policy transaction. Group before rechecking authorization
    so many canvases owned by one login do not repeat the same grant queries.
    No row locks or lease mutations: management inspection cannot renew a lease.
    """
    rows = conn.execute('''SELECT workspace_id,member_id,login_session_id,member_auth_version,count(*) AS total
        FROM canvas_edit_leases WHERE (%s::text IS NULL OR workspace_id=%s)
        AND token_hash IS NOT NULL AND released_at IS NULL AND expires_at>statement_timestamp()
        GROUP BY workspace_id,member_id,login_session_id,member_auth_version''', (workspace, workspace)).fetchall()
    return sum(row['total'] for row in rows if holder_authorized(conn, row))


def public(conn, row, actor, revision):
    active = holder_active(conn, row)
    holder = None
    if active:
        member = conn.execute('SELECT id,display_name,avatar FROM members WHERE id=%s', (row['member_id'],)).fetchone()
        holder = {**member, 'edit_session_id': str(row['edit_session_id']), 'is_self': actor.member_id == row['member_id']}
    return {'canvas_id': row['canvas_id'], 'generation': row['generation'], 'revision': revision,
            'holder': holder, 'expires_at': row['expires_at'].isoformat() if active else None,
            'server_time': row['server_time'].isoformat(), 'heartbeat_seconds': min(10, ttl() // 3)}


def authorize(conn, actor, workspace, action='canvas.edit'):
    if actor.audience != 'workbench':
        az.fail('workbench_session_required')
    az.require(conn, actor, 'canvas.read', workspace)
    az.require(conn, actor, action, workspace)


def validate(conn, actor, workspace, canvas_id, proof, *, operation='write', revision=True, include_document=True):
    authorize(conn, actor, workspace)
    canvas = canvas_row(conn, workspace, canvas_id, include_document=include_document)
    row = lease_row(conn, workspace, canvas_id)
    if not proof or not proof.token or proof.generation is None or (revision and proof.revision is None):
        az.fail('canvas_protocol_required', 428)
    if (not holder_active(conn, row) or row['member_id'] != actor.member_id
            or row['login_session_id'] != actor.session_id or row['generation'] != proof.generation
            or not hmac.compare_digest(row['token_hash'] or '', digest(proof.token))):
        az.fail('canvas_lease_lost', 409)
    ensure(conn, workspace, operation, canvas_id)
    if revision and canvas['revision'] != proof.revision:
        raise HTTPException(409, {'code': 'canvas_revision_conflict', 'revision': canvas['revision']})
    return canvas, row


def request_write(conn, canvas_id, *, operation=None, include_document=False):
    from app.services.member_context import current_access
    access = current_access.get()
    if access is None:  # Trusted server work has its own durable task/migration checks.
        return None
    return validate(conn, access.principal, access.workspace, canvas_id, access.edit_proof,
                    operation=operation or access.operation, include_document=include_document)


def event(conn, actor, row, action, previous, revision, reason=''):
    conn.execute('''INSERT INTO collaboration_events(workspace_id,canvas_id,actor_id,action,previous_generation,generation,revision,reason)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s)''',
        (row['workspace_id'], row['canvas_id'], actor.member_id, action, previous, row['generation'], revision, reason))


def status(actor, canvas_id):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace, 'canvas.read')
        ensure(conn, workspace, 'read')
        canvas = canvas_row(conn, workspace, canvas_id, include_document=False)
        return public(conn, lease_row(conn, workspace, canvas_id), actor, canvas['revision'])


def acquire(actor, canvas_id, *, takeover='', expected_generation=None, confirm=False, reason=''):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace)
        ensure(conn, workspace, 'write')
        canvas = canvas_row(conn, workspace, canvas_id, include_document=False)
        row = lease_row(conn, workspace, canvas_id)
        if takeover not in {'', 'self', 'force'}:
            az.fail('canvas_takeover_invalid', 400)
        if takeover:
            if not confirm or expected_generation != row['generation']:
                az.fail('canvas_takeover_confirmation_required', 409)
            if takeover == 'self' and row['member_id'] != actor.member_id:
                az.fail('canvas_takeover_not_self')
            if takeover == 'force':
                az.require(conn, actor, 'canvas.lock.takeover', workspace)
                if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
                    az.fail('canvas_takeover_reason_required', 400)
        elif holder_active(conn, row):
            raise HTTPException(409, {'code': 'canvas_locked', **public(conn, row, actor, canvas['revision'])})
        previous = row['generation']
        token = secrets.token_urlsafe(32)
        version = az.active_member(conn, actor)['auth_version']
        row = conn.execute('''UPDATE canvas_edit_leases SET generation=generation+1,member_id=%s,login_session_id=%s,
            edit_session_id=%s,token_hash=%s,member_auth_version=%s,acquired_at=clock_timestamp(),renewed_at=clock_timestamp(),
            expires_at=clock_timestamp()+make_interval(secs=>%s),released_at=NULL
            WHERE workspace_id=%s AND canvas_id=%s RETURNING *,clock_timestamp() AS server_time''',
            (actor.member_id, actor.session_id, uuid.uuid4(), digest(token), version, ttl(), workspace, canvas_id)).fetchone()
        event(conn, actor, row, 'takeover.' + takeover if takeover else 'acquire', previous, canvas['revision'], reason.strip() if takeover == 'force' else '')
        return {**public(conn, row, actor, canvas['revision']), 'edit_token': token}


def renew(actor, canvas_id, proof):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        canvas, row = validate(conn, actor, workspace, canvas_id, proof, operation='canvas.finish', revision=False, include_document=False)
        # A renewal cannot extend editing past a maintenance drain deadline.
        from app.services.maintenance_control import effective
        deadlines = [r['drain_deadline'] for r in effective(conn, workspace)['sources'] if r['mode'] == 'draining']
        row = conn.execute('''UPDATE canvas_edit_leases SET renewed_at=clock_timestamp(),
            expires_at=LEAST(clock_timestamp()+make_interval(secs=>%s),%s::timestamptz)
            WHERE workspace_id=%s AND canvas_id=%s RETURNING *,clock_timestamp() AS server_time''',
            (ttl(), min(deadlines) if deadlines else None, workspace, canvas_id)).fetchone()
        return public(conn, row, actor, canvas['revision'])


def release(actor, canvas_id, proof):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        # Release may end a valid lease during offline maintenance. It cannot
        # silently save a page: the client supplies its last confirmed revision.
        canvas, row = validate(conn, actor, workspace, canvas_id, proof, operation='observe')
        save_release_snapshot(conn, canvas, row)
        conn.execute('UPDATE canvas_edit_leases SET released_at=clock_timestamp(),expires_at=clock_timestamp() WHERE workspace_id=%s AND canvas_id=%s', (workspace, canvas_id))
        event(conn, actor, row, 'release', row['generation'], canvas['revision'])
        return {'released': True, 'generation': row['generation'], 'revision': canvas['revision']}


def save_release_snapshot(conn, canvas, row):
    from psycopg.types.json import Jsonb
    conn.execute('''INSERT INTO canvas_release_snapshots(workspace_id,canvas_id,generation,revision,document)
        VALUES(%s,%s,%s,%s,%s)''', (row['workspace_id'], row['canvas_id'], row['generation'], canvas['revision'], Jsonb(canvas['document'])))


def request_transfer(actor, canvas_id):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace)
        ensure(conn, workspace, 'write')
        canvas_row(conn, workspace, canvas_id, include_document=False)
        row = lease_row(conn, workspace, canvas_id)
        if not holder_active(conn, row):
            az.fail('canvas_transfer_no_holder', 409)
        token, identity = secrets.token_urlsafe(32), uuid.uuid4()
        version = az.active_member(conn, actor)['auth_version']
        result = conn.execute('''INSERT INTO canvas_transfer_requests(id,workspace_id,canvas_id,generation,member_id,
            login_session_id,member_auth_version,edit_session_id,token_hash,expires_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,LEAST(clock_timestamp()+interval '120 seconds',%s)) RETURNING expires_at''',
            (identity, workspace, canvas_id, row['generation'], actor.member_id, actor.session_id, version, uuid.uuid4(), digest(token), row['expires_at'])).fetchone()
        return {'id': str(identity), 'generation': row['generation'], 'edit_token': token, 'expires_at': result['expires_at']}


def transfers(actor, canvas_id):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace, 'canvas.read')
        ensure(conn, workspace, 'read')
        canvas = canvas_row(conn, workspace, canvas_id, include_document=False)
        row = lease_row(conn, workspace, canvas_id)
        return transfer_snapshot(conn, actor, workspace, canvas, row)


def transfer_snapshot(conn, actor, workspace, canvas, row):
    canvas_id = canvas['id']
    is_holder = holder_active(conn, row) and (row['member_id'], row['login_session_id']) == (actor.member_id, actor.session_id)
    records = conn.execute('''SELECT t.id,t.generation,t.status,t.expires_at,t.member_id,m.display_name,m.avatar
        FROM canvas_transfer_requests t JOIN members m ON m.id=t.member_id WHERE t.workspace_id=%s AND t.canvas_id=%s
        AND ((t.member_id=%s AND t.login_session_id=%s) OR (%s AND t.generation=%s AND t.status='pending'))
        ORDER BY t.created_at DESC LIMIT 100''', (workspace, canvas_id, actor.member_id, actor.session_id, is_holder, row['generation'])).fetchall()
    for request in records:
        if request['status'] == 'pending' and (request['generation'] != row['generation'] or request['expires_at'] <= row['server_time'] or not holder_active(conn, row)):
            request['status'] = 'expired'
    return {'requests': records, 'lease': public(conn, row, actor, canvas['revision'])}


def resolve_transfer(actor, canvas_id, request_id, proof, *, approve, confirm=False):
    workspace = current_workspace()
    try:
        identity = uuid.UUID(request_id)
    except (ValueError, TypeError):
        az.fail('canvas_transfer_not_found', 404)
    with az.policy_transaction() as conn:
        canvas, row = validate(conn, actor, workspace, canvas_id, proof,
                               operation='write' if approve else 'observe', revision=approve)
        target = conn.execute('SELECT *,clock_timestamp() AS server_time FROM canvas_transfer_requests WHERE id=%s AND workspace_id=%s AND canvas_id=%s FOR UPDATE', (identity, workspace, canvas_id)).fetchone()
        if not target:
            az.fail('canvas_transfer_not_found', 404)
        if target['status'] != 'pending' or target['generation'] != row['generation'] or target['expires_at'] <= target['server_time']:
            az.fail('canvas_transfer_expired', 409)
        if approve:
            if not confirm:
                az.fail('canvas_transfer_confirmation_required', 409)
            recipient = az.Principal(target['member_id'], target['login_session_id'], 'workbench')
            authorize(conn, recipient, workspace)
            if az.active_member(conn, recipient)['auth_version'] != target['member_auth_version']:
                az.fail('canvas_transfer_recipient_changed', 409)
            save_release_snapshot(conn, canvas, row)
            previous = row['generation']
            row = conn.execute('''UPDATE canvas_edit_leases SET generation=generation+1,member_id=%s,login_session_id=%s,
                member_auth_version=%s,edit_session_id=%s,token_hash=%s,acquired_at=clock_timestamp(),renewed_at=clock_timestamp(),
                expires_at=clock_timestamp()+make_interval(secs=>%s),released_at=NULL WHERE workspace_id=%s AND canvas_id=%s
                RETURNING *,clock_timestamp() AS server_time''',
                (target['member_id'], target['login_session_id'], target['member_auth_version'], target['edit_session_id'], target['token_hash'], ttl(), workspace, canvas_id)).fetchone()
            event(conn, actor, row, 'transfer.approve', previous, canvas['revision'])
        else:
            event(conn, actor, row, 'transfer.reject', row['generation'], canvas['revision'])
        conn.execute('UPDATE canvas_transfer_requests SET status=%s,resolved_at=clock_timestamp() WHERE id=%s', ('approved' if approve else 'rejected', identity))
        return {'status': 'approved' if approve else 'rejected', 'lease': public(conn, row, actor, canvas['revision'])}


def revoke_for_maintenance(conn, actor, workspace, mode):
    # Caller holds the exclusive policy lock, excluding acquisition and saves.
    rows = conn.execute('''UPDATE canvas_edit_leases SET released_at=clock_timestamp(),expires_at=clock_timestamp()
        WHERE released_at IS NULL AND token_hash IS NOT NULL AND (%s::text IS NULL OR workspace_id=%s)
        RETURNING *''', (workspace, workspace)).fetchall()
    for row in rows:
        revision = conn.execute('SELECT revision FROM canvases WHERE workspace_id=%s AND id=%s', (row['workspace_id'], row['canvas_id'])).fetchone()['revision']
        event(conn, actor, row, 'maintenance.revoke', row['generation'], revision, mode)
