"""Provider registry — normalization, loading, saving, and lookup.

Extracted from main.py — Phase 1 physical split, no behavior changes.
"""
import json
import re
import os
import urllib.parse
import urllib.request
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException

from app.config import (
    API_PROVIDERS_FILE, API_ENV_FILE, DATA_DIR, GLOBAL_CONFIG_FILE,
    VOLCENGINE_DEFAULT_BASE_URL, VOLCENGINE_DEFAULT_PROJECT_NAME,
    VOLCENGINE_DEFAULT_REGION, VOLCENGINE_DEFAULT_VIDEO_MODELS,
    AI_BASE_URL,
    AGNES_DEFAULT_VIDEO_MODELS,
    SUPPORTED_IMAGE_REQUEST_MODES, SUPPORTED_PROVIDER_PROTOCOLS,
    PROXY_DISABLED_PROVIDER_IDS, SUPPORTED_PROXY_SCHEMES, PROVIDER_ID_RE,



)
from app.state import GLOBAL_CONFIG_LOCK
from app.utils import model_list_from_values, mask_secret, strip_auth_scheme, bearer_auth_value, env_quote, now_ms
from app.models import ApiProviderPayload

REMOVED_PROVIDER_IDS = {"runninghub", "modelscope", "comfyui", "comfy"}
MODEL_PRICE_BILLING_TYPES = {"per_image", "per_second", "per_call", "per_million_tokens", "disabled"}


def normalize_model_prices(rows):
    normalized = []
    for raw in rows or []:
        if not isinstance(raw, dict):
            continue
        kind = str(raw.get("kind") or "").strip().lower()
        model = str(raw.get("model") or "").strip()[:180]
        billing_type = str(raw.get("billing_type") or "").strip().lower()
        if kind not in {"image", "video", "chat"} or not model or billing_type not in MODEL_PRICE_BILLING_TYPES:
            continue
        if kind == 'chat':
            from app.services.chat_billing import normalize_price
            try:
                price = normalize_price(raw)
                start, end = int(raw.get('effective_from') or 0), int(raw.get('effective_to') or 0)
                if start < 0 or end < 0 or (end and end <= start):
                    continue
            except (ValueError, TypeError, OverflowError):
                continue
            normalized.append({'kind': kind, 'model': model, **price, 'currency': 'CNY',
                               'effective_from': start, 'effective_to': end})
            continue
        if billing_type == 'disabled':
            continue
        if raw.get("unit_price") is None or isinstance(raw.get("unit_price"), bool) or not str(raw["unit_price"]).strip():
            continue
        try:
            price = Decimal(str(raw.get("unit_price") or "0"))
        except (InvalidOperation, ValueError):
            continue
        if not price.is_finite() or price < 0 :
            continue
        conditions = {}
        if billing_type == "per_million_tokens":
            resolution = str(raw.get("resolution") or "").lower()
            has_video = raw.get("has_video_input")
            tier = str(raw.get("service_tier") or "default")
            if kind != "video" or resolution not in {"480p", "720p", "1080p", "4k"} or not isinstance(has_video, bool) or tier not in {"default", "flex"}:
                continue
            conditions = {"resolution": resolution, "has_video_input": has_video, "service_tier": tier}
        if billing_type != "per_million_tokens" and raw.get("resolution"):
            resolution = str(raw["resolution"]).lower()
            if resolution not in ({"1k", "2k", "4k"} if kind == "image" else {"480p", "720p", "1080p", "4k"}): continue
            conditions["resolution"] = resolution
        normalized.append({
            **conditions,
            "kind": kind,
            "model": model,
            "billing_type": billing_type,
            "unit_price": format(price.normalize(), "f"),
            "currency": "CNY",
            "effective_from": max(0, int(raw.get("effective_from") or 0)),
            "effective_to": max(0, int(raw.get("effective_to") or 0)),
        })
    return normalized


def model_price_key(row):
    return (row["kind"], row["model"], row.get("resolution", ""),
            row.get("has_video_input"), row.get("service_tier", ""))


