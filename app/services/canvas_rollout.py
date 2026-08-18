import json
import os
import time
from threading import Lock
from typing import Any, Dict, Optional, Tuple

from app.config import CANVAS_DIR, CANVAS_ROLLOUT_FILE
from app.services.canvas_audit import audit_canvas_directory


DEFAULT_CANVAS_ROLLOUT = {
    "enabled": False,
    "percentage": 0,
    "kill_switch": False,
    "require_audit": True,
    "max_audit_files": 20000,
}
_AUDIT_CACHE: Dict[str, Any] = {"key": None, "expires_at": 0.0, "summary": None}
_AUDIT_CACHE_LOCK = Lock()
AUDIT_CACHE_SECONDS = 30


def get_canvas_rollout_policy(path: Optional[str] = None) -> Dict[str, Any]:
    configured, config_error = _read_policy(path or CANVAS_ROLLOUT_FILE)
    blockers = []
    if config_error:
        blockers.append("config-invalid")
    kill_switch = _env_bool("CANVAS_V2_KILL_SWITCH", bool(configured["kill_switch"]))
    enabled = _env_bool("CANVAS_V2_ROLLOUT_ENABLED", bool(configured["enabled"]))
    percentage = _env_percentage("CANVAS_V2_ROLLOUT_PERCENTAGE", configured["percentage"])
    require_audit = bool(configured["require_audit"])
    audit_summary = None

    if kill_switch:
        blockers.append("kill-switch")
    if not enabled:
        blockers.append("rollout-disabled")
    if require_audit:
        audit_summary = _cached_audit_summary(int(configured["max_audit_files"]))
        if not audit_summary.get("complete", False):
            blockers.append("audit-incomplete")
        if int(audit_summary.get("incompatible") or 0) > 0:
            blockers.append("audit-incompatible")

    effective_percentage = percentage if not blockers else 0
    return {
        "version": 1,
        "configured_percentage": percentage,
        "effective_percentage": effective_percentage,
        "enabled": enabled,
        "kill_switch": kill_switch,
        "require_audit": require_audit,
        "blocked_reasons": blockers,
        "audit": audit_summary,
    }


def clear_canvas_rollout_cache() -> None:
    with _AUDIT_CACHE_LOCK:
        _AUDIT_CACHE.update({"key": None, "expires_at": 0.0, "summary": None})


def _cached_audit_summary(max_files: int) -> Dict[str, Any]:
    try:
        directory_version = os.path.getmtime(CANVAS_DIR)
    except OSError:
        directory_version = 0
    key = (directory_version, max_files)
    now = time.monotonic()
    with _AUDIT_CACHE_LOCK:
        if _AUDIT_CACHE["key"] == key and _AUDIT_CACHE["expires_at"] > now:
            return dict(_AUDIT_CACHE["summary"] or {})
        audit = audit_canvas_directory(
            CANVAS_DIR, include_deleted=False, include_details=False, max_files=max_files,
        )
        summary = dict(audit["summary"])
        _AUDIT_CACHE.update({"key": key, "expires_at": now + AUDIT_CACHE_SECONDS, "summary": summary})
        return summary


def _read_policy(path: str) -> Tuple[Dict[str, Any], str]:
    configured = dict(DEFAULT_CANVAS_ROLLOUT)
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise ValueError("rollout policy must be an object")
        configured.update({key: payload[key] for key in DEFAULT_CANVAS_ROLLOUT if key in payload})
        configured["percentage"] = _percentage(configured["percentage"])
        configured["max_audit_files"] = max(1, min(20000, int(configured["max_audit_files"])))
        for key in ("enabled", "kill_switch", "require_audit"):
            if not isinstance(configured[key], bool):
                raise ValueError(f"{key} must be boolean")
        return configured, ""
    except FileNotFoundError:
        return configured, ""
    except Exception as exc:
        return dict(DEFAULT_CANVAS_ROLLOUT), str(exc)


def _percentage(value: Any) -> int:
    number = float(value)
    if number != number:
        raise ValueError("percentage must be finite")
    return max(0, min(100, int(number)))


def _env_percentage(name: str, fallback: Any) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return _percentage(fallback)
    try:
        return _percentage(value)
    except (TypeError, ValueError):
        return 0


def _env_bool(name: str, fallback: bool) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return fallback
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback
