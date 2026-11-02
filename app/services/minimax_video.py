"""APIMart MiniMax H3 request rules, checked before uploading paid inputs."""
from fastapi import HTTPException


def minimax_model(model):
    return {"minimax-h3": "MiniMax-H3", "minimax-h3-max": "MiniMax-H3-Max"}.get(str(model or "").strip().lower(), "")


def image_role(role):
    value = str(role or "").strip().lower() or "reference_image"
    return {"first": "first_frame", "start": "first_frame", "last": "last_frame",
            "end_frame": "last_frame", "tail": "last_frame", "reference": "reference_image"}.get(value, value)


def video_resolution(model, resolution):
    model = minimax_model(model)
    maximum = model == "MiniMax-H3-Max"
    value = str(resolution or ("768P" if maximum else "2K")).strip().upper()
    allowed = {"480P", "768P", "1080P"} if maximum else {"768P", "2K"}
    if value not in allowed:
        raise HTTPException(400, f"{model}：分辨率仅支持 " + " / ".join(sorted(allowed)) + "，请重新选择。")
    return value


def validate_request(payload):
    model = minimax_model(payload.model)
    maximum = model == "MiniMax-H3-Max"
    def reject(message):
        raise HTTPException(400, f"{model}：{message}")
    if not payload.prompt.strip() or len(payload.prompt) > 7000:
        reject("提示词不能为空，且不能超过 7000 个字符。")
    minimum = 5 if maximum else 4
    if not minimum <= payload.duration <= 15:
        reject(f"视频时长须为 {minimum}～15 秒的整数。")
    resolution = video_resolution(model, payload.resolution)
    if len(payload.images) > 9 or len(payload.videos) > 3 or len(payload.audios) > 3:
        reject("最多支持 9 张参考图、3 段参考视频和 3 段参考音频。")
    roles = [image_role(ref.role) for ref in payload.images]
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
    body = {"model": model, "prompt": payload.prompt, "duration": payload.duration,
            "resolution": resolution, "aspect_ratio": aspect}
    # 1080P forbids even watermark:false. Keep this field absent in that mode.
    if not (maximum and resolution == "1080P"):
        body["watermark"] = bool(payload.watermark)
    return body
