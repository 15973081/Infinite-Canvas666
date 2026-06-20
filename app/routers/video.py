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
from app.services.update import *
from app.services.canvas import *
from app.services.assets import *
from app.services.prompt import *
from app.services.media import *
from app.services.chat import *
from app.services.comfyui import *
from app.services.workflow import *
from app.providers.jimeng import *


router = APIRouter()

@router.post("/api/cloud-video/upload")
async def cloud_video_upload(payload: CloudVideoUploadRequest, request: Request):
    ensure_same_origin_request(request)
    return await upload_local_video_to_cloud(payload.url, payload.service)

