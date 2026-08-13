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


router = APIRouter()
avatar_status_lock = asyncio.Lock()
avatar_registration_semaphore = asyncio.Semaphore(8)

@router.post("/api/local-assets/upload")
async def upload_local_assets(files: List[UploadFile] = File(...), folder: str = Form("")):
    uploaded = []
    folder_rel, folder_abs = _local_upload_safe_folder(folder)
    os.makedirs(folder_abs, exist_ok=True)
    for file in files:
        content = await file.read()
        if not content:
            continue
        kind, ext = _local_upload_kind_ext(file.filename, file.content_type)
        if kind is None:
            continue
        base = os.path.splitext(os.path.basename(file.filename or "file"))[0]
        base = re.sub(r"[^0-9A-Za-z一-鿿._-]+", "_", base).strip("_") or "file"
        base = base[:60]
        filename = f"up_{uuid.uuid4().hex[:12]}_{base}{ext}"
        rel_name = f"{folder_rel}/{filename}".lstrip("/")
        path = os.path.join(folder_abs, filename)
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append(_local_upload_item(rel_name))
    return {"files": uploaded}

@router.get("/api/local-assets")
async def list_local_assets():
    tree, items = _local_upload_tree_and_items()
    return {"items": items, "tree": tree}

@router.post("/api/local-assets/folders")
async def create_local_asset_folder(payload: LocalAssetFolderRequest, request: Request):
    ensure_same_origin_request(request)
    parent_rel, parent_abs = _local_upload_safe_folder(payload.parent)
    if not os.path.isdir(parent_abs):
        raise HTTPException(status_code=404, detail="父文件夹不存在")
    name = _local_upload_safe_folder_name(payload.name)
    rel = f"{parent_rel}/{name}".lstrip("/")
    _, abs_path = _local_upload_safe_folder(rel)
    if os.path.exists(abs_path):
        raise HTTPException(status_code=400, detail="同名文件夹已存在")
    os.makedirs(abs_path, exist_ok=False)
    tree, items = _local_upload_tree_and_items()
    return {"ok": True, "folder": {"path": rel, "name": name}, "tree": tree, "items": items}

@router.patch("/api/local-assets/folders")
async def rename_local_asset_folder(payload: LocalAssetFolderRequest, request: Request):
    ensure_same_origin_request(request)
    rel, abs_path = _local_upload_safe_folder(payload.path)
    if not rel:
        raise HTTPException(status_code=400, detail="根目录不能重命名")
    if not os.path.isdir(abs_path):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    name = _local_upload_safe_folder_name(payload.name)
    parent = os.path.dirname(rel).replace("\\", "/")
    new_rel = f"{parent}/{name}".lstrip("/")
    _, new_abs = _local_upload_safe_folder(new_rel)
    if os.path.exists(new_abs):
        raise HTTPException(status_code=400, detail="同名文件夹已存在")
    os.rename(abs_path, new_abs)
    tree, items = _local_upload_tree_and_items()
    return {"ok": True, "folder": {"path": new_rel, "name": name}, "tree": tree, "items": items}

@router.post("/api/local-assets/delete")
async def delete_local_assets(payload: dict, request: Request):
    ensure_same_origin_request(request)
    names = payload.get("names") if isinstance(payload, dict) else None
    if not isinstance(names, list):
        names = []
    deleted = []
    for name in names:
        try:
            rel, path = _local_upload_safe_path(name)
        except HTTPException:
            continue
        if os.path.isfile(path):
            try:
                os.remove(path)
                txt_path = _local_upload_caption_path(rel)
                if os.path.isfile(txt_path):
                    os.remove(txt_path)
                deleted.append(rel)
            except OSError:
                pass
    return {"deleted": deleted}

@router.post("/api/local-assets/caption")
async def caption_local_assets(payload: LocalAssetCaptionRequest):
    prompt = (payload.prompt or "描述图片").strip() or "描述图片"
    items = []
    ok_count = 0
    for name in (payload.names or [])[:100]:
        item = {"name": name, "ok": False, "caption": "", "caption_file": "", "error": ""}
        try:
            filename, path = _local_upload_safe_path(name)
            if not os.path.isfile(path):
                raise HTTPException(status_code=404, detail="文件不存在")
            kind, _ = _local_upload_kind_ext(filename, "")
            if kind != "image":
                raise HTTPException(status_code=400, detail="仅支持图片素材反推提示词")
            caption, resolved_model = await caption_image_with_provider(
                path,
                prompt,
                payload.provider,
                payload.model,
                payload.ms_model,
            )
            txt_path = _local_upload_caption_path(filename)
            with open(txt_path, "w", encoding="utf-8", newline="") as f:
                f.write(caption)
            item.update({
                "ok": True,
                "name": filename,
                "caption": caption,
                "caption_file": os.path.basename(txt_path),
                "model": resolved_model,
            })
            ok_count += 1
        except HTTPException as exc:
            item["error"] = str(exc.detail or "反推失败")
        except Exception as exc:
            item["error"] = str(exc) or "反推失败"
        items.append(item)
    return {"ok": True, "count": ok_count, "items": items}

