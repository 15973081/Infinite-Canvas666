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

from pydantic import BaseModel, ConfigDict
from fastapi import Query
from app.services import chat_attachments


class AttachmentShare(BaseModel):
    model_config = ConfigDict(extra='forbid')
    shared: bool


@router.get('/api/chat/attachments')
def attachment_list(offset:int=Query(0,ge=0),limit:int=Query(50,ge=1,le=100),sort:str=Query('newest',pattern='^(newest|size)$'),unreferenced:bool=False):
    return JSONResponse(chat_attachments.list_owned(offset,limit,sort,unreferenced),headers={'Cache-Control':'private, no-store'})


@router.post('/api/chat/attachments')
async def attachment_upload(files:List[UploadFile]=File(...)):
    return await asyncio.to_thread(chat_attachments.upload,files)


@router.get('/api/chat/attachments/audit')
def attachment_audit(before:Optional[int]=Query(None,ge=1,le=9223372036854775807),limit:int=Query(50,ge=1,le=100)):
    return JSONResponse(chat_attachments.list_audit(before,limit),headers={'Cache-Control':'private, no-store'})


@router.post('/api/chat/attachments/preview')
def attachment_preview(payload:AIReference):
    from app.services.attachment_preview import preview
    return JSONResponse(preview(payload.model_dump()),headers={'Cache-Control':'private, no-store'})


@router.patch('/api/chat/attachments/{asset_id}')
def attachment_share(asset_id:str,payload:AttachmentShare):
    return chat_attachments.share(asset_id,payload.shared)


@router.delete('/api/chat/attachments/{asset_id}')
def attachment_delete(asset_id:str,confirm_permanent:bool=False):
    return chat_attachments.delete(asset_id,confirm_permanent)

@router.get("/api/conversations")
def conversations(request: Request, x_user_id: str = Header(default=""), limit: int = 100, offset: int = 0):
    if not 1 <= limit <= 200 or offset < 0:
        raise HTTPException(400, "无效的对话分页参数")
    user_id = safe_user_id(x_user_id, request)
    records = list_conversations(user_id, limit + 1, offset)
    return {"user_id": user_id, "conversations": records[:limit], "next_offset": offset + limit if len(records) > limit else None}

@router.post("/api/conversations")
def create_conversation(payload: ConversationCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": new_conversation(user_id, payload.title)}

@router.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": load_conversation(user_id, conversation_id)}

@router.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default=""), delete_unused_attachments:bool=False):
    user_id = safe_user_id(x_user_id, request)
    if postgres_enabled():
        conversation = load_conversation(user_id,conversation_id)
        from app.storage.documents import delete
        delete("conversation", user_id + "/" + conversation_id)
        cleanup = []
        if delete_unused_attachments:
            from app.storage.media import referenced_ids
            for asset_id in sorted(set(referenced_ids(conversation))):
                try:
                    result=chat_attachments.delete(asset_id,True)
                    cleanup.append({'id':asset_id,'deleted':bool(result.get('deleted')),
                                    **({'message':'后台正在清理，请在附件管理中查看进度。'} if result.get('pending') else {})})
                except HTTPException as exc:
                    cleanup.append({'id':asset_id,'deleted':False,'message':exc.detail})
        return {"ok": True,'attachment_cleanup':cleanup}
    path = conversation_path(user_id, conversation_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
