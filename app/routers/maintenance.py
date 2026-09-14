"""Workbench maintenance announcements. Changes belong to the management app."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.models import MaintenanceStartRequest
from app.services.maintenance import maintenance_snapshot
from app.services.static_pages import current_app_version, frontend_build_id

router = APIRouter()


@router.get("/api/frontend/version")
async def get_frontend_version():
    return JSONResponse(
        {"build_id": frontend_build_id(), "version": current_app_version()},
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


def require_local_operator(request: Request) -> None:
    """Compatibility tombstone: even a loopback caller must use management."""
    raise HTTPException(410, {"code": "management_entry_required"})


@router.get("/api/maintenance/status")
async def get_maintenance_status(request: Request):
    return maintenance_snapshot(admin_allowed=False)


@router.post("/api/maintenance/start")
async def start_maintenance(payload: MaintenanceStartRequest, request: Request):
    require_local_operator(request)


@router.post("/api/maintenance/cancel")
async def stop_maintenance(request: Request):
    require_local_operator(request)
