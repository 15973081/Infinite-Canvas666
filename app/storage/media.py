"""Versioned objects, stable references and operation-scoped local materialization.

filesystem is a private local simulator, not an S3/TOS compatibility claim. Both
backends use the same metadata, checksum validation and immutable object contract.
"""
import copy
from collections import OrderedDict
from threading import Lock
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
import logging
from functools import lru_cache

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.settings import media_backend
from app.storage.workspace import current_workspace

_scope = ContextVar("media_operation", default=None)
result_slot = ContextVar("media_result_slot", default=None)
ASSET_ID = re.compile(r"ast_[a-f0-9]{32}")
logger = logging.getLogger(__name__)


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


def get_assets(refs, ready=True):
    """Resolve one operation's references in batches, never across workspaces."""
    ids = {ref: id_from_ref(ref) for ref in refs}
    aliases = {ref: canonical_legacy(ref) for ref in ids if not ids[ref]}
    workspace = current_workspace()
    if not ids:
        return {}
    names = sorted(set(aliases.values()) - {""})
    if not names and not any(ids.values()):
        return dict.fromkeys(ids)
    with connection() as conn:
        if names:
            rows = conn.execute("SELECT legacy_ref,asset_id FROM asset_aliases WHERE workspace_id=%s AND source_namespace=%s AND legacy_ref=ANY(%s)",
                                (workspace, os.getenv("ASSET_SOURCE_NAMESPACE", "local"), names)).fetchall()
            resolved = {row['legacy_ref']: row['asset_id'] for row in rows}
            ids.update({ref: resolved.get(alias, '') for ref, alias in aliases.items()})
        wanted = sorted(set(ids.values()) - {""})
        rows = conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=ANY(%s)",
                            (workspace, wanted)).fetchall() if wanted else []
    assets = {row['id']: row for row in rows}
    from app.services.member_context import current_access
    result = {}
    for ref, asset_id in ids.items():
        row = assets.get(asset_id)
        if row:
            assert_chat_asset_access(row)
        if row and row["role"] == "task-result-source" and current_access.get() is not None:
            raise HTTPException(404, "素材不存在")
        if ready and asset_id and (not row or row["status"] != "ready" or row["deleted_at"]):
            raise HTTPException(404, "素材不存在或尚未就绪")
        result[ref] = row
    return result


def assert_chat_asset_access(asset):
    owner = (asset.get('metadata') or {}).get('chat_owner')
    if not owner:
        return
    from app.storage.deletion_ledger import blocked
    if blocked(asset):
        raise HTTPException(404,'素材已删除')
    from app.services.member_context import current_access
    access = current_access.get()
    if access is None and (asset.get('metadata') or {}).get('chat_shared',False):
        from app.storage.tasks import lease_context
        if lease_context.get():
            return  # Trusted task execution may consume explicitly shared input.
    if access is None or (access.principal.member_id != owner and
                          not (asset.get('metadata') or {}).get('chat_shared', False)):
        raise HTTPException(404, '素材不存在')


def get_asset(ref, ready=True):
    if isinstance(ref, dict):
        ref = ref.get('media_asset_id') or ref.get('url') or ''
    if not isinstance(ref, str) or not ref:
        return None
    return get_assets([ref], ready=ready)[ref]


def stable_url(asset):
    # Retain /assets classification and extensions used by existing canvas nodes.
    return "/assets/cloud/" + asset["id"] + "/" + quote(asset["display_name"] or "media", safe="")


def filesystem_path(value):
    path = Path(value).resolve()
    if os.name == "nt":
        # Object keys add several levels to the configured root. The extended
        # namespace supports those paths without rewriting keys or versions.
        value = str(path)
        prefix = "\\\\?\\"
        if not value.startswith(prefix):
            path = Path(prefix + ("UNC\\" + value[2:] if value.startswith("\\\\") else value))
    return path


class FilesystemStore:
    def __init__(self, root=None):
        self.root = filesystem_path(root if root is not None else os.environ["OBJECT_STORE_ROOT"])
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key, version):
        # Object keys and version identifiers only originate from this service.
        if not re.fullmatch(r"[a-zA-Z0-9_/.-]+", key) or not re.fullmatch(r"[a-f0-9]{32}", version):
            raise ValueError("Invalid object key/version")
        if any(part in {"", ".", ".."} for part in key.split("/")):
            raise ValueError("Object escaped private root")
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


BROWSER_MEDIA_CACHE_CONTROL = "private, max-age=300, must-revalidate"


