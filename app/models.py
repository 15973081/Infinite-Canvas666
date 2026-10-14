"""Pydantic request/response models for Infinite Canvas API.

Extracted from main.py — Phase 1 physical split, no behavior changes.
"""
from typing import Literal, List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError
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

class AttachmentSheetRange(BaseModel):
    model_config = {'extra':'forbid'}
    name: str = Field(min_length=1,max_length=31)
    region: str = Field(default='',max_length=32,pattern=r'^(?:[A-Za-z]{1,3}[1-9][0-9]{0,6}:[A-Za-z]{1,3}[1-9][0-9]{0,6})?$')


class AttachmentSelection(BaseModel):
    model_config = {'extra':'forbid'}
    kind: Literal['docx','xlsx']
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    sections: List[str] = Field(default_factory=list,max_length=200)
    sheets: List[AttachmentSheetRange] = Field(default_factory=list,max_length=100)


class AIReference(BaseModel):
    url: str = ""
    name: str = ""
    role: str = ""
    kind: str = ""
    mime: str = ""
    selection: Optional[AttachmentSelection] = None


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
    chat_context_limits: Dict[str, int] = {}
    video_models: List[str] = []
    audio_models: List[str] = []
    model_models: List[str] = []
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
    skill_ids: List[str] = Field(default_factory=list, max_length=6)
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
    video_sampling: Literal['head', 'uniform'] = 'head'
    video_frames: Literal[6, 12, 24] = 6

    @model_validator(mode='after')
    def sampling_requires_video(self):
        if self.video_sampling == 'uniform' and (not self.videos or any(not value.strip() for value in self.videos)):
            raise ValueError('全片取帧需要视频输入')
        return self


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
    video_sampling: Literal['head', 'uniform'] = 'head'
    video_frames: Literal[6, 12, 24] = 6

    @model_validator(mode='after')
    def sampling_requires_video(self):
        if self.video_sampling == 'uniform' and (not self.videos or any(not value.strip() for value in self.videos)):
            raise ValueError('全片取帧需要视频输入')
        return self


class CanvasModelTaskRequest(BaseModel):
    model_config = {'extra': 'forbid'}
    canvas_id: str = Field(min_length=1, max_length=96)
    client_task_id: str = Field(pattern=r'^canvas_model_[A-Za-z0-9_-]{8,80}$')
    canvas_target: CanvasTaskTarget
    provider_id: str = Field(min_length=1, max_length=96)
    model: Literal['3.0', '3.1'] = '3.0'
    mode: Literal['text', 'image', 'multi'] = 'text'
    prompt: str = Field(default='', max_length=1024)
    images: List[str] = Field(default_factory=list, max_length=7)
    view_types: List[Literal['front','left','right','back','top','bottom','left_front','right_front']] = Field(default_factory=list, max_length=7)
    generate_type: Literal['Normal','LowPoly','Geometry','Sketch'] = 'Normal'
    enable_pbr: bool = Field(default=False, strict=True)
    face_count: Literal[0,300000,500000] = 300000
    polygon_type: Literal['triangle','quadrilateral'] = 'triangle'

    @field_validator('face_count', mode='before')
    @classmethod
    def integer_faces(cls, value):
        if type(value) is not int:
            raise PydanticCustomError('model_faces_integer', '模型面数需要整数')
        return value

    @model_validator(mode='after')
    def valid_inputs(self):
        if self.model == '3.1' and self.generate_type not in {'Normal','Geometry'}:
            raise PydanticCustomError('model_generation_type', '3.1 模型支持标准模型和白模')
        if self.mode == 'text':
            if self.images or self.view_types or not self.prompt.strip():
                raise PydanticCustomError('model_text_input', '文字生成需要描述，不能同时提供图片')
        else:
            if not self.images or len(set(self.images)) != len(self.images) or self.mode == 'image' and len(self.images) != 1:
                raise PydanticCustomError('model_image_input', '请提供模式所需数量的独立参考图片')
            if self.prompt.strip() and self.generate_type != 'Sketch':
                raise PydanticCustomError('model_prompt_image_conflict', '图片生成模式仅草图类型支持附加文字描述')
            if self.mode == 'image' and self.view_types:
                raise PydanticCustomError('model_views', '单图模式无需多视角配置')
            if self.mode == 'multi' and (len(self.view_types) != len(self.images) or len(set(self.view_types)) != len(self.view_types) or self.view_types[0] != 'front'):
                raise PydanticCustomError('model_views', '多图模式需要为每张图片指定独立视角，第一张为正面')
            if self.model == '3.0' and any(view not in {'front','left','right','back'} for view in self.view_types):
                raise PydanticCustomError('model_views_version', '3.0 多图模式支持正面、左侧、右侧和背面')
        if self.generate_type != 'LowPoly' and self.face_count == 0:
            raise PydanticCustomError('model_faces', '标准模型和白模请选择 30 万或 50 万面')
        return self


