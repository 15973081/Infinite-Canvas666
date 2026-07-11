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
from app.services.update import *
from app.services.canvas import *
from app.services.assets import *
from app.services.prompt import *
from app.services.media import *
from app.services.chat import *
from app.services.comfyui import *
from app.services.workflow import *
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
        "comfy_instances": COMFYUI_INSTANCES,
        "api_providers": providers,
        "has_api_key": bool(AI_API_KEY),
        "ms_chat_models": MODELSCOPE_CHAT_MODELS,
        "has_ms_key": bool(modelscope_api_key()),
    }

@router.get("/api/models")
async def ai_models():
    return {"chat_models": CHAT_MODELS, "image_models": IMAGE_MODELS, "video_models": VIDEO_MODELS}

@router.get("/api/providers")
async def api_providers():
    return {"providers": public_api_providers()}

@router.put("/api/providers")
async def save_providers(payload: List[ApiProviderPayload]):
    providers = []
    env_updates = {}
    # 收集每个 item 的 primary 字段
    raw_primary_flags = [bool(getattr(item, "primary", False)) for item in payload]
    for item in payload:
        provider = normalize_provider(item.dict(exclude={"api_key"}))
        if any(existing["id"] == provider["id"] for existing in providers):
            raise HTTPException(status_code=400, detail=f"API 平台 ID 重复：{provider['id']}")
        providers.append(provider)
        key_env = provider_key_env(provider["id"])
        if item.clear_key:
            env_updates[key_env] = ""
        elif item.api_key is not None and item.api_key.strip():
            env_updates[key_env] = item.api_key.strip()
        if provider["id"] == "volcengine":
            ak_env = volcengine_access_key_env()
            sk_env = volcengine_secret_key_env()
            if item.clear_volcengine_access_key_id:
                env_updates[ak_env] = ""
            elif item.volcengine_access_key_id is not None and item.volcengine_access_key_id.strip():
                env_updates[ak_env] = item.volcengine_access_key_id.strip()
            if item.clear_volcengine_secret_access_key:
                env_updates[sk_env] = ""
            elif item.volcengine_secret_access_key is not None and item.volcengine_secret_access_key.strip():
                env_updates[sk_env] = item.volcengine_secret_access_key.strip()
        if provider["id"] == "comfly":
            env_updates["COMFLY_BASE_URL"] = provider["base_url"]
            env_updates["IMAGE_MODELS"] = ",".join(provider["image_models"])
            env_updates["CHAT_MODELS"] = ",".join(provider["chat_models"])
            env_updates["VIDEO_MODELS"] = ",".join(provider.get("video_models") or [])
        if provider["id"] == "modelscope":
            env_updates["MODELSCOPE_CHAT_MODELS"] = ",".join(provider["chat_models"])
        if provider["id"] == "volcengine":
            provider["protocol"] = "volcengine"
    if not providers:
        raise HTTPException(status_code=400, detail="至少保留一个 API 平台")
    # 强制最多一个 primary（取最后被标记的；都没标记则保持原样不强制）
    primary_indices = [i for i, flag in enumerate(raw_primary_flags) if flag]
    if primary_indices:
        winner = primary_indices[-1]
        for i, p in enumerate(providers):
            p["primary"] = (i == winner)
    save_api_providers(providers)
    if env_updates:
        update_env_values(env_updates)
        reload_env_globals()   # 立即将最新 env 值同步回模块全局变量，无需重启
    return {"providers": [public_provider(p) for p in providers]}

