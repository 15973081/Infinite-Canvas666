"""Disk-backed exports and bounded workflow import for cloud media."""
from starlette.concurrency import run_in_threadpool
import json
from pathlib import Path
import shutil
import uuid
import zipfile
from fastapi import HTTPException
from fastapi.responses import FileResponse
from app.storage import media


def build_workflow(payload):
    from app.services.canvas import canvas_workflow_collect_resource_refs, canvas_workflow_payload
    from app.utils import canvas_workflow_unique_archive_name, sanitize_export_filename
    if not payload.nodes:
        raise HTTPException(400, "没有可导出的节点")
    name = sanitize_export_filename(payload.filename or "canvas-workflow.zip", "canvas-workflow.zip")
    if not name.lower().endswith(".zip"):
        name += ".zip"
    target = Path(media.scratch_directory()) / (uuid.uuid4().hex + ".zip")
    resources, used = [], set()
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        refs = list(dict.fromkeys(canvas_workflow_collect_resource_refs(payload.nodes))) if payload.include_resources else []
        for ref in refs:
            asset = media.get_asset(ref)
            if not asset:
                raise HTTPException(404, "工作流包含未迁移的素材")
            path = media.materialize(ref)
            media.check_budget(asset["size_bytes"])
            archive_name = "resources/" + canvas_workflow_unique_archive_name(asset["display_name"], used)
            archive.write(path, archive_name)
            resources.append({"url": ref, "archive": archive_name, "name": asset["display_name"], "size": asset["size_bytes"]})
        archive.writestr("workflow.json", json.dumps(canvas_workflow_payload(payload.nodes, payload.connections, resources), ensure_ascii=False))
    asset = media.publish(target, name, role="export")
    return target, asset, {"resources": resources, "node_count": len(payload.nodes), "connection_count": len(payload.connections)}


async def workflow_response(payload):
    target, asset, _ = await run_in_threadpool(build_workflow, payload)
    return FileResponse(target, media_type="application/zip", filename=asset["display_name"], headers={"X-Media-Asset-Id": asset["id"]})


def workflow_to_library(payload):
    from app.services.assets import load_asset_library, asset_library_workflow_category, save_asset_library
    _, asset, meta = build_workflow(payload)
    lib = load_asset_library()
    _, category = asset_library_workflow_category(lib, payload.library_id, payload.category_id)
    item = {"id": "wf_" + uuid.uuid4().hex[:12], "name": payload.name or asset["display_name"], "url": media.stable_url(asset),
            "media_asset_id": asset["id"], "kind": "workflow", "type": "workflow", "format": "zip", "size": asset["size_bytes"],
            "node_count": meta["node_count"], "connection_count": meta["connection_count"], "resource_count": len(meta["resources"])}
    category.setdefault("items", []).append(item)
    save_asset_library(lib)
    return {"library": lib, "item": item}


def download_assets(payload):
    from app.utils import sanitize_export_filename, canvas_workflow_unique_archive_name
    target = Path(media.scratch_directory()) / (uuid.uuid4().hex + ".zip")
    used, count = set(), 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in (payload.items or [{"url": ref} for ref in payload.urls])[:1000]:
            ref = item.get("url", "") if isinstance(item, dict) else str(item)
            asset = media.get_asset(ref)
            if not asset:
                raise HTTPException(404, "素材不存在或尚未迁移")
            path = media.materialize(ref)
            media.check_budget(asset["size_bytes"])
            name = item.get("name") if isinstance(item, dict) else ""
            archive.write(path, canvas_workflow_unique_archive_name(sanitize_export_filename(name or asset["display_name"], "media.bin"), used))
            count += 1
    if not count:
        raise HTTPException(404, "没有可下载的素材")
    asset = media.publish(target, payload.filename or "canvas-assets.zip", role="export")
    return FileResponse(target, media_type="application/zip", filename=asset["display_name"], headers={"X-Media-Asset-Id": asset["id"]})