def merge_model_price_history(existing_rows, desired_rows, effective_at=None):
    now = int(effective_at or now_ms())
    existing = normalize_model_prices(existing_rows)
    desired = {
        model_price_key(row): row
        for row in normalize_model_prices(desired_rows)
        if not row["effective_to"]
    }
    active = {model_price_key(row): row for row in existing if not row["effective_to"]}
    history = [row for row in existing if row["effective_to"]]

    for key, old in active.items():
        new = desired.get(key)
        comparable = ("billing_type", "unit_price", "currency", "input_price", "output_price", "cached_input_price", "stream_usage")
        if new and all(old.get(field) == new.get(field) for field in comparable):
            history.append(old)
        else:
            history.append({**old, "effective_to": now})

    for key, new in desired.items():
        old = active.get(key)
        comparable = ("billing_type", "unit_price", "currency", "input_price", "output_price", "cached_input_price", "stream_usage")
        if old and all(old.get(field) == new.get(field) for field in comparable):
            continue
        had_history = any(model_price_key(row) == key for row in existing)
        history.append({**new, "effective_from": now, "effective_to": 0})
    return history


def managed_providers_enabled():
    from app.storage.settings import postgres_enabled, member_auth_enabled
    return postgres_enabled() and member_auth_enabled()


def provider_key_env(provider_id):
    if provider_id == "comfly":
        return "COMFLY_API_KEY"
    if provider_id == "volcengine":
        return "ARK_API_KEY"
    return f"API_PROVIDER_{re.sub(r'[^A-Za-z0-9]', '_', provider_id).upper()}_KEY"


def volcengine_access_key_env():
    return "VOLCENGINE_ACCESS_KEY_ID"


def volcengine_secret_key_env():
    return "VOLCENGINE_SECRET_ACCESS_KEY"


def read_api_env_value(key: str) -> str:
    key = str(key or "").strip()
    if not key or not os.path.exists(API_ENV_FILE):
        return ""
    try:
        with open(API_ENV_FILE, "r", encoding="utf-8-sig") as f:
            for raw_line in f.read().splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                env_key, value = line.split("=", 1)
                if env_key.strip() == key:
                    return value.strip().strip('"').strip("'")
    except Exception:
        return ""
    return ""


def provider_env_key_value(provider_id: str) -> str:
    if managed_providers_enabled():
        from app.services.provider_control import credential
        return credential(provider_id)
    provider_id = str(provider_id or "").strip().lower()
    env_key = provider_key_env(provider_id)
    key = os.getenv(env_key, "") or read_api_env_value(env_key)
    if key:
        return key
    return ""


def volcengine_access_key_value(provider_id="volcengine") -> str:
    if managed_providers_enabled():
        from app.services.provider_control import credential
        return credential(provider_id, 'volcengine_access_key_id')
    if provider_id != 'volcengine':
        return ''
    env_key = volcengine_access_key_env()
    return os.getenv(env_key, "") or read_api_env_value(env_key)


def volcengine_secret_key_value(provider_id="volcengine") -> str:
    if managed_providers_enabled():
        from app.services.provider_control import credential
        return credential(provider_id, 'volcengine_secret_access_key')
    if provider_id != 'volcengine':
        return ''
    env_key = volcengine_secret_key_env()
    return os.getenv(env_key, "") or read_api_env_value(env_key)


def volcengine_provider_api_key(explicit_key: str = "") -> str:
    if managed_providers_enabled():
        return provider_env_key_value('volcengine')
    explicit_key = str(explicit_key or "").strip()
    if explicit_key:
        return explicit_key
    return provider_env_key_value("volcengine")


# ── Provider normalization ──

def normalize_endpoint_override(value, label):
    endpoint = str(value or "").strip()
    if not endpoint:
        return ""
    if len(endpoint) > 300 or re.search(r"\s", endpoint):
        raise HTTPException(status_code=400, detail=f"{label} 不合法，请填写类似 /v1/images/edits 的路径")
    if re.match(r"^https?://", endpoint, re.I):
        return endpoint.rstrip("/")
    if not endpoint.startswith("/"):
        raise HTTPException(status_code=400, detail=f"{label} 需要以 /v1/... 开头，或填写完整 http(s) 地址")
    return endpoint

# ── Provider protocol helpers ──

def provider_protocol(provider):
    return str((provider or {}).get("protocol") or "openai").strip().lower()

# 单模型可覆盖的协议（仅 OpenAI / Gemini，二者可共用同一站点的 Base URL + Key）
PER_MODEL_PROTOCOL_OPTIONS = {"openai", "gemini"}
# 协议固定、不支持单模型覆盖的内置平台
FIXED_PROTOCOL_PROVIDER_IDS = {"volcengine"}

