"""APIMart gateway video adapters. These are not MiniMax official API rules.

Select the provider before its gateway model ID. Unknown providers/models are
left to their existing adapters, even when they use the same model name.
"""
from dataclasses import dataclass
import asyncio
import json
import math
import shutil
import subprocess
from fastapi import HTTPException
from app.providers.registry import is_apimart_provider


@dataclass(frozen=True)
class GatewayVideoModel:
    model_id: str
    duration_min: int
    resolutions: tuple[str, ...]
    default_resolution: str
    duration_max: int = 15
    omit_watermark_at: tuple[str, ...] = ()


# Sourced from the supplied APIMart generation docs, not MiniMax documentation.
APIMART_VIDEO_MODELS = {
    "kling-v4": GatewayVideoModel("kling-v4", 3, ("720p", "1080p"), "720p", 30),
    "kling-v4-flash": GatewayVideoModel("kling-v4-flash", 3, ("720p",), "720p", 20),
    "minimax-h3": GatewayVideoModel("MiniMax-H3", 4, ("2K", "768P"), "2K"),
    "minimax-h3-max": GatewayVideoModel("MiniMax-H3-Max", 5, ("768P", "480P", "1080P"), "768P", omit_watermark_at=("1080P",)),
}


def apimart_video_model(provider, model):
    if not is_apimart_provider(provider):
        return None
    return APIMART_VIDEO_MODELS.get(str(model or "").strip().lower())


def apimart_image_role(role):
    value = str(role or "").strip().lower() or "reference_image"
    return {"first": "first_frame", "start": "first_frame", "last": "last_frame",
            "end_frame": "last_frame", "tail": "last_frame", "reference": "reference_image",
            "middle_frame": "keyframe"}.get(value, value)


def is_apimart_kling(provider, model):
    rule = apimart_video_model(provider, model)
    return bool(rule and rule.model_id in {"kling-v4", "kling-v4-flash"})


def kling_image_roles(payload):
    roles = [apimart_image_role(ref.role) if ref.role else "" for ref in payload.images]
    mode = payload.task_mode
    reference = mode in {"reference", "edit"} or (mode == "auto" and (
        payload.videos or payload.audios or "reference_image" in roles))
    if reference:
        return [role or "reference_image" for role in roles]
    if mode == "extend":
        return [role or "last_frame" for role in roles]
    return [role or ("first_frame" if i == 0 else "last_frame" if i == len(roles)-1 else "keyframe")
            for i, role in enumerate(roles)]


def build_apimart_video_request(provider, payload):
    rule = apimart_video_model(provider, payload.model)
    if rule is None:
        return None
    if is_apimart_kling(provider, payload.model):
        return _build_kling_request(payload, rule)
    return _build_h3_request(payload, rule)


