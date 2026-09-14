"""Workspace-only status stream; never subscribes to the legacy global hub."""
import asyncio
import json
import uuid

from fastapi import HTTPException, WebSocketDisconnect
from app.services import authorization as az
from app.storage.database import connection
from app.storage.workspace import current_workspace

_connections = {}


def status(actor):
    workspace = current_workspace()
    with connection() as conn:
        member = az.require(conn, actor, 'canvas.read', workspace)
        allowed = az.effective_permissions(conn, actor.member_id, workspace)
        from app.services.maintenance_control import effective
        state = effective(conn, workspace)
        tasks = {}
        if 'task.read' in allowed and state['mode'] not in {'offline', 'recovering'}:
            tasks = {r['status']: r['count'] for r in conn.execute(
                "SELECT status,count(*) AS count FROM tasks WHERE workspace_id=%s GROUP BY status", (workspace,))}
    return {'type': 'stats', 'workspace_id': workspace, 'member': {'id': member['id'], 'display_name': member['display_name'], 'avatar': member['avatar']},
            'online_members': len({v[1] for v in _connections.copy().values() if v[0] == workspace}),
            'task_counts': tasks, 'maintenance': {key: (value.isoformat() if hasattr(value, 'isoformat') else value)
                for key, value in state.items() if key in {'mode', 'message', 'planned_at', 'drain_deadline', 'server_time', 'versions'}}, 'admin_allowed': False}


def queue(actor):
    workspace = current_workspace()
    with connection() as conn:
        az.require(conn, actor, 'task.read', workspace)
        rows = conn.execute("SELECT requested_by FROM tasks WHERE workspace_id=%s AND status='queued' ORDER BY created_at,id", (workspace,)).fetchall()
    positions = [i + 1 for i, row in enumerate(rows) if row['requested_by'] == actor.member_id]
    return {'total': len(rows), 'position': positions[0] if positions else 0}


async def serve(websocket):
    actor = websocket.scope['member_principal']
    key = uuid.uuid4().hex
    await websocket.accept()
    _connections[key] = (current_workspace(), actor.member_id)
    try:
        while True:
            snapshot = await asyncio.to_thread(status, actor)
            await websocket.send_json(snapshot)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5)
                if data == 'ping':
                    # Revalidate before replying, rather than trusting an old socket.
                    await asyncio.to_thread(status, actor)
                    await websocket.send_text(json.dumps({'type': 'pong'}))
            except asyncio.TimeoutError:
                pass
    except HTTPException:
        await websocket.close(code=1008)
    except WebSocketDisconnect:
        pass
    finally:
        _connections.pop(key, None)