def normalize_model_protocols(value):
    """规整 {模型名: 协议} 覆盖表，仅保留 openai/gemini。"""
    out = {}
    if isinstance(value, dict):
        for raw_name, raw_proto in value.items():
            name = str(raw_name or "").strip()
            proto = str(raw_proto or "").strip().lower()
            if name and proto in PER_MODEL_PROTOCOL_OPTIONS:
                out[name] = proto
    return out

def effective_protocol(provider, model=""):
    """返回某模型实际生效的协议：优先单模型覆盖，否则用平台全局协议。"""
    base = provider_protocol(provider)
    pid = str((provider or {}).get("id") or "").strip().lower()
    if pid in FIXED_PROTOCOL_PROVIDER_IDS:
        return base
    overrides = (provider or {}).get("model_protocols")
    if isinstance(overrides, dict):
        val = str(overrides.get(str(model or "").strip()) or "").strip().lower()
        if val in PER_MODEL_PROTOCOL_OPTIONS:
            return val
    return base

def is_apimart_provider(provider):
    base_url = str((provider or {}).get("base_url") or "").lower()
    return provider_protocol(provider) == "apimart" or "apimart.ai" in base_url

def detect_image_request_mode(base_url="", models=None):
    base = str(base_url or "").strip().lower()
    if "apihub.agnes-ai.com" in base:
        return "openai-json"
    for model in models or []:
        if str(model or "").strip().lower().startswith("agnes-image-"):
            return "openai-json"
    return ""

def effective_image_request_mode(provider, model=""):
    detected = detect_image_request_mode((provider or {}).get("base_url"), [model])
    if detected:
        return detected
    return normalize_image_request_mode((provider or {}).get("image_request_mode"))

def is_gemini_provider(provider):
    return provider_protocol(provider) == "gemini"

def is_volcengine_provider(provider):
    return provider_protocol(provider) == "volcengine"

def is_yuli_provider(provider):
    # 玉玉API（yuli.host）的视频接口走自有格式（/v1/video/create + /v1/video/query），
    # 与通用 OpenAI /v1/videos/generations 不同，需单独识别。
    base_url = str((provider or {}).get("base_url") or "").lower()
    return "yuli.host" in base_url

def is_agnes_provider(provider, model=""):
    base_url = str((provider or {}).get("base_url") or "").lower()
    model_id = str(model or "").strip().lower()
    return "apihub.agnes-ai.com" in base_url or model_id.startswith("agnes-video-")


def normalize_ms_loras(values):
    normalized = []
    seen = set()
    for raw in values or []:
        if not isinstance(raw, dict):
            continue
        lora_id = str(raw.get("id") or "").strip()
        if not lora_id:
            continue
        target_model = str(raw.get("target_model") or raw.get("model") or "").strip()
        if not target_model:
            continue
        key = (target_model, lora_id)
        if key in seen:
            continue
        seen.add(key)
        try:
            strength = float(raw.get("strength", raw.get("default_strength", 0.8)))
        except Exception:
            strength = 0.8
        strength = max(0.0, min(2.0, strength))
        name = re.sub(r"\s+", " ", str(raw.get("name") or "").strip())[:80]
        normalized.append({
            "id": lora_id[:180],
            "name": name or lora_id,
            "target_model": target_model[:180],
            "strength": strength,
            "enabled": bool(raw.get("enabled", True)),
            "note": str(raw.get("note") or "").strip()[:300],
        })
    return normalized


def normalize_media_input_modes(value):
    if value is None:
        value = {}
    if not isinstance(value, dict) or set(value) - {"image", "video", "audio"}:
        raise ValueError("invalid media input modes")
    if any(mode not in ("url", "base64") for mode in value.values()):
        raise ValueError("invalid media input mode")
    return {kind: value.get(kind, "url") for kind in ("image", "video", "audio")}


def normalize_image_request_mode(value):
    mode = str(value or "").strip().lower()
    return mode if mode in SUPPORTED_IMAGE_REQUEST_MODES else "openai"


def normalize_proxy_url(value, provider_id="", name=""):
    text = str(value or "").strip()
    if not text:
        return ""
    if str(provider_id or "").strip().lower() in PROXY_DISABLED_PROVIDER_IDS:
        return ""
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme.lower() not in SUPPORTED_PROXY_SCHEMES or not parsed.netloc:
        label = name or provider_id or "API platform"
        raise HTTPException(status_code=400, detail=f"{label} proxy URL must start with http:// or https://")
    return text.rstrip("/")


def provider_supports_proxy(provider):
    provider_id = str((provider or {}).get("id") or "").strip().lower()
    protocol = str((provider or {}).get("protocol") or "").strip().lower()
    return bool(provider_id and provider_id not in PROXY_DISABLED_PROVIDER_IDS and protocol not in PROXY_DISABLED_PROVIDER_IDS)


