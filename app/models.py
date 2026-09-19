"""Pydantic request/response models for Infinite Canvas API.

Extracted from main.py — Phase 1 physical split, no behavior changes.
"""
from typing import Literal, List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from fastapi import UploadFile

from app.config import (
    ONLINE_IMAGE_PROMPT_MAX_LENGTH,
    VIDEO_PROMPT_MAX_LENGTH,
    VOLCENGINE_DEFAULT_PROJECT_NAME,
    VOLCENGINE_DEFAULT_REGION,
    LLM_MESSAGE_MAX_LENGTH,
)


# ── Maintenance ──

class MaintenanceStartRequest(BaseModel):
    message: str = Field(default="服务即将维护，请保存当前工作并等待现有生成任务完成。", max_length=300)
    planned_at: int = Field(default=0, ge=0)


# ── Generate / Cloud ──



class DeleteHistoryRequest(BaseModel):
    timestamp: float


class TokenRequest(BaseModel):
    token: str






# ── AI Reference ──

class AIReference(BaseModel):
    url: str = ""
    name: str = ""
    role: str = ""
    kind: str = ""
    mime: str = ""


# ── Online Image ──

class CanvasTaskTarget(BaseModel):
    model_config = {'extra': 'forbid'}
    source_node_id: str = Field(min_length=1, max_length=160)
    target_node_id: str = Field(min_length=1, max_length=160)
    base_revision: int = Field(ge=1, strict=True)
    input_sha256: Optional[str] = Field(default=None, pattern=r"^[0-9a-f]{64}$", strict=True)


