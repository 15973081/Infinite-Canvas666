"""Manual maintenance notification and drain controls."""

import ipaddress
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.models import MaintenanceStartRequest
from app.services.maintenance import (
    cancel_maintenance,
    maintenance_snapshot,
    set_maintenance,
)
from app.state import manager
from app.services.static_pages import current_app_version, frontend_build_id


router = APIRouter()


@router.get("/api/frontend/version")
async def get_frontend_version():
    return JSONResponse(
        {"build_id": frontend_build_id(), "version": current_app_version()},
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


def request_is_local(request: Request) -> bool:
    host = str(request.client.host if request.client else "").split("%", 1)[0]
    try:
        client_is_loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        client_is_loopback = host.lower() == "localhost"
    hostname = str(request.url.hostname or "").split("%", 1)[0].lower()
    try:
        host_is_loopback = ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        host_is_loopback = hostname == "localhost"
    return client_is_loopback and host_is_loopback


def require_local_operator(request: Request) -> None:
    if not request_is_local(request):
        raise HTTPException(status_code=403, detail="维护操作只能在服务器本机通过 127.0.0.1 执行")
    origin = str(request.headers.get("origin") or "").strip()
    if origin:
        parsed = urlsplit(origin)
        request_port = request.url.port or (443 if request.url.scheme == "https" else 80)
        origin_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if parsed.scheme != request.url.scheme or parsed.hostname != request.url.hostname or origin_port != request_port:
            raise HTTPException(status_code=403, detail="维护操作只接受本机同源页面请求")


@router.get("/api/maintenance/status")
async def get_maintenance_status(request: Request):
    return maintenance_snapshot(admin_allowed=request_is_local(request))


@router.post("/api/maintenance/start")
async def start_maintenance(payload: MaintenanceStartRequest, request: Request):
    require_local_operator(request)
    set_maintenance(payload.message, payload.planned_at)
    snapshot = maintenance_snapshot(admin_allowed=True)
    await manager.broadcast_maintenance(snapshot)
    return snapshot


@router.post("/api/maintenance/cancel")
async def stop_maintenance(request: Request):
    require_local_operator(request)
    cancel_maintenance()
    snapshot = maintenance_snapshot(admin_allowed=True)
    await manager.broadcast_maintenance(snapshot)
    return snapshot