def provider_proxy_url(provider):
    if not provider_supports_proxy(provider):
        return ""
    return normalize_proxy_url((provider or {}).get("proxy_url") or "", (provider or {}).get("id") or "", (provider or {}).get("name") or "")


def normalize_provider(item):
    from app.services.model_commercial import policies, discounts
    if str(item.get("id") or "").strip().lower() in REMOVED_PROVIDER_IDS:
        raise HTTPException(410, "该供应商集成已移除")
    provider_id = str(item.get("id") or "").strip().lower()
    if not PROVIDER_ID_RE.fullmatch(provider_id):
        raise HTTPException(status_code=400, detail=f"API 平台 ID 不合法：{provider_id or '(empty)'}")
    name = re.sub(r"\s+", " ", str(item.get("name") or provider_id).strip())[:60] or provider_id
    base_url = str(item.get("base_url") or "").strip().rstrip("/")
    if base_url and not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail=f"{name} 的 Base URL 需要以 http:// 或 https:// 开头")
    protocol = str(item.get("protocol") or "openai").strip().lower()
    if protocol not in SUPPORTED_PROVIDER_PROTOCOLS:
        protocol = "openai"
    image_request_mode = detect_image_request_mode(base_url, item.get("image_models") or []) or normalize_image_request_mode(item.get("image_request_mode"))
    image_generation_endpoint = normalize_endpoint_override(item.get("image_generation_endpoint"), "文生图端口")
    image_edit_endpoint = normalize_endpoint_override(item.get("image_edit_endpoint"), "图生图/编辑端口")
    volc_project = re.sub(r"\s+", " ", str(item.get("volcengine_project_name") or "").strip())[:80]
    volc_region = re.sub(r"\s+", " ", str(item.get("volcengine_region") or "").strip())[:40]
    if provider_id == "volcengine":
        protocol = "volcengine"
        base_url = base_url or VOLCENGINE_DEFAULT_BASE_URL
        volc_project = volc_project or VOLCENGINE_DEFAULT_PROJECT_NAME
        volc_region = volc_region or VOLCENGINE_DEFAULT_REGION
    proxy_url = "" if protocol in PROXY_DISABLED_PROVIDER_IDS else normalize_proxy_url(item.get("proxy_url"), provider_id, name)
    return {
        "id": provider_id,
        "name": name,
        "base_url": base_url,
        "protocol": protocol,
        "image_request_mode": image_request_mode,
        "media_input_modes": normalize_media_input_modes(item.get("media_input_modes")),
        "image_generation_endpoint": image_generation_endpoint,
        "image_edit_endpoint": image_edit_endpoint,
        "proxy_url": proxy_url,
        "enabled": bool(item.get("enabled", True)),
        "primary": bool(item.get("primary", False)),
        "image_models": model_list_from_values(item.get("image_models") or []),
        "chat_models": model_list_from_values(item.get("chat_models") or []),
        "video_models": model_list_from_values(item.get("video_models") or []),
        "model_prices": normalize_model_prices(item.get("model_prices") or []),
        "model_policies": policies(item.get("model_policies") or {}),
        "model_discounts": discounts(item.get("model_discounts") or []),
        "model_protocols": normalize_model_protocols(item.get("model_protocols")),
        "ms_loras": normalize_ms_loras(item.get("ms_loras") or []),
        "ms_defaults_version": int(item.get("ms_defaults_version") or 0),
        "volcengine_project_name": volc_project,
        "volcengine_region": volc_region,
    }


def default_api_providers():
    return [
        {
            "id": "volcengine",
            "name": "火山引擎",
            "base_url": VOLCENGINE_DEFAULT_BASE_URL,
            "protocol": "volcengine",
            "image_request_mode": "openai",
            "image_generation_endpoint": "",
            "image_edit_endpoint": "",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": VOLCENGINE_DEFAULT_VIDEO_MODELS,
            "ms_loras": [],
            "ms_defaults_version": 0,
            "volcengine_project_name": VOLCENGINE_DEFAULT_PROJECT_NAME,
            "volcengine_region": VOLCENGINE_DEFAULT_REGION,
        },
    ]


