from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import canvas_ledger as ledger
from app.services.canvas_ledger_recovery import read_canvas_file, recover

router = APIRouter(prefix="/api/canvases/{canvas_id}/ledger", tags=["canvas-ledger"])


class LedgerAppendRequest(BaseModel):
    logs: List[Dict[str, Any]] = Field(default_factory=list, max_length=5000)


class LedgerRecoveryRequest(BaseModel):
    preview_token: str = Field(min_length=64, max_length=64)


def _existing(canvas_id):
    try:
        canvas = read_canvas_file(canvas_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="画布不存在")
    if canvas.get("id") != canvas_id:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas


@router.get("")
def get_ledger(canvas_id: str, page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
               from_ms: int = Query(default=0, ge=0), to_ms: int = Query(default=0, ge=0),
               expected_revision: Optional[int] = Query(default=None, ge=0)):
    canvas = _existing(canvas_id)
    if to_ms and to_ms <= from_ms:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    from app.storage.settings import member_auth_enabled
    if not member_auth_enabled():
        ledger.import_canvas_logs(canvas_id, canvas.get("logs") or [])
        ledger.sync_canvas_tasks(canvas_id)
    try:
        return ledger.read_page(canvas_id, page, page_size, from_ms, to_ms, expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/entries")
def append_entries(canvas_id: str, payload: LedgerAppendRequest):
    _existing(canvas_id)
    return {"report": ledger.append_logs(canvas_id, payload.logs)}


@router.post("/recovery/preview")
def preview_recovery(canvas_id: str):
    _existing(canvas_id)
    return recover(canvas_id)


@router.post("/recovery/apply")
def apply_recovery(canvas_id: str, payload: LedgerRecoveryRequest):
    _existing(canvas_id)
    try:
        return recover(canvas_id, payload.preview_token)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
