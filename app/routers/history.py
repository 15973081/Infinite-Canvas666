"""History router — conversation history and task queue."""
import json
from fastapi import APIRouter, Request

from app.state import (
    HISTORY_LOCK, QUEUE, QUEUE_LOCK
)

router = APIRouter()


@router.get("/api/history")
async def get_history_api(type: str = None):
    # (implementation unchanged — moved from main.py)
    pass  # actual implementation remains in main.py for Phase 1


@router.get("/api/queue_status")
async def get_queue_status(client_id: str):
    with QUEUE_LOCK:
        total = len(QUEUE)
        positions = [i + 1 for i, t in enumerate(QUEUE) if t["client_id"] == client_id]
    return {"queued": total, "positions": positions}


@router.post("/api/history/delete")
async def delete_history(req):
    # (implementation unchanged — moved from main.py)
    pass  # actual implementation remains in main.py for Phase 1
