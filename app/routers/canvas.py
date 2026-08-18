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
from app.services.canvas_tasks import create_canvas_task, get_canvas_task, update_canvas_task
from app.services.canvas_audit import audit_canvas_directory
from app.services.canvas_rollout import get_canvas_rollout_policy
from app.services.canvas_rollout_metrics import get_canvas_rollout_metrics, record_canvas_rollout_event
router = APIRouter()

@router.post("/api/canvas-image-tasks")
async def create_canvas_image_task(payload: OnlineImageRequest):
    task, deduplicated = create_canvas_task(
        "online-image", payload.idempotency_key, provider_id=payload.provider_id, model=payload.model
    )
    if deduplicated:
        return {"task_id": task["id"], "status": task["status"], "deduplicated": True}
    task_id = task["id"]
    asyncio.create_task(run_canvas_image_task(task_id, payload))
    return {"task_id": task_id, "status": "queued"}

@router.get("/api/canvas-image-tasks/{task_id}")
async def get_canvas_image_task(task_id: str):
    task = get_canvas_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="画布任务不存在，可能服务已重启或任务已过期")
    return task

@router.post("/api/canvas-video-tasks")
async def create_canvas_video_task(payload: CanvasVideoRequest):
    task, deduplicated = create_canvas_task(
        "video", payload.idempotency_key, provider_id=payload.provider_id, model=payload.model
    )
    if deduplicated:
        return {"task_id": task["id"], "status": task["status"], "deduplicated": True}
    task_id = task["id"]
    asyncio.create_task(run_canvas_video_task(task_id, payload))
    return {"task_id": task_id, "status": "queued"}

@router.get("/api/canvas-video-tasks/{task_id}")
async def get_canvas_video_task(task_id: str):
    task = get_canvas_task(task_id)
    if not task or task.get("type") != "video":
        raise HTTPException(status_code=404, detail="视频任务不存在，可能服务已重启或任务已过期")
    return task

async def run_canvas_video_task(task_id: str, payload: CanvasVideoRequest):
    update_canvas_task(task_id, status="running")
    try:
        result = await canvas_video_impl(payload)
        upstream_task_id = result.get("task_id") if isinstance(result, dict) else ""
        update_canvas_task(
            task_id, status="succeeded", result=result, error="", upstream_task_id=upstream_task_id or ""
        )
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        upstream_task_id = getattr(exc, "upstream_task_id", "") or extract_task_id_from_text(detail)
        update_canvas_task(
            task_id, status="failed", error=str(detail), status_code=status_code,
            upstream_task_id=upstream_task_id, recoverable=bool(upstream_task_id)
        )

@router.post("/api/canvas-video")
async def canvas_video(payload: CanvasVideoRequest):
    return await canvas_video_impl(payload)

