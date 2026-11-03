"""APIMart gateway video adapters. These are not MiniMax official API rules.

Select the provider before its gateway model ID. Unknown providers/models are
left to their existing adapters, even when they use the same model name.
"""
from dataclasses import dataclass
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
            "end_frame": "last_frame", "tail": "last_frame", "reference": "reference_image"}.get(value, value)


def build_apimart_video_request(provider, payload):
    rule = apimart_video_model(provider, payload.model)
    if rule is None:
        return None
    return _build_h3_request(payload, rule)


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
