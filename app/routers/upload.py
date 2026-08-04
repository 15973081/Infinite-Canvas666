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
# ── Explicit imports for PIL symbols (resolved via wildcard but invisible to static analysis) ──
from PIL import Image, ImageOps

router = APIRouter()
_media_preview_semaphore = asyncio.Semaphore(max(2, min(4, os.cpu_count() or 2)))

@router.get("/api/media-preview")
async def media_preview(url: str, w: int = 512):
    path = output_file_from_url(url)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="媒体文件不存在")

    width = max(64, min(2048, int(w or 512)))
    webp_path, png_path = media_preview_cache_paths(path, width)

    if os.path.exists(webp_path):
        return FileResponse(webp_path, media_type="image/webp")
    if os.path.exists(png_path):
        return FileResponse(png_path, media_type="image/png")

    try:
        async with _media_preview_semaphore:
            if os.path.exists(webp_path):
                return FileResponse(webp_path, media_type="image/webp")
            if os.path.exists(png_path):
                return FileResponse(png_path, media_type="image/png")
            preview_path, media_type = await asyncio.to_thread(
                generate_media_preview_file, path, width, webp_path, png_path
            )
        return FileResponse(preview_path, media_type=media_type)
    except Exception as exc:
        raise HTTPException(status_code=415, detail=f"无法生成预览图：{exc}") from exc

@router.get("/")
async def index():
    return static_html_response("index.html")

@router.get("/api/view")
def view_image(filename: str, type: str = "input", subfolder: str = ""):
    # 先按原逻辑去各 ComfyUI 后端找
    for addr in COMFYUI_INSTANCES:
        try:
            url = f"http://{addr}/view"
            params = {"filename": filename, "type": type, "subfolder": subfolder}
            r = requests.get(url, params=params, timeout=1)
            if r.status_code == 200:
                return Response(content=r.content, media_type=r.headers.get('Content-Type'))
        except Exception:
            continue
    # 后端都拿不到时回退本地 assets/<input|output>/
    # 适用场景：画布通过 /api/ai/upload 把参考图直接落到本地 assets/input/，
    # 但 ComfyUI 的 input 可能因为重启/清理而丢失，导致 enhance/klein 等页面预览对比图 404
    if not subfolder and type in ("input", "output"):
        safe_name = os.path.basename(filename or "")
        if safe_name:
            local_path = output_path_for(safe_name, "input" if type == "input" else "output")
            if os.path.isfile(local_path):
                return FileResponse(local_path, media_type=content_type_for_path(local_path))
    raise HTTPException(status_code=404, detail="Image not found on any available backend")

@router.get("/api/download-output")
def download_output(url: str, name: str = "", inline: bool = False):
    path = output_file_from_url(url)
    if not path:
        path = local_media_file_by_basename(filename_from_media_url(url, ""))
    if path:
        filename = sanitize_export_filename(os.path.basename(name) if name else os.path.basename(path), os.path.basename(path))
        return FileResponse(path, media_type=content_type_for_path(path), filename=None if inline else filename)
    try:
        remote = fetch_remote_media_bytes(url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"远程文件下载失败：{exc}")
    if not remote:
        raise HTTPException(status_code=404, detail="文件不存在")
    content, content_type = remote
    fallback = filename_from_media_url(url, "download.bin")
    filename = sanitize_export_filename(os.path.basename(name) if name else fallback, fallback)
    disposition = "inline" if inline else "attachment"
    headers = {"Content-Disposition": f"{disposition}; filename*=UTF-8''{urllib.parse.quote(filename)}"}
    return Response(content, media_type=content_type, headers=headers)

@router.post("/api/upload")
async def upload_image(files: List[UploadFile] = File(...)):
    uploaded_files = []
    files_content = []
    for file in files:
        content = await file.read()
        files_content.append((file, content))

    for file, content in files_content:
        success_count = 0
        last_result = None
        for addr in COMFYUI_INSTANCES:
            try:
                files_data = {'image': (file.filename, content, file.content_type)}
                response = requests.post(f"http://{addr}/upload/image", files=files_data, timeout=5)
                if response.status_code == 200:
                    last_result = response.json()
                    success_count += 1
            except Exception as e:
                print(f"Upload error for {addr}: {e}")

        if success_count > 0 and last_result:
            uploaded_files.append({"comfy_name": last_result.get("name", file.filename)})
        else:
            raise HTTPException(status_code=500, detail="Failed to upload to any backend")

    return {"files": uploaded_files}

@router.post("/api/ai/upload")
async def upload_ai_reference(files: List[UploadFile] = File(...)):
    uploaded = []
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".webm", ".mov", ".m4v"}
    audio_exts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    doc_exts = {".pdf", ".txt", ".md", ".markdown", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".json", ".zip", ".yaml", ".yml", ".log"}
    max_upload_bytes = 50 * 1024 * 1024
    for file in files:
        content = await file.read()
        if not content:
            continue
        if len(content) > max_upload_bytes:
            raise HTTPException(status_code=413, detail=f"{file.filename or '文件'} 超过 50MB，无法上传")
        ext = os.path.splitext(file.filename or "")[1].lower()
        content_type = (file.content_type or "").lower()
        kind = "image"
        if ext in video_exts or content_type.startswith("video/"):
            kind = "video"
            if ext not in video_exts:
                ext = ".webm" if "webm" in content_type else ".mov" if "quicktime" in content_type else ".mp4"
        elif ext in audio_exts or content_type.startswith("audio/"):
            kind = "audio"
            if ext not in audio_exts:
                ext = ".wav" if "wav" in content_type else ".ogg" if "ogg" in content_type else ".m4a" if "mp4" in content_type else ".mp3"
        elif ext in image_exts or content_type.startswith("image/"):
            kind = "image"
            if ext not in image_exts:
                ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".gif" if "gif" in content_type else ".png"
        elif ext in doc_exts or content_type.startswith(("text/", "application/")):
            kind = "file"
            if not ext:
                ext = mimetypes.guess_extension(content_type) or ".bin"
        else:
            kind = "file"
            if not ext:
                ext = ".bin"
        filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
        path = output_path_for(filename, "input")
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append({"url": output_url_for(filename, "input"), "name": file.filename or filename, "kind": kind, "mime": content_type})
    return {"files": uploaded}

@router.post("/api/temp-sh/upload")
async def temp_sh_upload(payload: TempShUploadRequest, request: Request):
    ensure_same_origin_request(request)
    return await upload_local_video_to_cloud(payload.url, "auto")

@router.post("/api/ai/import-local-image")
async def import_local_ai_reference(payload: LocalImageImportRequest, request: Request):
    ensure_same_origin_request(request)
    requested = [payload.path] if payload.path else []
    requested.extend(payload.paths or [])
    requested = [p for p in requested if str(p or "").strip()][:20]
    if not requested:
        raise HTTPException(status_code=400, detail="没有可导入的本地图片")
    return {"files": [import_local_image_file(normalize_local_image_path(path)) for path in requested]}