class CanvasAudioVoiceFavorite(BaseModel):
    model_config = {'extra': 'forbid'}
    provider_id: str = Field(min_length=1, max_length=96)
    model: str = Field(min_length=1, max_length=180)
    voice_id: str = Field(min_length=1, max_length=180)
    catalog_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    favorite: bool = Field(strict=True)


class CanvasAudioVoiceRegistration(BaseModel):
    model_config = {'extra': 'forbid'}
    provider_id: str = Field(min_length=1, max_length=96)
    model: str = Field(min_length=1, max_length=180)
    catalog_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    task_id: str = Field(pattern=r'^canvas_audio_[A-Za-z0-9_-]{8,80}$')
    name: str = Field(min_length=1, max_length=180)
    language: str = Field(min_length=1, max_length=64)
    accent: str = Field(default='', max_length=64)
    gender: Literal['MALE', 'FEMALE']
    age: Literal['CHILD', 'YOUTH', 'ADULT', 'ELDER']
    description: str = Field(default='', max_length=1000)


class CanvasAudioVoiceDelete(BaseModel):
    model_config = {'extra': 'forbid'}
    provider_id: str = Field(min_length=1, max_length=96)
    model: str = Field(min_length=1, max_length=180)
    catalog_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    voice_id: str = Field(min_length=1, max_length=180)
    retry: bool = Field(default=False, strict=True)


class CanvasAudioTaskRequest(BaseModel):
    model_config = {'extra': 'forbid'}
    canvas_id: str = Field(min_length=1, max_length=96)
    client_task_id: str = Field(pattern=r'^canvas_audio_[A-Za-z0-9_-]{8,80}$')
    canvas_target: CanvasTaskTarget
    provider_id: str = Field(min_length=1, max_length=96)
    model: str = Field(min_length=1, max_length=180)
    mode: Literal['speech', 'music', 'design', 'clone'] = 'speech'
    prompt: str = Field(default='', max_length=10000)
    preview_text: str = Field(default='', max_length=500)
    voice_catalog_id: str = Field(default='', max_length=64)
    sample_audio: str = Field(default='', max_length=2048)
    clone_preview_model: str = Field(default='', max_length=180)
    clone_terms_accepted: bool = Field(default=False, strict=True)
    timbre_id: str = Field(default='male-qn-qingse', min_length=1, max_length=180)
    speed: float = Field(default=1, ge=.5, le=2, allow_inf_nan=False)
    vol: float = Field(default=1, ge=0, le=10, allow_inf_nan=False)
    pitch: int = Field(default=0, ge=-12, le=12, strict=True)
    voice_modify_pitch: int = Field(default=0, ge=-100, le=100, strict=True)
    voice_modify_intensity: int = Field(default=0, ge=-100, le=100, strict=True)
    voice_modify_timbre: int = Field(default=0, ge=-100, le=100, strict=True)
    voice_modify_sound_effects: Literal['', 'spacious_echo', 'auditorium_echo', 'lofi_telephone', 'robotic'] = ''
    music_mode: Literal['CUSTOM', 'ADAPTIVE', 'INSTRUMENTAL'] = 'CUSTOM'
    lyrics: str = Field(default='', max_length=3500)

    @model_validator(mode='after')
    def content_for_mode(self):
        if self.mode == 'design' and (not self.prompt.strip() or not self.preview_text.strip()):
            raise PydanticCustomError('voice_design_text_required', '请填写音色描述和 1–500 个字符的试听文本')
        if self.mode in {'design', 'clone'} and (len(self.voice_catalog_id) != 64 or any(char not in '0123456789abcdef' for char in self.voice_catalog_id)):
            raise PydanticCustomError('voice_design_catalog_required', '请先读取当前供应商的音色目录')
        if self.mode == 'clone' and (not self.sample_audio or not self.clone_terms_accepted or not self.clone_preview_model.startswith('speech-') or not self.preview_text.strip()):
            raise PydanticCustomError('voice_clone_sample_required', '请确认声音克隆规则，录制样本并选择试听模型')
        if self.mode == 'speech' and (not self.prompt.strip() or len(self.prompt) >= 10000):
            raise PydanticCustomError('audio_text_required', '语音文本需要 1–9999 个字符')
        if self.mode == 'music':
            if len(self.prompt) > 2000:
                raise PydanticCustomError('music_prompt_length', '音乐描述最多 2000 个字符')
            if self.music_mode == 'CUSTOM' and not self.lyrics.strip():
                raise PydanticCustomError('music_lyrics_required', '自定义歌曲需要歌词')
            if self.music_mode != 'CUSTOM' and not self.prompt.strip():
                raise PydanticCustomError('music_prompt_required', '请填写音乐描述')
        return self


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


