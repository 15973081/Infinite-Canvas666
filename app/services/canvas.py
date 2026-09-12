import os
from app.storage.settings import postgres_enabled
import re
import json
import time
import uuid
import shutil
import hashlib
import zipfile
from io import BytesIO
from typing import List, Dict, Any, Optional, Tuple

from fastapi import HTTPException

from app.config import (
    CANVAS_DIR, CANVAS_FOLDERS_FILE, CANVAS_TRASH_RETENTION_MS,
    STATIC_DIR, DATA_DIR, ASSETS_DIR, OUTPUT_DIR, OUTPUT_OUTPUT_DIR,
    LOCAL_UPLOAD_DIR,
)
from app.state import CANVAS_LOCK, CANVAS_FOLDERS_LOCK
from app.utils import now_ms, sanitize_export_filename, canvas_workflow_unique_archive_name
from app.models import CanvasWorkflowExportRequest


CANVAS_COLORS = {"", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "slate"}


def canvas_path(canvas_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return os.path.join(CANVAS_DIR, f"{cleaned}.json")

def save_canvas(canvas):
    if postgres_enabled():
        from app.storage.canvases import save
        save(canvas)
        from app.services.canvas_ledger import import_canvas_logs
        import_canvas_logs(canvas['id'], canvas.get('logs') or [])
        return
    from app.services.canvas_ledger import import_canvas_logs
    import_canvas_logs(canvas["id"], canvas.get("logs") or [])
    canvas["updated_at"] = now_ms()
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)

def save_canvas_without_touch(canvas):
    if postgres_enabled():
        from app.storage.canvases import save
        return save(canvas, touch=False)
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)

def normalize_canvas_kind(kind="classic"):
    return "smart" if str(kind or "").strip().lower() == "smart" else "classic"

def normalize_canvas_folder_id(folder_id):
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(folder_id or ""))