@router.get("/api/config/token")
async def get_global_token():
    # 优先读 env，回退到 global_config.json（兼容旧数据）
    saved_token = modelscope_api_key()
    if saved_token:
        return {"token": saved_token}
    if os.path.exists(GLOBAL_CONFIG_FILE):
        try:
            with open(GLOBAL_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {"token": config.get("modelscope_token", "")}
        except:
            pass
    return {"token": ""}

@router.post("/api/providers/test-connection")
async def test_provider_connection(payload: TestConnectionPayload):
    """测试请求地址是否可用：调上游 /v1/models。验证通过时同时把模型清单按类别返回，避免再调一次拉取接口。"""
    protocol = protocol_from_payload(payload)
    base_url = (payload.base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    if not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail="请求地址必须以 http:// 或 https:// 开头")
    api_key = api_key_from_payload(payload, protocol)
    if not api_key:
        key_name = "方舟 API Key" if protocol == "volcengine" else "API Key"
        raise HTTPException(status_code=400, detail=f"请先填写或保存 {key_name}")
    url = upstream_models_url(base_url, protocol)
    client_kwargs = httpx_provider_kwargs(proxy_url=proxy_url_from_payload(payload))
    try:
        async with httpx.AsyncClient(timeout=15, **client_kwargs) as client:
            resp = await client.get(url, headers=upstream_model_headers(api_key, protocol))
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location") or resp.headers.get("location") or ""
                suffix = f"：{location}" if location else ""
                endpoint_label = "/v1beta/models" if protocol == "gemini" else "/api/v3/models" if protocol == "volcengine" else "/v1/models"
                return {"ok": False, "status": resp.status_code, "message": f"上游 {endpoint_label} 发生跳转{suffix}，请填写 API Base URL，不要填写网页登录地址"}
            if looks_like_html_response(resp.text):
                endpoint_label = "/v1beta/models" if protocol == "gemini" else "/api/v3/models" if protocol == "volcengine" else "/v1/models"
                return {"ok": False, "status": resp.status_code, "message": f"上游 {endpoint_label} 返回网页 HTML，请检查请求地址是否为 API Base URL"}
            if resp.status_code >= 400:
                if protocol == "volcengine":
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        message = f"{probe.get('message') or '方舟任务接口可达'}；但 /api/v3/models 不可用，已使用默认 Seedance 模型。"
                        return volcengine_default_model_payload(status=probe.get("status") or resp.status_code, message=message, raw={"models_error": resp.text[:300], **(probe.get("raw") or {})})
                elif protocol == "openai":
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        message = f"{probe.get('message') or '检测到方舟/Ark 兼容入口'}；OpenAI /v1/models 不可用，已自动切换为方舟协议并使用默认 Seedance 模型。"
                        return volcengine_default_model_payload(status=probe.get("status") or resp.status_code, message=message, raw={"models_error": resp.text[:300], **(probe.get("raw") or {})})
                return {"ok": False, "status": resp.status_code, "message": resp.text[:300]}
            data = resp.json() if resp.text else {}
            grouped, ids = parse_upstream_models(data, protocol)
            grouped, ids = apply_agnes_model_defaults(base_url, grouped, ids)
            if protocol == "volcengine" and not ids:
                detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                if detected:
                    return volcengine_default_model_payload(status=resp.status_code, raw=data)
            return {
                "ok": True,
                "status": resp.status_code,
                "model_count": len(ids),
                "image_models": grouped["image"],
                "chat_models": grouped["chat"],
                "video_models": grouped["video"],
                "all": ids,
                "image_request_mode": detect_image_request_mode(base_url, ids) or normalize_image_request_mode(getattr(payload, "image_request_mode", "")),
            }
    except httpx.HTTPError as e:
        if protocol == "volcengine":
            try:
                async with httpx.AsyncClient(timeout=15, **client_kwargs) as client:
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        message = f"{probe.get('message') or '方舟任务接口可达'}；但模型列表请求失败，已使用默认 Seedance 模型。"
                        return volcengine_default_model_payload(status=probe.get("status") or 0, message=message, raw={"models_error": str(e)[:300], **(probe.get("raw") or {})})
            except Exception:
                pass
        return {"ok": False, "status": 0, "message": str(e)[:300]}

@router.post("/api/providers/probe-async")
async def probe_async_endpoint(payload: TestConnectionPayload):
    """验证异步协议：用假 task_id 请求 GET /v1/tasks/{fake_id}。
    收到 400 Invalid task ID = 端点存在且 Key 有效；401/403 = Key 无效；404/连接失败 = 不支持异步端点。"""
    base_url = (payload.base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    protocol = protocol_from_payload(payload)
    api_key = api_key_from_payload(payload, protocol)
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写或保存 API Key")
    client_kwargs = httpx_provider_kwargs(proxy_url=proxy_url_from_payload(payload))
    if protocol == "volcengine":
        try:
            async with httpx.AsyncClient(timeout=15, **client_kwargs) as client:
                task_ok, task_probe = await probe_volcengine_task_endpoint(client, base_url, api_key)
                if task_ok:
                    return {
                        "ok": True,
                        "protocol": "volcengine",
                        "status_code": task_probe.get("status") or 200,
                        "message": "方舟/Ark 任务协议可用",
                        "raw": task_probe.get("raw"),
                    }
                compat_ok, compat_probe = await probe_openai_compat_bearer_endpoint(client, base_url, api_key)
                if compat_ok:
                    return {
                        "ok": True,
                        "protocol": "volcengine",
                        "status_code": compat_probe.get("status") or 200,
                        "message": "方舟/Ark Bearer 鉴权入口可用（OpenAI 兼容透传）",
                        "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
                    }
                return {
                    "ok": False,
                    "protocol": "volcengine",
                    "status_code": compat_probe.get("status") or task_probe.get("status") or 0,
                    "message": compat_probe.get("message") or task_probe.get("message") or "方舟/Ark 任务协议不可用",
                    "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
                }
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=str(e)[:300])
    tasks_base = base_url if base_url.endswith("/v1") else f"{base_url}/v1"
    probe_url = f"{tasks_base}/tasks/healthcheck_probe_do_not_submit"
    try:
        async with httpx.AsyncClient(timeout=15, **client_kwargs) as client:
            resp = await client.get(probe_url, headers={"Authorization": bearer_auth_value(api_key), "Accept": "application/json"})
            try:
                body = resp.json()
            except Exception:
                body = resp.text[:500]
            sc = resp.status_code
            # 判断结果
            err_msg = ""
            if isinstance(body, dict):
                err = body.get("error") or {}
                if isinstance(err, dict):
                    err_msg = str(err.get("message") or "").lower()
                else:
                    err_msg = str(err).lower()
            # 400 + "invalid task id" → 端点存在，Key 有效
            if sc == 400 and "invalid task id" in err_msg:
                return {"ok": True, "protocol": "apimart", "status_code": sc, "message": "APIMart 异步任务端点可用，API Key 已通过认证", "raw": body}

            async_probe = {"status": sc, "message": "", "raw": body}
            if sc in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location") or resp.headers.get("location") or ""
                async_probe["message"] = f"/v1/tasks/ 发生跳转{f'：{location}' if location else ''}"
            elif looks_like_html_response(resp.text):
                async_probe["message"] = "/v1/tasks/ 返回网页 HTML"
            elif sc in (401, 403):
                async_probe["message"] = "/v1/tasks/ 返回鉴权失败"
            elif sc == 404:
                async_probe["message"] = "平台不支持 /v1/tasks/ 端点，可能不是 APIMart 异步协议"
            elif 400 <= sc < 500:
                async_probe["message"] = f"/v1/tasks/ 返回 {sc}"
            elif sc < 300:
                async_probe["message"] = f"/v1/tasks/ 返回 {sc}（意外成功）"
            else:
                async_probe["message"] = f"/v1/tasks/ 服务端错误 {sc}"

            if protocol == "apimart":
                return {"ok": False, "protocol": "apimart", "status_code": sc, "message": async_probe["message"], "raw": body}

            openai_ok, openai_probe = await probe_openai_models_endpoint(client, base_url, api_key)
            if not openai_ok and protocol == "openai":
                detected, volc_probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                if detected:
                    return {
                        "ok": True,
                        "protocol": "volcengine",
                        "status_code": volc_probe.get("status") or openai_probe.get("status") or sc,
                        "message": f"{volc_probe.get('message') or '检测到方舟/Ark 兼容入口'}，已自动切换为方舟/Ark 任务协议",
                        "raw": {"async_probe": async_probe, "openai_probe": openai_probe.get("raw"), **(volc_probe.get("raw") or {})},
                    }
            return {
                "ok": openai_ok,
                "protocol": "openai",
                "status_code": openai_probe.get("status") or sc,
                "message": openai_probe.get("message") or "OpenAI 兼容验证完成",
                "raw": {"async_probe": async_probe, "openai_probe": openai_probe.get("raw")},
                "model_count": openai_probe.get("model_count") or 0,
                "image_models": openai_probe.get("image_models") or [],
                "chat_models": openai_probe.get("chat_models") or [],
                "video_models": openai_probe.get("video_models") or [],
                "all": openai_probe.get("all") or [],
                "image_request_mode": detect_image_request_mode(base_url, openai_probe.get("all") or []) or normalize_image_request_mode(getattr(payload, "image_request_mode", "")),
            }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e)[:300])

