import os
import sys
import logging
from contextlib import asynccontextmanager

_sys_d = os.path.dirname(os.path.abspath(__file__))
if _sys_d not in sys.path:
    sys.path.insert(0, _sys_d)

from app.storage.settings import load_storage_env, postgres_enabled, member_auth_enabled
load_storage_env()

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import ensure_runtime_config_files, load_env_file, FIELD_LABELS
from app.services.static_pages import VersionedStaticFiles
# Routers — extracted to app/routers/
from app.routers import (
    assets, canvas, canvas_ledger, chat, conversation,
    history, image, prompt,
    providers, maintenance, upload, video, websocket,
)
from app.services.maintenance import begin_transient_generation, end_transient_generation, mark_service_started

QUIET_ACCESS_PATHS = {
    "/api/queue_status",
    "/api/canvases",
    "/api/canvases/trash",
}
QUIET_ACCESS_PREFIXES = (
    "/api/canvases/",
)

class QuietAccessLogFilter(logging.Filter):
    def filter(self, record):
        args = record.args if isinstance(record.args, tuple) else ()
        if len(args) >= 3:
            path = str(args[2]).split("?", 1)[0]
            status = int(args[4]) if len(args) >= 5 and str(args[4]).isdigit() else 0
            quiet_dynamic = any(path.startswith(prefix) and path.endswith("/meta") for prefix in QUIET_ACCESS_PREFIXES)
            if (path in QUIET_ACCESS_PATHS or quiet_dynamic) and status < 400:
                return False
        message = record.getMessage()
        if any(f'"GET {path}' in message and '" 200' in message for path in QUIET_ACCESS_PATHS):
            return False
        if 'GET /api/canvases/' in message and '/meta' in message and '" 200' in message:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(QuietAccessLogFilter())

@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not member_auth_enabled():
        mark_service_started()
    if postgres_enabled():
        from app.storage.settings import validate
        from app.storage import database, worker
        validate()
        database.check()
        from app.storage.media import cleanup_orphaned_operations
        cleanup_orphaned_operations()
        handle = worker.start() if os.getenv("CLOUD_EMBEDDED_WORKER", "true").lower() == "true" else None
        try:
            from app.services.maintenance_control import scheduler, service_presence
            async with scheduler(), service_presence('workbench'):
                yield
        finally:
            if handle:
                await worker.shutdown(handle)
            database.close()
    else:
        await canvas.recover_durable_canvas_video_tasks()
        yield


app = FastAPI(lifespan=lifespan)
if postgres_enabled():
    from app.storage.middleware import CloudStorageMiddleware
    app.add_middleware(CloudStorageMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("PUBLIC_BASE_URL", "").rstrip("/")] if postgres_enabled() else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TRANSIENT_GENERATION_PATHS = {
    "/api/online-image": "online-image",
    "/api/canvas-llm": "llm",
    "/api/canvas-video": "video",
}


@app.middleware("http")
async def maintenance_generation_tracker(request: Request, call_next):
    task_type = TRANSIENT_GENERATION_PATHS.get(request.url.path) if request.method == "POST" else None
    if not task_type:
        return await call_next(request)
    try:
        task_id = begin_transient_generation(task_type, request.url.path)
    except Exception as exc:
        status_code = int(getattr(exc, "status_code", 503) or 503)
        headers = dict(getattr(exc, "headers", None) or {})
        return JSONResponse(status_code=status_code, content={"detail": getattr(exc, "detail", str(exc))}, headers=headers)
    try:
        return await call_next(request)
    finally:
        end_transient_generation(task_id)

# Authentication runs outside maintenance and storage middleware.
from app.services.auth import AuthenticationMiddleware, router as auth_router
app.add_middleware(AuthenticationMiddleware)
app.include_router(auth_router)

# --- Register all routers ---
app.include_router(assets.router)
app.include_router(canvas.router)
from app.routers.canvas_pages import router as canvas_pages_router
app.include_router(canvas_pages_router)
from app.routers.collaboration import router as collaboration_router
app.include_router(collaboration_router)
app.include_router(canvas_ledger.router)
from app.routers.account_billing import router as account_billing_router
app.include_router(account_billing_router)
from app.routers.account_data import router as account_data_router
app.include_router(account_data_router)
app.include_router(chat.router)
from app.routers.skills import router as skills_router
app.include_router(skills_router)
app.include_router(conversation.router)
app.include_router(history.router)
app.include_router(image.router)
app.include_router(prompt.router)
app.include_router(providers.router)
app.include_router(maintenance.router)
app.include_router(upload.router)
app.include_router(video.router)
app.include_router(websocket.router)

# --- Mount static files (after routers so API routes take priority) ---
app.mount("/static", VersionedStaticFiles(directory="static"), name="static")
if postgres_enabled():
    from app.routers.cloud_media import router as cloud_media_router
    app.include_router(cloud_media_router)
else:
    app.mount("/assets", StaticFiles(directory="assets"), name="assets")

ensure_runtime_config_files()
load_env_file()


def friendly_validation_error(errors):
    parts = []
    for err in errors or []:
        loc = [str(item) for item in err.get("loc", []) if item != "body"]
        field = loc[-1] if loc else ""
        label = FIELD_LABELS.get(field, field or "请求参数")
        ctx = err.get("ctx") or {}
        limit = ctx.get("limit_value") or ctx.get("max_length") or ctx.get("min_length")
        err_type = str(err.get("type") or "")
        msg = str(err.get("msg") or "")
        if "max_length" in err_type or "at most" in msg:
            parts.append(f"{label}过长：当前内容超过后端上限 {limit} 个字符。请拆分为多个提示词节点，或先用 LLM 节点压缩后再生成。")
        elif "min_length" in err_type:
            parts.append(f"{label}不能为空。")
        else:
            parts.append(f"{label}格式不正确：{msg}")
    return "\n".join(parts) or "请求参数不正确。"


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": friendly_validation_error(exc.errors()), "errors": exc.errors()},
    )


# ── Startup (runs when invoked directly: python main.py) ──
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("SERVER_PORT", "6003"))
    print(f"Starting Infinite Canvas on http://127.0.0.1:{port}/")
    uvicorn.run(app, host=os.getenv("SERVER_HOST", "0.0.0.0"), port=port)