class TosStore:
    def __init__(self):
        import tos
        self.bucket = os.environ["TOS_BUCKET"]
        self._browser_urls = OrderedDict()
        self._browser_urls_lock = Lock()
        self.client = tos.TosClientV2(os.environ["TOS_ACCESS_KEY"], os.environ["TOS_SECRET_KEY"],
                                      os.environ["TOS_INTERNAL_ENDPOINT"], os.environ["TOS_REGION"],
                                      security_token=os.getenv("TOS_SECURITY_TOKEN"), connection_time=10, socket_timeout=120, max_connections=20)

    def put(self, key, path, content_type):
        result = self.client.put_object_from_file(self.bucket, key, str(path), content_type=content_type, cache_control=BROWSER_MEDIA_CACHE_CONTROL, forbid_overwrite=True)
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

    def signed_url(self, asset, seconds, cache_scope=None):
        from tos.enum import HttpMethodType
        # Keep authorization at the application entry point. Reuse only the
        # resulting object URL, so redirects do not bust the browser's byte cache.
        max_age = min(300, max(0, seconds // 2))
        policy = f"private, max-age={max_age}, must-revalidate" if cache_scope else "private, no-store"
        key = (cache_scope, self.bucket, asset["object_key"], asset["object_version_id"], seconds, policy)
        now = time.monotonic()
        with self._browser_urls_lock:
            if cache_scope:
                cached = self._browser_urls.get(key)
                if cached and cached[0] - now > max_age + 5:
                    self._browser_urls.move_to_end(key)
                    return cached[1]
            result = self.client.pre_signed_url(HttpMethodType.Http_Method_Get, self.bucket, asset["object_key"],
                expires=seconds, query={"versionId": asset["object_version_id"], "response-cache-control": policy},
                alternative_endpoint=os.environ["TOS_PUBLIC_ENDPOINT"])
            if cache_scope:
                self._browser_urls[key] = (now + seconds, result.signed_url)
                self._browser_urls.move_to_end(key)
                while len(self._browser_urls) > 2048:
                    self._browser_urls.popitem(last=False)
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


def guess_content_type(name):
    # Python 3.10 on Windows may omit WebP from its OS-dependent MIME table.
    if Path(name).suffix.lower() == ".webp":
        return "image/webp"
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


def _discard_unpublished_object(storage, workspace, media_id, key, version):
    """Delete only this attempt's exact version, after checking commit outcome."""
    try:
        # A commit may have succeeded even if its acknowledgement was lost. If
        # the DB cannot confirm ownership, leave the object intact and log it.
        with connection() as conn:
            row = conn.execute("SELECT object_key,object_version_id FROM assets WHERE workspace_id=%s AND id=%s",
                               (workspace, media_id)).fetchone()
        if row and row['object_key'] == key and row['object_version_id'] == version:
            return
        if not version or version == 'null':
            raise ValueError('Missing immutable object version')
        if isinstance(storage, TosStore):
            storage.client.delete_object(storage.bucket, key, version_id=version)
        else:
            storage.path(key, version).unlink(missing_ok=True)
    except Exception:
        # Preserve the original upload result/error; never turn a successful
        # publication into a retry just because surplus-object cleanup failed.
        logger.warning('Unpublished media cleanup incomplete: workspace=%s asset=%s key=%s version=%s',
                       workspace, media_id, key, version, exc_info=True)


def publish(path, display_name=None, legacy_ref=None, asset_id=None, parent_asset_id=None, role="original", metadata=None):
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
    mime = guess_content_type(name)
    kind = mime.split("/")[0] if mime.split("/")[0] in {"image", "video", "audio"} else "workflow" if name.lower().endswith(".zip") else "file"
    # Every attempt owns a separate key. Failed attempts cannot overwrite ready data.
    workspace = current_workspace()
    metadata = dict(metadata or {})
    key = "media/" + workspace + "/" + media_id + "/" + uuid.uuid4().hex + (Path(name).suffix[:12] or ".bin")
    bucket = os.getenv("TOS_BUCKET", "local-simulation") if media_backend() == "tos" else "local-simulation"
    region = os.getenv("TOS_REGION", "local") if media_backend() == "tos" else "local"
    with connection() as conn:
        lock_retained_references(conn, [media_id, parent_asset_id], allow_private=True)
        if parent_asset_id:
            # Read ownership under the same lock used by sharing/revocation.
            # A concurrent preview must not restore an outdated shared flag.
            parent = conn.execute('SELECT metadata FROM assets WHERE workspace_id=%s AND id=%s FOR SHARE',
                                  (workspace,parent_asset_id)).fetchone()
            if parent and (parent.get('metadata') or {}).get('chat_owner'):
                metadata.update({key: parent['metadata'][key] for key in ('chat_owner','chat_shared') if key in parent['metadata']})
                from app.services.chat_attachments import usage
                conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('chat-quota:'+metadata['chat_owner'],))
                if size>usage(conn,metadata['chat_owner'])['remaining_bytes']:
                    raise HTTPException(413,'个人附件容量不足，无法生成新的预览。')
                metadata['expected_bytes']=size
        conn.execute("INSERT INTO assets(workspace_id,id,kind,status,display_name,bucket,region,object_key,parent_asset_id,role,metadata) VALUES(%s,%s,%s,'uploading',%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO NOTHING", (workspace, media_id, kind, name, bucket, region, key, parent_asset_id, role, Jsonb(metadata)))
        if not conn.execute("SELECT 1 FROM assets WHERE workspace_id=%s AND id=%s", (workspace, media_id)).fetchone():
            raise HTTPException(409, "素材 ID 不可用于当前空间")
    storage = store()
    version = storage.put(key, path, mime)
    try:
        with connection() as conn:
            from app.storage.tasks import lease_context
            lease = lease_context.get()
            if lease and not conn.execute("SELECT id FROM tasks WHERE workspace_id=%s AND id=%s AND lease_token=%s AND lease_until>now() FOR SHARE", (workspace, *lease)).fetchone():
                raise HTTPException(409, "任务租约已失效，拒绝发布旧执行者的输出")
            row = conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=%s FOR UPDATE", (workspace, media_id)).fetchone()
            if row["status"] in ("deleting", "deleted"):
                raise HTTPException(409, "素材正在删除或已彻底删除")
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
    except Exception:
        _discard_unpublished_object(storage, workspace, media_id, key, version)
        raise
    if row['object_key'] != key or row['object_version_id'] != version:
        _discard_unpublished_object(storage, workspace, media_id, key, version)
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
    assert_chat_asset_access(asset)
    if (asset.get('metadata') or {}).get('chat_owner') and not provider:
        return f"/api/media/{asset['id']}/content?workspace={quote(current_workspace(), safe='')}"
    if asset.get("role") == "task-result-source":
        raise HTTPException(404, "内部任务检查点不可分享")
    if asset.get("workspace_id", "default") != current_workspace():
        raise HTTPException(404, "素材不属于当前空间")
    if provider:
        ttl = int(os.getenv("MEDIA_PROVIDER_URL_TTL", "3600"))
    elif asset.get("role") == "preview":
        ttl = int(os.getenv("MEDIA_PREVIEW_URL_TTL", "900"))
    else:
        ttl = int(os.getenv("MEDIA_BROWSER_URL_TTL", "900"))
    ttl = min(max(ttl, 30), 86400)
    if media_backend() == "tos":
        from app.services.member_context import current_access
        access = current_access.get()
        scope = None if provider else (current_workspace(), access.principal.member_id if access else "shared")
        return store().signed_url(asset, ttl, cache_scope=scope)
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
    fields = {"url", "src", "path", "image", "video", "audio", "audios", "audio_url", "preview_url", "reference_images", "output", "output_url", "outputUrl", "image_url", "video_url", "videoUrl", "thumbnail", "thumbnail_url", "images", "videos", "outputs", "references", "frames"}

    refs = set()
    def collect(item, field=""):
        if isinstance(item, dict):
            for key, child in item.items():
                if key not in {"logs", "cost", "billing_price", "registrations"}:
                    collect(child, key)
        elif isinstance(item, list):
            for child in item:
                collect(child, field)
        elif isinstance(item, str) and field in fields and item.startswith(("/assets/", "/output/", "/api/media/")):
            refs.add(item)
    collect(value)
    assets = get_assets(refs)

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
            asset = assets[item]
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


def lock_retained_references(conn, value, *, allow_private=False):
    """Coordinate document publication with permanent asset deletion."""
    ids = set(referenced_ids(value))
    # Query only aliases mentioned by this document, rather than the entire
    # workspace on every upload (legacy imports can contain tens of thousands).
    legacy_refs = set()
    def walk(v):
        if isinstance(v,str):
            if v.startswith('ast_'): ids.add(v)
            legacy = canonical_legacy(v)
            if legacy: legacy_refs.add(legacy)
        elif isinstance(v,dict):
            for child in v.values(): walk(child)
        elif isinstance(v,list):
            for child in v: walk(child)
    walk(value)
    if legacy_refs:
        ids.update(r['asset_id'] for r in conn.execute(
            'SELECT asset_id FROM asset_aliases WHERE workspace_id=%s AND legacy_ref=ANY(%s)',
            (current_workspace(), sorted(legacy_refs))))
    if ids:
        rows=conn.execute('SELECT id,status,metadata FROM assets WHERE workspace_id=%s AND id=ANY(%s) ORDER BY id FOR SHARE', (current_workspace(),sorted(ids))).fetchall()
        for row in rows:
            assert_chat_asset_access(row)
            if not allow_private and (row.get('metadata') or {}).get('chat_owner') and not row['metadata'].get('chat_shared'):
                raise HTTPException(409, '私有对话附件不能保存到共享画布或任务，请先在附件管理中主动共享。')
        if any(r['status'] in ('deleting','deleted') for r in rows):
            raise HTTPException(409, '引用的素材正在删除或已彻底删除，请刷新后重试')