async def fetch_models_from_upstream(base_url: str, api_key: str, protocol: str = "openai", image_request_mode: str = "openai", proxy_url: str = ""):
    """从上游模型列表端点拉取模型，并按名称做轻量分类。"""
    protocol = protocol if protocol in SUPPORTED_PROVIDER_PROTOCOLS else "openai"
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    if not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail="请求地址必须以 http:// 或 https:// 开头")
    api_key = volcengine_provider_api_key(api_key) if protocol == "volcengine" else (api_key or "").strip()
    if not api_key:
        key_name = "方舟 API Key" if protocol == "volcengine" else "API Key"
        raise HTTPException(status_code=400, detail=f"请先填写或保存 {key_name}")
    url = upstream_models_url(base_url, protocol)
    client_kwargs = httpx_provider_kwargs(proxy_url=proxy_url)
    try:
        async with httpx.AsyncClient(timeout=30, **client_kwargs) as client:
            resp = await client.get(url, headers=upstream_model_headers(api_key, protocol))
            endpoint_label = "/v1beta/models" if protocol == "gemini" else "/api/v3/models" if protocol == "volcengine" else "/v1/models"
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location") or resp.headers.get("location") or ""
                suffix = f"：{location}" if location else ""
                raise HTTPException(status_code=400, detail=f"上游 {endpoint_label} 发生跳转{suffix}，请填写 API Base URL，不要填写网页登录地址")
            if looks_like_html_response(resp.text):
                raise HTTPException(status_code=400, detail=f"上游 {endpoint_label} 返回网页 HTML，请检查请求地址是否为 API Base URL")
            if resp.status_code >= 400:
                if protocol == "volcengine":
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        payload = volcengine_default_model_payload(
                            status=probe.get("status") or resp.status_code,
                            message=f"{probe.get('message') or '方舟任务接口可达'}；但 /api/v3/models 不可用，已使用默认 Seedance 模型。",
                            raw={"models_error": resp.text[:300], **(probe.get("raw") or {})},
                        )
                        return {
                            "total": payload["model_count"],
                            "protocol": payload["protocol"],
                            "image_models": payload["image_models"],
                            "chat_models": payload["chat_models"],
                            "video_models": payload["video_models"],
                            "all": payload["all"],
                            "message": payload["message"],
                            "raw": payload["raw"],
                        }
                elif protocol == "openai":
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        payload = volcengine_default_model_payload(
                            status=probe.get("status") or resp.status_code,
                            message=f"{probe.get('message') or '检测到方舟/Ark 兼容入口'}；OpenAI /v1/models 不可用，已自动切换为方舟协议并使用默认 Seedance 模型。",
                            raw={"models_error": resp.text[:300], **(probe.get("raw") or {})},
                        )
                        return {
                            "total": payload["model_count"],
                            "protocol": payload["protocol"],
                            "image_models": payload["image_models"],
                            "chat_models": payload["chat_models"],
                            "video_models": payload["video_models"],
                            "all": payload["all"],
                            "message": payload["message"],
                            "raw": payload["raw"],
                        }
                raise HTTPException(status_code=resp.status_code, detail=f"上游 {endpoint_label} 失败：{resp.text[:300]}")
            raw = resp.json()
    except httpx.HTTPError as e:
        if protocol == "volcengine":
            try:
                async with httpx.AsyncClient(timeout=15, **client_kwargs) as client:
                    detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                    if detected:
                        payload = volcengine_default_model_payload(
                            status=probe.get("status") or 0,
                            message=f"{probe.get('message') or '方舟任务接口可达'}；但模型列表请求失败，已使用默认 Seedance 模型。",
                            raw={"models_error": str(e)[:300], **(probe.get("raw") or {})},
                        )
                        return {
                            "total": payload["model_count"],
                            "protocol": payload["protocol"],
                            "image_models": payload["image_models"],
                            "chat_models": payload["chat_models"],
                            "video_models": payload["video_models"],
                            "all": payload["all"],
                            "message": payload["message"],
                            "raw": payload["raw"],
                        }
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=f"请求上游模型列表失败：{e}")
    grouped, ids = parse_upstream_models(raw, protocol)
    grouped, ids = apply_agnes_model_defaults(base_url, grouped, ids)
    if protocol == "volcengine" and not ids:
        payload = volcengine_default_model_payload(raw=raw)
        return {
            "total": payload["model_count"],
            "image_models": payload["image_models"],
            "chat_models": payload["chat_models"],
            "video_models": payload["video_models"],
            "all": payload["all"],
            "message": payload["message"],
            "raw": payload["raw"],
        }
    return {
        "total": len(ids),
        "image_models": grouped["image"],
        "chat_models": grouped["chat"],
        "video_models": grouped["video"],
        "all": ids,
        "image_request_mode": detect_image_request_mode(base_url, ids) or normalize_image_request_mode(image_request_mode),
    }

