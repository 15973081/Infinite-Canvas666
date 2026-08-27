import os
import sys
import logging
from contextlib import asynccontextmanager

_sys_d = os.path.dirname(os.path.abspath(__file__))
if _sys_d not in sys.path:
    sys.path.insert(0, _sys_d)

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import ensure_runtime_config_files, load_env_file, FIELD_LABELS
# Routers — extracted to app/routers/
from app.routers import (
    angle, assets, canvas, chat, comfyui, conversation,
    generate, history, image, prompt,
    providers, update, upload, video, websocket,
)

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
    await canvas.recover_durable_canvas_video_tasks()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register all routers ---
app.include_router(angle.router)
app.include_router(assets.router)
app.include_router(canvas.router)
app.include_router(chat.router)
app.include_router(comfyui.router)
app.include_router(conversation.router)
app.include_router(generate.router)
app.include_router(history.router)
app.include_router(image.router)
app.include_router(prompt.router)
app.include_router(providers.router)
app.include_router(update.router)
app.include_router(upload.router)
app.include_router(video.router)
app.include_router(websocket.router)

# --- Mount static files (after routers so API routes take priority) ---
app.mount("/static", StaticFiles(directory="static"), name="static")
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
    print(f"Starting ComfyUI-API-Modelscope on http://127.0.0.1:{port}/")
    uvicorn.run(app, host="0.0.0.0", port=port)