async def canvas_video_impl(payload: CanvasVideoRequest):
    provider = get_api_provider(payload.provider_id)
    base_url = video_api_root(provider)
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")
    api_key = os.getenv(provider_key_env(provider["id"]), "")
    if not api_key:
        raise HTTPException(status_code=400, detail=f"未配置 {provider.get('name') or provider['id']} 的 API Key，请在 API 设置中填写。")
    is_apimart = is_apimart_provider(provider)
    is_volcengine = is_volcengine_provider(provider)
    is_yuli = is_yuli_provider(provider)
    is_agnes = is_agnes_provider(provider, payload.model)
    volc_is_proxy = bool(is_volcengine and urllib.parse.urlparse(base_url).path.rstrip("/"))
    submit_urls = video_submit_url_candidates(provider, base_url)
    submit_url = submit_urls[0]
    requested_model = selected_model(payload.model, "agnes-video-v2.0" if is_agnes else "veo3-fast")
    is_veo31 = is_apimart and is_apimart_veo31_model(requested_model)
    if is_agnes:
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT, **httpx_provider_kwargs(provider)) as agnes_client:
                return await generate_agnes_video(agnes_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            text = exc.response.text
            raise HTTPException(status_code=exc.response.status_code, detail=f"Agnes 视频接口错误：{text}") from exc
        except httpx.HTTPError as exc:
            log_net_error(f"视频(Agnes) 网络/TLS错误 model={requested_model}", exc)
            raise HTTPException(status_code=502, detail=f"请求 Agnes 视频接口失败：{exc}") from exc
    # 玉玉API veo3.1 走 OpenAI multipart 格式（支持 seconds 时长）；其余模型（doubao 等）
    # 沿用下方原生 /v1/video/create JSON 流程。
    if is_yuli and yuli_is_veo_openai_model(requested_model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT, **httpx_provider_kwargs(provider)) as yuli_client:
                return await generate_yuli_openai_video(yuli_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            text = exc.response.text
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{text}") from exc
        except httpx.HTTPError as exc:
            log_net_error(f"视频(玉玉) 网络/TLS错误 model={requested_model}", exc)
            raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc
    try:
        async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT, **httpx_provider_kwargs(provider)) as client:
            # --- 构造图片载荷 ---
            if is_apimart:
                # APIMart 只接受 http/https 或 asset:// URL，先上传本地图片取回网络 URL
                image_with_roles = []
                invalid_images = []  # 每项为 (原始 URL, 失败原因)
                video_payload = []
                invalid_videos = []
                for ref_url in payload.videos[:3]:
                    ref_url = str(ref_url or "").strip()
                    if not ref_url:
                        continue
                    normalized_video_url = await upload_video_for_apimart(client, provider, ref_url)
                    if valid_apimart_video_image_input(normalized_video_url):
                        video_payload.append(normalized_video_url)
                    else:
                        reason = normalized_video_url[4:] if isinstance(normalized_video_url, str) and normalized_video_url.startswith("ERR:") else apimart_video_reference_error(ref_url)
                        invalid_videos.append((ref_url, reason))
                if invalid_videos:
                    first_url, first_reason = invalid_videos[0]
                    sample = invalid_video_image_preview(first_url)
                    raise HTTPException(
                        status_code=400,
                        detail=f"输入视频无法转换为 APIMart 支持的格式：{sample}\n原因：{first_reason}"
                    )
                apimart_model = apimart_veo31_model(requested_model) if is_veo31 else ""
                if apimart_model == "veo3.1-lite" and payload.images:
                    raise HTTPException(status_code=400, detail="veo3.1-lite 不支持图片输入，请改用 veo3.1-fast 或 veo3.1-quality。")
                image_limit = 0 if apimart_model == "veo3.1-lite" else (3 if is_veo31 else 9)
                for ref in payload.images[:image_limit]:
                    if not ref.url:
                        continue
                    role = str(ref.role or "").strip()
                    if not is_veo31 and role in {"first_frame", "last_frame", "reference_image"}:
                        up_url = await upload_image_for_apimart(client, provider, ref.url)
                        if valid_apimart_video_image_input(up_url):
                            image_with_roles.append({"url": up_url, "role": role})
                        else:
                            reason = up_url[4:] if isinstance(up_url, str) and up_url.startswith("ERR:") else "未知错误"
                            invalid_images.append((ref.url, reason))
                image_payload = []
                if not image_with_roles:
                    for ref in payload.images[:image_limit]:
                        if not ref.url:
                            continue
                        up_url = await upload_image_for_apimart(client, provider, ref.url)
                        if valid_apimart_video_image_input(up_url):
                            image_payload.append(up_url)
                        else:
                            reason = up_url[4:] if isinstance(up_url, str) and up_url.startswith("ERR:") else "未知错误"
                            invalid_images.append((ref.url, reason))
                if payload.images and not image_with_roles and not image_payload:
                    first_url, first_reason = invalid_images[0] if invalid_images else ("", "未知错误")
                    sample = invalid_video_image_preview(first_url)
                    raise HTTPException(status_code=400, detail=f"输入图片无法转换为视频接口支持的格式：{sample}\n原因：{first_reason}\n请确认本地文件存在且不超过 10MB；VEO3.1 需要图片是 APIMart 可访问的 http/https / asset:// / data URL。")
                # --- APIMart 请求体 ---
                if is_veo31:
                    model = apimart_model
                    body = {
                        "prompt": payload.prompt,
                        "model": model,
                        "duration": apimart_veo31_duration(payload.duration),
                        "aspect_ratio": apimart_veo31_aspect(payload.aspect_ratio),
                        "resolution": apimart_veo31_resolution(payload.resolution),
                    }
                    if image_payload and model != "veo3.1-lite":
                        video_images = image_payload[:3]
                        if model == "veo3.1-quality" and len(video_images) > 2:
                            video_images = video_images[:2]
                        body["image_urls"] = video_images
                        if len(video_images) == 2:
                            body["generation_type"] = "frame"
                        elif len(video_images) >= 3 and model != "veo3.1-quality":
                            body["generation_type"] = "reference"
                    if model != "veo3.1-lite":
                        body["official_fallback"] = False
                else:
                    body = {
                        "prompt": payload.prompt,
                        "model": selected_model(payload.model, "doubao-seedance-2.0"),
                        "duration": apimart_video_duration(payload.duration),
                        "size": apimart_video_size(payload.aspect_ratio or payload.size),
                        "resolution": payload.resolution or "480p",
                    }
                    if image_with_roles and video_payload:
                        raise HTTPException(status_code=400, detail="APIMart Seedance 的 image_with_roles 不能和 video_urls 同时使用，请只保留图片首尾帧或参考视频其中一种。")
                    if image_with_roles:
                        body["image_with_roles"] = image_with_roles
                    elif image_payload:
                        body["image_urls"] = image_payload[:9]
                    if video_payload:
                        body["video_urls"] = video_payload
                    audio_payload = []
                    invalid_audios = []
                    for ref_url in (payload.audios or [])[:3]:
                        ref_url = str(ref_url or "").strip()
                        if not ref_url:
                            continue
                        normalized_audio_url = await upload_audio_for_apimart(client, provider, ref_url)
                        if valid_apimart_video_image_input(normalized_audio_url):
                            audio_payload.append(normalized_audio_url)
                        else:
                            reason = normalized_audio_url[4:] if isinstance(normalized_audio_url, str) and normalized_audio_url.startswith("ERR:") else "未知错误"
                            invalid_audios.append((ref_url, reason))
                    if invalid_audios:
                        first_url, first_reason = invalid_audios[0]
                        raise HTTPException(status_code=400, detail=f"参考音频无法转换为 APIMart 支持的地址：{invalid_video_image_preview(first_url)}\n原因：{first_reason}")
                    if audio_payload:
                        body["audio_urls"] = audio_payload
                    if payload.trusted_asset:
                        img_count = len(body.get("image_urls") or []) or len(image_with_roles)
                        body["prompt"] = apply_trusted_asset_prompt_index(
                            body["prompt"], img_count, len(video_payload), len(audio_payload)
                        )
                    if payload.seed is not None:
                        body["seed"] = payload.seed
                    if payload.return_last_frame:
                        body["return_last_frame"] = True
                    if payload.generate_audio:
                        body["generate_audio"] = True
            else:
                # 非 APIMart：data URL 方式（OpenAI / ComflyAI 接口）
                if is_volcengine and not volc_is_proxy:
                    text = str(payload.prompt or "").strip()
                    volc_model = selected_model(payload.model, "doubao-seedance-2-0-fast-260128")
                    is_seedance25 = is_volcengine_seedance25_model(volc_model)
                    image_limit, video_limit, audio_limit = (30, 10, 10) if is_seedance25 else (9, 3, 3)
                    if is_seedance25 and (len(payload.images) > image_limit or len(payload.videos or []) > video_limit or len(payload.audios or []) > audio_limit):
                        raise HTTPException(status_code=400, detail="Seedance 2.5 单次最多支持 30 张图片、10 个视频、10 个音频。")
                    if is_seedance25:
                        task_mode = str(payload.task_mode or "auto").strip().lower()
                        task_type = "edit" if task_mode == "edit" else "extend" if task_mode in {"extend_forward", "extend_backward"} else ""
                        if task_type and not payload.videos:
                            raise HTTPException(status_code=400, detail="Seedance 2.5 视频编辑或延长至少需要 1 个参考视频。")
                        inferred_type = volcengine_seedance25_task_type(text, len(payload.videos or []))
                        if task_type and inferred_type not in {"reference", task_type}:
                            raise HTTPException(status_code=400, detail="任务模式与提示词意图冲突，请修改提示词后重试。")
                        if task_type and inferred_type == "reference":
                            prefix = "编辑视频@video1：" if task_type == "edit" else "向前延长@video1：" if task_mode == "extend_forward" else "向后延长@video1："
                            text = f"{prefix}{text}"
                        _, duration, ratio, resolution = volcengine_seedance25_options(
                            text, payload.duration, payload.aspect_ratio, payload.resolution, len(payload.videos or []), task_type
                        )
                    else:
                        duration = volcengine_video_duration(payload.duration)
                        ratio = payload.aspect_ratio
                        resolution = volcengine_video_resolution(payload.resolution)
                    body = {
                        "model": volc_model,
                        "content": [
                            {
                                "type": "text",
                                "text": text,
                            }
                        ],
                    }
                    # 火山方舟视频接口（含 Seedance 2.0 图生视频）均通过 body 的 duration 字段控制时长；
                    # 之前对 seedance-2.0 + 参考图的情况省略了 duration，导致接口回退到默认 5s。
                    body["duration"] = duration
                    if ratio:
                        body["ratio"] = ratio
                    if resolution:
                        body["resolution"] = resolution
                    if payload.watermark:
                        body["watermark"] = True
                    if payload.generate_audio:
                        body["generate_audio"] = True
                    if payload.camerafixed:
                        body["camera_fixed"] = True
                    if payload.return_last_frame:
                        body["return_last_frame"] = True
                    project_name = str(provider.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip() or VOLCENGINE_DEFAULT_PROJECT_NAME
                    image_like_urls = set()
                    volc_video_count = 0
                    for ref in payload.images[:image_limit]:
                        url = await volcengine_video_media_reference_url(ref.url, project_name, max_image_size=1536)
                        if not url:
                            continue
                        body["content"].append({
                            "type": "image_url",
                            "image_url": {"url": url},
                            "role": "reference_image",
                        })
                        image_like_urls.add(url)
                    for url in (payload.videos or [])[:video_limit]:
                        text_url = str(url or "").strip()
                        if not text_url:
                            continue
                        media_url = await volcengine_video_media_reference_url(text_url, project_name, max_image_size=1536 if looks_like_image_media_url(text_url) else None)
                        if not media_url:
                            continue
                        if media_url in image_like_urls or looks_like_image_media_url(media_url):
                            body["content"].append({
                                "type": "image_url",
                                "image_url": {"url": media_url},
                                "role": "reference_image",
                            })
                            image_like_urls.add(media_url)
                            continue
                        video_items = await volcengine_video_reference_content_items(media_url, direct_video=is_seedance25)
                        body["content"].extend(video_items)
                        volc_video_count += 1
                    volc_audio_count = 0
                    for url in (payload.audios or [])[:audio_limit]:
                        audio_url = await volcengine_video_media_reference_url(url, project_name, max_image_size=None)
                        if not audio_url:
                            continue
                        body["content"].append({
                            "type": "audio_url",
                            "audio_url": {"url": audio_url},
                            "role": volcengine_content_role("", "audio"),
                        })
                        volc_audio_count += 1
                    if payload.trusted_asset and body["content"] and body["content"][0].get("type") == "text":
                        body["content"][0]["text"] = apply_trusted_asset_prompt_index(
                            body["content"][0].get("text") or "", len(image_like_urls), volc_video_count, volc_audio_count
                        )
                    if payload.seed is not None and not is_seedance25:
                        body["seed"] = payload.seed
                elif is_yuli:
                    # 玉玉API（yuli.host）视频走自有 veo 统一格式：POST /v1/video/create。
                    # 字段：model / prompt / images[]（http(s) URL）/ enhance_prompt /
                    # enable_upsample / aspect_ratio（仅 16:9、9:16）。无 duration 字段，
                    # 时长由模型本身决定，所以这里不传 duration/seconds。
                    yuli_images = []
                    for ref in payload.images[:3]:
                        ref_url = str(getattr(ref, "url", "") or "").strip()
                        if not ref_url:
                            continue
                        if ref_url.startswith("http://") or ref_url.startswith("https://"):
                            yuli_images.append(ref_url)
                        else:
                            # 本地/dataURL 图片转成 data URL 兜底传递
                            data_url = reference_to_data_url(ref.dict(), max_size=1536)
                            if data_url:
                                yuli_images.append(data_url)
                    prompt_text = str(payload.prompt or "")
                    # veo 只支持英文提示词：仅在含中文等非 ASCII 字符时才开启翻译增强，
                    # 纯英文原样传递（避免增强改写时引入人物等触发安全过滤的描述）。
                    needs_enhance = any(ord(ch) > 127 for ch in prompt_text)
                    body = {
                        "model": selected_model(payload.model, "veo3.1-fast"),
                        "prompt": prompt_text,
                        "enhance_prompt": needs_enhance,
                    }
                    if yuli_images:
                        body["images"] = yuli_images
                    ratio = str(payload.aspect_ratio or "").strip()
                    if ratio in {"16:9", "9:16"}:
                        body["aspect_ratio"] = ratio
                    if payload.enable_upsample:
                        body["enable_upsample"] = True
                else:
                    image_payload = []
                    for ref in payload.images[:4]:
                        if ref.url:
                            image_payload.append(reference_to_data_url(ref.dict(), max_size=1536))
                    body = {
                        "prompt": payload.prompt,
                        "model": selected_model(payload.model, "veo3-fast"),
                        "duration": payload.duration,
                        "watermark": payload.watermark,
                    }
                    if payload.aspect_ratio:
                        body["aspect_ratio"] = payload.aspect_ratio
                        body["ratio"] = payload.aspect_ratio
                    if payload.size:
                        body["size"] = payload.size
                    if payload.resolution:
                        body["resolution"] = payload.resolution
                    if image_payload:
                        body["images"] = image_payload
                    if payload.videos:
                        body["videos"] = [v for v in payload.videos if v]
                    if payload.enhance_prompt:
                        body["enhance_prompt"] = True
                    if payload.enable_upsample:
                        body["enable_upsample"] = True
                    if payload.seed is not None:
                        body["seed"] = payload.seed
                    if payload.camerafixed:
                        body["camerafixed"] = True
                    if payload.return_last_frame:
                        body["return_last_frame"] = True
                    if payload.generate_audio:
                        body["generate_audio"] = True
            # --- 发起视频生成请求 ---
            raw = None
            html_response = None
            last_response = None
            last_json_error = None
            total_candidates = len(submit_urls)
            for idx, candidate_url in enumerate(submit_urls):
                submit_url = candidate_url
                is_last = idx == total_candidates - 1
                if is_volcengine and not volc_is_proxy:
                    debug_items = []
                    for item in (body.get("content") or []):
                        item_type = item.get("type")
                        url = ""
                        if item_type == "image_url":
                            url = ((item.get("image_url") or {}).get("url") or "")
                        elif item_type == "video_url":
                            url = ((item.get("video_url") or {}).get("url") or "")
                        elif item_type == "audio_url":
                            url = ((item.get("audio_url") or {}).get("url") or "")
                        if url.startswith("asset://"):
                            url_kind = "asset"
                        elif url.startswith("/assets/") or url.startswith("/output/"):
                            url_kind = "local"
                        elif url.startswith("data:"):
                            url_kind = "data"
                        elif url.startswith("http://") or url.startswith("https://"):
                            url_kind = "http"
                        else:
                            url_kind = "none"
                        debug_items.append({
                            "type": item_type,
                            "role": item.get("role", ""),
                            "url_kind": url_kind,
                            "url_prefix": url[:32],
                        })
                    print(f"[volc-video-debug] model={body.get('model')} project={provider.get('volcengine_project_name') or VOLCENGINE_DEFAULT_PROJECT_NAME} trusted_asset={payload.trusted_asset} content={debug_items}")
                response = await client.post(submit_url, headers=api_headers(provider=provider), json=body)
                last_response = response
                if response.status_code >= 400:
                    # 404/405（或直接返回网页 HTML）通常表示该平台不支持这个端点路径——
                    # 例如有的站点只实现了统一格式的 /v2/videos/generations，而我们先试了 /v1。
                    # 这种情况要继续尝试下一个候选端点（关键修复：以前在这里直接 raise_for_status，
                    # 第一个 /v1 报错就抛出，永远轮不到 /v2，表现为“接口错误”）。
                    # 其它错误（模型不支持/时长/额度等请求被拒）说明端点是存在的，直接抛出交给外层友好提示。
                    endpoint_missing = response.status_code in (404, 405) or looks_like_html_response(response.text)
                    if endpoint_missing and not is_last:
                        continue
                    response.raise_for_status()
                try:
                    raw = response.json()
                    break
                except Exception as exc:
                    last_json_error = exc
                    if looks_like_html_response(response.text):
                        html_response = response
                        continue
                    if not is_last:
                        continue
                    resp_text = response.text[:500]
                    raise HTTPException(status_code=502, detail=f"上游视频接口返回非 JSON 响应（状态 {response.status_code}）：{resp_text}")
            if raw is None:
                resp = html_response or last_response
                status_code = getattr(resp, "status_code", 200)
                resp_text = (getattr(resp, "text", "") or "")[:500]
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"上游视频接口返回了网页 HTML，而不是 JSON（状态 {status_code}）。\n\n"
                        f"这通常表示 API 设置里的 Base URL 指到了第三方聚合平台的管理后台/网页入口，"
                        f"或该平台不支持当前视频接口路径。请确认 Base URL 是接口地址，例如以 /v1 结尾的 OpenAI 兼容地址，"
                        f"并确认该平台实际支持视频生成端点。\n\n原始响应：{resp_text}"
                    )
                ) from last_json_error
            task_id = extract_task_id(raw) or raw.get("task_id") or raw.get("id")
            result = raw
            if task_id and not video_output_urls(raw):
                result = await wait_for_video_task(client, provider, task_id, submit_url)
            urls = video_output_urls(result)
            if not urls:
                raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
            local_urls = [await save_remote_video_to_output(url, provider=provider) for url in urls]
            return {"videos": local_urls, "task_id": task_id, "raw": result}
    except httpx.HTTPStatusError as exc:
        text = exc.response.text
        try:
            requested_model = body.get("model", "") or payload.model or ""
        except NameError:
            requested_model = payload.model or ""
        provider_name = provider.get('name') or provider['id']
        # 1) 模型名不在上游支持范围 → 从错误信息里抽取合法列表展示
        valid_models_match = re.search(r"not in\s*\[([^\]]+)\]", text)
        if valid_models_match:
            valid_models = [m.strip() for m in valid_models_match.group(1).split(",") if m.strip()]
            sample = valid_models[:30]
            more = f"（共 {len(valid_models)} 个，仅显示前 {len(sample)} 个）" if len(valid_models) > len(sample) else ""
            hint = (
                f"上游「{provider_name}」不识别模型「{requested_model}」。\n\n"
                f"上游支持的视频模型清单{more}：\n  {', '.join(sample)}\n\n"
                f"请到「API 设置」里把视频模型改成上面列表中的一个。"
            )
            raise HTTPException(status_code=exc.response.status_code, detail=hint) from exc
        # 2) 模型名合法但账号没开通通道
        if "channel not found" in text or "model_not_found" in text:
            hint = (
                f"上游「{provider_name}」识别了模型「{requested_model}」，但你的 API Key 账号下**没有该模型的可用通道**。\n\n"
                f"原因：你的账号没开通这个模型的访问权限（付费/订阅相关）。\n\n"
                f"解决方法：\n"
                f"  1. 登录 {provider.get('base_url') or '上游平台'} 控制台，开通该模型 / 充值；\n"
                f"  2. 或在「API 设置」里把视频模型改成你账号已开通的型号（如 veo3-fast / veo2-fast / sora-2 等）。"
            )
            raise HTTPException(status_code=exc.response.status_code, detail=hint) from exc
        if "text.duration" in text or "specified duration is not supported" in text:
            hint = (
                f"上游「{provider_name}」模型「{requested_model}」不支持当前时长参数。\n\n"
                f"不同视频模型支持的时长不一样；如果选择了模型不支持的时长，上游可能报错，"
                f"也可能自动按平台默认时长生成，例如 5 秒。\n\n"
                f"请把视频时长切回该模型支持的值，或改用支持更长时长的视频模型。"
            )
            raise HTTPException(status_code=exc.response.status_code, detail=hint) from exc
        if "inputimagesensitivecontentdetected" in text.lower() or "privacyinformation" in text.lower() or "may contain real person" in text.lower():
            hint = (
                f"上游「{provider_name}」拦截了输入参考图，原因是图片里可能包含真人身份/隐私信息。\n\n"
                f"这不是代码协议错误，而是火山视频模型的内容安全策略。\n\n"
                f"建议你这样处理：\n"
                f"  1. 改用非真人参考图，例如插画、AI 头像、商品图、场景图；\n"
                f"  2. 先把真人脸做模糊、遮挡、裁掉，或转成明显的二次元/插画风；\n"
                f"  3. 如果只是想做文生视频，先去掉参考图只保留文字提示词测试。"
            )
            raise HTTPException(status_code=exc.response.status_code, detail=hint) from exc
        if "specified asset" in text.lower() and "is not found" in text.lower():
            hint = (
                "火山视频接口找不到当前引用的 asset:// 素材。\n\n"
                "这通常不是图片上传失败，而是项目隔离或 API Key 不一致：素材入库使用的 ProjectName / 账号，必须和视频生成 API Key 所属的 ProjectName / 推理接入点一致。\n\n"
                f"当前火山配置的 ProjectName：{provider.get('volcengine_project_name') or VOLCENGINE_DEFAULT_PROJECT_NAME}\n\n"
                "处理方式：\n"
                "  1. 在火山控制台确认这个 asset 是否在同一个项目下；\n"
                "  2. 用视频生成所用的同一个 API Key / 项目重新上传素材到资产库；\n"
                "  3. 或把 API 设置里的火山 ProjectName 改成素材所在项目，并确保视频生成 key 也属于该项目。\n\n"
                f"原始错误：{text}"
            )
            raise HTTPException(status_code=exc.response.status_code, detail=hint) from exc
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{text}") from exc
    except httpx.HTTPError as exc:
        log_net_error(f"视频 网络/TLS错误 provider={provider.get('id')} model={payload.model}", exc)
        raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc

