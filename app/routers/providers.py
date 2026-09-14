"""Auto-generated router."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse, JSONResponse
from typing import List, Dict, Any, Optional
import json, os, time, re, uuid, shutil, asyncio, httpx, urllib.parse, hashlib, base64
from app.models import *
from app.state import *
from app.config import *
from app.utils import *
from app.providers.registry import *
from app.services.canvas import *
from app.services.assets import *
from app.services.prompt import *
from app.services.media import *
from app.services.chat import *
router = APIRouter()

@router.get("/api/config")
async def ai_config():
    preferred_chat_model = next((m for m in CHAT_MODELS if m == "gpt-5.5"), CHAT_MODELS[0] if CHAT_MODELS else CHAT_MODEL)
    providers = public_api_providers()
    return {
        "base_url": AI_BASE_URL,
        "chat_model": preferred_chat_model,
        "image_model": IMAGE_MODEL,
        "chat_models": CHAT_MODELS,
        "image_models": IMAGE_MODELS,
        "video_models": VIDEO_MODELS,
        "api_providers": providers,
        "has_api_key": bool(AI_API_KEY),
    }

@router.get("/api/models")
async def ai_models():
    return {"chat_models": CHAT_MODELS, "image_models": IMAGE_MODELS, "video_models": VIDEO_MODELS}

@router.get("/api/providers")
async def api_providers():
    return {"providers": public_api_providers()}

@router.put("/api/providers")
@router.post("/api/providers/test-connection")
@router.post("/api/providers/probe-async")
@router.post("/api/providers/fetch-models")
@router.get("/api/providers/{provider_id}/fetch-models")
async def management_provider_endpoint():
    raise HTTPException(410, {"code": "management_entry_required"})


async def build_online_image_result(payload: OnlineImageRequest, *, recover=False):
    cloud_task = False
    if postgres_enabled():
        from app.storage.tasks import lease_context
        cloud_task = lease_context.get() is not None
    provider = get_api_provider(payload.provider_id)
    default_model = (provider.get("image_models") or [IMAGE_MODEL])[0]
    model = selected_model(payload.model, default_model)
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    image_refs = image_references(refs)
    count = max(1, min(8, int(payload.n or 1)))
    from app.storage import image_receipts
    recovery_row = image_receipts.current_row() if recover else None
    async def generate_one(index):
        with image_receipts.slot_scope(index):
            if recover:
                packet = await asyncio.to_thread(image_receipts.read, recovery_row, index)
                if packet["kind"] == "result":
                    return packet["source"], packet["raw"]
                async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT, **httpx_provider_kwargs(provider)) as client:
                    raw_item = await wait_for_image_task(client, packet["upstream_task_id"], provider)
                image_data = extract_image(raw_item)
            else:
                image_data, raw_item = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, image_refs, provider["id"])
            if cloud_task:
                await asyncio.to_thread(image_receipts.completed, image_data, raw_item)
            local_url = image_data if cloud_task else await save_ai_image_to_output(image_data, prefix="online_", provider=provider)
            return local_url, raw_item
    try:
        generated = await asyncio.gather(*(generate_one(index) for index in range(count)), return_exceptions=cloud_task)
        failures = [item for item in generated if isinstance(item, BaseException)]
        generated = [item for item in generated if not isinstance(item, BaseException)]
        if not generated and failures:
            raise failures[0]
    except httpx.HTTPStatusError as exc:
        log_net_error(f"生图 HTTP状态错误 provider={provider.get('id')} model={model} size={payload.size}", exc)
        text = exc.response.text or ''
        friendly = friendly_image_error_detail(text, payload.size, model)
        detail = friendly or f"上游生图接口错误：{text[:300]}"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        log_net_error(f"生图 网络/TLS错误 provider={provider.get('id')} model={model}", exc)
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc

    local_urls = [url for url, _raw in generated if url]
    raw = generated[0][1] if generated else {}
    if not local_urls:
        provider_name = provider.get("name") or provider["id"]
        raw_text = json.dumps(raw, ensure_ascii=False)[:800] if isinstance(raw, (dict, list)) else str(raw)[:800]
        raise HTTPException(status_code=502, detail=f"{provider_name} 没有返回图片：{raw_text}")
    result = {
        "prompt": payload.prompt,
        "images": local_urls,
        "timestamp": time.time(),
        "type": "online",
        "model": model,
        "provider_id": provider["id"],
        "provider_name": provider.get("name") or provider["id"],
        "task_id": extract_task_id(raw) if isinstance(raw, dict) else None,
        "request_id": raw.get("id") if isinstance(raw, dict) else None,
        "params": {"provider_id": provider["id"], "model": model, "size": payload.size, "quality": payload.quality, "n": len(generated), "requested_n": count, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    if cloud_task:
        if failures:
            result.update(partial=True, incomplete_count=len(failures),
                          incomplete_reason='部分生成未完成；已有结果已保留，请核对任务后再决定是否补充生成')
        from app.storage.finalization import publish_result
        sources = result["images"]
        result["images"] = []
        return await publish_result(result, sources, "images", provider["id"])
    save_to_history(result)
    if GLOBAL_LOOP:
        asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
    return result
