import asyncio
import hashlib
import hmac
import os
import re
from pathlib import Path
import time
import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel, Field
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
async def upload_media(request: Request):
    enabled()
    if request.headers.get("content-type", "").split(";", 1)[0] == "application/json":
        from app.storage import uploads
        from pydantic import ValidationError
        try:
            data = UploadStart.model_validate(await request.json())
        except (ValueError, ValidationError):
            raise HTTPException(422, "请提供文件名、大小和上传幂等键")
        return JSONResponse(await asyncio.to_thread(uploads.create, data.name, data.size, data.idempotency_key), headers={"Cache-Control": "no-store"})
    async with request.form() as form:
        from starlette.datastructures import UploadFile as FormUploadFile
        files = form.getlist("files")
        if not files or any(not isinstance(file, FormUploadFile) for file in files):
            raise HTTPException(422, "请选择要上传的文件")
        return await upload_files(files)


class UploadStart(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    size: int = Field(gt=0, strict=True)
    idempotency_key: str = Field(min_length=16, max_length=128)


class PartDeclaration(BaseModel):
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


@router.get("/api/media/uploads/{asset_id}")
def upload_status(asset_id: str):
    enabled()
    from app.storage import uploads
    return JSONResponse(uploads.result(asset_id), headers={"Cache-Control": "no-store"})


@router.post("/api/media/uploads/{asset_id}/parts/{number}")
def sign_upload_part(asset_id: str, number: int, data: PartDeclaration):
    enabled()
    from app.storage import uploads
    return JSONResponse(uploads.sign_part(asset_id, number, data.sha256), headers={"Cache-Control": "no-store"})


@router.put("/api/media/uploads/{asset_id}/parts/{number}/content")
async def put_upload_part(asset_id: str, number: int, request: Request, expires: int, signature: str, workspace: str = "default"):
    enabled()
    from app.storage import uploads
    from app.storage.workspace import workspace_scope
    # The signed capability, not the query selector, authorizes this one PUT.
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", workspace):
        raise HTTPException(400, "无效空间")
    with workspace_scope(workspace):
        return await uploads.receive_part(asset_id, number, expires, signature, request)


@router.post("/api/media/uploads/{asset_id}/parts/{number}/complete")
def confirm_upload_part(asset_id: str, number: int):
    enabled()
    from app.storage import uploads
    return uploads.confirm_part(asset_id, number)


@router.delete("/api/media/uploads/{asset_id}")
def abort_upload(asset_id: str):
    enabled()
    from app.storage import uploads
    return uploads.abort(asset_id)


@router.post("/api/media/uploads/{asset_id}/complete")
def complete_upload(asset_id: str):
    enabled()
    from app.storage import uploads
    try:
        uploads.get(asset_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    else:
        return uploads.complete(asset_id)
    asset = media.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    return {"media_asset_id": asset["id"], "url": media.stable_url(asset), "size": asset["size_bytes"], "sha256": asset["sha256"], "status": asset["status"]}


@router.get("/api/media/{asset_id}/content")
async def content(asset_id: str, variant: str = "original"):
    enabled()
    if variant == "preview":
        return await preview(asset_id, 512)
    if variant != "original":
        raise HTTPException(400, "未知媒体版本")
    asset = media.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    return RedirectResponse(media.browser_url(asset), status_code=307, headers={"Cache-Control": "private, no-store"})


@router.get("/api/media/{asset_id}/signed")
def signed_content(asset_id: str, expires: int, signature: str, workspace: str = "default", member: str = ""):
    from app.storage.workspace import workspace_scope
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", workspace):
        raise HTTPException(400, "无效空间")
    with workspace_scope(workspace):
        return _signed_content(asset_id, expires, signature, member)


def _signed_content(asset_id, expires, signature, member=""):
    enabled()
    if member:
        from app.services.member_context import current_access
        access = current_access.get()
        if access is None or access.principal.member_id != member:
            raise HTTPException(401, "素材链接需要原成员会话")
    if media.media_backend() != "filesystem":
        raise HTTPException(404)
    asset = media.get_asset(asset_id)
    if not asset or asset.get("role") == "task-result-source":
        raise HTTPException(404)
    if expires < int(time.time()) or expires > int(time.time()) + 86400 or not hmac.compare_digest(signature, media.signature(asset_id, asset["object_version_id"], expires, member)):
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