@router.post("/api/canvas-llm")
async def canvas_llm(payload: CanvasLLMRequest):
    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    # 判断协议：APIMart 异步 vs 标准 OpenAI
    _llm_provider = get_api_provider(payload.provider) if payload.provider not in ("modelscope",) else {}
    _is_apimart = is_apimart_provider(_llm_provider)
    system_prompt = (payload.system_prompt or "").strip()
    upstream_messages = [{"role": "system", "content": system_prompt}] if system_prompt else []
    for item in payload.messages[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            upstream_messages.append({"role": role, "content": content})
    # 构造用户消息：有图片/视频时用 OpenAI/Gemini 多模态格式
    image_inputs = [img for img in (payload.images or []) if is_image_reference_value(img)]
    video_inputs = [video for video in (payload.videos or []) if is_video_reference_value(video)]
    if image_inputs or video_inputs:
        content_parts = [{"type": "text", "text": payload.message}]
        ok_imgs = 0
        for img in image_inputs[:8]:
            if not img or not isinstance(img, str):
                continue
            ref_url = media_reference_to_url(img, max_image_size=1024)
            if not ref_url:
                continue
            content_parts.append({"type": "image_url", "image_url": {"url": ref_url}})
            ok_imgs += 1
        ok_videos = 0
        for video in video_inputs[:3]:
            if not video or not isinstance(video, str):
                continue
            frame_urls = await video_reference_to_frame_data_urls(video, max_frames=6, max_size=768)
            if frame_urls:
                ok_videos += 1
                content_parts.append({"type": "text", "text": f"以下是视频 {ok_videos} 按时间顺序抽取的关键帧，请结合这些画面理解视频内容。"})
                for frame_url in frame_urls:
                    content_parts.append({"type": "image_url", "image_url": {"url": frame_url}})
            else:
                ref_url = media_reference_to_url(video)
                if not ref_url:
                    continue
                content_parts.append({"type": "video_url", "video_url": {"url": ref_url}})
                ok_videos += 1
        print(f"[canvas-llm] model={model} provider={payload.provider} text_len={len(payload.message)} images={ok_imgs}/{len(payload.images)} videos={ok_videos}/{len(payload.videos)}")
        upstream_messages.append({"role": "user", "content": content_parts})
    else:
        upstream_messages.append({"role": "user", "content": payload.message})
    raw = None
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body = {"model": model, "messages": upstream_messages}
            if _is_apimart:
                req_body["stream"] = False   # APIMart 默认流式，强制关闭
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json=req_body,
            )
            response.raise_for_status()
            if not response.content:
                raise HTTPException(status_code=502, detail="上游接口返回了空响应")
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, model, _llm_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"解析上游响应失败：{exc}") from exc
    try:
        text = text_from_chat_response(raw).strip() if isinstance(raw, dict) else ""
        text = text or "接口返回了空回复。"
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"解析回复内容失败：{exc}") from exc
    raw_data = unwrap_apimart_response(raw) if isinstance(raw, dict) else {}
    return {"text": text, "model": model, "raw_usage": raw_data.get("usage")}