def _build_kling_request(payload, rule):
    def reject(message):
        raise HTTPException(400, f"APIMart {rule.model_id}：{message}")
    flash = rule.model_id == "kling-v4-flash"
    mode = payload.task_mode or "auto"
    if mode not in {"auto", "text", "image", "reference", "edit", "extend"}:
        reject("任务类型仅支持自动、文生视频、图生视频、参考生成、编辑或续写。")
    roles = kling_image_roles(payload)
    if mode == "auto":
        mode = "reference" if payload.videos or payload.audios or "reference_image" in roles else "image" if roles else "text"
    if mode != "image" and not payload.prompt.strip():
        reject("当前生成方式需要提示词。")
    if any(not ref.url.strip() for ref in payload.images) or any(not url.strip() for url in [*payload.videos, *payload.audios]):
        reject("输入素材地址不能为空。")
    if len(roles) > 10 or len(payload.videos) > 5 or len(payload.audios) > 3 or len(roles)+len(payload.videos)+len(payload.audios) > 15:
        reject("最多支持 10 张图片、5 段视频、3 段音频，参考素材合计最多 15 个。")
    if flash and payload.audios:
        reject("Flash 不支持参考音频。")
    if mode == "text" and (roles or payload.videos or payload.audios):
        reject("文生视频不能包含参考素材，请选择图生视频或参考生成。")
    if mode == "image":
        if roles.count("first_frame") != 1 or roles.count("last_frame") > 1 or roles.count("keyframe") > 8:
            reject("图生视频需要一张首帧，最多一张尾帧和八张中间帧。")
        if any(role not in {"first_frame", "last_frame", "keyframe"} for role in roles) or payload.videos or payload.audios:
            reject("图生视频的帧图不能与参考图、视频或音频混用。")
        if flash and roles != ["first_frame"]:
            reject("Flash 图生视频只支持一张首帧，不支持尾帧或中间帧。")
    if mode in {"reference", "edit"} and any(role != "reference_image" for role in roles):
        reject("参考生成和视频编辑的图片须使用参考图角色。")
    if mode == "reference" and not (roles or payload.videos or payload.audios):
        reject("参考生成至少需要一个参考素材。")
    if mode in {"edit", "extend"}:
        if len(payload.videos) != 1 or payload.audios:
            reject("编辑和续写需要恰好一段输入视频，不支持参考音频。")
    if mode == "extend" and (len(roles) > 1 or any(role != "last_frame" for role in roles) or (flash and roles)):
        reject("Flash 续写不接受图片；V4 续写最多接受一张目标尾帧。")
    resolution = (payload.resolution or rule.default_resolution).lower()
    if resolution not in rule.resolutions:
        reject("分辨率仅支持 " + " / ".join(rule.resolutions) + "。")
    body = {"model": rule.model_id, "resolution": resolution}
    if payload.prompt.strip():
        body["prompt"] = payload.prompt
    supplied = payload.model_fields_set
    duration = payload.duration
    if mode == "edit" and (duration in (None, -1) or "duration" not in supplied):
        pass
    else:
        duration = 5 if duration is None else duration
        if not rule.duration_min <= duration <= rule.duration_max:
            reject(f"视频时长须为 {rule.duration_min}～{rule.duration_max} 秒的整数。")
        body["duration"] = duration
    if mode in {"reference", "edit", "extend"}:
        body["omni_reference_task_type"] = mode
    aspect = str((payload.aspect_ratio if "aspect_ratio" in supplied else "") or payload.size or "auto").strip()
    if aspect in {"keep_ratio", "adaptive"}:
        aspect = "auto"
    if mode not in {"image", "extend"}:
        if aspect not in {"auto", "16:9", "9:16", "1:1", "21:9"}:
            reject("宽高比仅支持 16:9、9:16、1:1 或 21:9。")
        if aspect != "auto" and (mode != "edit" or "aspect_ratio" in supplied or "size" in supplied):
            body["aspect_ratio"] = aspect
        elif mode == "reference":
            body["aspect_ratio"] = "auto"
    if payload.audio_setting:
        if payload.audio_setting not in {"origin", "auto"}:
            reject("声音策略仅支持 origin 或 auto。")
        if not (mode == "reference" and payload.videos or mode == "edit" and not flash):
            reject("当前模式不支持指定声音策略。")
        body["audio_setting"] = payload.audio_setting
    if payload.watermark:
        reject("不支持水印。")
    return body


