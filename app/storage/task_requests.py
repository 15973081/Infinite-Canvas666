"""Canonical task media references and server-side provider account bindings."""
import hashlib
import os
from urllib.parse import parse_qs, unquote, urlsplit

from app.services.generation_kind import billing_kind
from fastapi import HTTPException
from app.storage import media
from app.storage.database import connection
from app.storage.workspace import current_workspace

MEDIA_FIELDS = {"images", "videos", "audios", "models", "reference_images", "references", "frames",
                "image", "video", "audio", "image_url", "video_url", "audio_url", "outputs"}
OPAQUE_FIELDS = {"prompt", "text", "name", "registrations", "asset_uri", "asset_uris", "raw", "cost"}


def origin(parts):
    return parts.scheme.lower(), (parts.hostname or "").lower(), parts.port or (443 if parts.scheme == "https" else 80)


def canonical_ref(value, strict=False):
    if not isinstance(value, str):
        return value
    candidate = value
    try:
        parts = urlsplit(value)
        parts.port  # Validate malformed ports before comparing origins.
    except ValueError as exc:
        raise HTTPException(400, "无效的素材地址") from exc
    if parts.username or parts.password:
        raise HTTPException(400, "素材地址不能包含登录凭证")
    if strict and parts.scheme == "data":
        raise HTTPException(400, "请先上传内嵌素材，再通过素材 ID 提交任务")
    if parts.scheme in {"http", "https"}:
        base = urlsplit(os.getenv("PUBLIC_BASE_URL", ""))
        if base.netloc and origin(parts) == origin(base):
            prefix = base.path.rstrip("/")
            if prefix and not parts.path.startswith(prefix + "/"):
                return value
            candidate = parts.path[len(prefix):]
        else:
            endpoint_value = os.getenv("TOS_PUBLIC_ENDPOINT", "")
            endpoint = urlsplit(endpoint_value if "://" in endpoint_value else "https://" + endpoint_value)
            bucket = os.getenv("TOS_BUCKET", "")
            if not endpoint.hostname or not bucket:
                return value
            if parts.hostname == bucket + "." + endpoint.hostname:
                key = unquote(parts.path.lstrip("/"))
            elif origin(parts) == origin(endpoint) and parts.path.startswith("/" + bucket + "/"):
                key = unquote(parts.path[len(bucket) + 2:])
            else:
                return value
            query = parse_qs(parts.query)
            versions = query.get("versionId", [])
            # Do not collapse a transformed or unversioned object to its original.
            if len(versions) != 1 or any(k != "versionId" and not k.lower().startswith("x-tos-") for k in query) or any(k.lower() == "x-tos-process" for k in query):
                raise HTTPException(400, "请使用带固定版本的原始素材引用")
            with connection() as conn:
                asset = conn.execute("SELECT id FROM assets WHERE workspace_id=%s AND bucket=%s AND object_key=%s AND object_version_id=%s", (current_workspace(), bucket, key, versions[0])).fetchone()
            if not asset:
                raise HTTPException(404, "对象版本没有对应的素材记录")
            return "/api/media/" + asset["id"] + "/content"
    asset_id = media.id_from_ref(candidate)
    if asset_id:
        return "/api/media/" + asset_id + "/content"
    if strict and candidate.startswith("/api/media/"):
        raise HTTPException(404, "无效的素材 ID")
    if candidate.startswith(("/assets/", "/output/")):
        asset = media.get_asset(candidate, ready=False)
        if asset:
            return "/api/media/" + asset["id"] + "/content"
        if strict:
            raise HTTPException(404, "旧素材路径尚未迁移或不存在")
    return value


