"""Provider registry — normalization, loading, saving, and lookup.

Extracted from main.py — Phase 1 physical split, no behavior changes.
"""
import json
import re
import os
import urllib.parse
import urllib.request

from fastapi import HTTPException

from app.config import (
    API_PROVIDERS_FILE, DATA_DIR, GLOBAL_CONFIG_FILE,
    MODELSCOPE_CHAT_BASE_URL,
    MODELSCOPE_DEFAULT_IMAGE_MODELS, MODELSCOPE_DEFAULT_CHAT_MODELS,
    MODELSCOPE_DEFAULT_LORAS, MODELSCOPE_DEFAULTS_VERSION,
    MODELSCOPE_API_KEY,
    RUNNINGHUB_DEFAULT_BASE_URL, RUNNINGHUB_DEFAULT_IMAGE_MODELS,
    RUNNINGHUB_DEFAULT_APPS, RUNNINGHUB_DEFAULT_WORKFLOWS,
    VOLCENGINE_DEFAULT_BASE_URL, VOLCENGINE_DEFAULT_PROJECT_NAME,
    VOLCENGINE_DEFAULT_REGION, VOLCENGINE_DEFAULT_VIDEO_MODELS,
    AI_BASE_URL,
    JIMENG_DEFAULT_IMAGE_MODELS, JIMENG_DEFAULT_VIDEO_MODELS,
    JIMENG_LEGACY_IMAGE_MODELS, JIMENG_LEGACY_VIDEO_MODELS,
    SUPPORTED_IMAGE_REQUEST_MODES, SUPPORTED_PROVIDER_PROTOCOLS,
    PROXY_DISABLED_PROVIDER_IDS, SUPPORTED_PROXY_SCHEMES, PROVIDER_ID_RE,
    STATIC_RUNNINGHUB_DIR, STATIC_RUNNINGHUB_THUMBNAIL_DIR,
    STATIC_RUNNINGHUB_API_PROVIDERS_FILE,
    STATIC_DIR, RUNNINGHUB_THUMBNAIL_EXTS,
)
from app.state import GLOBAL_CONFIG_LOCK
from app.utils import model_list_from_values, mask_secret, strip_auth_scheme, bearer_auth_value
from app.models import ApiProviderPayload


def provider_key_env(provider_id):
    if provider_id == "comfly":
        return "COMFLY_API_KEY"
    if provider_id == "modelscope":
        return "MODELSCOPE_API_KEY"
    if provider_id == "runninghub":
        return "RUNNINGHUB_API_KEY"
    if provider_id == "volcengine":
        return "ARK_API_KEY"
    return f"API_PROVIDER_{re.sub(r'[^A-Za-z0-9]', '_', provider_id).upper()}_KEY"


def runninghub_wallet_key_env():
    return "RUNNINGHUB_WALLET_API_KEY"


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
    provider_id = str(provider_id or "").strip().lower()
    env_key = provider_key_env(provider_id)
    key = os.getenv(env_key, "") or read_api_env_value(env_key)
    if key:
        return key
    if provider_id == "modelscope":
        return MODELSCOPE_API_KEY or ""
    return ""


def runninghub_wallet_key_value() -> str:
    env_key = runninghub_wallet_key_env()
    return os.getenv(env_key, "") or read_api_env_value(env_key)


def volcengine_access_key_value() -> str:
    env_key = volcengine_access_key_env()
    return os.getenv(env_key, "") or read_api_env_value(env_key)


def volcengine_secret_key_value() -> str:
    env_key = volcengine_secret_key_env()
    return os.getenv(env_key, "") or read_api_env_value(env_key)


def volcengine_provider_api_key(explicit_key: str = "") -> str:
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

# NOTE: Full provider registry extracted from main.py.
# Functions: default_api_providers, merge_default_api_providers,
# normalize_provider, load_api_providers, save_api_providers,
# public_provider, public_api_providers, get_primary_provider_id,
# get_api_provider, get_api_provider_exact, etc.
# These remain in main.py for Phase 1 and will fully migrate in Phase 2.
