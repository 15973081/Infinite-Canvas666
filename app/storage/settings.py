import os
from pathlib import Path


def postgres_enabled():
    backend = os.getenv("DATABASE_BACKEND", "local")
    if backend not in {"local", "postgres"}:
        raise ValueError("DATABASE_BACKEND must be local or postgres")
    return backend == "postgres"


def member_auth_enabled():
    mode = os.getenv("AUTH_MODE", "shared")
    if mode not in {"shared", "members"}:
        raise ValueError("AUTH_MODE must be shared or members")
    if mode == "members" and not postgres_enabled():
        raise ValueError("Member authentication requires PostgreSQL")
    return mode == "members"


def media_backend():
    backend = os.getenv("MEDIA_BACKEND", "local")
    if backend not in {"local", "filesystem", "tos"}:
        raise ValueError("MEDIA_BACKEND must be local, filesystem or tos")
    if backend != "local" and not postgres_enabled():
        raise ValueError("Object storage requires DATABASE_BACKEND=postgres")
    return backend


def workspace_id():
    value = os.getenv("DEFAULT_WORKSPACE_ID", "default")
    if value != "default":
        raise ValueError("This release supports the default shared workspace only")
    return value


def load_storage_env():
    """Explicit file only; exported process variables take precedence."""
    path = os.getenv("STORAGE_ENV_FILE")
    if path:
        for raw in Path(path).read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def validate():
    members = member_auth_enabled()
    workspace_id()
    if postgres_enabled() and not os.getenv("DATABASE_URL"):
        raise ValueError("DATABASE_URL is required; no silent local fallback")
    if postgres_enabled() and media_backend() == "local":
        raise ValueError("PostgreSQL mode requires MEDIA_BACKEND=filesystem or tos")
    if media_backend() == "tos":
        for name in ("TOS_BUCKET", "TOS_REGION", "TOS_INTERNAL_ENDPOINT", "TOS_PUBLIC_ENDPOINT", "TOS_ACCESS_KEY", "TOS_SECRET_KEY"):
            if not os.getenv(name):
                raise ValueError(name + " is required")
    if media_backend() == "filesystem" and not os.getenv("OBJECT_STORE_ROOT"):
        raise ValueError("OBJECT_STORE_ROOT must point to an isolated simulation directory")
    if postgres_enabled():
        for name in (("PUBLIC_BASE_URL",) if members else ("CLOUD_ACCESS_PASSWORD", "PUBLIC_BASE_URL")):
            if not os.getenv(name):
                raise ValueError(name + " is required")
        if media_backend() == "filesystem" and len(os.getenv("MEDIA_SIGNING_KEY", "")) < 32:
            raise ValueError("MEDIA_SIGNING_KEY must contain at least 32 characters")
