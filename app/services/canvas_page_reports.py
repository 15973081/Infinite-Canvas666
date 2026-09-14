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
        from app.services.member_presence import roster
        return {'accepted': row is not None, 'presence': roster(conn, actor, workspace, canvas_id)}


# Shared classification keeps management lists, counts and review eligibility
# consistent. The statement clock is read again after taking the report row lock.
REPORTS = """WITH reports AS (
    SELECT p.*,(NOT p.closed AND p.seen_at>statement_timestamp()-interval '35 seconds'
        AND m.status='active' AND m.auth_version=p.member_auth_version AND w.status='active'
        AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
        AND EXISTS(SELECT 1 FROM workspace_members g WHERE g.workspace_id=p.workspace_id AND g.member_id=p.member_id)) AS fresh,
        coalesce(p.reviewed_sequence=p.sequence,false) AS reviewed
    FROM canvas_page_reports p JOIN members m ON m.id=p.member_id
    JOIN workspaces w ON w.id=p.workspace_id JOIN member_sessions s ON s.id=p.login_session_id
    WHERE (%s::text IS NULL OR p.workspace_id=%s)) """


def counts(conn, workspace=None):
    # Raw diagnostics remain visible after review: an operator cannot save a
    # browser draft. Only the unresolved review counters change.
    row = conn.execute(REPORTS + '''SELECT count(*) FILTER(WHERE fresh) AS online_pages,
        count(*) FILTER(WHERE fresh AND dirty) AS unsaved_pages,
        count(*) FILTER(WHERE NOT fresh AND NOT closed) AS stale_pages,
        count(*) FILTER(WHERE NOT fresh AND NOT closed AND dirty) AS stale_unsaved_pages,
        count(*) FILTER(WHERE closed AND dirty) AS closed_unsaved_pages,
        count(*) FILTER(WHERE NOT fresh AND NOT reviewed) AS pending_review_pages,
        count(*) FILTER(WHERE NOT fresh AND reviewed) AS reviewed_pages
        FROM reports WHERE NOT closed OR dirty''', (workspace, workspace)).fetchone()
    return {**row, 'coverage': 'reported_pages_only', 'stale_after_seconds': 35}


def require_manager(conn, actor, workspace):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, 'maintenance.space' if workspace else 'maintenance.platform', workspace)


def review_list(actor, workspace=None, *, reviewed=False, after=None, limit=50):
    if not 1 <= limit <= 100:
        az.fail('invalid_page_report_limit', 400)
    with az.policy_transaction() as conn:
        require_manager(conn, actor, workspace)
        rows = conn.execute(REPORTS + '''SELECT p.id,p.workspace_id,w.name AS workspace_name,
            p.canvas_id,c.title AS canvas_title,p.member_id,m.display_name AS member_name,
            p.sequence,p.dirty,p.closed,p.seen_at,p.reviewed_sequence,p.reviewed_at,
            p.review_outcome,p.review_note,reviewer.display_name AS reviewer_name
            FROM reports p JOIN workspaces w ON w.id=p.workspace_id
            JOIN canvases c ON c.workspace_id=p.workspace_id AND c.id=p.canvas_id
            JOIN members m ON m.id=p.member_id LEFT JOIN members reviewer ON reviewer.id=p.reviewed_by
            WHERE NOT p.fresh AND (NOT p.closed OR p.dirty) AND p.reviewed=%s
            AND (%s::uuid IS NULL OR p.id>%s) ORDER BY p.id LIMIT %s''',
            (workspace, workspace, reviewed, after, after, limit + 1)).fetchall()
        return {'reports': rows[:limit], 'next': rows[limit - 1]['id'] if len(rows) > limit else None}


def review(actor, report_id, expected_sequence, outcome, note, workspace=None):
    if outcome not in {'member_confirmed_saved', 'draft_exported', 'member_discarded'} or not isinstance(note, str) or not note.strip() or len(note) > 1000:
        az.fail('invalid_page_report_review', 400)
    with az.policy_transaction() as conn:
        require_manager(conn, actor, workspace)
        row = conn.execute('''SELECT id FROM canvas_page_reports WHERE id=%s
            AND (%s::text IS NULL OR workspace_id=%s) FOR UPDATE''', (report_id, workspace, workspace)).fetchone()
        if not row:
            az.fail('page_report_not_found', 404)
        current = conn.execute(REPORTS + 'SELECT * FROM reports WHERE id=%s', (workspace, workspace, report_id)).fetchone()
        if current['sequence'] != expected_sequence or current['reviewed']:
            az.fail('page_report_changed', 409)
        if current['fresh'] or (current['closed'] and not current['dirty']):
            az.fail('page_report_not_reviewable', 409)
        conn.execute('''UPDATE canvas_page_reports SET reviewed_sequence=sequence,reviewed_by=%s,
            reviewed_at=clock_timestamp(),review_outcome=%s,review_note=%s WHERE id=%s''',
            (actor.member_id, outcome, note.strip(), report_id))
        az.audit(conn, actor, 'maintenance.page.review', str(report_id), current['workspace_id'],
                 {'sequence': expected_sequence, 'canvas_id': current['canvas_id'], 'member_id': current['member_id'],
                  'dirty': current['dirty'], 'closed': current['closed'], 'outcome': outcome, 'note': note.strip()})
        return {'id': report_id, 'reviewed_sequence': expected_sequence}
