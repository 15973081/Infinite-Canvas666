"""Permission-filtered management overview; aggregates never return resource bodies."""
from fastapi import HTTPException
from app.services import authorization as az, maintenance_control
from app.management import queries


def _allowed(conn, actor, permission, workspace=None):
    try:
        az.require(conn, actor, permission, workspace)
        return True
    except HTTPException as error:
        if error.status_code != 403:
            raise
        return False


def overview(actor, workspace=None):
    if actor.audience != 'management':
        az.fail('management_session_required')
    with az.policy_transaction() as conn:
        identity = queries.snapshot(actor)
        selected = None
        if workspace is not None:
            selected = next((row for row in identity['workspaces'] if row['id'] == workspace), None)
            if selected is None:
                az.fail('workspace_forbidden')
        elif not identity['permissions']:
            az.fail('permission_denied')
        result = {'workspace': None if selected is None else {k: selected[k] for k in ('id', 'name', 'status')},
                  'observed_at': conn.execute('SELECT clock_timestamp() AS now').fetchone()['now'],
                  'manageable_spaces': len(identity['workspaces']),
                  **{key: None for key in ('members', 'canvases', 'assets', 'tasks', 'maintenance', 'services', 'backup')}}
        if selected and selected['status'] != 'active':
            return result
        if workspace is None:
            if _allowed(conn, actor, 'member.manage'):
                result['members'] = conn.execute("""SELECT count(*) AS total,
                    count(*) FILTER(WHERE status='active') AS active,
                    count(*) FILTER(WHERE status='invited') AS invited,
                    count(*) FILTER(WHERE status='disabled') AS disabled FROM members""").fetchone()
        else:
            if _allowed(conn, actor, 'space.members.manage', workspace) or _allowed(conn, actor, 'space.assign'):
                result['members'] = conn.execute("""SELECT count(*) AS total,
                    count(*) FILTER(WHERE m.status='active') AS active,
                    count(*) FILTER(WHERE m.status='invited') AS invited,
                    count(*) FILTER(WHERE m.status='disabled') AS disabled
                    FROM workspace_members w JOIN members m ON m.id=w.member_id WHERE w.workspace_id=%s""", (workspace,)).fetchone()
            if _allowed(conn, actor, 'canvas.read', workspace):
                result['canvases'] = conn.execute("""SELECT
                    count(*) FILTER(WHERE deleted_at IS NULL) AS total,
                    count(*) FILTER(WHERE deleted_at IS NULL AND kind='classic') AS classic,
                    count(*) FILTER(WHERE deleted_at IS NULL AND kind='smart') AS smart,
                    count(*) FILTER(WHERE deleted_at IS NOT NULL) AS recycled
                    FROM canvases WHERE workspace_id=%s""", (workspace,)).fetchone()
            if _allowed(conn, actor, 'asset.read', workspace):
                values = conn.execute("""SELECT count(*) FILTER(WHERE role<>'preview') AS originals,
                    count(*) FILTER(WHERE role='preview') AS previews, coalesce(sum(size_bytes),0) AS ready_bytes
                    FROM assets WHERE workspace_id=%s AND status='ready' AND deleted_at IS NULL
                    AND role<>'task-result-source'""", (workspace,)).fetchone()
                # Preserve exact large byte totals when decoded by JavaScript.
                result['assets'] = {**values, 'ready_bytes': str(values['ready_bytes'])}
            if _allowed(conn, actor, 'task.review', workspace):
                rows = conn.execute('SELECT status,count(*) AS count FROM tasks WHERE workspace_id=%s GROUP BY status', (workspace,)).fetchall()
                counts = {row['status']: row['count'] for row in rows}
                result['tasks'] = {'total': sum(counts.values()), 'by_status': counts,
                                   'active': sum(counts.get(s, 0) for s in ('running', 'submitting', 'polling', 'finalizing')),
                                   'queued': counts.get('queued', 0), 'needs_review': counts.get('needs_review', 0)}
        if _allowed(conn, actor, 'maintenance.space' if workspace else 'maintenance.platform', workspace):
            state = maintenance_control.effective(conn, workspace)
            result['maintenance'] = {k: state[k] for k in ('mode', 'message', 'planned_at', 'drain_deadline')}
            result['services'] = conn.execute("""SELECT kind,
                count(*) FILTER(WHERE stopped_at IS NULL AND seen_at>statement_timestamp()-interval '35 seconds') AS online,
                count(*) FILTER(WHERE stopped_at IS NULL AND seen_at<=statement_timestamp()-interval '35 seconds') AS unknown,
                count(*) FILTER(WHERE stopped_at IS NOT NULL) AS stopped, max(seen_at) AS last_seen
                FROM service_heartbeats GROUP BY kind ORDER BY kind""").fetchall()
        if _allowed(conn, actor, 'backup.read' if workspace else 'backup.platform', workspace):
            counts = conn.execute("""SELECT count(*) AS total,
                count(*) FILTER(WHERE status IN ('queued','running')) AS pending
                FROM backup_jobs WHERE workspace_id IS NOT DISTINCT FROM %s""", (workspace,)).fetchone()
            latest = conn.execute("""SELECT id,kind,status,created_at,completed_at FROM backup_jobs
                WHERE workspace_id IS NOT DISTINCT FROM %s ORDER BY created_at DESC,id DESC LIMIT 1""", (workspace,)).fetchone()
            result['backup'] = {**counts, 'latest': latest}
        return result
