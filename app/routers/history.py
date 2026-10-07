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

# Online works keep one record per image, independent of generation batches.
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal


class OnlineWorkSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1,max_length=80)
    revision: int = Field(ge=1)


class OnlineWorkMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None,min_length=1,max_length=240)
    folder: str | None = Field(default=None,max_length=80)
    tags: list[str] | None = Field(default=None,max_length=20)

    @model_validator(mode='after')
    def clean(self):
        if self.name is not None:
            self.name=self.name.strip()
            if not self.name: raise ValueError('名称不能为空')
        if self.folder is not None: self.folder=self.folder.strip()
        if self.tags is not None:
            if any(len(tag)>40 for tag in self.tags): raise ValueError('标签最多40字')
            self.tags=list(dict.fromkeys(tag.strip() for tag in self.tags if tag.strip()))
        return self


class OnlineWorkMutation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['edit','save','trash','restore','purge']
    items: list[OnlineWorkSelection] = Field(min_length=1,max_length=200)
    metadata: OnlineWorkMetadata = Field(default_factory=OnlineWorkMetadata)
    confirm_permanent: bool = False

    @model_validator(mode='after')
    def unique(self):
        if len({item.id for item in self.items})!=len(self.items): raise ValueError('不能重复选择作品')
        if self.metadata.name is not None and len(self.items)!=1: raise ValueError('重命名请只选择一个作品')
        return self


@router.get('/api/online-works')
def online_works(state: str='inbox',q: str='',owner: str='all',folder: str='',model: str='',cursor: str=None,limit: int=30,references: str='all'):
    if not postgres_enabled(): raise HTTPException(409,'收件箱需要 PostgreSQL 存储模式')
    from app.services.online_inbox import page
    return page(state,q,owner,folder,model,cursor,limit,references)


@router.post('/api/online-works/actions')
def online_work_actions(payload: OnlineWorkMutation):
    if not postgres_enabled(): raise HTTPException(409,'收件箱需要 PostgreSQL 存储模式')
    from app.services.online_inbox import mutate
    body=payload.model_dump()
    body['metadata']=payload.metadata.model_dump(exclude_none=True)
    return mutate(body)

@router.get("/api/history")
def get_history_api(type: str = None):
    if postgres_enabled():
        from app.storage.history import legacy_list
        return legacy_list(type)
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if type:
                    data = [item for item in data if item.get("type", "zimage") == type]
                data = [item for item in data if item.get("images") and len(item["images"]) > 0]

                def sort_key(item):
                    ts = item.get("timestamp", 0)
                    if isinstance(ts, (int, float)):
                        return float(ts)
                    return 0

                data.sort(key=sort_key, reverse=True)
                return data
        except Exception as e:
            print(f"读取历史文件失败: {e}")
            return []
    return []


@router.get("/api/history/page")
def get_history_page(type: str = None, limit: int = 50, cursor: str = None):
    if not 1 <= limit <= 200:
        raise HTTPException(400, "每页历史数量必须为 1–200")
    if postgres_enabled():
        from app.storage.history import page
        return page(type, limit, cursor)
    try:
        offset = int(cursor or 0)
        if offset < 0:
            raise ValueError()
    except ValueError:
        raise HTTPException(400, "无效的历史分页游标") from None
    data = get_history_api(type)
    return {"items": data[offset:offset + limit], "next_cursor": str(offset + limit) if offset + limit < len(data) else None}

@router.get("/api/queue_status")
def get_queue_status(client_id: str):
    with QUEUE_LOCK:
        total = len(QUEUE)
        positions = [i + 1 for i, t in enumerate(QUEUE) if t["client_id"] == client_id]
        position = positions[0] if positions else 0
    return {"total": total, "position": position}

@router.post("/api/history/delete")
def delete_history(req: DeleteHistoryRequest):
    if postgres_enabled():
        from app.services.online_inbox import trash_history
        if trash_history(req.timestamp):
            return {'success':True,'recycled':True,'message':'已移入在线作品回收站，可恢复；彻底删除后才释放空间'}
        from app.storage.history import delete_timestamp
        return {"success": delete_timestamp(req.timestamp)}
    if not os.path.exists(HISTORY_FILE):
        return {"success": False, "message": "History file not found"}
    try:
        with HISTORY_LOCK:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
            target_record = None
            new_history = []
            for item in history:
                is_match = False
                item_ts = item.get("timestamp", 0)
                if isinstance(req.timestamp, (int, float)) and isinstance(item_ts, (int, float)):
                    if abs(float(item_ts) - float(req.timestamp)) < 0.001:
                        is_match = True
                elif str(item_ts) == str(req.timestamp):
                    is_match = True
                if is_match:
                    target_record = item
                else:
                    new_history.append(item)
            if target_record:
                with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_history, f, ensure_ascii=False, indent=4)

        if target_record:
            for img_url in target_record.get("images", []):
                file_path = output_file_from_url(img_url)
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete file {file_path}: {e}")
            return {"success": True}
        else:
            return {"success": False, "message": "Record not found"}
    except Exception as e:
        print(f"Delete history error: {e}")
        return {"success": False, "message": str(e)}