def merge_default_api_providers(providers):
    merged = [dict(item) for item in providers if str(item.get("id") or "").strip().lower() not in REMOVED_PROVIDER_IDS]
    volc_default = next((d for d in default_api_providers() if d["id"] == "volcengine"), None)
    if volc_default:
        current = next((item for item in merged if item.get("id") == "volcengine"), None)
        legacy = next((item for item in merged if item.get("id") != "volcengine" and str(item.get("protocol") or "").lower() == "volcengine"), None)
        if not current:
            if legacy:
                legacy_image_models = model_list_from_values(legacy.get("image_models") or [])
                legacy_video_models = model_list_from_values(legacy.get("video_models") or [])
                current = {
                    **volc_default,
                    "base_url": legacy.get("base_url") or volc_default["base_url"],
                    "image_models": legacy_image_models or model_list_from_values(volc_default.get("image_models") or []),
                    "chat_models": model_list_from_values(legacy.get("chat_models") or []),
                    "video_models": legacy_video_models or model_list_from_values(volc_default.get("video_models") or []),
                }
                merged.append(current)
            else:
                merged.append(volc_default)
        else:
            if not current.get("base_url"):
                current["base_url"] = volc_default["base_url"]
            current["protocol"] = "volcengine"
            current["video_models"] = model_list_from_values([*(current.get("video_models") or []), *(volc_default.get("video_models") or [])])
            current["volcengine_project_name"] = str(current.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip() or VOLCENGINE_DEFAULT_PROJECT_NAME
            current["volcengine_region"] = str(current.get("volcengine_region") or VOLCENGINE_DEFAULT_REGION).strip() or VOLCENGINE_DEFAULT_REGION
    return merged


def provider_endpoint_url(provider, key, default_path):
    base_url = str((provider or {}).get("base_url") or AI_BASE_URL).strip().rstrip("/")
    override = str((provider or {}).get(key) or "").strip()
    if override:
        if re.match(r"^https?://", override, re.I):
            return override.rstrip("/")
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}{override}"
        return override
    for prefix in ("/api/v3", "/v1beta", "/v1", "/v2"):
        if base_url.endswith(prefix) and default_path.startswith(f"{prefix}/"):
            return f"{base_url}{default_path[len(prefix):]}"
    return f"{base_url}{default_path}"


def httpx_provider_kwargs(provider=None, proxy_url=None):
    proxy = str(proxy_url or "").strip() if proxy_url is not None else provider_proxy_url(provider)
    if not proxy:
        # Managed connections follow the saved platform configuration, not a
        # desktop proxy inherited from the previous local deployment.
        return {"trust_env": False} if managed_providers_enabled() else {}
    return {"proxy": proxy, "trust_env": False}


