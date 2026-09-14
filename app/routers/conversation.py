"""Auto-generated router."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse, JSONResponse
from typing import List, Dict, Any, Optional
import json, os, time, re, uuid, shutil, asyncio, httpx, urllib.parse, hashlib, base64
from app.models import *
from app.state import *
from app.config import *
from app.utils import *
from app.providers.registry import *
from app.services.canvas import *
from app.services.assets import *
from app.services.prompt import *
from app.services.media import *
from app.services.chat import *


router = APIRouter()

@router.get("/api/conversations")
async def conversations(request: Request, x_user_id: str = Header(default=""), limit: int = 100, offset: int = 0):
    if not 1 <= limit <= 200 or offset < 0:
        raise HTTPException(400, "无效的对话分页参数")
    user_id = safe_user_id(x_user_id, request)
    records = list_conversations(user_id, limit + 1, offset)
    return {"user_id": user_id, "conversations": records[:limit], "next_offset": offset + limit if len(records) > limit else None}

@router.post("/api/conversations")
async def create_conversation(payload: ConversationCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": new_conversation(user_id, payload.title)}

@router.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": load_conversation(user_id, conversation_id)}

@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    if postgres_enabled():
        from app.storage.documents import delete
        delete("conversation", user_id + "/" + conversation_id)
        return {"ok": True}
    path = conversation_path(user_id, conversation_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
