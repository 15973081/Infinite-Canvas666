import asyncio
import hashlib
import hmac
import os
from pathlib import Path
import time
import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from app.storage import media
from app.storage.settings import postgres_enabled

router = APIRouter()


def enabled():
    if not postgres_enabled():
        raise HTTPException(404, "对象存储未启用")


async def upload_files(files):
    enabled()
    uploaded = []
    for file in files:
        name = Path(file.filename or "upload.bin").name
        path = Path(media.scratch_directory("input")) / (uuid.uuid4().hex + Path(name).suffix[:12])
        total = 0
        try:
            with path.open("xb") as stream:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > media.max_file_bytes():
                        raise HTTPException(413, "素材超过单文件限制")
                    media.check_budget(len(chunk))
                    stream.write(chunk)
            if not total:
                continue
            asset = await asyncio.to_thread(media.publish, path, name)
            uploaded.append({"url": media.stable_url(asset), "media_asset_id": asset["id"], "name": name,
                             "kind": asset["kind"], "size": total, "filename": path.name})
        finally:
            path.unlink(missing_ok=True)
            await file.close()
    return {"files": uploaded}


@router.post("/api/media/uploads")
async def upload_media(files: list[UploadFile] = File(...)):
    # Initial release proxies uploads through the authenticated server. Clients
    # cannot write a ready key or replace a previously confirmed object.
    return await upload_files(files)


@router.post("/api/media/uploads/{asset_id}/complete")
def complete_upload(asset_id: str):
    enabled()
    asset = media.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    return {"media_asset_id": asset["id"], "url": media.stable_url(asset), "size": asset["size_bytes"], "sha256": asset["sha256"], "status": asset["status"]}


@router.get("/api/media/{asset_id}/content")
def content(asset_id: str):
    enabled()
    asset = media.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    return RedirectResponse(media.browser_url(asset), status_code=307, headers={"Cache-Control": "private, no-store"})


@router.get("/api/media/{asset_id}/signed")
def signed_content(asset_id: str, expires: int, signature: str):
    enabled()
    if media.media_backend() != "filesystem":
        raise HTTPException(404)
    asset = media.get_asset(asset_id)
    if not asset:
        raise HTTPException(404)
    if expires < int(time.time()) or expires > int(time.time()) + 86400 or not hmac.compare_digest(signature, media.signature(asset_id, asset["object_version_id"], expires)):
        raise HTTPException(403, "素材链接已过期或无效")
    path = media.materialize(asset_id)
    mime = asset["content_type"]
    inline = mime in {"image/png", "image/jpeg", "image/webp", "image/gif"} or mime.startswith(("video/", "audio/"))
    return FileResponse(path, media_type=mime, filename=None if inline else asset["display_name"],
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"})


@router.get("/assets/{legacy_path:path}")
def asset_alias(legacy_path: str):
    return legacy_content("/assets/" + legacy_path)


@router.get("/output/{legacy_path:path}")
def output_alias(legacy_path: str):
    return legacy_content("/output/" + legacy_path)


def legacy_content(ref):
    enabled()
    asset = media.get_asset(ref)
    if not asset:
        raise HTTPException(404, "旧素材路径尚未迁移")
    return RedirectResponse(media.browser_url(asset), 307, headers={"Cache-Control": "private, no-store"})


async def preview(ref, width):
    from app.services.assets import generate_media_preview_file
    asset = media.get_asset(ref)
    if not asset:
        raise HTTPException(404, "素材不存在")
    width = max(64, min(2048, int(width or 512)))
    media_id = "ast_" + hashlib.sha256(f"preview-v1:{asset['id']}:{width}".encode()).hexdigest()[:32]
    existing = media.get_asset(media_id, ready=False)
    if not existing or existing["status"] != "ready":
        path = await asyncio.to_thread(media.materialize, asset["id"])
        root = media.operation()["root"]
        target, _ = await asyncio.to_thread(generate_media_preview_file, path, width, str(root / "preview.webp"), str(root / "preview.png"))
        existing = await asyncio.to_thread(media.publish, target, Path(target).name, asset_id=media_id, parent_asset_id=asset["id"], role="preview")
    return RedirectResponse(media.browser_url(existing), 307, headers={"Cache-Control": "private, no-store"})
