"""Database-backed workspace presence. Presence never grants editing rights."""
import asyncio
import json
import logging
import uuid

import anyio

from fastapi import HTTPException, WebSocketDisconnect
from app.services import authorization as az
from app.storage.database import connection
from app.storage.workspace import current_workspace

STALE_SECONDS = 35


def roster(conn, actor, workspace, canvas_id=None):
    # Page reports cover both canvas types, including standalone pages. Socket
    # rows cover the workbench shell; UNION deduplicates tabs and devices.
    # Recheck every subject's current grants, not only the requesting member.
    rows = conn.execute('''WITH candidates AS (
        SELECT member_id,login_session_id,member_auth_version FROM canvas_page_reports
        WHERE workspace_id=%s AND NOT closed AND seen_at>statement_timestamp()-make_interval(secs=>%s)
          AND (%s::text IS NULL OR canvas_id=%s)
        UNION
        SELECT member_id,login_session_id,member_auth_version FROM member_presence_sockets
        WHERE workspace_id=%s AND seen_at>statement_timestamp()-make_interval(secs=>%s) AND %s::text IS NULL
    ) SELECT DISTINCT m.id,m.display_name,m.avatar FROM candidates p
        JOIN members m ON m.id=p.member_id AND m.status='active' AND m.auth_version=p.member_auth_version
        JOIN member_sessions s ON s.id=p.login_session_id AND s.member_id=m.id AND s.audience='workbench'
          AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
        JOIN workspace_members wm ON wm.member_id=m.id AND wm.workspace_id=%s
        WHERE EXISTS(SELECT 1 FROM workspace_member_roles g JOIN roles r ON r.id=g.role_id AND r.active
            JOIN role_permissions rp ON rp.role_id=r.id AND rp.permission_id='canvas.read'
            WHERE g.workspace_id=%s AND g.member_id=m.id)
        ORDER BY m.display_name,m.id''',
        (workspace, STALE_SECONDS, canvas_id, canvas_id, workspace, STALE_SECONDS, canvas_id, workspace, workspace)).fetchall()
    from app.services.canvas_leases import holder_authorized
    leases = conn.execute('''SELECT DISTINCT workspace_id,member_id,login_session_id,member_auth_version
        FROM canvas_edit_leases WHERE workspace_id=%s AND (%s::text IS NULL OR canvas_id=%s)
          AND token_hash IS NOT NULL AND released_at IS NULL AND expires_at>statement_timestamp()''',
        (workspace, canvas_id, canvas_id)).fetchall()
    online = {row['id'] for row in rows}
    editors = {row['member_id'] for row in leases if row['member_id'] in online and holder_authorized(conn, row)}
    return {'members': [{**row, 'is_self': row['id'] == actor.member_id,
                         'activity': 'editing' if row['id'] in editors else 'viewing'} for row in rows],
            'online_members': len(rows), 'stale_after_seconds': STALE_SECONDS,
            'server_time': conn.execute('SELECT clock_timestamp() AS value').fetchone()['value'].isoformat()}


def status(actor, socket_id=None):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        if actor.audience != 'workbench':
            az.fail('workbench_session_required')
        member = az.require(conn, actor, 'canvas.read', workspace)
        if socket_id is not None:
            # The ID is minted by serve(), never accepted from a client.
            conn.execute('''INSERT INTO member_presence_sockets(id,workspace_id,member_id,login_session_id,member_auth_version)
                VALUES(%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET seen_at=clock_timestamp(),member_auth_version=excluded.member_auth_version
                WHERE member_presence_sockets.workspace_id=excluded.workspace_id
                  AND member_presence_sockets.member_id=excluded.member_id
                  AND member_presence_sockets.login_session_id=excluded.login_session_id''',
                (socket_id, workspace, actor.member_id, actor.session_id, member['auth_version']))
            # Ephemeral sockets have no diagnostic/history value; keep their
            # storage bounded after process crashes. Page reports are retained.
            conn.execute("DELETE FROM member_presence_sockets WHERE seen_at<statement_timestamp()-interval '1 day'")
        presence = roster(conn, actor, workspace)
        allowed = az.effective_permissions(conn, actor.member_id, workspace)
        from app.services.maintenance_control import effective
        state = effective(conn, workspace)
        tasks = {}
        if 'task.read' in allowed and state['mode'] not in {'offline', 'recovering'}:
            tasks = {r['status']: r['count'] for r in conn.execute(
                "SELECT status,count(*) AS count FROM tasks WHERE workspace_id=%s GROUP BY status", (workspace,))}
    return {'type': 'stats', 'workspace_id': workspace, 'member': {'id': member['id'], 'display_name': member['display_name'], 'avatar': member['avatar']},
            'online_members': presence['online_members'], 'presence': presence,
            'task_counts': tasks, 'maintenance': {key: (value.isoformat() if hasattr(value, 'isoformat') else value)
                for key, value in state.items() if key in {'mode', 'message', 'planned_at', 'drain_deadline', 'server_time', 'versions'}}, 'admin_allowed': False}


def disconnect(actor, workspace, socket_id):
    with connection() as conn:
        conn.execute('DELETE FROM member_presence_sockets WHERE id=%s AND workspace_id=%s AND member_id=%s AND login_session_id=%s',
                     (socket_id, workspace, actor.member_id, actor.session_id))


def queue(actor):
    workspace = current_workspace()
    with connection() as conn:
        az.require(conn, actor, 'task.read', workspace)
        rows = conn.execute("SELECT requested_by FROM tasks WHERE workspace_id=%s AND status='queued' ORDER BY created_at,id", (workspace,)).fetchall()
    positions = [i + 1 for i, row in enumerate(rows) if row['requested_by'] == actor.member_id]
    return {'total': len(rows), 'position': positions[0] if positions else 0}


async def serve(websocket):
    actor = websocket.scope['member_principal']
    key, workspace = uuid.uuid4(), current_workspace()
    await websocket.accept()
    try:
        while True:
            snapshot = await anyio.to_thread.run_sync(status, actor, key)
            await websocket.send_json(snapshot)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5)
                if data == 'ping':
                    await anyio.to_thread.run_sync(status, actor, key)
                    await websocket.send_text(json.dumps({'type': 'pong'}))
            except asyncio.TimeoutError:
                pass
    except HTTPException:
        await websocket.close(code=1008)
    except WebSocketDisconnect:
        pass
    except Exception:
        logging.getLogger(__name__).warning('Presence stream unavailable')
        await websocket.close(code=1011)
    finally:
        try:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(disconnect, actor, workspace, key)
        except Exception:
            # Database outages fall back to expiry; never release canvas leases.
            logging.getLogger(__name__).warning('Presence disconnect cleanup deferred to expiry')