class CanvasFolderTreeProof(BaseModel):
    model_config = {'extra': 'forbid'}
    id: str = Field(min_length=1,max_length=96)
    token: str = Field(min_length=1,max_length=128)
    generation: int = Field(ge=1,strict=True)
    revision: int = Field(ge=0,strict=True)


class CanvasFolderTreeDelete(BaseModel):
    model_config = {'extra': 'forbid'}
    operation_id: str = Field(pattern=r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    name: str = Field(min_length=1,max_length=80)
    plan_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    canvases: List[CanvasFolderTreeProof] = Field(default_factory=list,max_length=10000)


class CanvasMoveRequest(BaseModel):
    folder_id: str = ""


class CanvasMetaUpdate(BaseModel):
    cover_style: Optional[Literal["type", "editorial", "sage", "ink"]] = None
    title: Optional[str] = None
    icon: Optional[str] = None
    owner: Optional[str] = None
    color: Optional[str] = None
    pinned: Optional[bool] = None


class CanvasNodeTag(BaseModel):
    id: str = Field(min_length=1, max_length=96)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    name: str = Field(default='', max_length=80)


class CanvasTagEnvelope(BaseModel):
    node_tags: Optional[List[CanvasNodeTag]] = Field(default=None, max_length=256)

    @field_validator('node_tags')
    @classmethod
    def unique_tag_ids(cls, value):
        if value is not None and len({tag.id for tag in value}) != len(value):
            raise PydanticCustomError('canvas_tag_duplicate', '标签标识不能重复')
        return value


class CanvasCoverSelection(BaseModel):
    node_id: str = Field(default="", max_length=128)
    index: int = Field(default=-1, ge=-1, le=100000, strict=True)
    text: str = Field(default="", max_length=80)


class CanvasSaveRequest(CanvasTagEnvelope):
    cover: Optional[CanvasCoverSelection] = None
    task_result_version: int = Field(default=0, ge=0, strict=True)
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


class CanvasWorkflowExportRequest(CanvasTagEnvelope):
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
    "ChatRequest",  "CanvasLLMRequest", "CanvasLLMTaskRequest", "CanvasAudioTaskRequest", "CanvasAudioVoiceFavorite", "CanvasAudioVoiceRegistration", "CanvasAudioVoiceDelete", "CanvasModelTaskRequest",
    "ConversationCreateRequest",
    "CanvasCreateRequest", "CanvasFolderCreateRequest",
    "CanvasFolderUpdateRequest", "CanvasFolderTreeProof", "CanvasFolderTreeDelete", "CanvasMoveRequest",
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