@router.patch("/api/local-assets/caption")
async def save_local_asset_caption(payload: LocalAssetCaptionSaveRequest):
    filename, path = _local_upload_safe_path(payload.name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    kind, _ = _local_upload_kind_ext(filename, "")
    if kind != "image":
        raise HTTPException(status_code=400, detail="仅支持图片素材保存提示词")
    caption = str(payload.caption or "")[:100000]
    txt_path = _local_upload_caption_path(filename)
    with open(txt_path, "w", encoding="utf-8", newline="") as f:
        f.write(caption)
    return {"ok": True, "caption": caption, "caption_file": os.path.basename(txt_path)}

@router.post("/api/asset-library/workflows/upload")
async def upload_asset_library_workflows(
    files: List[UploadFile] = File(...),
    library_id: str = Form(""),
    category_id: str = Form(""),
):
    lib = load_asset_library()
    _, cat = asset_library_workflow_category(lib, library_id, category_id)
    added = []
    for file in files[:100]:
        raw = await file.read()
        filename = file.filename or "canvas-workflow.zip"
        lower = filename.lower()
        if not (lower.endswith(".json") or lower.endswith(".zip") or raw[:2] == b"PK"):
            continue
        item = make_workflow_library_item_from_bytes(raw, filename, os.path.splitext(filename)[0])
        cat.setdefault("items", []).append(item)
        added.append(item)
    if not added:
        raise HTTPException(status_code=400, detail="没有可上传的工作流文件")
    save_asset_library(lib)
    return {"library": lib, "items": added}

@router.get("/api/asset-library")
async def get_asset_library():
    return {"library": await asyncio.to_thread(load_asset_library)}

@router.post("/api/asset-library/libraries")
async def create_asset_library(payload: AssetLibraryRequest):
    lib = load_asset_library()
    library = {"id": f"lib_{uuid.uuid4().hex[:12]}", "name": sanitize_asset_name(payload.name, "资产库"), "type": "asset", "categories": []}
    library["categories"].append({"id": f"cat_{uuid.uuid4().hex[:12]}", "name": "默认分组", "type": "image", "items": []})
    library["categories"].append({"id": f"wf_{uuid.uuid4().hex[:12]}", "name": "工作流", "type": "workflow", "items": []})
    lib.setdefault("libraries", []).append(library)
    lib["active_library_id"] = library["id"]
    save_asset_library(lib)
    return {"library": lib, "asset_library": library}

@router.patch("/api/asset-library/libraries/{library_id}")
async def rename_asset_library(library_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    library = find_asset_library(lib, library_id)
    if not library or library.get("id") != library_id:
        raise HTTPException(status_code=404, detail="资产库不存在")
    library["name"] = sanitize_asset_name(payload.name, library.get("name") or "资产库")
    save_asset_library(lib)
    return {"library": lib, "asset_library": library}

@router.delete("/api/asset-library/libraries/{library_id}")
async def delete_asset_library(library_id: str):
    lib = load_asset_library()
    libraries = lib.get("libraries") or []
    if len(libraries) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个资产库")
    removed_library = next((item for item in libraries if item.get("id") == library_id), None)
    if not removed_library:
        raise HTTPException(status_code=404, detail="资产库不存在")
    lib["libraries"] = [item for item in libraries if item.get("id") != library_id]
    if lib.get("active_library_id") == library_id:
        lib["active_library_id"] = lib["libraries"][0].get("id")
    save_asset_library(lib)
    for cat in removed_library.get("categories", []):
        for item in cat.get("items", []):
            remove_asset_library_file(item)
        cat_dir = str(cat.get("dir") or "").strip("/\\")
        if cat_dir:
            target = os.path.abspath(os.path.join(ASSET_LIBRARY_DIR, cat_dir))
            if os.path.commonpath([os.path.abspath(ASSET_LIBRARY_DIR), target]) == os.path.abspath(ASSET_LIBRARY_DIR):
                shutil.rmtree(target, ignore_errors=True)
    return {"library": lib}

@router.post("/api/asset-library/categories")
async def create_asset_library_category(payload: AssetLibraryCategoryRequest):
    lib = load_asset_library()
    library = find_asset_library(lib, payload.library_id)
    if not library:
        raise HTTPException(status_code=404, detail="资产库不存在")
    cat_type = "workflow" if str(payload.type or "").lower() == "workflow" else "image"
    category = {"id": f"cat_{uuid.uuid4().hex[:12]}", "name": sanitize_asset_name(payload.name, "新文件夹"), "type": cat_type, "items": []}
    if cat_type == "image":
        # 图片分组在 library/ 下建一个真实文件夹，之后该分组的资产都存进这个文件夹，便于在磁盘上管理。
        category["dir"] = unique_asset_category_dir(library, payload.name)
        try:
            os.makedirs(os.path.join(ASSET_LIBRARY_DIR, category["dir"]), exist_ok=True)
        except Exception as exc:
            print(f"创建分组文件夹失败: {exc}")
    library.setdefault("categories", []).append(category)
    lib["active_library_id"] = library.get("id") or lib.get("active_library_id")
    save_asset_library(lib)
    return {"library": lib, "category": category}

@router.patch("/api/asset-library/categories/{category_id}")
async def rename_asset_library_category(category_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    _, cat = find_asset_category_with_library(lib, category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    cat["name"] = sanitize_asset_name(payload.name, cat.get("name") or "新文件夹")
    save_asset_library(lib)
    return {"library": lib, "category": cat}

@router.delete("/api/asset-library/categories/{category_id}")
async def delete_asset_library_category(category_id: str, library_id: str = ""):
    lib = load_asset_library()
    library, cat = find_asset_category_with_library(lib, category_id, library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") == "workflow" and category_id == "workflows" and (library.get("id") or "") == "default":
        raise HTTPException(status_code=400, detail="默认工作流分类不能删除")
    # 删除分组时一并清理该分组下的本地文件 + 分组文件夹，避免磁盘残留。
    for item in (cat.get("items") or []):
        remove_asset_library_file(item)
    cat_dir = str(cat.get("dir") or "").strip("/").strip()
    if cat_dir:
        try:
            target = os.path.join(ASSET_LIBRARY_DIR, cat_dir)
            if os.path.isdir(target) and os.path.abspath(target).startswith(os.path.abspath(ASSET_LIBRARY_DIR) + os.sep):
                shutil.rmtree(target, ignore_errors=True)
        except Exception as exc:
            print(f"删除分组文件夹失败: {exc}")
    library["categories"] = [c for c in library.get("categories", []) if c.get("id") != category_id]
    save_asset_library(lib)
    return {"library": lib}

@router.post("/api/asset-library/items")
async def add_asset_library_item(payload: AssetLibraryAddRequest):
    lib = load_asset_library()
    cat = find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    src = output_file_from_url(payload.url)
    if not src:
        raise HTTPException(status_code=400, detail="只支持保存本地 /assets 或 /output 媒体")
    _, item = make_asset_library_item(src, payload.name or os.path.basename(src), subdir=cat.get("dir") or "")
    cat.setdefault("items", []).append(item)
    save_asset_library(lib)
    return {"library": lib, "item": item}

@router.post("/api/asset-library/items/batch")
async def batch_add_asset_library_items(payload: AssetLibraryBatchAddRequest):
    added = []
    lib = load_asset_library()
    cat = find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    for entry in (payload.items or [])[:200]:
        entry.category_id = payload.category_id
        entry.library_id = payload.library_id
        src = output_file_from_url(entry.url)
        if not src:
            continue
        _, item = make_asset_library_item(src, entry.name or os.path.basename(src), subdir=cat.get("dir") or "")
        cat.setdefault("items", []).append(item)
        added.append(item)
    save_asset_library(lib)
    return {"library": lib, "items": added}

@router.get("/api/shared-folders")
async def list_shared_folders():
    data = shared_folders_load()
    folders = []
    for entry in data.get("folders", []):
        abs_path = shared_folder_abs(entry)
        folders.append({
            "id": entry.get("id"),
            "name": entry.get("name") or os.path.basename(abs_path) or abs_path,
            "rel": entry.get("rel") or "",
            "path": abs_path,
            "exists": os.path.isdir(abs_path),
            "created_at": entry.get("created_at"),
        })
    return {"folders": folders}

@router.post("/api/shared-folders")
async def register_shared_folder(payload: SharedFolderRegister):
    abs_path, rel = shared_resolve_register(payload.path)
    name = sanitize_asset_name(payload.name or os.path.basename(abs_path), "共享文件夹")
    with SHARED_FOLDERS_LOCK:
        data = shared_folders_load()
        for entry in data.get("folders", []):
            if os.path.normpath(shared_folder_abs(entry)) == os.path.normpath(abs_path):
                entry["name"] = name
                shared_folders_save(data)
                return {"folder": {**entry, "path": abs_path, "exists": True}}
        entry = {
            "id": f"shared_{uuid.uuid4().hex[:12]}",
            "name": name,
            "rel": rel,
            "created_at": now_ms(),
        }
        data.setdefault("folders", []).append(entry)
        shared_folders_save(data)
    return {"folder": {**entry, "path": abs_path, "exists": True}}

@router.delete("/api/shared-folders/{folder_id}")
async def unregister_shared_folder(folder_id: str):
    with SHARED_FOLDERS_LOCK:
        data = shared_folders_load()
        before = len(data.get("folders", []))
        data["folders"] = [f for f in data.get("folders", []) if f.get("id") != folder_id]
        if len(data["folders"]) == before:
            raise HTTPException(status_code=404, detail="共享文件夹不存在")
        shared_folders_save(data)
    return {"ok": True}

@router.get("/api/shared-folders/{folder_id}/tree")
async def get_shared_folder_tree(folder_id: str):
    entry = shared_folder_by_id(folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    abs_path = shared_folder_abs(entry)
    if not os.path.isdir(abs_path):
        raise HTTPException(status_code=404, detail="文件夹已不存在")
    tree = scan_shared_tree(folder_id, abs_path, "", entry.get("name") or os.path.basename(abs_path))
    return {"folder": {"id": folder_id, "name": entry.get("name"), "path": abs_path}, "tree": tree}

@router.get("/api/shared-folders/{folder_id}/file")
async def get_shared_folder_file(folder_id: str, path: str = ""):
    entry = shared_folder_by_id(folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    folder_abs = shared_folder_abs(entry)
    abs_path = shared_child_abs(folder_abs, path)
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in SHARED_MEDIA_EXTS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    return FileResponse(abs_path, media_type=content_type_for_path(abs_path))

@router.post("/api/shared-folders/import")
async def import_shared_folder_files(payload: SharedFolderImport):
    entry = shared_folder_by_id(payload.folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    folder_abs = shared_folder_abs(entry)
    lib = load_asset_library()
    cat = find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    added = []
    for rel in (payload.paths or [])[:200]:
        abs_path = shared_child_abs(folder_abs, rel)
        if not os.path.isfile(abs_path):
            continue
        ext = os.path.splitext(abs_path)[1].lower()
        if ext not in SHARED_MEDIA_EXTS:
            continue
        _, item = make_asset_library_item(abs_path, os.path.basename(abs_path), subdir=cat.get("dir") or "")
        cat.setdefault("items", []).append(item)
        added.append(item)
    save_asset_library(lib)
    return {"library": lib, "items": added}

async def caption_image_with_provider(abs_path, prompt, provider_id, model, ms_model=""):
    chat_base, chat_hdrs, resolved_model = resolve_chat_provider(provider_id, model, ms_model)
    llm_provider = get_api_provider(provider_id) if provider_id not in ("modelscope",) else {}
    is_apimart = is_apimart_provider(llm_provider)
    prompt_text = (prompt or "描述图片").strip() or "描述图片"
    data_url = image_path_to_data_url(abs_path, max_size=1024)
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt_text},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    }]
    raw = None
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body = {"model": resolved_model, "messages": messages}
            if is_apimart:
                req_body["stream"] = False
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json=req_body,
            )
            response.raise_for_status()
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, resolved_model, llm_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body}") from exc
    except httpx.HTTPError as exc:
        log_net_error(f"对话 网络/TLS错误 provider={llm_provider} model={resolved_model}", exc)
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"解析上游响应失败：{exc}") from exc
    text = text_from_chat_response(raw).strip() if isinstance(raw, dict) else ""
    return text or "接口返回了空回复。", resolved_model

@router.patch("/api/asset-library/items/{item_id}")
async def rename_asset_library_item(item_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    item["name"] = sanitize_asset_name(payload.name, item.get("name") or "asset")
                    save_asset_library(lib)
                    return {"library": lib, "item": item}
    raise HTTPException(status_code=404, detail="资产不存在")

@router.post("/api/asset-library/items/{item_id}/register-avatar")
async def register_asset_library_avatar(item_id: str, payload: AssetAvatarRegisterRequest):
    lib = load_asset_library()
    target_item = find_asset_item_in_library(lib, item_id, payload.library_id)
    if not target_item:
        raise HTTPException(status_code=404, detail="资产不存在")
    provider = get_api_provider_exact(payload.provider_id)
    platform = avatar_platform_for_provider(provider)
    if platform not in AVATAR_SUPPORTED_PLATFORMS:
        name = (provider or {}).get("name") or (provider or {}).get("id") or "该平台"
        raise HTTPException(status_code=400, detail=f"「{name}」暂不支持数字人/真人认证（目前仅 APIMart 可用，火山等平台待接入官方资产 API）。")
    existing_regs = target_item.get("registrations") if isinstance(target_item.get("registrations"), dict) else {}
    existing_reg = existing_regs.get(platform) if isinstance(existing_regs.get(platform), dict) else {}
    existing_status = str(existing_reg.get("status") or "")
    if existing_status == "Active" or (existing_status == "Processing" and existing_reg.get("task_id")):
        return {"library": lib, "item": target_item, "skipped": True, "status": existing_status}
    kind = str(target_item.get("kind") or "image").lower()
    if kind not in ("image", "video", "audio"):
        kind = "image"
    async with avatar_registration_semaphore:
        if platform == "apimart":
            project_name = str(payload.project_name or "default").strip() or "default"
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT, **httpx_provider_kwargs(provider)) as client:
                public_url = await upload_media_for_apimart(client, provider, target_item.get("url") or "", kind)
            if not valid_apimart_video_image_input(public_url):
                reason = public_url[4:] if isinstance(public_url, str) and public_url.startswith("ERR:") else "无法获取公网可访问地址"
                raise HTTPException(status_code=400, detail=f"素材无法提交到 APIMart：{reason}\n请配置 PUBLIC_BASE_URL，或确认本地文件存在。")
            task_id = await submit_apimart_avatar_asset(
                provider, public_url, target_item.get("name") or "asset", kind,
                project_name=project_name, group_name=payload.group_name,
            )
        elif platform == "volcengine":
            project_name = str(provider.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip() or VOLCENGINE_DEFAULT_PROJECT_NAME
            public_url = volcengine_public_asset_url(target_item.get("url") or "")
            if public_url.startswith("ERR:"):
                raise HTTPException(status_code=400, detail=public_url[4:])
            task_id = await submit_volcengine_avatar_asset(
                public_url, target_item.get("name") or "asset", kind,
                project_name=project_name, group_name=payload.group_name or "",
            )
        else:
            raise HTTPException(status_code=400, detail="该平台的认证后端尚未接入。")
    async with avatar_status_lock:
        latest_lib = load_asset_library()
        latest_item = find_asset_item_in_library(latest_lib, item_id, payload.library_id)
        if not latest_item:
            raise HTTPException(status_code=404, detail="资产不存在")
        regs = latest_item.get("registrations") if isinstance(latest_item.get("registrations"), dict) else {}
        regs[platform] = {
            "provider_id": provider["id"], "project_name": project_name, "task_id": task_id,
            "status": "Processing", "detail": "已提交，审核中", "asset_uri": "", "asset_id": "",
            "registered_at": now_ms(),
        }
        latest_item["registrations"] = regs
        save_asset_library(latest_lib)
        return {"library": latest_lib, "item": latest_item, "status": "Processing"}

@router.post("/api/asset-library/items/batch-register-avatar")
async def batch_register_asset_library_avatar(payload: AssetAvatarBatchRegisterRequest):
    ids = []
    seen = set()
    for raw_id in (payload.ids or []):
        item_id = str(raw_id or "").strip()
        if item_id and item_id not in seen:
            ids.append(item_id)
            seen.add(item_id)
    if not ids:
        raise HTTPException(status_code=400, detail="No assets selected")
    if len(ids) > 100:
        raise HTTPException(status_code=400, detail="Too many assets selected; please submit at most 100 at a time")

    provider = get_api_provider_exact(payload.provider_id)
    platform = avatar_platform_for_provider(provider)
    if platform not in AVATAR_SUPPORTED_PLATFORMS:
        name = (provider or {}).get("name") or (provider or {}).get("id") or "provider"
        raise HTTPException(status_code=400, detail=f"{name} does not support avatar asset registration")

    lib = load_asset_library()
    indexed_items = []
    results = [None] * len(ids)
    for index, item_id in enumerate(ids):
        item = find_asset_item_in_library(lib, item_id, payload.library_id)
        if not item:
            results[index] = {"item_id": item_id, "ok": False, "status": "Failed", "detail": "Asset not found"}
        elif str(item.get("kind") or "image").lower() not in ("image", "video", "audio"):
            results[index] = {"item_id": item_id, "ok": False, "status": "Failed", "detail": "Unsupported asset type"}
        else:
            regs = item.get("registrations") if isinstance(item.get("registrations"), dict) else {}
            reg = regs.get(platform) if isinstance(regs.get(platform), dict) else {}
            status = str(reg.get("status") or "")
            if status == "Active" or (status == "Processing" and reg.get("task_id")):
                results[index] = {
                    "item_id": item_id, "ok": True, "skipped": True, "status": status,
                    "task_id": reg.get("task_id") or "", "detail": "Already registered" if status == "Active" else "Already processing",
                }
            else:
                indexed_items.append((index, item))

    if not indexed_items:
        final_results = [r for r in results if r]
        return {
            "library": lib, "items": [], "results": final_results, "submitted": 0,
            "skipped": sum(1 for result in final_results if result.get("skipped")),
            "failed": sum(1 for result in final_results if not result.get("ok")),
        }

    def avatar_kind(item):
        kind = str(item.get("kind") or "image").lower()
        return kind

    def failure_result(index, item, exc):
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        return index, {"item_id": item.get("id") or ids[index], "ok": False, "status": "Failed", "detail": str(detail or "Registration failed")}

    if platform == "apimart":
        project_name = str(payload.project_name or "default").strip() or "default"

        async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT, **httpx_provider_kwargs(provider)) as upload_client:
            async def register_one(index, item):
                async with avatar_registration_semaphore:
                    kind = avatar_kind(item)
                    try:
                        public_url = await upload_media_for_apimart(upload_client, provider, item.get("url") or "", kind)
                        if not valid_apimart_video_image_input(public_url):
                            reason = public_url[4:] if isinstance(public_url, str) and public_url.startswith("ERR:") else "Unable to get a public media URL"
                            raise HTTPException(status_code=400, detail=reason)
                        task_id = await submit_apimart_avatar_asset(
                            provider, public_url, item.get("name") or "asset", kind,
                            project_name=project_name, group_name=payload.group_name,
                        )
                        return index, {"item_id": item.get("id") or ids[index], "ok": True, "status": "Processing", "task_id": task_id, "detail": "Submitted"}
                    except Exception as exc:
                        return failure_result(index, item, exc)

            completed = await asyncio.gather(*(register_one(index, item) for index, item in indexed_items))
    elif platform == "volcengine":
        project_name = str(provider.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip() or VOLCENGINE_DEFAULT_PROJECT_NAME

        async with httpx.AsyncClient(timeout=120) as client:
            group_id = await volcengine_ensure_asset_group(client, project_name, payload.group_name or "")

            async def register_one(index, item):
                async with avatar_registration_semaphore:
                    kind = avatar_kind(item)
                    try:
                        public_url = volcengine_public_asset_url(item.get("url") or "")
                        if public_url.startswith("ERR:"):
                            raise HTTPException(status_code=400, detail=public_url[4:])
                        created = await volcengine_ark_asset_call(client, "CreateAsset", {
                            "GroupId": group_id,
                            "URL": public_url,
                            "AssetType": apimart_avatar_asset_type(kind),
                            "Name": (item.get("name") or "asset")[:60],
                            "ProjectName": project_name,
                        })
                        task_id = str(created.get("Id") or "").strip()
                        if not task_id:
                            raise HTTPException(status_code=502, detail=f"Volcengine CreateAsset did not return Asset Id: {str(created)[:200]}")
                        return index, {"item_id": item.get("id") or ids[index], "ok": True, "status": "Processing", "task_id": task_id, "detail": "Submitted"}
                    except Exception as exc:
                        return failure_result(index, item, exc)

            completed = await asyncio.gather(*(register_one(index, item) for index, item in indexed_items))
    else:
        raise HTTPException(status_code=400, detail="This provider is not wired for avatar registration")

    submitted = 0
    for index, result in completed:
        results[index] = result
    successful = [result for result in results if result and result.get("ok") and not result.get("skipped")]
    if successful:
        async with avatar_status_lock:
            lib = load_asset_library()
            for result in successful:
                item = find_asset_item_in_library(lib, result.get("item_id") or "", payload.library_id)
                if not item:
                    result.update(ok=False, status="Failed", detail="Asset disappeared before registration could be saved")
                    continue
                regs = item.get("registrations") if isinstance(item.get("registrations"), dict) else {}
                regs[platform] = {
                    "provider_id": provider["id"],
                    "project_name": project_name,
                    "task_id": result.get("task_id") or "",
                    "status": "Processing",
                    "detail": "Submitted, processing",
                    "asset_uri": "",
                    "asset_id": "",
                    "registered_at": now_ms(),
                }
                item["registrations"] = regs
                submitted += 1
            if submitted:
                save_asset_library(lib)
    final_results = [r for r in results if r]
    return {
        "library": lib,
        "items": [find_asset_item_in_library(lib, item.get("id") or "", payload.library_id) for _, item in indexed_items],
        "results": final_results,
        "submitted": submitted,
        "skipped": sum(1 for result in final_results if result.get("skipped")),
        "failed": sum(1 for result in final_results if not result.get("ok")),
    }
@router.post("/api/asset-library/items/{item_id}/avatar-status")
async def check_asset_library_avatar(item_id: str, payload: AssetAvatarRegisterRequest):
    lib = load_asset_library()
    target_item = find_asset_item_in_library(lib, item_id, payload.library_id)
    if not target_item:
        raise HTTPException(status_code=404, detail="资产不存在")
    regs = target_item.get("registrations") if isinstance(target_item.get("registrations"), dict) else {}
    provider = get_api_provider_exact(payload.provider_id or "")
    platform = avatar_platform_for_provider(provider)
    if platform not in AVATAR_SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="该平台暂不支持数字人/真人认证审核。")
    reg = regs.get(platform) if isinstance(regs.get(platform), dict) else {}
    task_id = str(reg.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="该素材还没有提交到这个平台的认证审核。")
    if platform == "apimart":
        result = await check_apimart_avatar_task(provider, task_id)
    elif platform == "volcengine":
        result = await check_volcengine_avatar_task(
            task_id, str(reg.get("project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip() or VOLCENGINE_DEFAULT_PROJECT_NAME,
        )
    else:
        raise HTTPException(status_code=400, detail="该平台的认证后端尚未接入。")
    async with avatar_status_lock:
        latest_lib = load_asset_library()
        latest_item = find_asset_item_in_library(latest_lib, item_id, payload.library_id)
        if not latest_item:
            raise HTTPException(status_code=404, detail="资产不存在")
        latest_regs = latest_item.get("registrations") if isinstance(latest_item.get("registrations"), dict) else {}
        latest_reg = latest_regs.get(platform) if isinstance(latest_regs.get(platform), dict) else {}
        if str(latest_reg.get("task_id") or "") != task_id:
            return {"library": latest_lib, "item": latest_item}
        latest_reg["status"] = result["status"]
        latest_reg["detail"] = result.get("detail") or ""
        if result["status"] == "Active" and result.get("asset_uri"):
            latest_reg["asset_uri"] = result["asset_uri"]
            latest_reg["asset_id"] = result["asset_uri"].replace("asset://", "")
        latest_regs[platform] = latest_reg
        latest_item["registrations"] = latest_regs
        save_asset_library(latest_lib)
        return {"library": latest_lib, "item": latest_item}

@router.delete("/api/asset-library/items/{item_id}")
async def delete_asset_library_item(item_id: str):
    lib = load_asset_library()
    removed = None
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    removed = item
                else:
                    keep.append(item)
            cat["items"] = keep
    if not removed:
        raise HTTPException(status_code=404, detail="资产不存在")
    remove_asset_library_file(removed)  # 同时删除本地文件，避免磁盘上堆积
    save_asset_library(lib)
    return {"library": lib}

@router.post("/api/asset-library/items/delete")
async def batch_delete_asset_library_items(payload: AssetLibraryBatchDeleteRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    removed = 0
    removed_items = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    removed += 1
                    removed_items.append(item)
                else:
                    keep.append(item)
            cat["items"] = keep
    for item in removed_items:  # 批量删除同时清理本地文件
        remove_asset_library_file(item)
    save_asset_library(lib)
    return {"library": lib, "removed": removed}

@router.post("/api/asset-library/items/move")
async def batch_move_asset_library_items(payload: AssetLibraryBatchMoveRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    target_cat = find_asset_category_in_library(lib, payload.target_category_id, payload.target_library_id)
    if not target_cat:
        raise HTTPException(status_code=404, detail="目标分组不存在")
    target_type = target_cat.get("type") or "image"
    moved = []
    source_categories = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            if (cat.get("type") or "image") != target_type:
                continue
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    moved.append(item)
                    source_categories.append(cat)
    target_dir = os.path.abspath(os.path.join(ASSET_LIBRARY_DIR, str(target_cat.get("dir") or "").strip("/\\")))
    library_root = os.path.abspath(ASSET_LIBRARY_DIR)
    if os.path.commonpath([library_root, target_dir]) != library_root:
        raise HTTPException(status_code=400, detail="目标分组目录无效")
    os.makedirs(target_dir, exist_ok=True)
    file_moves = []
    try:
        for item in moved:
            source = output_file_from_url(item.get("url") or "")
            if not source or os.path.commonpath([library_root, os.path.abspath(source)]) != library_root:
                raise HTTPException(status_code=409, detail=f"素材文件不存在或不在素材库中：{item.get('name') or item.get('id')}")
            destination = os.path.join(target_dir, os.path.basename(source))
            old_url = item.get("url") or ""
            if os.path.abspath(source) != os.path.abspath(destination):
                if os.path.exists(destination):
                    raise HTTPException(status_code=409, detail=f"目标分组已存在同名文件：{os.path.basename(destination)}")
                shutil.move(source, destination)
                file_moves.append((source, destination, item, old_url))
            rel = os.path.relpath(destination, library_root).replace(os.sep, "/")
            item["url"] = "/assets/library/" + urllib.parse.quote(rel, safe="/")
        for cat, item in zip(source_categories, moved):
            if cat is not target_cat:
                cat["items"] = [entry for entry in cat.get("items", []) if entry.get("id") != item.get("id")]
        existing_ids = {item.get("id") for item in target_cat.get("items", [])}
        for item in moved:
            if item.get("id") not in existing_ids:
                target_cat.setdefault("items", []).append(item)
                existing_ids.add(item.get("id"))
        save_asset_library(lib)
    except Exception:
        for source, destination, item, old_url in reversed(file_moves):
            if os.path.exists(destination) and not os.path.exists(source):
                shutil.move(destination, source)
            item["url"] = old_url
        raise
    return {"library": lib, "moved": len(moved)}

@router.post("/api/asset-library/items/crop")
async def batch_crop_asset_library_items(payload: AssetLibraryBatchCropRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    target_cat = None
    if payload.target_category_id:
        target_cat = find_asset_category_in_library(lib, payload.target_category_id, payload.target_library_id)
        if not target_cat:
            raise HTTPException(status_code=404, detail="目标分组不存在")
        if target_cat.get("type") != "image":
            raise HTTPException(status_code=400, detail="目标分组不支持媒体")
    added = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            if cat.get("type") != "image":
                continue
            source_items = [item for item in (cat.get("items", []) or []) if item.get("id") in ids]
            for item in source_items:
                src = output_file_from_url(item.get("url") or "")
                if not src or not os.path.isfile(src):
                    continue
                try:
                    with Image.open(src) as img:
                        img = img.convert("RGBA")
                        w, h = img.size
                        side = min(w, h)
                        if side <= 0:
                            continue
                        left = max(0, (w - side) // 2)
                        top = max(0, (h - side) // 2)
                        cropped = img.crop((left, top, left + side, top + side))
                        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                        tmp_path = tmp.name
                        tmp.close()
                        try:
                            cropped.save(tmp_path, "PNG")
                            base_name = os.path.splitext(item.get("name") or "asset")[0] + "_crop.png"
                            dest_cat = target_cat or cat
                            _, next_item = make_asset_library_item(tmp_path, base_name, subdir=dest_cat.get("dir") or "")
                            dest_cat.setdefault("items", []).append(next_item)
                            added.append(next_item)
                        finally:
                            try:
                                os.remove(tmp_path)
                            except Exception:
                                pass
                except Exception:
                    continue
    save_asset_library(lib)
    return {"library": lib, "added": len(added), "items": added}

# ── Explicit imports for underscore-prefixed helpers (not exported by wildcard) ──
from app.services.assets import (
    _local_upload_safe_folder, _local_upload_safe_folder_name,
    _local_upload_kind_ext, _local_upload_item, _local_upload_safe_path,
    _local_upload_caption_path, _local_upload_tree_and_items,
)

# ── Explicit imports for PIL symbols (resolved via wildcard but invisible to static analysis) ──
from PIL import Image