def canvas_folders_load():
    if postgres_enabled():
        from app.storage.documents import get
        return get('canvas_folders', default={'folders': []})
    if not os.path.exists(CANVAS_FOLDERS_FILE):
        return {"folders": []}
    try:
        with open(CANVAS_FOLDERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return {"folders": []}
    raw_folders = data.get("folders") if isinstance(data, dict) else []
    if not isinstance(raw_folders, list):
        raw_folders = []
    folders = []
    seen = set()
    for raw in raw_folders:
        if not isinstance(raw, dict):
            continue
        folder_id = normalize_canvas_folder_id(raw.get("id"))
        if not folder_id or folder_id in seen:
            continue
        seen.add(folder_id)
        folders.append({
            "id": folder_id,
            "name": str(raw.get("name") or "Folder")[:80],
            "parent_id": normalize_canvas_folder_id(raw.get("parent_id")),
            "order": int(raw.get("order") or 0),
            "created_at": int(raw.get("created_at") or 0),
        })
    valid_ids = {folder["id"] for folder in folders}
    for folder in folders:
        if folder["parent_id"] not in valid_ids:
            folder["parent_id"] = ""
    return {"folders": folders}

def canvas_folders_save(data):
    if postgres_enabled():
        from app.storage.documents import put
        return put('canvas_folders', 'default', {'folders': data.get('folders', [])})
    os.makedirs(DATA_DIR, exist_ok=True)
    with CANVAS_FOLDERS_LOCK:
        with open(CANVAS_FOLDERS_FILE, 'w', encoding='utf-8') as f:
            json.dump({"folders": data.get("folders", [])}, f, ensure_ascii=False, indent=2)

def canvas_folder_records():
    data = canvas_folders_load()
    return sorted(data.get("folders", []), key=lambda item: (item.get("parent_id") or "", int(item.get("order") or 0), item.get("name") or ""))

def canvas_folder_exists(folder_id, folders=None):
    target = normalize_canvas_folder_id(folder_id)
    if not target:
        return True
    folders = folders if folders is not None else canvas_folders_load().get("folders", [])
    return any(folder.get("id") == target for folder in folders)

def canvas_folder_would_cycle(folders, folder_id, parent_id):
    target = normalize_canvas_folder_id(folder_id)
    parent = normalize_canvas_folder_id(parent_id)
    parents = {folder.get("id"): normalize_canvas_folder_id(folder.get("parent_id")) for folder in folders}
    while parent:
        if parent == target:
            return True
        parent = parents.get(parent, "")
    return False

def canvas_folder_child_count(parent_id, folders):
    target = normalize_canvas_folder_id(parent_id)
    return sum(1 for folder in folders if normalize_canvas_folder_id(folder.get("parent_id")) == target)

def reassign_canvas_folder(old_folder_id, new_folder_id):
    if postgres_enabled():
        from app.storage.canvases import all_documents
        for canvas in all_documents():
            if normalize_canvas_folder_id(canvas.get('folder_id')) == normalize_canvas_folder_id(old_folder_id):
                canvas['folder_id'] = normalize_canvas_folder_id(new_folder_id)
                save_canvas_without_touch(canvas)
        return
    old_id = normalize_canvas_folder_id(old_folder_id)
    next_id = normalize_canvas_folder_id(new_folder_id)
    if not os.path.isdir(CANVAS_DIR):
        return
    for filename in os.listdir(CANVAS_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(CANVAS_DIR, filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        if normalize_canvas_folder_id(data.get("folder_id")) != old_id:
            continue
        data["folder_id"] = next_id
        with CANVAS_LOCK:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

def new_canvas(title="未命名画布", icon="layers", kind="classic", folder_id=""):
    timestamp = now_ms()
    canvas_kind = normalize_canvas_kind(kind)
    safe_folder_id = normalize_canvas_folder_id(folder_id)
    if not canvas_folder_exists(safe_folder_id):
        safe_folder_id = ""
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or ("智能画布" if canvas_kind == "smart" else "未命名画布"))[:80],
        "icon": (icon or ("sparkles" if canvas_kind == "smart" else "🧩"))[:32],
        "kind": canvas_kind,
        "folder_id": safe_folder_id,
        "owner": "",
        "color": "",
        "pinned": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    save_canvas(canvas)
    return canvas

def load_canvas(canvas_id):
    if postgres_enabled():
        from app.storage.canvases import get
        return get(canvas_id)
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        canvas = json.load(f)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    from app.services.canvas_ledger import import_canvas_logs
    import_canvas_logs(canvas_id, canvas.get("logs") or [])
    return canvas

def load_canvas_any(canvas_id):
    if postgres_enabled():
        from app.storage.canvases import get
        return get(canvas_id, include_deleted=True)
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def normalize_canvas_color(value):
    color = str(value or "").strip().lower()
    return color if color in CANVAS_COLORS else ""

def canvas_record(data):
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "kind": normalize_canvas_kind(data.get("kind")),
        "owner": str(data.get("owner") or "")[:40],
        "color": normalize_canvas_color(data.get("color")),
        "pinned": bool(data.get("pinned") or False),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "deleted_at": data.get("deleted_at", 0),
        "folder_id": normalize_canvas_folder_id(data.get("folder_id")),
        "node_count": len(data.get("nodes", [])),
    }

def cleanup_expired_canvas_trash():
    if postgres_enabled():
        return  # Cloud originals and tombstones have no automatic GC.
    cutoff = now_ms() - CANVAS_TRASH_RETENTION_MS
    with CANVAS_LOCK:
        for filename in os.listdir(CANVAS_DIR):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(CANVAS_DIR, filename)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                deleted_at = int(data.get("deleted_at") or 0)
                if deleted_at and deleted_at < cutoff:
                    os.remove(path)
            except Exception:
                continue

def iter_canvas_records(include_deleted=False):
    if postgres_enabled():
        from app.storage.canvases import all_documents
        return [canvas_record(c) for c in all_documents() if bool(c.get('deleted_at')) == include_deleted and not c.get('purged_at')]
    cleanup_expired_canvas_trash()
    records = []
    for filename in os.listdir(CANVAS_DIR):
        if not filename.endswith(".json"):
            continue
        try:
            with open(os.path.join(CANVAS_DIR, filename), 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        is_deleted = bool(data.get("deleted_at"))
        if include_deleted != is_deleted:
            continue
        records.append(canvas_record(data))
    return records

def list_canvases():
    records = iter_canvas_records(include_deleted=False)
    return sorted(
        records,
        key=lambda item: (
            0 if item.get("pinned") else 1,
            -int(item.get("updated_at") or item.get("created_at") or 0),
        ),
    )

def list_deleted_canvases():
    records = iter_canvas_records(include_deleted=True)
    return sorted(records, key=lambda item: item["deleted_at"], reverse=True)

def canvas_asset_url_value(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("url", "path", "src", "uri", "output", "output_url", "outputUrl", "video", "video_url", "videoUrl"):
            text = str(value.get(key) or "").strip()
            if text:
                return text
    return ""

def canvas_asset_downloadable_url(url):
    text = str(url or "").strip()
    return text if text.startswith(("/output/", "/assets/", "http://", "https://")) else ""

def canvas_asset_kind(value, url=""):
    from app.services.assets import asset_library_media_kind
    explicit = ""
    if isinstance(value, dict):
        explicit = str(value.get("kind") or value.get("mediaKind") or value.get("type") or "").lower()
    if "video" in explicit:
        return "video"
    if "audio" in explicit:
        return "audio"
    if "text" in explicit:
        return "text"
    if "workflow" in explicit:
        return "workflow"
    return asset_library_media_kind(url or canvas_asset_url_value(value))

def canvas_asset_name(value, url="", fallback="asset"):
    from app.services.assets import sanitize_asset_name, filename_from_media_url
    if isinstance(value, dict):
        for key in ("name", "filename", "file", "title"):
            name = str(value.get(key) or "").strip()
            if name:
                return sanitize_asset_name(name, fallback)
    return sanitize_asset_name(filename_from_media_url(url, fallback), fallback)

def iter_canvas_asset_values(value, path=""):
    if isinstance(value, dict):
        url = canvas_asset_downloadable_url(canvas_asset_url_value(value))
        if url:
            yield path, value, url
        for key, child in value.items():
            if key in {"run", "runs", "settings", "params", "metadata", "meta", "prompt", "text", "caption", "logs"}:
                continue
            yield from iter_canvas_asset_values(child, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_canvas_asset_values(child, f"{path}[{index}]")
    elif isinstance(value, str):
        url = canvas_asset_downloadable_url(value)
        if url:
            yield path, value, url

def canvas_node_title(node):
    if not isinstance(node, dict):
        return ""
    return str(node.get("title") or node.get("name") or node.get("label") or node.get("type") or "节点")[:120]

def extract_canvas_assets(canvas):
    record = canvas_record(canvas)
    canvas_id = str(record.get("id") or "")
    items = []
    seen = set()
    nodes = canvas.get("nodes") if isinstance(canvas.get("nodes"), list) else []
    for node_index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or f"node_{node_index}")
        node_title = canvas_node_title(node)
        for field_path, raw, url in iter_canvas_asset_values(node):
            dedupe_key = url
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            kind = canvas_asset_kind(raw, url)
            if kind not in {"image", "video", "audio", "text"}:
                continue
            fallback = f"{record.get('title') or 'canvas'}-{len(items) + 1}"
            item = {
                "id": hashlib.sha1(f"{canvas_id}:{url}".encode("utf-8")).hexdigest()[:24],
                "url": url,
                "name": canvas_asset_name(raw, url, fallback),
                "kind": kind,
                "canvas_id": canvas_id,
                "canvas_title": record.get("title") or "未命名画布",
                "canvas_kind": record.get("kind") or "classic",
                "canvas_icon": record.get("icon") or "layers",
                "canvas_owner": record.get("owner") or "",
                "canvas_color": record.get("color") or "",
                "canvas_created_at": record.get("created_at") or 0,
                "canvas_updated_at": record.get("updated_at") or 0,
                "node_id": node_id,
                "node_title": node_title,
                "node_type": str(node.get("type") or ""),
                "source_path": field_path,
                "created_at": node.get("created_at") or record.get("updated_at") or record.get("created_at") or 0,
            }
            if isinstance(raw, dict):
                for key in ("natural_w", "natural_h", "width", "height", "size", "duration", "runMs"):
                    if raw.get(key) is not None:
                        item[key] = raw.get(key)
            items.append(item)
    return items

def canvas_assets_index():
    canvases = []
    items = []
    canvas_counts = {"all": 0, "smart": 0, "classic": 0}
    item_counts = {"all": 0, "smart": 0, "classic": 0}
    cleanup_expired_canvas_trash()
    for canvas in iter_canvas_documents():
        if canvas.get("deleted_at"):
            continue
        record = canvas_record(canvas)
        canvas_items = extract_canvas_assets(canvas)
        record["asset_count"] = len(canvas_items)
        canvases.append(record)
        items.extend(canvas_items)
        kind = record.get("kind") or "classic"
        canvas_counts["all"] += 1
        canvas_counts[kind] = canvas_counts.get(kind, 0) + 1
        item_counts["all"] += len(canvas_items)
        item_counts[kind] = item_counts.get(kind, 0) + len(canvas_items)
    canvases.sort(key=lambda item: (0 if item.get("pinned") else 1, -int(item.get("updated_at") or item.get("created_at") or 0)))
    items.sort(key=lambda item: int(item.get("canvas_updated_at") or item.get("created_at") or 0), reverse=True)
    categories = [
        {"id": "all", "name": "全部画布", "count": item_counts.get("all", 0), "canvas_count": canvas_counts.get("all", 0)},
        {"id": "smart", "name": "智能画布", "count": item_counts.get("smart", 0), "canvas_count": canvas_counts.get("smart", 0)},
        {"id": "classic", "name": "普通画布", "count": item_counts.get("classic", 0), "canvas_count": canvas_counts.get("classic", 0)},
    ]
    return {"categories": categories, "canvases": canvases, "items": items}

def display_title(text):
    title = re.sub(r"\s+", " ", text or "").strip()
    return title[:24] or "新对话"

def canvas_workflow_collect_resource_refs(value, found=None):
    from app.services.media import output_file_from_url
    if found is None:
        found = []
    if isinstance(value, dict):
        for item in value.values():
            canvas_workflow_collect_resource_refs(item, found)
    elif isinstance(value, list):
        for item in value:
            canvas_workflow_collect_resource_refs(item, found)
    elif isinstance(value, str):
        text = value.strip()
        if (text.startswith("/assets/") or text.startswith("/output/")) and (postgres_enabled() or output_file_from_url(text)):
            found.append(text)
    return found

def canvas_workflow_replace_strings(value, mapping):
    if isinstance(value, dict):
        return {k: canvas_workflow_replace_strings(v, mapping) for k, v in value.items()}
    if isinstance(value, list):
        return [canvas_workflow_replace_strings(item, mapping) for item in value]
    if isinstance(value, str):
        return mapping.get(value, value)
    return value

def canvas_workflow_payload(nodes, connections, resources=None):
    return {
        "format": "infinite-canvas-workflow",
        "version": 1,
        "exported_at": now_ms(),
        "nodes": nodes or [],
        "connections": connections or [],
        "resources": resources or [],
    }

def build_canvas_workflow_archive(payload: CanvasWorkflowExportRequest) -> Tuple[bytes, Dict[str, Any]]:
    from app.services.media import output_file_from_url
    nodes_payload = payload.nodes or []
    connections_payload = payload.connections or []
    if not nodes_payload:
        raise HTTPException(status_code=400, detail="没有可导出的节点")
    buffer = BytesIO()
    resources = []
    used = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if payload.include_resources:
            for url in canvas_workflow_collect_resource_refs(nodes_payload):
                if any(item.get("url") == url for item in resources):
                    continue
                path = output_file_from_url(url)
                if not path or not os.path.isfile(path):
                    continue
                archive_name = canvas_workflow_unique_archive_name(os.path.basename(path), used)
                archive_path = f"resources/{archive_name}"
                zf.write(path, archive_path)
                resources.append({
                    "url": url,
                    "archive": archive_path,
                    "name": os.path.basename(path),
                    "size": os.path.getsize(path),
                })
        workflow = canvas_workflow_payload(nodes_payload, connections_payload, resources)
        zf.writestr("workflow.json", json.dumps(workflow, ensure_ascii=False, indent=2))
    buffer.seek(0)
    return buffer.getvalue(), {"resources": resources, "node_count": len(nodes_payload), "connection_count": len(connections_payload)}

def smart_group_export_folder(folder: str, group_name: str) -> str:
    text = str(folder or "").strip()
    if text:
        path = os.path.abspath(os.path.expanduser(text))
    else:
        stamp = time.strftime("%Y%m%d-%H%M%S")
        safe_group = sanitize_export_filename(group_name or "group", "group")
        path = os.path.abspath(os.path.join(OUTPUT_DIR, "smart-groups", f"{safe_group}-{stamp}"))
    os.makedirs(path, exist_ok=True)
    return path

def find_asset_item_in_library(lib, item_id, library_id=""):
    for library in lib.get("libraries", []):
        if library_id and library.get("id") != library_id:
            continue
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    return item
    return None


BACKUP_DIR = os.path.join(CANVAS_DIR, "backups")
MAX_BACKUPS_PER_CANVAS = 50

def _backup_dir(canvas_id: str) -> str:
    return os.path.join(BACKUP_DIR, canvas_id)

def _backup_path(canvas_id: str, filename: str) -> str:
    return os.path.join(_backup_dir(canvas_id), filename)


def recover_canvas_logs(canvas_id, canvas):
    if canvas.get("_logs_history_recovered"):
        return canvas
    backup_dir = _backup_dir(canvas_id)
    if not os.path.isdir(backup_dir):
        return canvas
    recovered = []
    seen = set()

    def add_logs(logs):
        for log in logs or []:
            log_id = str(log.get("id") or "") if isinstance(log, dict) else ""
            key = f"id:{log_id}" if log_id else f"data:{json.dumps(log, ensure_ascii=False, sort_keys=True)}"
            if key not in seen:
                seen.add(key)
                recovered.append(log)

    add_logs(canvas.get("logs"))
    for name in sorted(os.listdir(backup_dir), reverse=True):
        if not name.endswith(".json"):
            continue
        try:
            with open(_backup_path(canvas_id, name), "r", encoding="utf-8") as f:
                add_logs(json.load(f).get("logs"))
        except Exception:
            continue
    path = canvas_path(canvas_id)
    with CANVAS_LOCK:
        with open(path, "r", encoding="utf-8") as f:
            current = json.load(f)
        if current.get("_logs_history_recovered"):
            return current
        add_logs(current.get("logs"))
        current["logs"] = sorted(
            recovered,
            key=lambda log: int(log.get("createdAt") or log.get("created_at") or 0) if isinstance(log, dict) else 0,
            reverse=True,
        )[:5000]
        current["_logs_history_recovered"] = True
        with open(path, "w", encoding="utf-8") as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
    return current


def iter_canvas_documents():
    if postgres_enabled():
        from app.storage.canvases import all_documents
        yield from all_documents()
        return
    for filename in os.listdir(CANVAS_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(CANVAS_DIR, filename), encoding="utf-8") as stream:
                    yield json.load(stream)
            except (OSError, ValueError):
                continue