@router.get("/api/canvases")
async def canvases():
    return {"canvases": list_canvases()}

@router.get("/api/canvas-audit")
async def canvas_audit(include_deleted: bool = False, include_details: bool = True, max_files: int = 5000):
    return audit_canvas_directory(
        CANVAS_DIR,
        include_deleted=include_deleted,
        include_details=include_details,
        max_files=max(1, min(20000, max_files)),
    )

@router.get("/api/canvas-rollout")
def canvas_rollout():
    return get_canvas_rollout_policy()

@router.post("/api/canvas-rollout/events")
def canvas_rollout_event(payload: Dict[str, Any]):
    try:
        return record_canvas_rollout_event(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

@router.get("/api/canvas-rollout/metrics")
def canvas_rollout_metrics():
    return get_canvas_rollout_metrics()

@router.get("/api/canvases/trash")
async def trashed_canvases():
    return {"canvases": list_deleted_canvases(), "retention_days": 30}

@router.get("/api/canvas-folders")
async def list_canvas_folders():
    return {"folders": canvas_folder_records()}

@router.post("/api/canvas-folders")
async def create_canvas_folder(payload: CanvasFolderCreateRequest):
    data = canvas_folders_load()
    folders = data.get("folders", [])
    parent_id = normalize_canvas_folder_id(payload.parent_id)
    if parent_id and not canvas_folder_exists(parent_id, folders):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    timestamp = now_ms()
    folder = {
        "id": uuid.uuid4().hex,
        "name": (str(payload.name or "").strip() or "新建文件夹")[:80],
        "parent_id": parent_id,
        "order": canvas_folder_child_count(parent_id, folders),
        "created_at": timestamp,
    }
    folders.append(folder)
    canvas_folders_save({"folders": folders})
    return {"folder": folder, "folders": canvas_folder_records()}

@router.patch("/api/canvas-folders/{folder_id}")
async def update_canvas_folder(folder_id: str, payload: CanvasFolderUpdateRequest):
    target_id = normalize_canvas_folder_id(folder_id)
    data = canvas_folders_load()
    folders = data.get("folders", [])
    folder = next((entry for entry in folders if entry.get("id") == target_id), None)
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    if payload.name is not None:
        folder["name"] = (str(payload.name or "").strip() or folder.get("name") or "新建文件夹")[:80]
    if payload.parent_id is not None:
        parent_id = normalize_canvas_folder_id(payload.parent_id)
        if parent_id and not canvas_folder_exists(parent_id, folders):
            raise HTTPException(status_code=404, detail="父文件夹不存在")
        if canvas_folder_would_cycle(folders, target_id, parent_id):
            raise HTTPException(status_code=400, detail="不能移动到自己的子文件夹")
        folder["parent_id"] = parent_id
    if payload.order is not None:
        folder["order"] = max(0, int(payload.order))
    canvas_folders_save({"folders": folders})
    return {"folder": folder, "folders": canvas_folder_records()}

@router.delete("/api/canvas-folders/{folder_id}")
async def delete_canvas_folder(folder_id: str):
    target_id = normalize_canvas_folder_id(folder_id)
    data = canvas_folders_load()
    folders = data.get("folders", [])
    folder = next((entry for entry in folders if entry.get("id") == target_id), None)
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    parent_id = normalize_canvas_folder_id(folder.get("parent_id"))
    for entry in folders:
        if normalize_canvas_folder_id(entry.get("parent_id")) == target_id:
            entry["parent_id"] = parent_id
    data["folders"] = [entry for entry in folders if entry.get("id") != target_id]
    canvas_folders_save(data)
    reassign_canvas_folder(target_id, parent_id)
    return {"ok": True, "folders": canvas_folder_records()}

@router.post("/api/canvases")
async def create_canvas(payload: CanvasCreateRequest):
    return {"canvas": new_canvas(payload.title, payload.icon, payload.kind, payload.folder_id)}

@router.get("/api/canvases/{canvas_id}/meta")
async def get_canvas_meta(canvas_id: str):
    canvas = load_canvas(canvas_id)
    return {
        "id": canvas.get("id"),
        "updated_at": canvas.get("updated_at", 0),
        "title": canvas.get("title", "未命名画布"),
        "icon": canvas.get("icon", "layers"),
        "kind": normalize_canvas_kind(canvas.get("kind")),
        "folder_id": normalize_canvas_folder_id(canvas.get("folder_id")),
    }

@router.post("/api/canvases/{canvas_id}/meta")
async def update_canvas_meta(canvas_id: str, payload: CanvasMetaUpdate):
    """更新画布的轻量元数据（标题/图标/负责人/颜色/置顶）。
    刻意不走 save_canvas（它会刷新 updated_at），以免打标签/置顶把画布顶到列表最前。"""
    canvas = load_canvas(canvas_id)
    if payload.title is not None:
        canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    if payload.icon is not None:
        canvas["icon"] = (payload.icon or "layers")[:32]
    if payload.owner is not None:
        canvas["owner"] = str(payload.owner).strip()[:40]
    if payload.color is not None:
        canvas["color"] = normalize_canvas_color(payload.color)
    if payload.pinned is not None:
        canvas["pinned"] = bool(payload.pinned)
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)
    return {"canvas": canvas_record(canvas)}