def normalize(value, strict=False):
    def walk(item, is_media=False):
        if isinstance(item, dict):
            result = {key: (child if key in OPAQUE_FIELDS else walk(child, key in MEDIA_FIELDS or (is_media and key in {"url", "src", "path", "media_asset_id"}))) for key, child in item.items()}
            if is_media and result.get("media_asset_id"):
                asset_id = media.id_from_ref(result["media_asset_id"])
                url_id = media.id_from_ref(result.get("url"))
                if not asset_id or (url_id and asset_id != url_id):
                    raise HTTPException(409, "素材 ID 与地址不一致")
                result["media_asset_id"] = asset_id
            return result
        if isinstance(item, list):
            return [walk(child, is_media) for child in item]
        return canonical_ref(item, strict) if is_media else item
    result = walk(value)
    if isinstance(result, dict) and result.get("canvas_target") is None:
        result.pop("canvas_target", None)
    if isinstance(result, dict) and isinstance(result.get("canvas_target"), dict) and result["canvas_target"].get("input_sha256") is None:
        result["canvas_target"].pop("input_sha256", None)
    if isinstance(result, dict) and "provider_id" in result:
        # Resolve the legacy default/fallback once and persist the concrete id.
        from app.providers.registry import load_api_providers, get_primary_provider_id, managed_providers_enabled
        if not result.get("provider_id") and not managed_providers_enabled():
            return result
        providers = load_api_providers()
        requested = str(result.get("provider_id") or "").strip().lower()
        if not requested:
            requested = get_primary_provider_id(providers)
        if managed_providers_enabled() and not any(p['id'] == requested for p in providers):
            raise HTTPException(403, '供应商未分配或已停用')
        result["provider_id"] = requested if any(p["id"] == requested for p in providers) else get_primary_provider_id(providers)
    return result


def asset_ids(value):
    found = set()
    def walk(item, is_media=False):
        if isinstance(item, dict):
            for key, child in item.items():
                if key not in OPAQUE_FIELDS:
                    walk(child, key in MEDIA_FIELDS or (is_media and key in {"url", "src", "path", "media_asset_id"}))
        elif isinstance(item, list):
            for child in item:
                walk(child, is_media)
        elif is_media:
            asset_id = media.id_from_ref(item)
            if asset_id:
                found.add(asset_id)
    walk(value)
    return sorted(found)


def lock_ready(conn, ids):
    if not ids:
        return
    media.lock_retained_references(conn,ids)
    rows = conn.execute("SELECT id,status,deleted_at FROM assets WHERE workspace_id=%s AND role<>'task-result-source' AND id=ANY(%s) ORDER BY id FOR SHARE", (current_workspace(), ids)).fetchall()
    if len(rows) != len(ids) or any(row["status"] != "ready" or row["deleted_at"] for row in rows):
        raise HTTPException(409, "任务引用的素材不存在、已删除或尚未就绪")


def account_ref(provider_id):
    if not provider_id:
        return None
    from app.providers.registry import provider_key_env, provider_env_key_value, managed_providers_enabled
    if managed_providers_enabled():
        from app.services.provider_control import account_ref as managed_account_ref
        return managed_account_ref(provider_id)
    key_name = provider_key_env(provider_id)
    explicit = os.getenv(key_name + "_ACCOUNT_REF", "").strip()
    if explicit:
        if len(explicit) > 200:
            raise ValueError("Provider account reference exceeds 200 characters")
        return "account:" + explicit
    credential = provider_env_key_value(provider_id)
    version = hashlib.sha256(credential.encode()).hexdigest() if credential else "unconfigured"
    return "env:" + key_name + ":" + version


def validate_execution(row):
    """A changed credential slot must not silently query/submit as another account."""
    from app.storage.image_receipts import recoverable
    recovery = bool(row.get("upstream_task_id")) or (row.get("status") in {"polling", "finalizing"} and recoverable(row))
    if not recovery:
        from app.services.maintenance_control import ensure
        with connection() as conn:
            ensure(conn, row['workspace_id'], 'write')
    if row.get("requested_by") and not recovery:
        from app.services import authorization as az
        with az.policy_transaction() as conn:
            member = conn.execute("SELECT status FROM members WHERE id=%s", (row["requested_by"],)).fetchone()
            space = conn.execute("SELECT status FROM workspaces WHERE id=%s", (row["workspace_id"],)).fetchone()
            permissions = az.effective_permissions(conn, row["requested_by"], row["workspace_id"])
            if not member or member["status"] != "active" or not space or space["status"] != "active" or not {"generation.submit", "provider.use"} <= permissions:
                raise HTTPException(403, "成员生成权限已撤销，任务暂停，未提交新的付费请求")
    expected = row.get("provider_account_ref")
    if expected and expected != account_ref(row.get("provider_id")):
        raise HTTPException(409, "供应商账号配置已变化，请核对原任务账号后继续")
    if row.get("provider_id"):
        from app.providers.registry import get_api_provider_exact
        provider = get_api_provider_exact(row["provider_id"])
        if not recovery:
            from app.services.model_commercial import enforce
            kind = billing_kind(row["kind"])
            enforce(provider, kind, row["request"])
    payload = normalize(row["request"], strict=True)
    with connection() as conn:
        lock_ready(conn, asset_ids(payload))
    return payload
