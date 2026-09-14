"""Versioned objects, stable references and operation-scoped local materialization.

filesystem is a private local simulator, not an S3/TOS compatibility claim. Both
backends use the same metadata, checksum validation and immutable object contract.
"""
import copy
import hashlib
import hmac
import mimetypes
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
from contextlib import contextmanager
from contextvars import ContextVar
from urllib.parse import quote, unquote, urlsplit
import uuid
import json
from functools import lru_cache

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.settings import media_backend
from app.storage.workspace import current_workspace

_scope = ContextVar("media_operation", default=None)
result_slot = ContextVar("media_result_slot", default=None)
ASSET_ID = re.compile(r"ast_[a-f0-9]{32}")


def max_file_bytes():
    return int(os.getenv("MEDIA_MAX_FILE_BYTES", str(2 * 1024 ** 3)))


def temp_root():
    root = Path(os.getenv("MEDIA_TEMP_DIR", str(Path(tempfile.gettempdir()) / "infinite-canvas-media"))).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


@contextmanager
def operation_scope():
    # Always own the directory: a worker must not inherit a request's lifetime.
    with tempfile.TemporaryDirectory(prefix="op-", dir=temp_root()) as directory:
        (Path(directory) / ".owner.json").write_text(json.dumps({"pid": os.getpid(), "created_at": time.time()}), encoding="utf-8")
        from app.storage.documents import read_versions
        document_token = read_versions.set({})
        token = _scope.set({"root": Path(directory), "paths": {}, "published": {}})
        try:
            yield Path(directory)
        finally:
            _scope.reset(token)
            read_versions.reset(document_token)


def operation():
    value = _scope.get()
    if value is None or not value["root"].exists():
        raise RuntimeError("Object media processing requires operation_scope()")
    return value


def scratch_directory(category="output"):
    path = operation()["root"] / ("input" if category == "input" else "output")
    path.mkdir(exist_ok=True)
    return str(path)


def check_budget(additional=0):
    root = temp_root()
    used = 0

    def scan_error(error):
        # Completed requests remove their operation directories concurrently.
        # Keep scanning siblings, but do not hide permission or disk failures.
        if not isinstance(error, FileNotFoundError):
            raise error

    for directory, _, names in os.walk(root, onerror=scan_error):
        for name in names:
            path = Path(directory) / name
            try:
                if path.is_file():
                    used += path.stat().st_size
            except FileNotFoundError:
                pass  # A completed operation may also remove an individual file.
    limit = int(os.getenv("MEDIA_TEMP_MAX_BYTES", str(10 * 1024 ** 3)))
    if used + additional > limit or shutil.disk_usage(root).free < additional + 128 * 1024 ** 2:
        raise HTTPException(507, "媒体临时空间不足，请稍后重试")


def file_digest(path):
    size, digest = 0, hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(chunk)
            if size > max_file_bytes():
                raise HTTPException(413, "素材超过单文件限制")
            digest.update(chunk)
    return size, digest.hexdigest()


def canonical_legacy(value):
    if not isinstance(value, str) or not value.startswith(("/assets/", "/output/")):
        return ""
    raw = unquote(urlsplit(value).path).replace("\\", "/")
    if "\x00" in raw or any(part in {"..", "."} for part in raw.split("/")):
        raise HTTPException(400, "无效的素材路径")
    return raw


def id_from_ref(value):
    if isinstance(value, dict):
        value = value.get("media_asset_id") or value.get("url") or ""
    if not isinstance(value, str):
        return ""
    if ASSET_ID.fullmatch(value):
        return value
    match = re.match(r"^/(?:assets/cloud|api/media)/(ast_[a-f0-9]{32})(?:/|$)", value)
    return match.group(1) if match else ""


def get_asset(ref, ready=True):
    asset_id = id_from_ref(ref)
    if not asset_id:
        legacy = canonical_legacy(ref)
        if not legacy:
            return None
        with connection() as conn:
            alias = conn.execute("SELECT asset_id FROM asset_aliases WHERE workspace_id=%s AND source_namespace=%s AND legacy_ref=%s", (current_workspace(), os.getenv("ASSET_SOURCE_NAMESPACE", "local"), legacy)).fetchone()
        asset_id = alias["asset_id"] if alias else None
    if not asset_id:
        return None
    with connection() as conn:
        row = conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=%s", (current_workspace(), asset_id)).fetchone()
    from app.services.member_context import current_access
    if row and row["role"] == "task-result-source" and current_access.get() is not None:
        raise HTTPException(404, "素材不存在")
    if ready and (not row or row["status"] != "ready" or row["deleted_at"]):
        raise HTTPException(404, "素材不存在或尚未就绪")
    return row


