"""Pure utility functions — no global state dependencies.

Extracted from main.py — Phase 1 physical split, no behavior changes.
"""
import re
import os
import time
from typing import List
from fastapi import HTTPException, Request


def mask_secret(value):
    if not value:
        return ""
    tail = value[-4:] if len(value) > 4 else value
    return f"••••••••{tail}"


def strip_auth_scheme(value, scheme="Bearer"):
    text = str(value or "").strip()
    if not text:
        return ""
    pattern = rf"^{re.escape(scheme)}\s+"
    return re.sub(pattern, "", text, flags=re.I).strip()


def bearer_auth_value(value):
    token = strip_auth_scheme(value, "Bearer")
    return f"Bearer {token}" if token else ""


def env_quote(value):
    text = str(value or "")
    if not text or re.search(r"\s|#|['\"]", text):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return text


def safe_user_id(user_id, request: Request):
    candidate = (user_id or "").strip()
    if not candidate and request.client:
        candidate = f"ip-{request.client.host}"
    if not candidate:
        candidate = "anonymous"
    candidate = re.sub(r"[^a-zA-Z0-9_.-]", "-", candidate)[:80].strip(".-")
    if not candidate:
        candidate = "anonymous"
    return candidate


def now_ms():
    return int(time.time() * 1000)


def selected_model(requested, fallback):
    model = (requested or fallback).strip()
    if not model:
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    if len(model) > 240 or any(ord(ch) < 32 or ord(ch) == 127 for ch in model):
        raise HTTPException(status_code=400, detail=f"模型名称不合法：{model}")
    return model


def model_list_from_values(values):
    deduped = []
    for value in values or []:
        item = str(value or "").strip()
        if item and item not in deduped:
            selected_model(item, item)
            deduped.append(item)
    return deduped


def normalize_model_list(values):
    return model_list_from_values(values)


def sanitize_export_filename(name: str, fallback: str) -> str:
    base = os.path.basename(str(name or "").strip()) or fallback
    base = re.sub(r'[\\/:*?"<>|]+', "_", base)
    return base or fallback


def canvas_workflow_unique_archive_name(base, used):
    safe = sanitize_export_filename(base, "resource.bin")
    name, ext = os.path.splitext(safe)
    archive = safe
    idx = 2
    while archive in used:
        archive = f"{name}-{idx}{ext}"
        idx += 1
    used.add(archive)
    return archive


__all__ = [
    "mask_secret",
    "strip_auth_scheme",
    "bearer_auth_value",
    "env_quote",
    "safe_user_id",
    "now_ms",
    "selected_model",
    "model_list_from_values",
    "normalize_model_list",
    "sanitize_export_filename",
    "canvas_workflow_unique_archive_name",
]