def import_workflow(file):
    from app.services.canvas import canvas_workflow_replace_strings, canvas_workflow_payload
    target = Path(media.scratch_directory("input")) / (uuid.uuid4().hex + ".zip")
    total = 0
    with target.open("xb") as stream:
        while chunk := file.file.read(1024 * 1024):
            total += len(chunk)
            if total > media.max_file_bytes():
                raise HTTPException(413, "工作流包超过单文件限制")
            media.check_budget(len(chunk))
            stream.write(chunk)
    mapping = {}
    try:
        if zipfile.is_zipfile(target):
            with zipfile.ZipFile(target) as archive:
                if len(archive.infolist()) > 2000 or sum(item.file_size for item in archive.infolist()) > media.max_file_bytes():
                    raise HTTPException(413, "工作流解压后的大小或文件数量超过限制")
                if "workflow.json" not in archive.namelist() or archive.getinfo("workflow.json").file_size > 10 * 1024 ** 2:
                    raise HTTPException(400, "压缩包缺少有效的 workflow.json")
                workflow = json.loads(archive.read("workflow.json").decode("utf-8-sig"))
                for resource in workflow.get("resources") or []:
                    name = str(resource.get("archive") or "")
                    if name not in archive.namelist() or name.startswith("/") or ".." in Path(name).parts:
                        raise HTTPException(400, "工作流资源路径无效")
                    info = archive.getinfo(name)
                    media.check_budget(info.file_size)
                    output = target.parent / (uuid.uuid4().hex + Path(name).suffix[:12])
                    with archive.open(name) as src, output.open("xb") as dst:
                        shutil.copyfileobj(src, dst, 1024 * 1024)
                    asset = media.publish(output, resource.get("name") or Path(name).name)
                    url = media.stable_url(asset)
                    for old in (resource.get("url"), name, "./" + name):
                        if old:
                            mapping[old] = url
        else:
            if total > 10 * 1024 ** 2:
                raise HTTPException(413, "工作流 JSON 过大")
            workflow = json.loads(target.read_text(encoding="utf-8-sig"))
    except (ValueError, zipfile.BadZipFile, KeyError) as exc:
        raise HTTPException(400, "无法解析工作流文件") from exc
    if isinstance(workflow, list):
        workflow = {"nodes": workflow, "connections": []}
    if not isinstance(workflow, dict) or not isinstance(workflow.get("nodes"), list):
        raise HTTPException(400, "工作流缺少 nodes")
    nodes = canvas_workflow_replace_strings(workflow["nodes"], mapping)
    connections = workflow.get("connections") or []
    return {"workflow": canvas_workflow_payload(nodes, connections, workflow.get("resources") or []),
            "nodes": nodes, "connections": connections, "resource_map": mapping}


def export_group(payload):
    from app.utils import sanitize_export_filename, canvas_workflow_unique_archive_name
    target = Path(media.scratch_directory()) / (uuid.uuid4().hex + ".zip")
    used, count = set(), 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in payload.items[:2000]:
            if item.kind == "text":
                if not item.text.strip():
                    continue
                name = sanitize_export_filename(item.name or "text.txt", "text.txt")
                archive.writestr(canvas_workflow_unique_archive_name(name, used), item.text)
            else:
                asset = media.get_asset(item.url)
                if not asset:
                    raise HTTPException(404, "分组包含尚未迁移的素材")
                path = media.materialize(item.url)
                media.check_budget(asset["size_bytes"])
                name = sanitize_export_filename(item.name or asset["display_name"], "media.bin")
                archive.write(path, canvas_workflow_unique_archive_name(name, used))
            count += 1
    if not count:
        raise HTTPException(404, "没有可导出的内容")
    asset = media.publish(target, (payload.group_name or "group") + ".zip", role="export")
    return {"ok": True, "folder": media.stable_url(asset), "url": media.stable_url(asset), "media_asset_id": asset["id"], "count": count}
