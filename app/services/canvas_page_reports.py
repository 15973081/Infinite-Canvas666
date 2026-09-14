"""Member page diagnostics; never authorize writes or infer unreported drafts."""
from app.services import authorization as az
from app.storage.workspace import current_workspace


def report(actor, canvas_id, page_id, sequence, dirty, closed=False):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        if actor.audience != 'workbench':
            az.fail('workbench_session_required')
        member = az.require(conn, actor, 'canvas.read', workspace)
        # Telemetry remains available during maintenance. It cannot alter the
        # canvas, revive an expired lease, or acknowledge a document revision.
        if not conn.execute('SELECT 1 FROM canvases WHERE workspace_id=%s AND id=%s', (workspace, canvas_id)).fetchone():
            az.fail('canvas_not_found', 404)
        row = conn.execute('''INSERT INTO canvas_page_reports(workspace_id,canvas_id,member_id,login_session_id,
            page_id,sequence,member_auth_version,dirty,closed) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(workspace_id,canvas_id,member_id,login_session_id,page_id) DO UPDATE SET
            sequence=excluded.sequence,member_auth_version=excluded.member_auth_version,dirty=excluded.dirty,
            closed=excluded.closed,seen_at=clock_timestamp()
            WHERE NOT canvas_page_reports.closed AND canvas_page_reports.sequence<excluded.sequence
            RETURNING sequence,closed''',
            (workspace, canvas_id, actor.member_id, actor.session_id, page_id, sequence, member['auth_version'], dirty, closed)).fetchone()
        return {'accepted': row is not None}


def counts(conn, workspace=None):
    # Revoked/expired identities become stale immediately, even before the
    # heartbeat deadline. Their last dirty report must not silently disappear.
    row = conn.execute('''WITH reports AS (
        SELECT p.dirty,p.closed,(NOT p.closed AND p.seen_at>statement_timestamp()-interval '35 seconds'
            AND m.status='active' AND m.auth_version=p.member_auth_version AND w.status='active'
            AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
            AND EXISTS(SELECT 1 FROM workspace_members g WHERE g.workspace_id=p.workspace_id AND g.member_id=p.member_id)) AS fresh
        FROM canvas_page_reports p JOIN members m ON m.id=p.member_id
        JOIN workspaces w ON w.id=p.workspace_id JOIN member_sessions s ON s.id=p.login_session_id
        WHERE (%s::text IS NULL OR p.workspace_id=%s) AND (NOT p.closed OR p.dirty))
        SELECT count(*) FILTER(WHERE fresh) AS online_pages,
            count(*) FILTER(WHERE fresh AND dirty) AS unsaved_pages,
            count(*) FILTER(WHERE NOT fresh AND NOT closed) AS stale_pages,
            count(*) FILTER(WHERE NOT fresh AND NOT closed AND dirty) AS stale_unsaved_pages,
            count(*) FILTER(WHERE closed AND dirty) AS closed_unsaved_pages FROM reports''', (workspace, workspace)).fetchone()
    return {**row, 'coverage': 'reported_pages_only', 'stale_after_seconds': 35}