def load_api_providers():
    if managed_providers_enabled():
        from app.services.provider_control import workspace_providers
        return workspace_providers()
    from app.storage.settings import postgres_enabled
    if postgres_enabled():
        from app.storage.documents import get
        raw = get("api_providers", default=default_api_providers())
        return merge_default_api_providers([normalize_provider(item) for item in raw if isinstance(item, dict) and str(item.get("id") or "").strip().lower() not in REMOVED_PROVIDER_IDS])
    defaults = default_api_providers()
    if not os.path.exists(API_PROVIDERS_FILE):
        return merge_default_api_providers(defaults)
    try:
        with open(API_PROVIDERS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        providers = [
            normalize_provider(item)
            for item in raw
            if isinstance(item, dict)
            and str(item.get("id") or "").strip().lower() not in REMOVED_PROVIDER_IDS
        ]
        return merge_default_api_providers(providers or defaults)
    except Exception as e:
        print(f"加载 API 平台配置失败: {e}")
        return defaults


def save_api_providers(providers):
    if managed_providers_enabled():
        raise HTTPException(403, '请通过独立管理平台配置供应商')
    from app.storage.settings import postgres_enabled
    if postgres_enabled():
        from app.storage.documents import put
        from app.storage.tasks import clean_request
        return put("api_providers", "default", clean_request(providers))
    os.makedirs(DATA_DIR, exist_ok=True)
    with GLOBAL_CONFIG_LOCK:
        with open(API_PROVIDERS_FILE, "w", encoding="utf-8") as f:
            json.dump(providers, f, ensure_ascii=False, indent=2)


def public_provider(provider):
    key = provider_env_key_value(provider["id"])
    item = {
        **provider,
        "has_key": bool(key),
        "key_preview": mask_secret(key),
        "key_env": provider_key_env(provider["id"]),
    }
    if is_volcengine_provider(provider):
        from app.services.volcengine_billing import official_ark, official_video_prices, PRICE_SOURCE, PRICE_VERSION
        item["volcengine_video_pricing"] = {
            "rules": official_video_prices() if official_ark(provider) else [],
            "source": PRICE_SOURCE, "version": PRICE_VERSION,
        }
    if provider.get("id") == "volcengine":
        ak = volcengine_access_key_value()
        sk = volcengine_secret_key_value()
        item.update({
            "has_volcengine_access_key": bool(ak),
            "volcengine_access_key_preview": mask_secret(ak),
            "volcengine_access_key_env": volcengine_access_key_env(),
            "has_volcengine_secret_key": bool(sk),
            "volcengine_secret_key_preview": mask_secret(sk),
            "volcengine_secret_key_env": volcengine_secret_key_env(),
            "volcengine_project_name": provider.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME,
            "volcengine_region": provider.get("volcengine_region") or VOLCENGINE_DEFAULT_REGION,
        })
    return item


def public_api_providers():
    return [public_provider(p) for p in load_api_providers()]


def get_primary_provider_id(providers=None):
    providers = providers if providers is not None else load_api_providers()
    providers = [p for p in providers if str(p.get("id") or "").strip().lower() not in REMOVED_PROVIDER_IDS]
    primary = next((p for p in providers if p.get("primary") and p.get("enabled", True)), None)
    if primary:
        return primary["id"]
    available = next((p for p in providers if p.get("enabled", True) and p["id"] not in REMOVED_PROVIDER_IDS), None)
    if available:
        return available["id"]
    return ""


def get_api_provider(provider_id="comfly"):
    providers = load_api_providers()
    target = (provider_id or "").strip().lower()
    if target in REMOVED_PROVIDER_IDS:
        raise HTTPException(410, "该供应商集成已移除，请明确选择其他供应商")
    if target and managed_providers_enabled() and not any(p['id'] == target for p in providers):
        raise HTTPException(403, '供应商未分配或已停用')
    if not target or not any(p["id"] == target for p in providers):
        target = get_primary_provider_id(providers)
    provider = next((p for p in providers if p["id"] == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target}")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider


def get_api_provider_exact(provider_id: str):
    providers = load_api_providers()
    target = (provider_id or "").strip().lower()
    if target in REMOVED_PROVIDER_IDS:
        raise HTTPException(410, "该供应商集成已移除，请明确选择其他供应商")
    provider = next((p for p in providers if p["id"] == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target or '(empty)'}。新增平台未保存时请使用当前表单拉取模型。")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider










def update_env_values(updates):
    os.makedirs(os.path.dirname(API_ENV_FILE), exist_ok=True)
    lines = []
    if os.path.exists(API_ENV_FILE):
        with open(API_ENV_FILE, "r", encoding="utf-8-sig") as f:
            lines = f.read().splitlines()
    seen = set()
    next_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            next_lines.append(f"{key}={env_quote(updates[key])}")
            os.environ[key] = str(updates[key] or "")
            seen.add(key)
        else:
            next_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            next_lines.append(f"{key}={env_quote(value)}")
            os.environ[key] = str(value or "")
    with open(API_ENV_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(next_lines).rstrip() + "\n")


def looks_like_html_response(text: str) -> bool:
    sample = str(text or "").lstrip()[:200].lower()
    return sample.startswith("<!doctype html") or sample.startswith("<html") or "<head" in sample


def protocol_from_payload(payload):
    provider_id = str(getattr(payload, "provider_id", "") or "").strip().lower()
    if provider_id == "volcengine":
        return "volcengine"
    protocol = str(getattr(payload, "protocol", "") or "openai").strip().lower()
    return protocol if protocol in SUPPORTED_PROVIDER_PROTOCOLS else "openai"


def proxy_url_from_payload(payload):
    provider_id = str(getattr(payload, "provider_id", "") or "").strip().lower()
    protocol = protocol_from_payload(payload)
    if provider_id in PROXY_DISABLED_PROVIDER_IDS or protocol in PROXY_DISABLED_PROVIDER_IDS:
        return ""
    return normalize_proxy_url(getattr(payload, "proxy_url", "") or "", provider_id, provider_id)


def api_key_from_payload(payload, protocol: str = ""):
    explicit = str(getattr(payload, "api_key", "") or "").strip()
    provider_id = str(getattr(payload, "provider_id", "") or "").strip().lower()
    protocol = str(protocol or protocol_from_payload(payload) or "").strip().lower()
    if explicit:
        return explicit
    if provider_id:
        value = os.getenv(provider_key_env(provider_id), "")
        if value:
            return value
    if protocol == "volcengine":
        return volcengine_provider_api_key("")
    return ""


def upstream_models_url(base_url: str, protocol: str):
    if protocol == "gemini":
        return f"{base_url}/models" if base_url.endswith("/v1beta") else f"{base_url}/v1beta/models"
    if protocol == "volcengine":
        return f"{base_url}/models" if base_url.endswith("/api/v3") else f"{base_url}/api/v3/models"
    return f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"


def upstream_model_headers(api_key: str, protocol: str):
    if protocol == "gemini":
        return {"x-goog-api-key": api_key, "Accept": "application/json"}
    return {"Authorization": bearer_auth_value(api_key), "Accept": "application/json"}


def volcengine_default_model_payload(status=200, message="", raw=None):
    models = VOLCENGINE_DEFAULT_VIDEO_MODELS[:]
    return {
        "ok": True,
        "protocol": "volcengine",
        "status": status,
        "message": message or "方舟任务接口可用，模型列表接口未返回模型，已使用默认 Seedance 模型。",
        "model_count": len(models),
        "image_models": [],
        "chat_models": [],
        "video_models": models,
        "all": models,
        "raw": raw,
    }


def volcengine_task_probe_url(base_url: str):
    base = str(base_url or "").strip().rstrip("/")
    if not base:
        return ""
    if base.endswith("/api/v3"):
        return f"{base}/contents/generations/tasks/healthcheck_probe_do_not_submit"
    return f"{base}/api/v3/contents/generations/tasks/healthcheck_probe_do_not_submit"


async def probe_volcengine_task_endpoint(client, base_url: str, api_key: str):
    probe_url = volcengine_task_probe_url(base_url)
    if not probe_url:
        return False, {"status": 0, "message": "Base URL 为空"}
    response = await client.get(probe_url, headers=upstream_model_headers(api_key, "volcengine"))
    try:
        raw = response.json() if response.text else {}
    except Exception:
        raw = response.text[:500]
    if response.status_code in (401, 403):
        return False, {"status": response.status_code, "message": "方舟 API Key 无效或无权限", "raw": raw}
    if looks_like_html_response(response.text):
        return False, {"status": response.status_code, "message": "任务接口返回 HTML，Base URL 可能不是 API 地址", "raw": raw}
    if response.status_code < 500:
        return True, {"status": response.status_code, "message": "方舟任务查询端点可达", "raw": raw}
    return False, {"status": response.status_code, "message": f"方舟任务接口服务端错误 {response.status_code}", "raw": raw}


def openai_compat_root_for_probe(base_url: str):
    base = str(base_url or "").strip().rstrip("/")
    if base.endswith("/api/v3"):
        base = base[: -len("/api/v3")]
    if base.endswith("/v1"):
        return base
    return f"{base}/v1" if base else ""


async def probe_openai_compat_bearer_endpoint(client, base_url: str, api_key: str):
    root = openai_compat_root_for_probe(base_url)
    if not root:
        return False, {"status": 0, "message": "Base URL 为空"}
    url = f"{root}/chat/completions"
    response = await client.post(
        url,
        headers={**upstream_model_headers(api_key, "openai"), "Content-Type": "application/json"},
        json={"messages": []},
    )
    try:
        raw = response.json() if response.text else {}
    except Exception:
        raw = response.text[:500]
    if response.status_code in (401, 403):
        return False, {"status": response.status_code, "message": "API Key 无效或无权限", "raw": raw}
    if looks_like_html_response(response.text):
        return False, {"status": response.status_code, "message": "OpenAI 兼容入口返回 HTML，Base URL 可能不是 API 地址", "raw": raw}
    if response.status_code < 500:
        return True, {"status": response.status_code, "message": "OpenAI 兼容 Bearer 鉴权入口可达", "raw": raw}
    return False, {"status": response.status_code, "message": f"OpenAI 兼容入口服务端错误 {response.status_code}", "raw": raw}


async def probe_openai_models_endpoint(client, base_url: str, api_key: str):
    url = upstream_models_url(base_url, "openai")
    response = await client.get(url, headers=upstream_model_headers(api_key, "openai"))
    try:
        raw = response.json() if response.text else {}
    except Exception:
        raw = response.text[:500]
    if response.status_code in (301, 302, 303, 307, 308):
        location = response.headers.get("Location") or response.headers.get("location") or ""
        suffix = f"：{location}" if location else ""
        return False, {"status": response.status_code, "message": f"OpenAI /v1/models 发生跳转{suffix}，请填写 API Base URL，不要填写网页登录地址", "raw": raw}
    if response.status_code in (401, 403):
        return False, {"status": response.status_code, "message": "OpenAI API Key 无效或无权限", "raw": raw}
    if looks_like_html_response(response.text):
        return False, {"status": response.status_code, "message": "OpenAI /v1/models 返回网页 HTML，请检查请求地址是否为 API Base URL", "raw": raw}
    if response.status_code < 300:
        grouped, ids = parse_upstream_models(raw, "openai") if isinstance(raw, dict) else ({"image": [], "chat": [], "video": []}, [])
        grouped, ids = apply_agnes_model_defaults(base_url, grouped, ids)
        return True, {
            "status": response.status_code,
            "message": f"OpenAI 兼容模型列表端点可用{f'，找到 {len(ids)} 个模型' if ids else ''}",
            "raw": raw,
            "model_count": len(ids),
            "image_models": grouped["image"],
            "chat_models": grouped["chat"],
            "video_models": grouped["video"],
            "all": ids,
        }
    if 400 <= response.status_code < 500:
        return False, {"status": response.status_code, "message": f"OpenAI /v1/models 不可用 (HTTP {response.status_code})", "raw": raw}
    return False, {"status": response.status_code, "message": f"OpenAI /v1/models 服务端错误 {response.status_code}", "raw": raw}


async def probe_volcengine_auto_detect(client, base_url: str, api_key: str):
    task_ok, task_probe = await probe_volcengine_task_endpoint(client, base_url, api_key)
    if task_ok:
        return True, {
            "status": task_probe.get("status") or 200,
            "message": "检测到方舟/Ark 任务协议",
            "raw": {"task_probe": task_probe.get("raw")},
        }
    compat_ok, compat_probe = await probe_openai_compat_bearer_endpoint(client, base_url, api_key)
    if compat_ok:
        return True, {
            "status": compat_probe.get("status") or 200,
            "message": "检测到方舟/Ark Bearer 鉴权入口（OpenAI 兼容透传）",
            "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
        }
    return False, {
        "status": compat_probe.get("status") or task_probe.get("status") or 0,
        "message": compat_probe.get("message") or task_probe.get("message") or "未检测到方舟/Ark 兼容入口",
        "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
    }


def classify_upstream_model(mid):
    lc = str(mid or "").lower()
    video_keys = ["veo", "sora", "wan2", "wanx", "seedance", "doubao-1", "kling", "hailuo", "minimax-h3", "video", "t2v-", "i2v-", "s2v"]
    if any(k in lc for k in video_keys):
        return "video"
    image_keys = ["banana", "image", "dalle", "dall-e", "imagen", "flux", "stable", "sdxl", "midjourney", "nano-banana", "ideogram", "fal-ai", "z-image", "qwen-image", "klein", "seedream", "doubao-seedream", "text-to-image", "image-to-image"]
    if any(k in lc for k in image_keys):
        return "image"
    return "chat"


def parse_upstream_models(raw, protocol="openai"):
    items = raw.get("data") if isinstance(raw, dict) else None
    if not items and isinstance(raw, dict):
        items = raw.get("models") or raw.get("list") or []
    if not isinstance(items, list):
        items = []
    ids = []
    for it in items:
        if isinstance(it, str):
            mid = it
        elif isinstance(it, dict):
            mid = it.get("id") or it.get("name") or it.get("model")
        else:
            mid = ""
        if mid:
            mid = str(mid)
            if protocol == "gemini" and mid.startswith("models/"):
                mid = mid[len("models/"):]
            ids.append(mid)
    ids = sorted(set(ids))
    grouped = {"image": [], "chat": [], "video": []}
    for mid in ids:
        grouped[classify_upstream_model(mid)].append(mid)
    return grouped, ids


def apply_agnes_model_defaults(base_url, grouped, ids):
    if "apihub.agnes-ai.com" not in str(base_url or "").strip().lower():
        return grouped, ids
    grouped = {key: list(value or []) for key, value in (grouped or {}).items()}
    ids = list(ids or [])
    for model in AGNES_DEFAULT_VIDEO_MODELS:
        if model not in ids:
            ids.append(model)
        if model not in grouped.setdefault("video", []):
            grouped["video"].append(model)
    ids = sorted(set(ids))
    grouped["video"] = sorted(set(grouped.get("video") or []))
    return grouped, ids