class OnlineImageRequest(BaseModel):
    image_tool: Literal['', 'panorama', 'depth'] = ''
    image_tool_revision: int = Field(default=0, ge=0, strict=True)
    canvas_target: Optional[CanvasTaskTarget] = None
    canvas_id: str = Field(default="", max_length=96)
    client_task_id: str = Field(default="", max_length=96)
    prompt: str = Field(min_length=1, max_length=ONLINE_IMAGE_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    n: int = 1
    reference_images: List[AIReference] = []


class ImageTaskQueryRequest(BaseModel):
    provider_id: str = "comfly"
    task_id: str = Field(min_length=1, max_length=240)


# ── Canvas Video ──

class CanvasVideoRequest(BaseModel):
    canvas_target: Optional[CanvasTaskTarget] = None
    canvas_id: str = Field(default="", max_length=96)
    client_task_id: str = Field(default="", max_length=96)
    prompt: str = Field(min_length=1, max_length=VIDEO_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = "veo3-fast"
    duration: int = 5
    aspect_ratio: str = "16:9"
    resolution: str = ""
    size: str = ""
    images: List[AIReference] = []
    videos: List[str] = []
    audios: List[str] = []
    enhance_prompt: bool = False
    enable_upsample: bool = False
    watermark: bool = False
    seed: Optional[int] = None
    camerafixed: bool = False
    return_last_frame: bool = False
    generate_audio: bool = False
    multimodal: bool = False
    trusted_asset: bool = False
    task_mode: str = "auto"


class SmartCanvasVideoTrimRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    start_seconds: float = Field(default=0, ge=0, le=86400)
    end_seconds: float = Field(gt=0, le=86400)
    name: str = Field(default="", max_length=240)


class TempShUploadRequest(BaseModel):
    url: str = ""


class CloudVideoUploadRequest(BaseModel):
    url: str = ""
    service: str = "auto"


# ── API Provider ──

class ApiProviderPayload(BaseModel):
    id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    image_request_mode: str = "openai"
    image_generation_endpoint: str = ""
    image_edit_endpoint: str = ""
    proxy_url: str = ""
    enabled: bool = True
    primary: bool = False
    image_models: List[str] = []
    chat_models: List[str] = []
    video_models: List[str] = []
    model_prices: Optional[List[Dict[str, Any]]] = None
    model_protocols: Dict[str, str] = {}
    ms_loras: List[Dict[str, Any]] = []
    ms_defaults_version: int = 0
    rh_apps: List[Dict[str, Any]] = []
    rh_workflows: List[Dict[str, Any]] = []
    volcengine_project_name: str = VOLCENGINE_DEFAULT_PROJECT_NAME
    volcengine_region: str = VOLCENGINE_DEFAULT_REGION
    volcengine_access_key_id: Optional[str] = None
    volcengine_secret_access_key: Optional[str] = None
    api_key: Optional[str] = None
    wallet_api_key: Optional[str] = None
    clear_key: bool = False
    clear_wallet_key: bool = False
    clear_volcengine_access_key_id: bool = False
    clear_volcengine_secret_access_key: bool = False


# ── Chat ──

class ChatRequest(BaseModel):
    conversation_id: str = ""
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    model: str = ""
    image_model: str = ""
    image_provider: str = ""
    mode: str = "chat"
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []
    provider: str = "comfly"


# ── Canvas LLM ──

class CanvasLLMRequest(BaseModel):
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    system_prompt: str = ""
    model: str = ""
    messages: List[Dict[str, Any]] = []
    provider: str = "comfly"
    images: List[str] = []   # 可以是 /output/*.png、/assets/*.png 本地路径 或 http(s) URL 或 data URL
    videos: List[str] = []   # 可以是 /output/*.mp4、/assets/*.mp4 本地路径 或 http(s) URL 或 data URL


class CanvasLLMTaskMessage(BaseModel):
    model_config = {'extra': 'forbid'}
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)


class CanvasLLMTaskRequest(BaseModel):
    model_config = {'extra': 'forbid'}
    canvas_id: str = Field(min_length=1, max_length=96)
    client_task_id: str = Field(pattern=r'^canvas_llm_[A-Za-z0-9_-]{8,80}$')
    canvas_target: CanvasTaskTarget
    provider_id: str = Field(min_length=1, max_length=96)
    model: str = Field(min_length=1, max_length=240)
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    system_prompt: str = Field(default='', max_length=LLM_MESSAGE_MAX_LENGTH)
    messages: List[CanvasLLMTaskMessage] = Field(default_factory=list, max_length=100)
    images: List[str] = Field(default_factory=list, max_length=8)
    videos: List[str] = Field(default_factory=list, max_length=3)


# ── Conversation ──

class ConversationCreateRequest(BaseModel):
    title: str = "新对话"


# ── Canvas ──

class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    kind: str = "classic"
    folder_id: str = ""


class CanvasFolderCreateRequest(BaseModel):
    name: str = ""
    parent_id: str = ""


class CanvasFolderUpdateRequest(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    order: Optional[int] = None


class CanvasMoveRequest(BaseModel):
    folder_id: str = ""


class CanvasLockRequest(BaseModel):
    client_id: str
    username: str = ""


class CanvasMetaUpdate(BaseModel):
    cover_style: Optional[Literal["type", "editorial", "sage", "ink"]] = None
    title: Optional[str] = None
    icon: Optional[str] = None
    owner: Optional[str] = None
    color: Optional[str] = None
    pinned: Optional[bool] = None


class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {}
    logs: List[Dict[str, Any]] = []
    settings: Dict[str, Any] = {}
    client_id: str = ""
    base_updated_at: int = 0
    base_revision: Optional[int] = None


class CanvasAssetCheckRequest(BaseModel):
    urls: List[str] = []


class CanvasAssetDownloadRequest(BaseModel):
    urls: List[str] = []
    items: List[Dict[str, Any]] = []
    filename: str = "canvas-output-images.zip"


class CanvasWorkflowExportRequest(BaseModel):
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    filename: str = "canvas-workflow.zip"
    include_resources: bool = True
    library_id: str = ""
    category_id: str = ""
    name: str = ""


class SmartCanvasGroupExportItem(BaseModel):
    kind: str = ""
    url: str = ""
    text: str = ""
    name: str = ""


class SmartCanvasGroupExportRequest(BaseModel):
    folder: str = ""
    group_name: str = "group"
    items: List[SmartCanvasGroupExportItem] = []


# ── Local Assets ──

class LocalImageImportRequest(BaseModel):
    path: str = ""
    paths: List[str] = Field(default_factory=list)


class LocalAssetCaptionRequest(BaseModel):
    names: List[str] = []
    provider: str = "comfly"
    model: str = ""
    prompt: str = "描述图片"


class LocalAssetCaptionSaveRequest(BaseModel):
    name: str = ""
    caption: str = ""


class LocalAssetFolderRequest(BaseModel):
    parent: str = ""
    path: str = ""
    name: str = ""


# ── Asset Library ──

class AssetLibraryCategoryRequest(BaseModel):
    name: str = "新文件夹"
    type: str = "image"
    library_id: str = ""


class AssetLibraryRequest(BaseModel):
    name: str = "资产库"


class AssetLibraryAddRequest(BaseModel):
    category_id: str = ""
    url: str = ""
    name: str = ""
    library_id: str = ""


class AssetLibraryBatchAddRequest(BaseModel):
    category_id: str = ""
    library_id: str = ""
    items: List[AssetLibraryAddRequest] = []


class SharedFolderRegister(BaseModel):
    path: str = ""
    name: str = ""


class SharedFolderImport(BaseModel):
    library_id: str = ""
    category_id: str = ""
    folder_id: str = ""
    paths: List[str] = []


class AssetLibraryRenameRequest(BaseModel):
    name: str = ""
    library_id: str = ""


class AssetLibraryBatchDeleteRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""


class AssetLibraryBatchMoveRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""


class AssetLibraryBatchCropRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""
    mode: str = "square"


class AssetAvatarRegisterRequest(BaseModel):
    library_id: str = ""
    provider_id: str = ""
    project_name: str = "default"
    group_name: str = ""


class AssetAvatarBatchRegisterRequest(AssetAvatarRegisterRequest):
    ids: List[str] = []
    concurrency: int = 8


# ── Prompt Library ──

class PromptLibraryRequest(BaseModel):
    name: str = "提示词库"


class PromptLibraryItemRequest(BaseModel):
    library_id: str = ""
    item_id: str = ""
    name: str = "提示词"
    category: str = "custom"
    positive: str = ""
    negative: str = ""
    scene: str = ""


class PromptLibraryBatchDeleteRequest(BaseModel):
    ids: List[str] = []


class PromptLibraryCategoryRequest(BaseModel):
    name: str = "新分组"
    library_id: str = ""


# ── Provider / Connection Test ──

class TestConnectionPayload(BaseModel):
    base_url: str = ""
    api_key: str = ""
    provider_id: str = ""
    protocol: str = "openai"
    image_request_mode: str = "openai"
    proxy_url: str = ""


# ── Export all names for easy import ──
__all__ = [
    "MaintenanceStartRequest",
     "DeleteHistoryRequest", "TokenRequest",

    "AIReference",
    "OnlineImageRequest", "ImageTaskQueryRequest",
    "CanvasVideoRequest", "SmartCanvasVideoTrimRequest", "TempShUploadRequest", "CloudVideoUploadRequest",
    "ApiProviderPayload",
    "ChatRequest",  "CanvasLLMRequest", "CanvasLLMTaskRequest",
    "ConversationCreateRequest",
    "CanvasCreateRequest", "CanvasFolderCreateRequest",
    "CanvasFolderUpdateRequest", "CanvasMoveRequest", "CanvasLockRequest",
    "CanvasMetaUpdate", "CanvasSaveRequest",
    "CanvasAssetCheckRequest", "CanvasAssetDownloadRequest",
    "CanvasWorkflowExportRequest",
    "SmartCanvasGroupExportItem", "SmartCanvasGroupExportRequest",
    "LocalImageImportRequest", "LocalAssetCaptionRequest",
    "LocalAssetCaptionSaveRequest", "LocalAssetFolderRequest",
    "AssetLibraryCategoryRequest", "AssetLibraryRequest",
    "AssetLibraryAddRequest", "AssetLibraryBatchAddRequest",
    "SharedFolderRegister", "SharedFolderImport",
    "AssetLibraryRenameRequest", "AssetLibraryBatchDeleteRequest",
    "AssetLibraryBatchMoveRequest", "AssetLibraryBatchCropRequest",
    "AssetAvatarRegisterRequest", "AssetAvatarBatchRegisterRequest",
    "PromptLibraryRequest", "PromptLibraryItemRequest",
    "PromptLibraryBatchDeleteRequest", "PromptLibraryCategoryRequest",
    "TestConnectionPayload",

]