def stable_url(asset):
    # Retain /assets classification and extensions used by existing canvas nodes.
    return "/assets/cloud/" + asset["id"] + "/" + quote(asset["display_name"] or "media", safe="")


class FilesystemStore:
    def __init__(self):
        self.root = Path(os.environ["OBJECT_STORE_ROOT"]).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key, version):
        # Object keys and version identifiers only originate from this service.
        if not re.fullmatch(r"[a-zA-Z0-9_/.-]+", key) or not re.fullmatch(r"[a-f0-9]{32}", version):
            raise ValueError("Invalid object key/version")
        path = (self.root / key / version).resolve()
        if self.root not in path.parents:
            raise ValueError("Object escaped private root")
        return path

    def put(self, key, path, content_type):
        version = uuid.uuid4().hex
        target = self.path(key, version)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "rb") as src, target.open("xb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
        return version

    def download(self, asset, path):
        source = self.path(asset["object_key"], asset["object_version_id"])
        if source.stat().st_size != asset["size_bytes"]:
            raise HTTPException(502, "对象大小校验失败")
        with source.open("rb") as src, open(path, "wb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)


class TosStore:
    def __init__(self):
        import tos
        self.bucket = os.environ["TOS_BUCKET"]
        self.client = tos.TosClientV2(os.environ["TOS_ACCESS_KEY"], os.environ["TOS_SECRET_KEY"],
                                      os.environ["TOS_INTERNAL_ENDPOINT"], os.environ["TOS_REGION"],
                                      security_token=os.getenv("TOS_SECURITY_TOKEN"), connection_time=10, socket_timeout=120, max_connections=20)

    def put(self, key, path, content_type):
        result = self.client.put_object_from_file(self.bucket, key, str(path), content_type=content_type, forbid_overwrite=True)
        version = result.version_id
        if not version or version == "null":
            raise RuntimeError("TOS Bucket must have versioning enabled")
        head = self.client.head_object(self.bucket, key, version_id=version)
        if head.content_length != os.path.getsize(path):
            raise RuntimeError("TOS upload size verification failed")
        return version

    def download(self, asset, path):
        if asset["bucket"] != self.bucket:
            raise RuntimeError("Asset bucket does not match configured bucket")
        head = self.client.head_object(self.bucket, asset["object_key"], version_id=asset["object_version_id"])
        if head.content_length != asset["size_bytes"] or head.content_length > max_file_bytes():
            raise HTTPException(502, "TOS 对象大小校验失败")
        self.client.get_object_to_file(self.bucket, asset["object_key"], str(path), version_id=asset["object_version_id"])

    def signed_url(self, asset, seconds):
        from tos.enum import HttpMethodType
        result = self.client.pre_signed_url(HttpMethodType.Http_Method_Get, self.bucket, asset["object_key"],
                                            expires=seconds, query={"versionId": asset["object_version_id"]},
                                            alternative_endpoint=os.environ["TOS_PUBLIC_ENDPOINT"])
        return result.signed_url


def store():
    return _tos_store() if media_backend() == "tos" else FilesystemStore()


@lru_cache(maxsize=1)
def _tos_store():
    return TosStore()


def cleanup_orphaned_operations(min_age_seconds=3600):
    """Only dead-process operation directories; never objects or legacy assets."""
    def alive(pid):
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            handle = kernel.OpenProcess(0x1000, False, pid)
            if not handle:
                return ctypes.get_last_error() != 87  # Access denied is not proof of death.
            try:
                code = wintypes.DWORD()
                return not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
            finally:
                kernel.CloseHandle(handle)
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True

    removed = 0
    root = temp_root()
    for path in root.glob("op-*"):
        if not path.is_dir() or path.is_symlink() or path.resolve().parent != root:
            continue
        try:
            owner = json.loads((path / ".owner.json").read_text(encoding="utf-8"))
            pid = int(owner["pid"])
            if pid > 0 and time.time() - float(owner["created_at"]) > min_age_seconds and not alive(pid):
                shutil.rmtree(path)
                removed += 1
        except (OSError, ValueError, KeyError):
            continue
    return removed


def publish(path, display_name=None, legacy_ref=None, asset_id=None, parent_asset_id=None, role="original"):
    path = Path(path)
    size, digest = file_digest(path)
    existing = get_asset(asset_id or legacy_ref, ready=False) if asset_id or legacy_ref else None
    if existing and existing["status"] == "ready":
        if existing["sha256"] != digest:
            raise HTTPException(409, "旧路径或输出槽位内容已变化，不能覆盖原件")
        return existing
    media_id = existing["id"] if existing else asset_id or "ast_" + uuid.uuid4().hex
    if not ASSET_ID.fullmatch(media_id):
        raise ValueError("Invalid media id")
    name = Path(display_name or path.name).name[:240]
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    kind = mime.split("/")[0] if mime.split("/")[0] in {"image", "video", "audio"} else "workflow" if name.lower().endswith(".zip") else "file"
    # Every attempt owns a separate key. Failed attempts cannot overwrite ready data.
    workspace = current_workspace()
    key = "media/" + workspace + "/" + media_id + "/" + uuid.uuid4().hex + (Path(name).suffix[:12] or ".bin")
    bucket = os.getenv("TOS_BUCKET", "local-simulation") if media_backend() == "tos" else "local-simulation"
    region = os.getenv("TOS_REGION", "local") if media_backend() == "tos" else "local"
    with connection() as conn:
        conn.execute("INSERT INTO assets(workspace_id,id,kind,status,display_name,bucket,region,object_key,parent_asset_id,role) VALUES(%s,%s,%s,'uploading',%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO NOTHING", (workspace, media_id, kind, name, bucket, region, key, parent_asset_id, role))
        if not conn.execute("SELECT 1 FROM assets WHERE workspace_id=%s AND id=%s", (workspace, media_id)).fetchone():
            raise HTTPException(409, "素材 ID 不可用于当前空间")
    version = store().put(key, path, mime)
    with connection() as conn:
        from app.storage.tasks import lease_context
        lease = lease_context.get()
        if lease and not conn.execute("SELECT id FROM tasks WHERE workspace_id=%s AND id=%s AND lease_token=%s AND lease_until>now() FOR SHARE", (workspace, *lease)).fetchone():
            raise HTTPException(409, "任务租约已失效，拒绝发布旧执行者的输出")
        row = conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=%s FOR UPDATE", (workspace, media_id)).fetchone()
        if row["status"] == "ready":
            if row["sha256"] != digest:
                raise HTTPException(409, "输出槽位已被另一份内容占用")
        else:
            row = conn.execute("UPDATE assets SET status='ready',object_key=%s,object_version_id=%s,size_bytes=%s,sha256=%s,content_type=%s,updated_at=now() WHERE workspace_id=%s AND id=%s RETURNING *", (key, version, size, digest, mime, workspace, media_id)).fetchone()
        if legacy_ref:
            canonical = canonical_legacy(legacy_ref)
            if not canonical:
                raise ValueError("Legacy alias must be a complete /assets/ or /output/ path")
            conn.execute("INSERT INTO asset_aliases(workspace_id,source_namespace,legacy_ref,asset_id,source_sha256) VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (workspace, os.getenv("ASSET_SOURCE_NAMESPACE", "local"), canonical, media_id, digest))
            alias = conn.execute("SELECT asset_id,source_sha256 FROM asset_aliases WHERE workspace_id=%s AND source_namespace=%s AND legacy_ref=%s", (workspace, os.getenv("ASSET_SOURCE_NAMESPACE", "local"), canonical)).fetchone()
            if alias["asset_id"] != media_id or alias["source_sha256"] != digest:
                raise HTTPException(409, "素材迁移映射冲突")
    return row


def publish_output(filename, category="output"):
    path = Path(scratch_directory(category)) / filename
    op = operation()
    cache_key = (current_workspace(), str(path), result_slot.get())
    if cache_key not in op["published"]:
        check_budget()
        # Fixed output slots make task finalization idempotent across restarts.
        from app.storage.tasks import lease_context
        lease = lease_context.get()
        asset_id = result_slot.get() or ("ast_" + hashlib.sha256((lease[0] + ":" + category + ":" + filename).encode()).hexdigest()[:32] if lease else None)
        op["published"][cache_key] = publish(path, asset_id=asset_id)
    return stable_url(op["published"][cache_key])


def materialize(ref):
    asset = get_asset(ref)
    if not asset:
        return None
    op = operation()
    if asset["id"] not in op["paths"]:
        check_budget(asset["size_bytes"])
        suffix = Path(asset["display_name"]).suffix[:12]
        path = op["root"] / (asset["id"] + suffix)
        try:
            store().download(asset, path)
            if file_digest(path) != (asset["size_bytes"], asset["sha256"]):
                raise HTTPException(502, "素材内容校验失败")
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        op["paths"][asset["id"]] = str(path)
    return op["paths"][asset["id"]]


def signature(asset_id, version, expires, member=""):
    secret = os.environ["MEDIA_SIGNING_KEY"].encode()
    payload = f"{current_workspace()}:{asset_id}:{version}:{expires}"
    if member:
        payload += ":member:" + member
    return hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()


def browser_url(asset, provider=False):
    if asset.get("role") == "task-result-source":
        raise HTTPException(404, "内部任务检查点不可分享")
    if asset.get("workspace_id", "default") != current_workspace():
        raise HTTPException(404, "素材不属于当前空间")
    ttl = int(os.getenv("MEDIA_PROVIDER_URL_TTL" if provider else "MEDIA_BROWSER_URL_TTL", "3600" if provider else "300"))
    ttl = min(max(ttl, 30), 86400)
    if media_backend() == "tos":
        return store().signed_url(asset, ttl)
    expires = int(time.time()) + ttl
    member = ""
    if not provider:
        from app.services.member_context import current_access
        access = current_access.get()
        if access:
            member = access.principal.member_id
    path = f"/api/media/{asset['id']}/signed?workspace={quote(current_workspace(), safe='')}&expires={expires}&signature={signature(asset['id'], asset['object_version_id'], expires, member)}"
    if member:
        path += "&member=" + quote(member, safe="")
    return os.getenv("PUBLIC_BASE_URL", "").rstrip("/") + path if provider else path


def referenced_ids(value):
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            # These are literal text, historical billing or supplier metadata,
            # even if their content happens to resemble a local asset ID.
            if key not in {"prompt", "text", "name", "description", "cost", "billing_price", "registrations", "asset_uri", "asset_uris"}:
                found.update(referenced_ids(child))
    elif isinstance(value, list):
        for child in value:
            found.update(referenced_ids(child))
    elif isinstance(value, str):
        media_id = id_from_ref(value)
        if media_id:
            found.add(media_id)
    return found


def normalize_document(value):
    # Only structured media fields; never rewrite prompts, costs or supplier URIs.
    fields = {"url", "src", "path", "image", "video", "output", "output_url", "outputUrl", "image_url", "video_url", "videoUrl", "thumbnail", "thumbnail_url", "images", "videos", "outputs", "references", "frames"}

    def walk(item, field=""):
        if isinstance(item, dict):
            result = {k: (copy.deepcopy(v) if k in {"logs", "cost", "billing_price", "registrations"} else walk(v, k)) for k, v in item.items()}
            media_id = id_from_ref(result.get("url", ""))
            if media_id:
                result["media_asset_id"] = media_id
            return result
        if isinstance(item, list):
            return [walk(child, field) for child in item]
        if isinstance(item, str) and field in fields and item.startswith(("/assets/", "/output/", "/api/media/")):
            asset = get_asset(item)
            return stable_url(asset) if asset else item
        return item

    return walk(value)


async def download_remote(url, prefix="media_", category="output", provider=None, default_extension=".bin"):
    """Persist supplier output with bounded memory and per-redirect URL checks."""
    import ipaddress
    import socket
    import httpx
    from app.providers.registry import httpx_provider_kwargs

    def validate_url(value):
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            raise HTTPException(400, "无效的远程素材地址")
        addresses = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
            raise HTTPException(400, "云模式不允许导入内网素材地址")

    import asyncio
    timeout = httpx.Timeout(connect=20, read=120, write=60, pool=20)
    current = url
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, **httpx_provider_kwargs(provider)) as client:
        for _ in range(6):
            await asyncio.to_thread(validate_url, current)
            async with client.stream("GET", current) as response:
                if response.is_redirect:
                    from urllib.parse import urljoin
                    current = urljoin(current, response.headers["location"])
                    continue
                response.raise_for_status()
                mime = response.headers.get("content-type", "").split(";", 1)[0]
                extension = mimetypes.guess_extension(mime) or Path(urlsplit(current).path).suffix[:12] or default_extension
                name = prefix + hashlib.sha256(urlsplit(url)._replace(query="", fragment="").geturl().encode()).hexdigest()[:24] + extension
                path = Path(scratch_directory(category)) / name
                total = 0
                with path.open("wb") as target:
                    async for chunk in response.aiter_bytes(1024 * 1024):
                        total += len(chunk)
                        if total > max_file_bytes():
                            raise HTTPException(413, "远程素材超过单文件限制")
                        check_budget(len(chunk))
                        target.write(chunk)
                if total == 0:
                    raise HTTPException(502, "供应商返回了空素材")
                return await asyncio.to_thread(publish_output, name, category)
    raise HTTPException(502, "远程素材重定向次数过多")
