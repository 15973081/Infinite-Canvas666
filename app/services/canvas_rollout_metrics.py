import json
import os
import time
import uuid
from threading import Lock
from typing import Any, Dict, Optional

from app.config import CANVAS_ROLLOUT_METRICS_FILE


ROLLOUT_METRICS_VERSION = 1
ALLOWED_EVENTS = {
    "board-mount-failed",
    "board-mounted",
    "execution-failed",
    "execution-stopped",
    "execution-succeeded",
    "page-summary",
    "rollout-decision",
    "save-conflict",
    "save-failed",
    "save-rebased",
    "save-succeeded",
}
ALLOWED_SOURCES = {"default", "query", "server", "storage"}
ALLOWED_MODES = {"disabled", "enabled"}
ALLOWED_REASONS = {
    "audit-incompatible",
    "audit-incomplete",
    "config-invalid",
    "dependency-unavailable",
    "execution-failed",
    "execution-stopped",
    "import-failed",
    "kill-switch",
    "none",
    "other",
    "policy-unavailable",
    "rollout-disabled",
    "save-conflict",
    "save-request-failed",
}
ALLOWED_COUNTERS = {
    "execution_failed",
    "execution_runs",
    "execution_errors",
    "repository_conflicts",
    "repository_errors",
    "repository_saves",
    "shadow_errors",
    "task_poll_errors",
    "task_polls",
    "task_recoveries",
    "task_resumed",
    "task_submissions",
}
_LOCK = Lock()


def record_canvas_rollout_event(payload: Dict[str, Any], path: Optional[str] = None) -> Dict[str, Any]:
    event = str(payload.get("event") or "").strip()
    if event not in ALLOWED_EVENTS:
        raise ValueError("unsupported canvas rollout event")
    if os.getenv("CANVAS_ROLLOUT_METRICS_DISABLED", "").strip().lower() in {"1", "true", "yes", "on"}:
        return {"accepted": True, "event": event, "persisted": False}
    dimensions = _dimensions(payload.get("dimensions"))
    counters = _counters(payload.get("counters"))
    store_path = path or CANVAS_ROLLOUT_METRICS_FILE
    with _LOCK:
        metrics = _read_metrics(store_path)
        metrics["events"][event] = int(metrics["events"].get(event) or 0) + 1
        for name, value in dimensions.items():
            bucket = metrics["dimensions"].setdefault(name, {})
            bucket[value] = int(bucket.get(value) or 0) + 1
        for name, value in counters.items():
            metrics["counters"][name] = int(metrics["counters"].get(name) or 0) + value
        event_dimensions = metrics["event_dimensions"].setdefault(event, {})
        for name, value in dimensions.items():
            bucket = event_dimensions.setdefault(name, {})
            bucket[value] = int(bucket.get(value) or 0) + 1
        mode = dimensions.get("mode")
        if mode and counters:
            event_counters = metrics["event_counters"].setdefault(event, {}).setdefault(mode, {})
            for name, value in counters.items():
                event_counters[name] = int(event_counters.get(name) or 0) + value
        metrics["updated_at"] = int(time.time() * 1000)
        _persist_metrics(metrics, store_path)
        return {"accepted": True, "event": event, "persisted": True}


def get_canvas_rollout_metrics(path: Optional[str] = None) -> Dict[str, Any]:
    with _LOCK:
        return _read_metrics(path or CANVAS_ROLLOUT_METRICS_FILE)


def _empty_metrics() -> Dict[str, Any]:
    return {
        "version": ROLLOUT_METRICS_VERSION,
        "updated_at": 0,
        "events": {},
        "event_dimensions": {},
        "event_counters": {},
        "dimensions": {"mode": {}, "reason": {}, "source": {}},
        "counters": {},
    }


def _read_metrics(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict) or payload.get("version") != ROLLOUT_METRICS_VERSION:
            return _empty_metrics()
        result = _empty_metrics()
        result["updated_at"] = int(payload.get("updated_at") or 0)
        for key in ("events", "counters"):
            if isinstance(payload.get(key), dict):
                result[key].update({str(name): max(0, int(value)) for name, value in payload[key].items()})
        dimensions = payload.get("dimensions")
        if isinstance(dimensions, dict):
            for name in result["dimensions"]:
                values = dimensions.get(name)
                if isinstance(values, dict):
                    result["dimensions"][name].update(
                        {str(value): max(0, int(count)) for value, count in values.items()}
                    )
        event_dimensions = payload.get("event_dimensions")
        if isinstance(event_dimensions, dict):
            for event, raw_dimensions in event_dimensions.items():
                if event not in ALLOWED_EVENTS or not isinstance(raw_dimensions, dict):
                    continue
                clean_dimensions = {}
                for name in result["dimensions"]:
                    values = raw_dimensions.get(name)
                    if not isinstance(values, dict):
                        continue
                    allowed = ALLOWED_MODES if name == "mode" else ALLOWED_SOURCES if name == "source" else ALLOWED_REASONS
                    clean = {
                        str(value): max(0, int(count))
                        for value, count in values.items()
                        if str(value) in allowed
                    }
                    if clean:
                        clean_dimensions[name] = clean
                if clean_dimensions:
                    result["event_dimensions"][event] = clean_dimensions
        event_counters = payload.get("event_counters")
        if isinstance(event_counters, dict):
            for event, modes in event_counters.items():
                if event not in ALLOWED_EVENTS or not isinstance(modes, dict):
                    continue
                clean_modes = {}
                for mode, values in modes.items():
                    if mode not in ALLOWED_MODES or not isinstance(values, dict):
                        continue
                    clean = {
                        str(name): max(0, int(value))
                        for name, value in values.items()
                        if str(name) in ALLOWED_COUNTERS
                    }
                    if clean:
                        clean_modes[mode] = clean
                if clean_modes:
                    result["event_counters"][event] = clean_modes
        return result
    except (FileNotFoundError, TypeError, ValueError, json.JSONDecodeError):
        return _empty_metrics()


def _persist_metrics(metrics: Dict[str, Any], path: str) -> None:
    temp_path = f"{path}.{uuid.uuid4().hex}.tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(metrics, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


def _dimensions(value: Any) -> Dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    source = str(raw.get("source") or "")
    mode = str(raw.get("mode") or "")
    reason = str(raw.get("reason") or "none")
    return {
        **({"source": source} if source in ALLOWED_SOURCES else {}),
        **({"mode": mode} if mode in ALLOWED_MODES else {}),
        "reason": reason if reason in ALLOWED_REASONS else "other",
    }


def _counters(value: Any) -> Dict[str, int]:
    raw = value if isinstance(value, dict) else {}
    result = {}
    for name in ALLOWED_COUNTERS:
        try:
            result[name] = max(0, min(10000, int(raw.get(name) or 0)))
        except (TypeError, ValueError):
            result[name] = 0
    return {name: count for name, count in result.items() if count}