@router.post("/api/providers/fetch-models")
async def fetch_upstream_models_from_payload(payload: TestConnectionPayload):
    """按页面当前表单值拉取模型，支持新增平台未保存时直接使用临时 Base URL / Key。"""
    protocol = protocol_from_payload(payload)
    api_key = api_key_from_payload(payload, protocol)
    return await fetch_models_from_upstream(payload.base_url, api_key, protocol, payload.image_request_mode, proxy_url_from_payload(payload))

@router.get("/api/providers/{provider_id}/fetch-models")
async def fetch_upstream_models(provider_id: str):
    """从已保存的上游 OpenAI 兼容接口拉取 /v1/models 列表，按名称智能分类为 image/chat/video。"""
    provider = get_api_provider_exact(provider_id)
    api_key = os.getenv(provider_key_env(provider["id"]), "")
    if not api_key:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider_id} 未配置 API Key")
    return await fetch_models_from_upstream(provider.get("base_url") or "", api_key, provider_protocol(provider), provider.get("image_request_mode") or "openai", provider_proxy_url(provider))

async def build_online_image_result(payload: OnlineImageRequest):
    provider = get_api_provider(payload.provider_id)
    default_model = (provider.get("image_models") or [IMAGE_MODEL])[0]
    model = selected_model(payload.model, default_model)
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    image_refs = image_references(refs)
    count = max(1, min(8, int(payload.n or 1)))
    async def generate_one():
        image_data, raw_item = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, image_refs, provider["id"])
        local_url = await save_ai_image_to_output(image_data, prefix="online_", provider=provider)
        return local_url, raw_item
    try:
        generated = await asyncio.gather(*(generate_one() for _ in range(count)))
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
        "params": {"provider_id": provider["id"], "model": model, "size": payload.size, "quality": payload.quality, "n": count, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    save_to_history(result)
    if GLOBAL_LOOP:
        asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
    return result
