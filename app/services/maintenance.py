"""Maintenance coordination for manual, operator-controlled deployments."""

from __future__ import annotations

import json
import os
import time
import uuid
from threading import Lock
from typing import Any, Dict

from fastapi import HTTPException

from app.config import DATA_DIR
from app.services.canvas_tasks import ACTIVE_CANVAS_TASK_STATUSES, active_durable_canvas_tasks
from app.services.static_pages import current_app_version
from app.state import (
    CANVAS_TASKS,
    CANVAS_TASK_LOCK,
    QUEUE,
    QUEUE_LOCK,
    canvas_task_maintenance,
    manager,
    set_canvas_task_maintenance,
)


BOOT_ID = uuid.uuid4().hex
MAINTENANCE_STATE_PATH = os.path.join(DATA_DIR, "maintenance_state.json")
_STATE_LOCK = Lock()
_TRANSIENT_LOCK = Lock()
_TRANSIENT_TASKS: Dict[str, Dict[str, Any]] = {}
_SERVICE_STARTED_AT = int(time.time() * 1000)
_LAST_RESTORED_AT = 0


def _default_state() -> Dict[str, Any]:
    return {
        "mode": "normal",
        "message": "",
        "planned_at": 0,
        "started_at": 0,
        "updated_at": int(time.time() * 1000),
    }


def _read_state() -> Dict[str, Any]:
    from app.storage.settings import postgres_enabled
    if postgres_enabled():
        from app.storage.documents import get
        return {**_default_state(), **(get("maintenance", default={}) or {})}
    try:
        with open(MAINTENANCE_STATE_PATH, "r", encoding="utf-8") as file:
            payload = json.load(file)
        if isinstance(payload, dict):
            state = _default_state()
            state.update(payload)
            return state
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"读取维护状态失败: {exc}")
    return _default_state()


def _write_state(state: Dict[str, Any]) -> None:
    from app.storage.settings import postgres_enabled
    if postgres_enabled():
        from app.storage.documents import put
        put("maintenance", "default", state)
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    temp_path = f"{MAINTENANCE_STATE_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8", newline="") as file:
        json.dump(state, file, ensure_ascii=False, indent=2)
    os.replace(temp_path, MAINTENANCE_STATE_PATH)


def mark_service_started() -> Dict[str, Any]:
    """Finish a persisted maintenance window after the new process is online."""
    global _LAST_RESTORED_AT
    with _STATE_LOCK:
        previous = _read_state()
        if previous.get("mode") == "draining":
            _LAST_RESTORED_AT = int(time.time() * 1000)
        state = _default_state()
        state["last_message"] = str(previous.get("message") or "")
        state["restored_at"] = _LAST_RESTORED_AT
        _write_state(state)
    set_canvas_task_maintenance(False)
    return state


def set_maintenance(message: str, planned_at: int = 0) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    clean_message = str(message or "").strip()[:300] or "服务即将维护，请保存当前工作并等待现有生成任务完成。"
    state = {
        "mode": "draining",
        "message": clean_message,
        "planned_at": max(0, int(planned_at or 0)),
        "started_at": now,
        "updated_at": now,
    }
    with _STATE_LOCK:
        _write_state(state)
    set_canvas_task_maintenance(True, clean_message)
    return state


def cancel_maintenance() -> Dict[str, Any]:
    state = _default_state()
    with _STATE_LOCK:
        _write_state(state)
    set_canvas_task_maintenance(False)
    return state


def maintenance_state() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _read_state()
    runtime = canvas_task_maintenance()
    if runtime.get("draining") and state.get("mode") != "draining":
        state.update({
            "mode": "draining",
            "message": runtime.get("reason") or state.get("message") or "服务正在维护",
            "started_at": runtime.get("started_at") or state.get("started_at") or 0,
        })
    state.update({
        "boot_id": BOOT_ID,
        "service_started_at": _SERVICE_STARTED_AT,
        "restored_at": int(state.get("restored_at") or _LAST_RESTORED_AT or 0),
        "version": current_app_version(),
    })
    return state


def ensure_generation_allowed() -> None:
    runtime = canvas_task_maintenance()
    if runtime.get("draining"):
        raise HTTPException(
            status_code=503,
            detail=runtime.get("reason") or "服务正在维护准备中，暂不接受新的生成任务",
            headers={"Retry-After": "30"},
        )


def begin_transient_generation(task_type: str, path: str) -> str:
    ensure_generation_allowed()
    task_id = f"request:{uuid.uuid4().hex}"
    now = time.time()
    with _TRANSIENT_LOCK:
        _TRANSIENT_TASKS[task_id] = {
            "id": task_id,
            "type": str(task_type or "generation"),
            "status": "running",
            "path": str(path or ""),
            "created_at": now,
        }
    return task_id


def end_transient_generation(task_id: str) -> None:
    with _TRANSIENT_LOCK:
        _TRANSIENT_TASKS.pop(str(task_id or ""), None)


def active_task_summary() -> Dict[str, Any]:
    tasks = {
        str(task.get("id") or ""): dict(task)
        for task in active_durable_canvas_tasks()
        if task.get("id")
    }
    with CANVAS_TASK_LOCK:
        for task_id, task in CANVAS_TASKS.items():
            if str(task.get("status") or "") in ACTIVE_CANVAS_TASK_STATUSES:
                tasks[str(task_id)] = dict(task)
    with QUEUE_LOCK:
        for queued in QUEUE:
            queue_id = f"generation:{queued.get('task_id')}"
            tasks[queue_id] = {
                "id": queue_id,
                "type": "generation",
                "status": "running",
                "created_at": queued.get("created_at", 0),
            }
    with _TRANSIENT_LOCK:
        for task_id, task in _TRANSIENT_TASKS.items():
            tasks[task_id] = dict(task)
    by_type: Dict[str, int] = {}
    for task in tasks.values():
        kind = str(task.get("type") or "unknown")
        by_type[kind] = by_type.get(kind, 0) + 1
    return {
        "active": len(tasks),
        "by_type": by_type,
        "tasks": [
            {
                "id": task.get("id"),
                "type": task.get("type"),
                "status": task.get("status"),
                "provider_id": task.get("provider_id", ""),
                "model": task.get("model", ""),
                "created_at": task.get("created_at", 0),
            }
            for task in tasks.values()
        ],
    }


def maintenance_snapshot(admin_allowed: bool = False) -> Dict[str, Any]:
    summary = active_task_summary()
    if not admin_allowed:
        summary.pop("tasks", None)
    return {
        **maintenance_state(),
        **summary,
        "online_count": manager.online_count(),
        "admin_allowed": bool(admin_allowed),
    }
