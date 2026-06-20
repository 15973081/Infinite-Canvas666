"""Global mutable state — queues, locks, WebSocket manager, sessions.

Extracted from main.py — Phase 1 physical split, no behavior changes.

All modules import these as module-level singletons (Python module cache ensures
a single instance across the entire process).
"""
import json
import uuid
from threading import Lock
from typing import List, Dict

from fastapi import WebSocket, WebSocketDisconnect

from app.config import COMFYUI_INSTANCES
from app.utils import now_ms


# ── WebSocket Connection Manager ──

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}
        self.connection_clients: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_clients[websocket] = client_id or f"anon-{id(websocket)}"
        if client_id:
            self.user_connections[client_id] = websocket
        print(f"WS Connected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
        await self.broadcast_count()

    async def disconnect(self, websocket: WebSocket, client_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.connection_clients.pop(websocket, None)
        if client_id and self.user_connections.get(client_id) is websocket:
            del self.user_connections[client_id]
        print(f"WS Disconnected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
        await self.broadcast_count()

    def online_count(self):
        visible_clients = {
            client_id for client_id in self.connection_clients.values()
            if client_id and not str(client_id).startswith("canvas_")
        }
        return len(visible_clients)

    async def broadcast_count(self):
        count = self.online_count()
        data = json.dumps({"type": "stats", "online_count": count})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast error: {e}")
                self.active_connections.remove(connection)

    async def broadcast_new_image(self, image_data: dict):
        data = json.dumps({"type": "new_image", "data": image_data})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast image error: {e}")
                self.active_connections.remove(connection)

    async def broadcast_canvas_updated(self, canvas_id: str, updated_at: int, client_id: str = ""):
        data = json.dumps({
            "type": "canvas_updated",
            "canvas_id": canvas_id,
            "updated_at": updated_at,
            "client_id": client_id or "",
        })
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast canvas error: {e}")
                self.active_connections.remove(connection)

    async def broadcast_asset_library_updated(self, updated_at: int = 0):
        data = json.dumps({
            "type": "asset_library_updated",
            "updated_at": updated_at or now_ms(),
        })
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast asset library error: {e}")
                self.active_connections.remove(connection)

    async def send_personal_message(self, message: dict, client_id: str):
        ws = self.user_connections.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                print(f"Personal message error for {client_id}: {e}")


# ── Singleton instances ──

manager = ConnectionManager()
GLOBAL_LOOP = None


# ── Task queue ──

QUEUE: list = []
QUEUE_LOCK = Lock()


# ── Locks ──

HISTORY_LOCK = Lock()
GLOBAL_CONFIG_LOCK = Lock()
CONVERSATION_LOCK = Lock()
CANVAS_LOCK = Lock()
CANVAS_FOLDERS_LOCK = Lock()
LOAD_LOCK = Lock()
RUNNINGHUB_WORKFLOW_LOCK = Lock()
UPDATE_LOCK = Lock()

NEXT_TASK_ID = 1

SHARED_FOLDERS_LOCK = Lock()

CLIENT_ID = str(uuid.uuid4())


# ── Jimeng CLI session ──

JIMENG_LOGIN_SESSION = {
    "proc": None,
    "stdout": "",
    "stderr": "",
    "started_at": 0.0,
}


# ── ComfyUI backend load tracking ──

BACKEND_LOCAL_LOAD = {addr: 0 for addr in COMFYUI_INSTANCES}


# ── Canvas task tracking ──

CANVAS_TASKS: Dict[str, Dict[str, any]] = {}
CANVAS_TASK_LOCK = Lock()


__all__ = [
    "ConnectionManager",
    "manager",
    "GLOBAL_LOOP",
    "QUEUE", "QUEUE_LOCK",
    "HISTORY_LOCK", "GLOBAL_CONFIG_LOCK", "CONVERSATION_LOCK",
    "CANVAS_LOCK", "CANVAS_FOLDERS_LOCK", "LOAD_LOCK",
    "RUNNINGHUB_WORKFLOW_LOCK", "UPDATE_LOCK",
    "NEXT_TASK_ID",
    "JIMENG_LOGIN_SESSION",
    "BACKEND_LOCAL_LOAD",
    "CANVAS_TASKS", "CANVAS_TASK_LOCK",
    "SHARED_FOLDERS_LOCK",
    "CLIENT_ID",
]
