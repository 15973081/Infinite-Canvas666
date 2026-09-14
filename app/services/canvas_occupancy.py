"""Management observation and explicit revocation of one canvas editing lease."""
from app.services import authorization as az, canvas_leases as leases


def authorize(conn, actor, workspace):
    if actor.audience != 'management':
        az.fail('management_session_required')
    if not workspace:
        az.fail('workspace_required', 400)
    az.require(conn, actor, 'canvas.read', workspace)
    az.require(conn, actor, 'canvas.lock.takeover', workspace)


def public(conn, row):
    if row['released_at'] or not row['token_hash']:
        state = 'released'
    elif row['expires_at'] <= row['server_time']:
        state = 'expired'
    elif not leases.holder_authorized(conn, row):
        state = 'invalid'
    else:
        state = 'active'
    return {'canvas_id': row['canvas_id'], 'title': row['title'], 'kind': row['kind'],
            'trashed': row['trashed'], 'generation': row['generation'], 'revision': row['revision'],
            'state': state, 'holder': {'id': row['member_id'], 'display_name': row['display_name']} if state == 'active' else None,
            'acquired_at': row['acquired_at'], 'expires_at': row['expires_at'], 'server_time': row['server_time']}


def listing(actor, workspace, after='', limit=50):
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace)
        rows = conn.execute('''SELECT l.*,c.revision,c.title,c.kind,(c.deleted_at IS NOT NULL) AS trashed,
            m.display_name,statement_timestamp() AS server_time
            FROM canvas_edit_leases l JOIN canvases c ON c.workspace_id=l.workspace_id AND c.id=l.canvas_id
            LEFT JOIN members m ON m.id=l.member_id
            WHERE l.workspace_id=%s AND l.canvas_id>%s AND l.generation>0
            AND COALESCE(c.document->>'purged_at','0') IN ('0','') ORDER BY l.canvas_id LIMIT %s''',
            (workspace, after, limit+1)).fetchall()
        return {'canvases': [public(conn, row) for row in rows[:limit]],
                'next': rows[limit-1]['canvas_id'] if len(rows)>limit else None}


def revoke(actor, workspace, canvas_id, *, expected_generation, expected_revision, confirm, reason):
    if not confirm or not isinstance(reason, str) or not reason.strip() or len(reason)>1000:
        az.fail('canvas_occupancy_confirmation_required', 400)
    with az.policy_transaction() as conn:
        authorize(conn, actor, workspace)
        canvas = leases.canvas_row(conn, workspace, canvas_id)
        row = conn.execute('''SELECT *,clock_timestamp() AS server_time FROM canvas_edit_leases
            WHERE workspace_id=%s AND canvas_id=%s FOR UPDATE''', (workspace, canvas_id)).fetchone()
        if (not row or row['generation'] != expected_generation or canvas['revision'] != expected_revision
                or not leases.holder_active(conn, row)):
            az.fail('canvas_occupancy_changed', 409)
        previous = row['generation']
        updated = conn.execute('''UPDATE canvas_edit_leases SET generation=generation+1,
            released_at=clock_timestamp(),expires_at=clock_timestamp()
            WHERE workspace_id=%s AND canvas_id=%s RETURNING *''', (workspace, canvas_id)).fetchone()
        leases.event(conn, actor, updated, 'management.revoke', previous, canvas['revision'], reason.strip())
        az.audit(conn, actor, 'canvas.occupancy.revoke', canvas_id, workspace,
                 {'previous_generation': previous, 'generation': updated['generation'], 'revision': canvas['revision'],
                  'previous_member_id': row['member_id'], 'reason': reason.strip()})
        # Never create a "saved and released" snapshot, grant a replacement
        # editing token, mutate the document, or discard a browser draft.
        return {'revoked': True, 'canvas_id': canvas_id, 'generation': updated['generation'], 'revision': canvas['revision']}