def _build_h3_request(payload, rule):
    def reject(message):
        raise HTTPException(400, f"APIMart {rule.model_id}：{message}")
    if not payload.prompt.strip() or len(payload.prompt) > 7000:
        reject("提示词不能为空，且不能超过 7000 个字符。")
    if not rule.duration_min <= payload.duration <= rule.duration_max:
        reject(f"视频时长须为 {rule.duration_min}～{rule.duration_max} 秒的整数。")
    resolution = str(payload.resolution or rule.default_resolution).strip().upper()
    if resolution not in rule.resolutions:
        reject("分辨率仅支持 " + " / ".join(rule.resolutions) + "，请重新选择。")
    if len(payload.images) > 9 or len(payload.videos) > 3 or len(payload.audios) > 3:
        reject("最多支持 9 张参考图、3 段参考视频和 3 段参考音频。")
    roles = [apimart_image_role(ref.role) for ref in payload.images]
    if any(not str(ref.url or "").strip() for ref in payload.images) or any(not str(url or "").strip() for url in [*payload.videos, *payload.audios]):
        reject("输入素材地址不能为空。")
    if any(role not in {"first_frame", "last_frame", "reference_image"} for role in roles):
        reject("图片角色仅支持首帧、尾帧或参考图。")
    frames = "first_frame" in roles or "last_frame" in roles
    if roles.count("first_frame") > 1 or roles.count("last_frame") > 1:
        reject("首帧和尾帧各最多一张。")
    if frames and ("reference_image" in roles or payload.videos or payload.audios):
        reject("首尾帧不能与参考图、参考视频或参考音频混用。")
    if payload.audios and not (payload.images or payload.videos):
        reject("参考音频必须搭配参考图或参考视频。")
    aspect = str(payload.aspect_ratio or payload.size or "adaptive").strip()
    if aspect == "keep_ratio":
        aspect = "adaptive"
    if not frames and aspect not in {"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}:
        reject("不支持当前宽高比，请重新选择。")
    if frames:
        aspect = "adaptive"
    elif not (payload.images or payload.videos or payload.audios) and aspect == "adaptive":
        aspect = "16:9"
    body = {"model": rule.model_id, "prompt": payload.prompt, "duration": payload.duration,
            "resolution": resolution, "aspect_ratio": aspect}
    # 1080P forbids even watermark:false. Keep this field absent in that mode.
    if resolution not in rule.omit_watermark_at:
        body["watermark"] = bool(payload.watermark)
    return body


def probe_stream_duration(url):
    """Read the video stream duration used by APIMart's input pricing."""
    executable = shutil.which("ffprobe")
    if not executable:
        return None
    try:
        result = subprocess.run([executable, "-v", "error", "-rw_timeout", "15000000",
                                 "-select_streams", "v:0", "-show_entries", "stream=duration",
                                 "-of", "json", url], capture_output=True, text=True, timeout=20)
        value = float(json.loads(result.stdout)["streams"][0]["duration"])
        return value if result.returncode == 0 and math.isfinite(value) and value > 0 else None
    except (OSError, ValueError, KeyError, IndexError, subprocess.TimeoutExpired):
        return None


async def kling_video_info(body):
    mode = body.get("omni_reference_task_type", "generate")
    videos = body.get("video_urls") or ([body["video_url"]] if body.get("video_url") else [])
    video_input = bool(videos) and mode != "extend"
    input_seconds = 0
    if video_input:
        durations = await asyncio.gather(*(asyncio.to_thread(probe_stream_duration, url) for url in videos))
        input_seconds = math.ceil(sum(durations)) if all(value is not None for value in durations) else None
        if input_seconds is not None and body["model"] == "kling-v4":
            input_seconds = min(30, input_seconds)
    output_seconds = body.get("duration") or (input_seconds if mode == "edit" else 5)
    quantity = (output_seconds + max(output_seconds, input_seconds)
                if video_input and input_seconds is not None and output_seconds else
                None if video_input else output_seconds)
    return {"model": body["model"], "resolution": body["resolution"], "mode": mode,
            "has_video_input": video_input, "input_seconds": input_seconds,
            "requested_duration": body.get("duration"), "billing_duration": quantity,
            "continuation": ("segment" if body["model"] == "kling-v4-flash" else "full") if mode == "extend" else ""}


def kling_accounting(info, provider, price):
    from app.services.canvas_ledger import price_log
    request = {"model": info["model"], "resolution": info["resolution"],
               "has_video_input": info["has_video_input"], "duration": info["billing_duration"]}
    if info["billing_duration"] is None:
        cost = {"status": "unknown", "reason": "missing_input_duration"}
    else:
        cost = price_log({"nodeType": "video", "status": "success", "providerId": provider["id"],
                          "model": info["model"], "request": request}, [provider], frozen_price=price or {})
    cost.update(billing_source="apimart_kling", source="estimated", kind="video",
                providerId=provider["id"], model=info["model"])
    return {"video_info": info, "cost": cost}
