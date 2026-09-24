"""Durable storage for canvas generation tasks.

The in-memory ``CANVAS_TASKS`` mapping remains a hot cache for the current
process.  This module is the restart-safe source of truth for long-running
canvas tasks, especially video jobs that outlive a backend restart.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from threading import Lock
from typing import Any, Dict, Iterable, List, Optional

from app.config import DATA_DIR
from app.storage.settings import postgres_enabled


ACTIVE_CANVAS_TASK_STATUSES = {"queued", "submitting", "running", "polling", "finalizing"}
TERMINAL_CANVAS_TASK_STATUSES = {"succeeded", "failed", "cancelled"}

_DB_LOCK = Lock()
_INITIALIZED_PATHS: set[str] = set()


def canvas_task_db_path() -> str:
    override = str(os.getenv("CANVAS_TASK_DB_PATH") or "").strip()
    return os.path.abspath(override or os.path.join(DATA_DIR, "canvas_tasks.sqlite3"))


@contextmanager
def _connect():
    path = canvas_task_db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        with conn:
            yield conn
    finally:
        conn.close()


def init_canvas_task_store() -> str:
    if postgres_enabled():
        from app.storage.database import check
        check()
        return 'postgres'
    path = canvas_task_db_path()
    with _DB_LOCK:
        if path in _INITIALIZED_PATHS and os.path.exists(path):
            return path
        with _connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS canvas_tasks (
                    id TEXT PRIMARY KEY,
                    task_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    task_json TEXT NOT NULL,
                    request_json TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_canvas_tasks_status_updated "
                "ON canvas_tasks(status, updated_at)"
            )
            if "canvas_id" not in {row[1] for row in conn.execute("PRAGMA table_info(canvas_tasks)")}:
                conn.execute("ALTER TABLE canvas_tasks ADD COLUMN canvas_id TEXT NOT NULL DEFAULT ''")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_canvas_tasks_canvas ON canvas_tasks(canvas_id, updated_at)")
        _INITIALIZED_PATHS.add(path)
    return path


def _loads(value: str, fallback: Any) -> Any:
    try:
        parsed = json.loads(value or "")
        return parsed
    except Exception:
        return fallback


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _row_task(row: sqlite3.Row | None) -> Dict[str, Any]:
    if row is None:
        return {}
    task = _loads(row["task_json"], {})
    if not isinstance(task, dict):
        task = {}
    task.setdefault("id", row["id"])
    task.setdefault("type", row["task_type"])
    task.setdefault("status", row["status"])
    task.setdefault("created_at", row["created_at"])
    task.setdefault("updated_at", row["updated_at"])
    return task


def save_canvas_task(task: Dict[str, Any], request_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if postgres_enabled():
        from app.storage.tasks import save
        from app.storage.database import connection
        from app.services.canvas_ledger import record_task
        with connection() as conn:
            if task.get('status') == 'succeeded':
                from app.storage.workspace import current_workspace
                # Match interactive joins/admission: canvas before task. Taking
                # the task lock first can deadlock a simultaneous manual join.
                target = conn.execute('SELECT canvas_id FROM tasks WHERE workspace_id=%s AND id=%s',
                                      (current_workspace(), task['id'])).fetchone()
                if target and target['canvas_id']:
                    conn.execute('SELECT id FROM canvases WHERE workspace_id=%s AND id=%s FOR UPDATE',
                                 (current_workspace(), target['canvas_id'])).fetchone()
            stored = save(task, request_payload)
            record_task(stored)
            if stored.get('status') == 'succeeded':
                from app.services.canvas_task_results import deliver_completed
                deliver_completed(conn, stored['id'])
            if stored.get("status") == "succeeded" and stored.get("type") == "online-image":
                from app.storage.documents import put
                put("history", "task:" + stored["id"], stored["result"])
        return stored
    task_id = str(task.get("id") or "").strip()
    if not task_id:
        raise ValueError("canvas task id is required")
    init_canvas_task_store()
    now = time.time()
    stored = dict(task)
    stored["id"] = task_id
    stored["type"] = str(stored.get("type") or "unknown")
    stored["status"] = str(stored.get("status") or "queued")
    stored["created_at"] = float(stored.get("created_at") or now)
    stored["updated_at"] = float(stored.get("updated_at") or now)
    with _DB_LOCK, _connect() as conn:
        existing = conn.execute(
            "SELECT request_json FROM canvas_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if request_payload is None:
            request_json = existing["request_json"] if existing else "{}"
        else:
            request_json = _dumps(request_payload)
        conn.execute(
            """
            INSERT INTO canvas_tasks(id, task_type, status, task_json, request_json, created_at, updated_at, canvas_id)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                task_type=excluded.task_type,
                status=excluded.status,
                task_json=excluded.task_json,
                request_json=excluded.request_json,
                created_at=excluded.created_at,
                updated_at=excluded.updated_at,
                canvas_id=excluded.canvas_id
            """,
            (
                task_id,
                stored["type"],
                stored["status"],
                _dumps(stored),
                request_json,
                stored["created_at"],
                stored["updated_at"],
                stored.get("canvas_id") or "",
            ),
        )
    _record_ledger(stored)
    return stored


def _record_ledger(task):
    try:
        from app.services.canvas_ledger import record_task
        record_task(task)
    except Exception:
        logging.exception("Canvas ledger write failed; retained durable task %s for reconciliation", task.get("id"))


def get_canvas_task(task_id: str) -> Dict[str, Any]:
    if postgres_enabled():
        from app.storage.tasks import get
        return get(task_id)
    init_canvas_task_store()
    with _DB_LOCK, _connect() as conn:
        row = conn.execute("SELECT * FROM canvas_tasks WHERE id = ?", (str(task_id),)).fetchone()
    return _row_task(row)


def get_canvas_task_request(task_id: str) -> Dict[str, Any]:
    if postgres_enabled():
        from app.storage.tasks import request
        return request(task_id)
    init_canvas_task_store()
    with _DB_LOCK, _connect() as conn:
        row = conn.execute("SELECT request_json FROM canvas_tasks WHERE id = ?", (str(task_id),)).fetchone()
    value = _loads(row["request_json"], {}) if row else {}
    return value if isinstance(value, dict) else {}


def update_canvas_task(task_id: str, **changes: Any) -> Dict[str, Any]:
    if postgres_enabled():
        from app.storage.tasks import get
        task = get(task_id)
        if not task:
            return {}
        task.update(changes)
        task['updated_at'] = float(changes.get('updated_at') or time.time())
        return save_canvas_task(task)
    init_canvas_task_store()
    with _DB_LOCK, _connect() as conn:
        row = conn.execute("SELECT * FROM canvas_tasks WHERE id = ?", (str(task_id),)).fetchone()
        task = _row_task(row)
        if not task:
            return {}
        task.update(changes)
        task["updated_at"] = float(changes.get("updated_at") or time.time())
        conn.execute(
            "UPDATE canvas_tasks SET task_type=?, status=?, task_json=?, updated_at=?, canvas_id=? WHERE id=?",
            (
                str(task.get("type") or "unknown"),
                str(task.get("status") or "queued"),
                _dumps(task),
                task["updated_at"],
                task.get("canvas_id") or "",
                str(task_id),
            ),
        )
    _record_ledger(task)
    return task


def list_canvas_tasks(
    statuses: Optional[Iterable[str]] = None,
    task_type: str = "",
    canvas_id: str = "",
) -> List[Dict[str, Any]]:
    if postgres_enabled():
        from app.storage.tasks import list_tasks
        return list_tasks(statuses, task_type, canvas_id)
    init_canvas_task_store()
    clauses: List[str] = []
    args: List[Any] = []
    status_values = [str(value) for value in (statuses or []) if str(value)]
    if status_values:
        clauses.append(f"status IN ({','.join('?' for _ in status_values)})")
        args.extend(status_values)
    if task_type:
        clauses.append("task_type = ?")
        args.append(str(task_type))
    if canvas_id:
        clauses.append("canvas_id = ?")
        args.append(canvas_id)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM canvas_tasks{where} ORDER BY created_at ASC", args
        ).fetchall()
    return [_row_task(row) for row in rows]


def active_durable_canvas_tasks() -> List[Dict[str, Any]]:
    return list_canvas_tasks(statuses=ACTIVE_CANVAS_TASK_STATUSES)
