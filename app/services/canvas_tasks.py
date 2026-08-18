import json
import os
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from app.config import CANVAS_TASKS_FILE
from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK


CANVAS_TASK_STORE_VERSION = 1
CANVAS_TASK_RETENTION_SECONDS = 7 * 24 * 60 * 60
ACTIVE_TASK_STATUSES = {"queued", "running"}
TERMINAL_TASK_STATUSES = {"cancelled", "failed", "succeeded"}


def create_canvas_task(task_type: str, idempotency_key: str = "", **fields: Any) -> Tuple[Dict[str, Any], bool]:
    key = str(idempotency_key or "").strip()
    with CANVAS_TASK_LOCK:
        _prune_canvas_tasks_locked(time.time())
        if key:
            existing = next((task for task in CANVAS_TASKS.values()
                             if task.get("type") == task_type and task.get("idempotency_key") == key), None)
            if existing:
                return dict(existing), True
        prefix = "canvas_vid" if task_type == "video" else "canvas_img"
        task_id = f"{prefix}_{uuid.uuid4().hex}"
        now = time.time()
        task = {
            "id": task_id,
            "type": task_type,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
            "result": None,
            "error": "",
            "idempotency_key": key,
            **fields,
        }
        CANVAS_TASKS[task_id] = task
        _persist_canvas_tasks_locked()
        return dict(task), False


def get_canvas_task(task_id: str) -> Optional[Dict[str, Any]]:
    with CANVAS_TASK_LOCK:
        task = CANVAS_TASKS.get(task_id)
        return dict(task) if task else None


def update_canvas_task(task_id: str, **patch: Any) -> Optional[Dict[str, Any]]:
    with CANVAS_TASK_LOCK:
        task = CANVAS_TASKS.get(task_id)
        if not task:
            return None
        task.update(patch)
        task["updated_at"] = float(patch.get("updated_at") or time.time())
        _persist_canvas_tasks_locked()
        return dict(task)


def load_canvas_tasks(path: Optional[str] = None) -> Dict[str, int]:
    store_path = path or CANVAS_TASKS_FILE
    loaded = interrupted = pruned = 0
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS.clear()
        try:
            with open(store_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except FileNotFoundError:
            return {"loaded": 0, "interrupted": 0, "pruned": 0}
        except Exception as exc:
            print(f"加载画布任务注册表失败，将使用空注册表: {exc}")
            return {"loaded": 0, "interrupted": 0, "pruned": 0}

        raw_tasks = payload.get("tasks", []) if isinstance(payload, dict) else []
        for raw in raw_tasks if isinstance(raw_tasks, list) else []:
            if not isinstance(raw, dict) or not raw.get("id"):
                continue
            task = dict(raw)
            if task.get("status") in ACTIVE_TASK_STATUSES:
                task.update({
                    "status": "failed",
                    "error": "服务重启中断了本地任务追踪；可使用上游任务 ID 查询或重新提交。",
                    "recoverable": True,
                    "recovery_status": "interrupted",
                    "recovered_after_restart": True,
                    "updated_at": time.time(),
                })
                interrupted += 1
            CANVAS_TASKS[str(task["id"])] = task
            loaded += 1
        before = len(CANVAS_TASKS)
        _prune_canvas_tasks_locked(time.time())
        pruned = before - len(CANVAS_TASKS)
        if interrupted or pruned:
            _persist_canvas_tasks_locked(store_path)
    return {"loaded": loaded - pruned, "interrupted": interrupted, "pruned": pruned}


def persist_canvas_tasks(path: Optional[str] = None) -> bool:
    with CANVAS_TASK_LOCK:
        return _persist_canvas_tasks_locked(path or CANVAS_TASKS_FILE)


def _prune_canvas_tasks_locked(now: float) -> None:
    expired = [task_id for task_id, task in CANVAS_TASKS.items()
               if task.get("status") in TERMINAL_TASK_STATUSES
               and now - float(task.get("updated_at") or task.get("created_at") or 0) > CANVAS_TASK_RETENTION_SECONDS]
    for task_id in expired:
        CANVAS_TASKS.pop(task_id, None)


def _persist_canvas_tasks_locked(path: Optional[str] = None) -> bool:
    store_path = path or CANVAS_TASKS_FILE
    temp_path = f"{store_path}.{uuid.uuid4().hex}.tmp"
    try:
        os.makedirs(os.path.dirname(store_path), exist_ok=True)
        payload = {
            "version": CANVAS_TASK_STORE_VERSION,
            "saved_at": time.time(),
            "tasks": list(CANVAS_TASKS.values()),
        }
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, default=str)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, store_path)
        return True
    except Exception as exc:
        print(f"持久化画布任务注册表失败: {exc}")
        return False
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