@router.patch("/api/canvases/{canvas_id}/folder")
async def move_canvas_to_folder(canvas_id: str, payload: CanvasMoveRequest):
    canvas = load_canvas(canvas_id)
    folder_id = normalize_canvas_folder_id(payload.folder_id)
    if folder_id and not canvas_folder_exists(folder_id):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    canvas["folder_id"] = folder_id
    save_canvas_without_touch(canvas)
    return {"canvas": canvas_record(canvas)}

@router.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    return {"canvas": load_canvas(canvas_id)}

@router.post("/api/canvases/{canvas_id}/touch")
async def touch_canvas(canvas_id: str):
    canvas = load_canvas(canvas_id)
    return {"canvas": canvas_record(canvas), "updated_at": canvas.get("updated_at", 0)}

@router.get("/api/canvas-assets")
async def list_canvas_assets():
    return canvas_assets_index()

@router.get("/api/smart-canvas/prompt-templates")
async def smart_canvas_prompt_templates():
    try:
        template_path = prompt_template_markdown_path()
        source = os.path.relpath(template_path, BASE_DIR).replace("\\", "/") if template_path else ""
        return {"templates": builtin_prompt_templates(), "source": source}
    except Exception as e:
        print(f"读取提示词模板失败: {e}")
        return {"templates": []}

