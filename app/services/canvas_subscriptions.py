"""Scoped database state notifications. A notification never grants a lease."""
import hashlib
import json
import logging
import time

import anyio
from fastapi import HTTPException, WebSocketDisconnect

from app.services import authorization as az, canvas_leases, maintenance_control
from app.storage.workspace import current_workspace

POLL_SECONDS = 1
HEARTBEAT_SECONDS = 10


def snapshot(actor, canvas_id):
    workspace = current_workspace()
    with az.policy_transaction() as conn:
        canvas_leases.authorize(conn, actor, workspace, 'canvas.read')
        canvas = canvas_leases.canvas_row(conn, workspace, canvas_id, include_document=False)
        state = maintenance_control.effective(conn, workspace)
        mode = state['mode']
        # Observation stays available through maintenance, without streaming
        # documents or private transfer records to the browser.
        detail = {'maintenance': {'mode': mode, 'versions': state['versions']}}
        row = canvas_leases.lease_row(conn, workspace, canvas_id)
        if mode not in {'offline', 'recovering'}:
            detail['collaboration'] = canvas_leases.transfer_snapshot(conn, actor, workspace, canvas, row)
            detail['collaboration']['lease'].pop('server_time', None)
            # Renewals extend a private deadline; they do not change public
            # collaboration state. Expiry is still reflected by holder/state.
            detail['collaboration']['lease'].pop('expires_at', None)
        encoded = json.dumps(detail, sort_keys=True, default=str, ensure_ascii=False).encode()
        return {'type': 'canvas_state', 'workspace_id': workspace, 'canvas_id': canvas_id,
                'revision': canvas['revision'], 'generation': row['generation'],
                'maintenance': detail['maintenance'], 'stamp': hashlib.sha256(encoded).hexdigest()}


async def serve(websocket, canvas_id):
    actor = websocket.scope.get('member_principal')
    if actor is None:
        await websocket.close(code=1008)
        return
    try:
        initial = await anyio.to_thread.run_sync(snapshot, actor, canvas_id)
    except HTTPException:
        await websocket.close(code=1008)
        return
    except Exception:
        await websocket.close(code=1011)
        return
    await websocket.accept()
    async with anyio.create_task_group() as group:
        async def publish():
            value, previous, sent_at, sequence = initial, None, 0, 0
            try:
                while True:
                    marker = (value['revision'], value['generation'], value['stamp'])
                    if marker != previous or time.monotonic()-sent_at >= HEARTBEAT_SECONDS:
                        sequence += 1
                        await websocket.send_json({**value, 'sequence': sequence})
                        previous, sent_at = marker, time.monotonic()
                    await anyio.sleep(POLL_SECONDS)
                    value = await anyio.to_thread.run_sync(snapshot, actor, canvas_id)
            except HTTPException:
                await websocket.close(code=1008)
            except (WebSocketDisconnect, RuntimeError):
                pass
            except Exception:
                logging.getLogger(__name__).warning('Canvas subscription unavailable')
                await websocket.close(code=1011)
            finally:
                group.cancel_scope.cancel()
        group.start_soon(publish)
        try:
            # Messages cannot change the subscription or supply trusted identity.
            # Keep receiving so disconnects cancel the publisher immediately.
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            group.cancel_scope.cancel()
