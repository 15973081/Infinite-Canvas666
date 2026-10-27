"""Seedance 2.5 draft lifecycle, backed by our durable task records."""
import time
from urllib.parse import urlsplit

from fastapi import HTTPException

from app.providers.registry import is_volcengine_provider
from app.services.canvas_tasks import get_canvas_task, get_canvas_task_request
from app.services.media import is_volcengine_seedance25_model

DRAFT_TTL = 7 * 24 * 60 * 60


def supports_drafts(provider, model):
    url = urlsplit(provider.get("base_url") or "")
    return (is_volcengine_provider(provider) and is_volcengine_seedance25_model(model)
            and url.scheme == "https" and url.hostname == "ark.cn-beijing.volces.com"
            and url.path.rstrip("/") in {"", "/api/v3"})


def validate(payload, provider):
    if not payload.draft and not payload.draft_source_task_id:
        return None
    if not supports_drafts(provider, payload.model):
        raise HTTPException(400, "样片模式仅支持国内火山引擎官方 Seedance 2.5 接口；聚合平台尚未确认支持 draft 和 draft_task。")
    if payload.draft_source_task_id:
        if payload.draft or payload.resolution != "1080p":
            raise HTTPException(400, "样片升级必须关闭样片模式并选择 1080p。")
        source = get_canvas_task(payload.draft_source_task_id)
        request = get_canvas_task_request(payload.draft_source_task_id)
        if source.get("type") != "video" or source.get("status") != "succeeded" or not request.get("draft"):
            raise HTTPException(400, "请先生成成功的样片，再升级正式视频。")
        if source.get("provider_id") != provider["id"] or request.get("model") != payload.model:
            raise HTTPException(400, "升级必须使用样片原供应商和模型。")
        if source.get("provider_account_ref"):
            from app.storage.task_requests import account_ref
            if source["provider_account_ref"] != account_ref(provider["id"]):
                raise HTTPException(409, "样片供应商账号已变化，请使用原账号升级。")
        draft = (source.get("result") or {}).get("seedance_draft") or {}
        if not draft.get("task_id") or not draft.get("expires_at"):
            raise HTTPException(400, "样片缺少上游任务信息，请重新生成样片。")
        if time.time() >= draft["expires_at"]:
            raise HTTPException(400, "样片任务已超过 7 天有效期，请重新生成样片。")
        return draft
    if payload.resolution != "480p":
        raise HTTPException(400, "样片模式仅支持 480p。")
    return None


def result_metadata(payload, raw, upstream_task_id, provider):
    if payload.draft_source_task_id:
        return {"draft_source_task_id": payload.draft_source_task_id}
    if not payload.draft:
        return {}
    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    # Never extend the validity window when polling resumes after a restart.
    created = data.get("created_at")
    if not isinstance(created, (int, float)) or isinstance(created, bool) or created <= 0:
        source = get_canvas_task(payload.client_task_id) if payload.client_task_id else {}
        created = source.get("created_at") or 0
    return {"seedance_draft": {
        "source_task_id": payload.client_task_id, "task_id": upstream_task_id,
        "provider_id": provider["id"], "model": payload.model,
        "created_at": created, "expires_at": created + DRAFT_TTL if created else 0,
    }}


def accounting_request(payload):
    request = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    if payload.draft_source_task_id:
        # The original reference videos determine pricing, not the draft preview.
        source = get_canvas_task_request(payload.draft_source_task_id)
        request = {**source, "resolution": "1080p", "draft": False}
    return request