@router.post("/api/canvas-assets/check")
async def check_canvas_assets(payload: CanvasAssetCheckRequest):
    result = {}
    for url in payload.urls[:3000]:
        text = str(url or "").strip()
        if not text:
            continue
        if text.startswith("/output/") or text.startswith("/assets/"):
            result[text] = bool(output_file_from_url(text))
        else:
            result[text] = True
    return {"exists": result}

@router.post("/api/canvas-assets/download")
async def download_canvas_assets(payload: CanvasAssetDownloadRequest):
    buffer = BytesIO()
    used_names = set()
    count = 0
    raw_items = payload.items or [{"url": url} for url in payload.urls]
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for raw in raw_items[:1000]:
            if isinstance(raw, dict):
                text = str(raw.get("url") or "").strip()
                requested_name = str(raw.get("name") or "").strip()
            else:
                text = str(raw or "").strip()
                requested_name = ""
            if not text:
                continue
            path = output_file_from_url(text)
            content = None
            content_type = ""
            if path and os.path.isfile(path):
                base = sanitize_export_filename(requested_name or os.path.basename(path), os.path.basename(path) or f"image-{count + 1}.png")
            else:
                local_by_name = local_media_file_by_basename(filename_from_media_url(text, ""))
                if local_by_name and os.path.isfile(local_by_name):
                    path = local_by_name
                    base = sanitize_export_filename(requested_name or os.path.basename(path), os.path.basename(path) or f"image-{count + 1}.png")
                else:
                    try:
                        remote = fetch_remote_media_bytes(text)
                    except Exception:
                        remote = None
                    if not remote:
                        continue
                    content, content_type = remote
                    base = sanitize_export_filename(requested_name or filename_from_media_url(text, f"image-{count + 1}.bin"), f"image-{count + 1}.bin")
            name, ext = os.path.splitext(base)
            archive_name = base
            suffix = 2
            while archive_name in used_names:
                archive_name = f"{name}-{suffix}{ext}"
                suffix += 1
            used_names.add(archive_name)
            if path and os.path.isfile(path):
                zf.write(path, archive_name)
            else:
                zf.writestr(archive_name, content)
            count += 1
    if count <= 0:
        raise HTTPException(status_code=404, detail="没有可下载的本地图片")
    buffer.seek(0)
    filename = re.sub(r'[\\/:*?"<>|]+', "_", payload.filename or "canvas-output-images.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    encoded = urllib.parse.quote(filename)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    return Response(buffer.getvalue(), media_type="application/zip", headers=headers)

@router.post("/api/canvas-workflows/export")
async def export_canvas_workflow(payload: CanvasWorkflowExportRequest):
    archive, _ = build_canvas_workflow_archive(payload)
    filename = sanitize_export_filename(payload.filename or "canvas-workflow.zip", "canvas-workflow.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    encoded = urllib.parse.quote(filename)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    return Response(archive, media_type="application/zip", headers=headers)

@router.post("/api/canvas-workflows/export-to-library")
async def export_canvas_workflow_to_library(payload: CanvasWorkflowExportRequest):
    archive, meta = build_canvas_workflow_archive(payload)
    filename = sanitize_export_filename(payload.filename or "canvas-workflow.zip", "canvas-workflow.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    lib = load_asset_library()
    _, cat = asset_library_workflow_category(lib, payload.library_id, payload.category_id)
    item = make_workflow_library_item_from_bytes(archive, filename, payload.name or os.path.splitext(filename)[0])
    item["node_count"] = meta.get("node_count") or len(payload.nodes or [])
    item["connection_count"] = meta.get("connection_count") or len(payload.connections or [])
    item["resource_count"] = len(meta.get("resources") or [])
    cat.setdefault("items", []).append(item)
    save_asset_library(lib)
    return {"library": lib, "item": item}

@router.post("/api/canvas-workflows/import")
async def import_canvas_workflow(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    name = str(file.filename or "").lower()
    resource_mapping = {}
    workflow = None
    try:
        if name.endswith(".zip") or raw[:2] == b"PK":
            with zipfile.ZipFile(BytesIO(raw), "r") as zf:
                candidates = [n for n in zf.namelist() if n.lower().endswith("workflow.json")]
                workflow_name = "workflow.json" if "workflow.json" in zf.namelist() else (candidates[0] if candidates else "")
                if not workflow_name:
                    raise HTTPException(status_code=400, detail="压缩包中没有 workflow.json")
                workflow = json.loads(zf.read(workflow_name).decode("utf-8-sig"))
                stamp = time.strftime("%Y%m%d-%H%M%S")
                import_dir = os.path.join(OUTPUT_INPUT_DIR, f"workflow_import_{stamp}_{uuid.uuid4().hex[:6]}")
                os.makedirs(import_dir, exist_ok=True)
                for res in workflow.get("resources") or []:
                    archive = str(res.get("archive") or "").replace("\\", "/").lstrip("/")
                    if not archive or archive not in zf.namelist():
                        continue
                    base = sanitize_export_filename(res.get("name") or os.path.basename(archive), os.path.basename(archive) or "resource.bin")
                    target = os.path.join(import_dir, f"{uuid.uuid4().hex[:8]}_{base}")
                    with zf.open(archive) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    rel = os.path.relpath(target, ASSETS_DIR).replace("\\", "/")
                    new_url = f"/assets/{rel}"
                    old_url = str(res.get("url") or "").strip()
                    if old_url:
                        resource_mapping[old_url] = new_url
                    resource_mapping[archive] = new_url
                    resource_mapping[f"./{archive}"] = new_url
                    resource_mapping[os.path.basename(archive)] = new_url
        else:
            workflow = json.loads(raw.decode("utf-8-sig"))
    except HTTPException:
        raise
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="无法读取压缩包") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法解析工作流文件：{exc}") from exc
    if isinstance(workflow, list):
        workflow = {"nodes": workflow, "connections": []}
    if not isinstance(workflow, dict):
        raise HTTPException(status_code=400, detail="工作流格式不正确")
    nodes_payload = workflow.get("nodes")
    connections_payload = workflow.get("connections")
    if nodes_payload is None and isinstance(workflow.get("workflow"), dict):
        nodes_payload = workflow["workflow"].get("nodes")
        connections_payload = workflow["workflow"].get("connections")
    if not isinstance(nodes_payload, list):
        raise HTTPException(status_code=400, detail="工作流 JSON 缺少 nodes")
    if not isinstance(connections_payload, list):
        connections_payload = []
    if resource_mapping:
        nodes_payload = canvas_workflow_replace_strings(nodes_payload, resource_mapping)
        connections_payload = canvas_workflow_replace_strings(connections_payload, resource_mapping)
    return {
        "workflow": canvas_workflow_payload(nodes_payload, connections_payload, workflow.get("resources") or []),
        "nodes": nodes_payload,
        "connections": connections_payload,
        "resource_map": resource_mapping,
    }

@router.post("/api/smart-canvas/group-export")
async def export_smart_canvas_group(payload: SmartCanvasGroupExportRequest):
    target_dir = smart_group_export_folder(payload.folder, payload.group_name)
    used_names = set()
    count = 0
    text_index = 1
    for item in payload.items[:2000]:
        kind = str(item.kind or "").lower()
        if kind == "text":
            text = str(item.text or "")
            if not text.strip():
                continue
            base = sanitize_export_filename(item.name or f"{text_index}.txt", f"{text_index}.txt")
            if not base.lower().endswith(".txt"):
                base += ".txt"
            text_index += 1
            name, ext = os.path.splitext(base)
            out_name = base
            suffix = 2
            while out_name in used_names:
                out_name = f"{name}-{suffix}{ext}"
                suffix += 1
            used_names.add(out_name)
            with open(os.path.join(target_dir, out_name), "w", encoding="utf-8") as f:
                f.write(text)
            count += 1
            continue
        src = output_file_from_url(item.url)
        if not src or not os.path.isfile(src):
            continue
        base = sanitize_export_filename(item.name or os.path.basename(src), os.path.basename(src) or f"asset-{count + 1}")
        name, ext = os.path.splitext(base)
        if not ext:
            _, src_ext = os.path.splitext(src)
            ext = src_ext or ".bin"
            base = name + ext
        out_name = base
        suffix = 2
        while out_name in used_names:
            out_name = f"{name}-{suffix}{ext}"
            suffix += 1
        used_names.add(out_name)
        shutil.copy2(src, os.path.join(target_dir, out_name))
        count += 1
    if count <= 0:
        raise HTTPException(status_code=404, detail="没有可导出的内容")
    return {"ok": True, "folder": target_dir, "count": count}

@router.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest):
    canvas = load_canvas(canvas_id)
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    current_updated_at = int(canvas.get("updated_at") or 0)
    if payload.base_updated_at and current_updated_at and int(payload.base_updated_at) < current_updated_at:
        raise HTTPException(status_code=409, detail={
            "message": "画布已被其他页面更新，已拒绝旧版本覆盖。",
            "canvas": canvas,
            "updated_at": current_updated_at,
        })
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    if canvas["kind"] == "smart":
        canvas["viewport"] = payload.viewport
    else:
        canvas["viewport"] = canvas.get("viewport") or {"x": 0, "y": 0, "scale": 1}
    if "logs" in fields_set:
        canvas["logs"] = payload.logs[-500:]
    if "settings" in fields_set:
        canvas["settings"] = payload.settings or {}
    save_canvas(canvas)
    await manager.broadcast_canvas_updated(canvas_id, int(canvas.get("updated_at") or now_ms()), payload.client_id)
    return {"canvas": canvas}

@router.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str):
    canvas = load_canvas_any(canvas_id)
    if not canvas.get("deleted_at"):
        canvas["deleted_at"] = now_ms()
        save_canvas(canvas)
    return {"ok": True}

@router.post("/api/canvases/{canvas_id}/restore")
async def restore_canvas(canvas_id: str):
    canvas = load_canvas_any(canvas_id)
    if canvas.get("deleted_at"):
        canvas.pop("deleted_at", None)
        if not canvas_folder_exists(canvas.get("folder_id")):
            canvas["folder_id"] = ""
        save_canvas(canvas)
    return {"canvas": canvas}

@router.delete("/api/canvases/{canvas_id}/purge")
async def purge_canvas(canvas_id: str):
    path = canvas_path(canvas_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

@router.post("/api/canvases/{canvas_id}/backup")
async def create_canvas_backup(canvas_id: str):
    canvas = load_canvas(canvas_id)
    ts = now_ms()
    filename = f"{ts}.json"
    backup_dir = _backup_dir(canvas_id)
    os.makedirs(backup_dir, exist_ok=True)
    with open(_backup_path(canvas_id, filename), 'w', encoding='utf-8') as f:
        json.dump(canvas, f, ensure_ascii=False, indent=2)
    # 清理旧备份，最多保留 MAX_BACKUPS_PER_CANVAS 份
    try:
        files = sorted(os.listdir(backup_dir), reverse=True)
        for old in files[MAX_BACKUPS_PER_CANVAS:]:
            os.remove(os.path.join(backup_dir, old))
    except Exception:
        pass
    return {"ok": True, "filename": filename, "updated_at": ts}

@router.get("/api/canvases/{canvas_id}/backups")
async def list_canvas_backups(canvas_id: str):
    backup_dir = _backup_dir(canvas_id)
    if not os.path.isdir(backup_dir):
        return {"backups": []}
    files = []
    for name in sorted(os.listdir(backup_dir), reverse=True):
        if name.endswith('.json'):
            p = _backup_path(canvas_id, name)
            try:
                stat = os.stat(p)
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                files.append({
                    "filename": name,
                    "timestamp": int(name.replace('.json', '') or 0),
                    "size": stat.st_size,
                    "title": data.get("title", ""),
                    "node_count": len(data.get("nodes", [])),
                })
            except Exception:
                continue
    return {"backups": files}

@router.post("/api/canvases/{canvas_id}/backups/{filename}/restore")
async def restore_canvas_backup(canvas_id: str, filename: str):
    path = _backup_path(canvas_id, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="备份不存在")
    with open(path, 'r', encoding='utf-8') as f:
        backup = json.load(f)
    # 恢复时保留原 ID，更新 updated_at
    backup["id"] = canvas_id
    save_canvas(backup)
    return {"canvas": backup}

@router.delete("/api/canvases/{canvas_id}/backups/{filename}")
async def delete_canvas_backup(canvas_id: str, filename: str):
    path = _backup_path(canvas_id, filename)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

# ── Canvas Lock (collaborative editing) ──

@router.get("/api/canvases/{canvas_id}/lock")
async def get_canvas_lock(canvas_id: str):
    """Return current lock status for a canvas."""
    holder = canvas_lock_manager.get(canvas_id)
    return {"locked": holder is not None, "holder": holder}


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first = forwarded_for.split(",", 1)[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else ""


@router.post("/api/canvases/{canvas_id}/lock")
async def acquire_canvas_lock(canvas_id: str, payload: CanvasLockRequest, request: Request):
    """Try to acquire the editing lock. 409 if held by someone else."""
    result = canvas_lock_manager.acquire(canvas_id, payload.client_id, payload.username, _client_ip(request))
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail={
            "message": "画布正在被其他人编辑中",
            "holder": result.get("holder"),
        })
    if not result.get("renewed"):
        await manager.broadcast_canvas_locked(canvas_id, result.get("holder"))
    return result


@router.delete("/api/canvases/{canvas_id}/lock")
async def release_canvas_lock(canvas_id: str, client_id: str = ""):
    """Release the editing lock. Triggers an auto-backup before releasing."""
    # Auto-backup the canvas before releasing the lock
    try:
        canvas = load_canvas(canvas_id)
        backup_dir = _backup_dir(canvas_id)
        os.makedirs(backup_dir, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        filename = f"{stamp}-auto.json"
        from app.services.canvas import _backup_path, MAX_BACKUPS_PER_CANVAS
        with open(_backup_path(canvas_id, filename), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)
        # Prune old backups
        files = sorted(os.listdir(backup_dir), reverse=True)
        for old in files[MAX_BACKUPS_PER_CANVAS:]:
            os.remove(os.path.join(backup_dir, old))
    except Exception as e:
        print(f"Auto-backup failed for canvas {canvas_id}: {e}")
    released = canvas_lock_manager.release(canvas_id, client_id)
    if released:
        await manager.broadcast_canvas_unlocked(canvas_id, client_id)
    return {"ok": released}


# ── Cross-router imports (at bottom to avoid circular imports) ──
@router.post("/api/canvases/{canvas_id}/lock/release")
async def release_canvas_lock_beacon(canvas_id: str, payload: CanvasLockRequest):
    """Release the editing lock via POST so browsers can send it with sendBeacon."""
    return await release_canvas_lock(canvas_id, payload.client_id)


from app.routers.image import run_canvas_image_task
from app.services.canvas import _backup_dir, _backup_path

