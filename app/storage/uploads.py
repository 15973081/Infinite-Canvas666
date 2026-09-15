"""Resumable staging uploads. Only the server can publish immutable ready media."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import time
import uuid

from fastapi import HTTPException
from app.storage import media
from app.storage.database import connection
from app.storage.workspace import current_workspace, workspace_scope


def get(asset_id):
    with connection() as conn:
        row = conn.execute("SELECT u.*,a.staging_key,a.staging_version_id,a.bucket,a.content_type,a.display_name "
                           "FROM media_uploads u JOIN assets a ON a.id=u.asset_id WHERE u.workspace_id=%s AND u.asset_id=%s", (current_workspace(), asset_id)).fetchone()
    if not row:
        raise HTTPException(404, "上传不存在")
    if row["backend"] != media.media_backend():
        raise HTTPException(409, "上传的存储后端已改变")
    return row


def parts(asset_id):
    with connection() as conn:
        return conn.execute("SELECT p.* FROM media_upload_parts p JOIN media_uploads u ON u.asset_id=p.asset_id WHERE u.workspace_id=%s AND p.asset_id=%s ORDER BY part_number", (current_workspace(), asset_id)).fetchall()


def writable(row):
    if row["status"] != "uploading":
        raise HTTPException(409, "上传已封存，不能修改分片")
    if row["expires_at"].timestamp() <= time.time():
        raise HTTPException(410, "上传已过期，请重新选择文件")


def result(asset_id):
    row = get(asset_id)
    value = {"media_asset_id": asset_id, "status": row["status"], "size": row["size_bytes"],
             "part_size": row["part_size"], "part_count": row["part_count"],
             "expires_at": row["expires_at"].timestamp(),
             "parts": [{"part_number": p["part_number"], "sha256": p["sha256"]}
                       for p in parts(asset_id) if p["etag"] or p["object_version_id"]]}
    if row["status"] == "ready":
        asset = media.get_asset(asset_id)
        value.update(url=media.stable_url(asset), name=asset["display_name"], kind=asset["kind"],
                     sha256=asset["sha256"], filename=asset["display_name"])
    return value


def create(name, size, idempotency_key):
    if size <= 0 or size > media.max_file_bytes():
        raise HTTPException(413, "素材大小超出允许范围")
    name = Path(name.replace("\\", "/")).name[:240]
    if not name or name in {".", ".."} or any(ord(c) < 32 for c in name):
        raise HTTPException(400, "无效文件名")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{16,128}", idempotency_key):
        raise HTTPException(400, "无效上传幂等键")
    digest = hashlib.sha256(json.dumps([name, size], ensure_ascii=False).encode()).hexdigest()
    part_size = 8 * 1024 * 1024
    count = (size + part_size - 1) // part_size
    if count > 10000:
        raise HTTPException(413, "素材分片数量超出限制")
    backend = media.media_backend()
    with connection() as conn:
        from app.services.maintenance_control import ensure
        ensure(conn, current_workspace(), 'write')
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("upload:" + current_workspace() + ":" + idempotency_key,))
        old = conn.execute("SELECT * FROM media_uploads WHERE workspace_id=%s AND idempotency_key=%s", (current_workspace(), idempotency_key)).fetchone()
        if old:
            if old["request_sha256"] != digest or old["backend"] != backend:
                raise HTTPException(409, "同一上传幂等键的文件声明不同")
            if old["expires_at"].timestamp() <= time.time() and old["status"] not in {"ready", "verifying"}:
                raise HTTPException(410, "上传已过期，请开始新的上传")
            asset_id = old["asset_id"]
        else:
            asset_id = "ast_" + uuid.uuid4().hex
            mime = media.guess_content_type(name)
            kind = mime.split("/")[0]
            kind = kind if kind in {"image", "audio", "video"} else "workflow" if name.endswith(".zip") else "file"
            bucket = os.environ["TOS_BUCKET"] if backend == "tos" else "local-simulation"
            region = os.environ["TOS_REGION"] if backend == "tos" else "local"
            ttl = max(300, min(86400, int(os.getenv("MEDIA_UPLOAD_TTL", "86400"))))
            conn.execute("INSERT INTO assets(workspace_id,id,kind,display_name,bucket,region,object_key,staging_key,content_type,upload_expires_at) "
                         "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,now()+make_interval(secs=>%s))",
                         (current_workspace(), asset_id, kind, name, bucket, region, "media/" + current_workspace() + "/" + asset_id + "/pending",
                          "staging/" + current_workspace() + "/" + asset_id, mime, ttl))
            conn.execute("INSERT INTO media_uploads(workspace_id,asset_id,idempotency_key,request_sha256,backend,size_bytes,part_size,part_count,status,expires_at) "
                         "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'initiating',now()+make_interval(secs=>%s))",
                         (current_workspace(), asset_id, idempotency_key, digest, backend, size, part_size, count, ttl))
    initialize(asset_id)
    return result(asset_id)


def initialize(asset_id):
    token = uuid.uuid4()
    with connection() as conn:
        claimed = conn.execute("UPDATE media_uploads SET lease_token=%s,lease_until=now()+interval '2 minutes' "
                               "WHERE workspace_id=%s AND asset_id=%s AND status='initiating' AND (lease_until IS NULL OR lease_until<now()) RETURNING asset_id",
                               (token, current_workspace(), asset_id)).fetchone()
    if not claimed:
        return
    row = get(asset_id)
    store = media.store()
    upload_id = (store.client.create_multipart_upload(store.bucket, row["staging_key"], content_type=row["content_type"], cache_control=media.BROWSER_MEDIA_CACHE_CONTROL).upload_id
                 if row["backend"] == "tos" else uuid.uuid4().hex)
    with connection() as conn:
        conn.execute("UPDATE media_uploads SET upload_id=%s,status='uploading',lease_token=NULL,lease_until=NULL,updated_at=now() "
                     "WHERE asset_id=%s AND lease_token=%s AND status='initiating' AND lease_until>now()", (upload_id, asset_id, token))


def part_size(row, number):
    if not 1 <= number <= row["part_count"]:
        raise HTTPException(400, "无效分片编号")
    return min(row["part_size"], row["size_bytes"] - (number - 1) * row["part_size"])


def part_signature(asset_id, number, digest, size, expires):
    message = f"upload:{current_workspace()}:{asset_id}:{number}:{digest}:{size}:{expires}"
    return hmac.new(os.environ["MEDIA_SIGNING_KEY"].encode(), message.encode(), hashlib.sha256).hexdigest()


def sign_part(asset_id, number, digest):
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise HTTPException(400, "分片 SHA-256 无效")
    row = get(asset_id)
    writable(row)
    size = part_size(row, number)
    with connection() as conn:
        current = conn.execute("SELECT * FROM media_uploads WHERE asset_id=%s FOR UPDATE", (asset_id,)).fetchone()
        writable(current)
        conn.execute("INSERT INTO media_upload_parts(asset_id,part_number,size_bytes,sha256) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                     (asset_id, number, size, digest))
        old = conn.execute("SELECT sha256 FROM media_upload_parts WHERE asset_id=%s AND part_number=%s", (asset_id, number)).fetchone()
        if old["sha256"] != digest:
            raise HTTPException(409, "续传文件内容已改变，请开始新的上传")
    ttl = max(1, min(900, int(row["expires_at"].timestamp() - time.time())))
    if row["backend"] == "tos":
        from tos.enum import HttpMethodType
        store = media.store()
        url = store.client.pre_signed_url(HttpMethodType.Http_Method_Put, store.bucket, row["staging_key"],
            expires=ttl, header={"Content-Length": str(size), "Content-Type": "application/octet-stream"},
            query={"uploadId": row["upload_id"], "partNumber": str(number)},
            alternative_endpoint=os.environ["TOS_PUBLIC_ENDPOINT"], is_signed_all_headers=True).signed_url
    else:
        expires = int(time.time()) + ttl
        signature = part_signature(asset_id, number, digest, size, expires)
        url = f"/api/media/uploads/{asset_id}/parts/{number}/content?workspace={current_workspace()}&expires={expires}&signature={signature}"
    return {"url": url, "method": "PUT", "headers": {"Content-Type": "application/octet-stream"}, "size": size}


async def receive_part(asset_id, number, expires, signature, request):
    row = get(asset_id)
    writable(row)
    if row["backend"] != "filesystem":
        raise HTTPException(404)
    part = next((p for p in parts(asset_id) if p["part_number"] == number), None)
    if not part or expires < time.time() or expires > time.time() + 901:
        raise HTTPException(403, "上传凭证已过期或无效")
    expected = part_signature(asset_id, number, part["sha256"], part["size_bytes"], expires)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(403, "上传凭证无效")
    from app.services.maintenance_control import ensure
    with connection() as conn:
        ensure(conn, current_workspace(), 'upload.finish', asset_id)
    path = media.operation()["root"] / "upload-part"
    size, digest = 0, hashlib.sha256()
    with path.open("xb") as stream:
        async for chunk in request.stream():
            size += len(chunk)
            if size > part["size_bytes"]:
                raise HTTPException(413, "分片超过声明大小")
            media.check_budget(len(chunk))
            digest.update(chunk)
            stream.write(chunk)
    if size != part["size_bytes"] or digest.hexdigest() != part["sha256"]:
        raise HTTPException(422, "分片大小或 SHA-256 校验失败")
    import asyncio
    def persist():
        # Only this bounded local copy holds the row lock, preventing expiry
        # cleanup from racing a late writer and recreating a cleaned directory.
        with connection() as conn:
            ensure(conn, current_workspace(), 'upload.finish', asset_id)
            current = conn.execute("SELECT * FROM media_uploads WHERE asset_id=%s FOR UPDATE", (asset_id,)).fetchone()
            writable(current)
            old = conn.execute("SELECT object_version_id FROM media_upload_parts WHERE asset_id=%s AND part_number=%s", (asset_id, number)).fetchone()
            if not old["object_version_id"]:
                version = media.store().put(row["staging_key"] + f"/parts/{number}", path, "application/octet-stream")
                conn.execute("UPDATE media_upload_parts SET object_version_id=%s,etag=sha256 WHERE asset_id=%s AND part_number=%s", (version, asset_id, number))
    await asyncio.to_thread(persist)
    return {"part_number": number, "sha256": part["sha256"]}


def confirm_part(asset_id, number):
    row = get(asset_id)
    writable(row)
    size = part_size(row, number)
    etag = None
    if row["backend"] == "tos":
        store = media.store()
        found = store.client.list_parts(store.bucket, row["staging_key"], row["upload_id"], part_number_marker=number-1, max_parts=1).parts
        if not found or found[0].part_number != number or found[0].size != size:
            raise HTTPException(409, "对象存储中尚无完整分片")
        etag = found[0].etag
    with connection() as conn:
        writable(conn.execute("SELECT * FROM media_uploads WHERE asset_id=%s FOR UPDATE", (asset_id,)).fetchone())
        part = conn.execute("SELECT * FROM media_upload_parts WHERE asset_id=%s AND part_number=%s", (asset_id, number)).fetchone()
        if not part or (row["backend"] == "filesystem" and not part["object_version_id"]):
            raise HTTPException(409, "分片尚未上传")
        if etag:
            conn.execute("UPDATE media_upload_parts SET etag=%s WHERE asset_id=%s AND part_number=%s", (etag, asset_id, number))
    return {"part_number": number, "sha256": part["sha256"]}


def _stage(row, uploaded, target):
    store = media.store()
    if row["backend"] == "filesystem":
        with target.open("wb") as stream:
            for part in uploaded:
                source = store.path(row["staging_key"] + f"/parts/{part['part_number']}", part["object_version_id"])
                if source.stat().st_size != part["size_bytes"]:
                    raise HTTPException(422, "暂存分片大小已改变")
                with source.open("rb") as src:
                    shutil.copyfileobj(src, stream, 1024 * 1024)
        return store.put(row["staging_key"] + "/source", target, row["content_type"])
    from tos.models2 import UploadedPart
    from tos.exceptions import TosServerError
    # A lost CompleteMultipartUpload response can be recovered by HEAD: this
    # random staging key can only be completed by our server, never by a client.
    try:
        head = store.client.head_object(store.bucket, row["staging_key"])
    except TosServerError as exc:
        if exc.status_code != 404:
            raise
        store.client.complete_multipart_upload(store.bucket, row["staging_key"], row["upload_id"],
            parts=[UploadedPart(p["part_number"], p["etag"]) for p in uploaded])
        head = store.client.head_object(store.bucket, row["staging_key"])
    if not head.version_id or head.version_id == "null":
        raise HTTPException(502, "TOS 必须开启版本控制")
    return head.version_id


def _verify(path, row, uploaded):
    size, digest = media.file_digest(path)
    if size != row["size_bytes"]:
        raise HTTPException(422, "合并文件大小不符")
    with path.open("rb") as stream:
        for part in uploaded:
            if hashlib.sha256(stream.read(part["size_bytes"])).hexdigest() != part["sha256"]:
                raise HTTPException(422, "合并文件分片校验失败")
    # Never trust an image/ZIP extension as proof that the bytes are usable.
    mime = row["content_type"]
    if mime.startswith("image/"):
        from PIL import Image
        try:
            with Image.open(path) as image:
                image.verify()
        except Exception as exc:
            raise HTTPException(422, "图片格式无效") from exc
    elif mime.startswith(("video/", "audio/")):
        import subprocess
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", str(path)],
                               capture_output=True, timeout=60, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            types = {s["codec_type"] for s in json.loads(probe.stdout)["streams"]}
            valid = probe.returncode == 0 and mime.split("/")[0] in types
        except (ValueError, KeyError):
            valid = False
        if not valid:
            raise HTTPException(422, "音视频格式无效")
    elif row["display_name"].lower().endswith(".zip"):
        import zipfile
        if not zipfile.is_zipfile(path):
            raise HTTPException(422, "ZIP 格式无效")
    return size, digest


def complete(asset_id):
    row = get(asset_id)
    if row["status"] == "ready":
        return result(asset_id)
    token = uuid.uuid4()
    with connection() as conn:
        current = conn.execute("SELECT * FROM media_uploads WHERE asset_id=%s FOR UPDATE", (asset_id,)).fetchone()
        if current["status"] == "ready":
            return result(asset_id)
        if current["status"] == "uploading":
            writable(current)
        elif current["status"] != "verifying":
            raise HTTPException(409, "上传不可确认")
        if current["lease_until"] and current["lease_until"].timestamp() > time.time():
            raise HTTPException(409, "上传正在确认，请稍后重试", headers={"Retry-After": "2"})
        uploaded = parts(asset_id)
        if len(uploaded) != row["part_count"] or any(not (p["etag"] or p["object_version_id"]) for p in uploaded):
            raise HTTPException(409, "仍有未完成的分片")
        conn.execute("UPDATE media_uploads SET status='verifying',lease_token=%s,lease_until=now()+interval '10 minutes',updated_at=now() WHERE asset_id=%s", (token, asset_id))
        conn.execute("UPDATE assets SET status='verifying',updated_at=now() WHERE id=%s", (asset_id,))
    try:
        media.check_budget(row["size_bytes"])
        path = media.operation()["root"] / "verified-upload"
        version = row["staging_version_id"] or _stage(row, uploaded, path)
        with connection() as conn:
            if not conn.execute("SELECT 1 FROM media_uploads WHERE asset_id=%s AND lease_token=%s AND lease_until>now() FOR UPDATE", (asset_id, token)).fetchone():
                raise HTTPException(409, "上传确认租约已失效")
            conn.execute("UPDATE assets SET staging_version_id=%s WHERE id=%s", (version, asset_id))
        staged = {"bucket": row["bucket"], "object_key": row["staging_key"] + ("/source" if row["backend"] == "filesystem" else ""),
                  "object_version_id": version, "size_bytes": row["size_bytes"]}
        media.store().download(staged, path)
        size, digest = _verify(path, row, uploaded)
        key = "media/" + current_workspace() + "/" + asset_id + "/" + uuid.uuid4().hex
        final_version = media.store().put(key, path, row["content_type"])
        with connection() as conn:
            if not conn.execute("SELECT 1 FROM media_uploads WHERE asset_id=%s AND lease_token=%s AND lease_until>now() FOR UPDATE", (asset_id, token)).fetchone():
                raise HTTPException(409, "上传确认租约已失效")
            conn.execute("UPDATE assets SET status='ready',object_key=%s,object_version_id=%s,size_bytes=%s,sha256=%s,updated_at=now() WHERE id=%s",
                         (key, final_version, size, digest, asset_id))
            conn.execute("UPDATE media_uploads SET status='ready',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE asset_id=%s", (asset_id,))
        return result(asset_id)
    finally:
        with connection() as conn:
            conn.execute("UPDATE media_uploads SET lease_token=NULL,lease_until=NULL WHERE asset_id=%s AND lease_token=%s", (asset_id, token))


def abort(asset_id):
    with connection() as conn:
        row = conn.execute("SELECT * FROM media_uploads WHERE workspace_id=%s AND asset_id=%s FOR UPDATE", (current_workspace(), asset_id)).fetchone()
        if not row:
            raise HTTPException(404, "上传不存在")
        if row["status"] == "ready" or (row["lease_until"] and row["lease_until"].timestamp() > time.time()):
            raise HTTPException(409, "已发布或正在处理的上传不可取消")
        conn.execute("UPDATE media_uploads SET status='aborted',updated_at=now() WHERE asset_id=%s", (asset_id,))
        conn.execute("UPDATE assets SET status='failed',updated_at=now() WHERE id=%s", (asset_id,))
    return {"status": "aborted", "media_asset_id": asset_id}


def cleanup(grace_seconds=3600, *, all_workspaces=False):
    if all_workspaces:
        # Trusted maintenance CLI only; HTTP cleanup must retain its space scope.
        with connection() as conn:
            workspaces = [r["workspace_id"] for r in conn.execute(
                "SELECT DISTINCT workspace_id FROM media_uploads WHERE cleaned_at IS NULL")]
        total = 0
        for workspace in workspaces:
            with workspace_scope(workspace):
                total += cleanup(grace_seconds)
        return total
    # Wait past the entire credential lifetime, including already signed PUTs.
    with connection() as conn:
        ids = [r["asset_id"] for r in conn.execute("SELECT asset_id FROM media_uploads WHERE workspace_id=%s AND cleaned_at IS NULL "
              "AND expires_at<now()-make_interval(secs=>%s) AND (lease_until IS NULL OR lease_until<now())", (current_workspace(), grace_seconds))]
    cleaned = 0
    for asset_id in ids:
        row = get(asset_id)
        if row["status"] not in {"ready", "aborted"}:
            abort(asset_id)
        if row["staging_key"] != "staging/" + current_workspace() + "/" + asset_id:
            raise RuntimeError("Refusing cleanup outside upload staging prefix")
        store = media.store()
        if row["backend"] == "filesystem":
            target = (store.root / row["staging_key"]).resolve()
            if target.parent != (store.root / "staging" / current_workspace()).resolve() or target.name != asset_id:
                raise RuntimeError("Staging path escaped private root")
            if target.exists():
                shutil.rmtree(target)
        else:
            from tos.exceptions import TosServerError
            if row["upload_id"]:
                try:
                    store.client.abort_multipart_upload(store.bucket, row["staging_key"], row["upload_id"])
                except TosServerError as exc:
                    if exc.status_code != 404:
                        raise
            try:
                head = store.client.head_object(store.bucket, row["staging_key"], version_id=row["staging_version_id"])
                if not head.version_id or head.version_id == "null":
                    raise RuntimeError("Staging cleanup requires an immutable version")
                store.client.delete_object(store.bucket, row["staging_key"], version_id=head.version_id)
            except TosServerError as exc:
                if exc.status_code != 404:
                    raise
        with connection() as conn:
            conn.execute("UPDATE media_uploads SET cleaned_at=now() WHERE asset_id=%s", (asset_id,))
        cleaned += 1
    return cleaned
