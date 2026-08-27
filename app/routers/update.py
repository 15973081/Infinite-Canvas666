"""Auto-generated router."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse, JSONResponse
from typing import List, Dict, Any, Optional
import json, os, time, re, uuid, shutil, asyncio, httpx, urllib.parse, hashlib, base64
import traceback
from threading import Thread
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
from app.services.canvas_tasks import ACTIVE_CANVAS_TASK_STATUSES, active_durable_canvas_tasks


router = APIRouter()


def active_canvas_task_summary() -> dict:
    """Return a deduplicated view of in-flight canvas tasks."""
    tasks = {str(task.get("id") or ""): dict(task) for task in active_durable_canvas_tasks() if task.get("id")}
    with CANVAS_TASK_LOCK:
        for task_id, task in CANVAS_TASKS.items():
            if str(task.get("status") or "") in ACTIVE_CANVAS_TASK_STATUSES:
                tasks[str(task_id)] = dict(task)
    with QUEUE_LOCK:
        for queued in QUEUE:
            queue_id = f"generation:{queued.get('task_id')}"
            tasks[queue_id] = {
                "id": queue_id,
                "type": "generation",
                "status": "running",
                "created_at": queued.get("created_at", 0),
            }
    by_type: Dict[str, int] = {}
    for task in tasks.values():
        kind = str(task.get("type") or "unknown")
        by_type[kind] = by_type.get(kind, 0) + 1
    return {
        "active": len(tasks),
        "by_type": by_type,
        "tasks": [
            {
                "id": task.get("id"),
                "type": task.get("type"),
                "status": task.get("status"),
                "provider_id": task.get("provider_id", ""),
                "model": task.get("model", ""),
                "created_at": task.get("created_at", 0),
            }
            for task in tasks.values()
        ],
        "maintenance": canvas_task_maintenance(),
    }


def wait_for_active_canvas_tasks(timeout_seconds: int) -> dict:
    deadline = time.monotonic() + max(0, int(timeout_seconds or 0))
    while True:
        summary = active_canvas_task_summary()
        if not summary["active"]:
            return summary
        if time.monotonic() >= deadline:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "等待生成任务完成超时，升级尚未开始",
                    "active": summary["active"],
                    "by_type": summary["by_type"],
                },
            )
        time.sleep(1.0)


@router.get("/api/update-task-status")
def update_task_status():
    return active_canvas_task_summary()

@router.get("/api/app-info")
def app_info():
    version = current_app_version()
    return {
        "version": version,
        "repo_url": GITHUB_REPO_URL,
        "version_url": GITHUB_VERSION_URL,
        "tree_url": GITHUB_TREE_URL,
        "sources": {
            "github": {
                "label": "GitHub",
                "repo_url": GITHUB_REPO_URL,
                "version_url": GITHUB_VERSION_URL,
                "tree_url": GITHUB_TREE_URL,
                "update_notes_url": GITHUB_UPDATE_NOTES_URL,
            },
            "modelscope": {
                "label": "ModelScope",
                "repo_url": MODELSCOPE_REPO_URL,
                "version_url": MODELSCOPE_VERSION_URL,
                "tree_url": MODELSCOPE_TREE_URL,
                "update_notes_url": MODELSCOPE_UPDATE_NOTES_URL,
            },
        },
        "update_notes": read_local_update_notes(version),
    }

@router.get("/api/update-connectivity/probe")
def update_connectivity_probe(name: str):
    """实时检测：只探测单个目标，前端可并发调用并逐条刷新。"""
    for t_name, url, source, required in update_connectivity_targets():
        if t_name == name:
            item = connectivity_probe(t_name, url)
            item["source"] = source
            item["required"] = required
            return item
    raise HTTPException(status_code=404, detail="未知的连通性检测目标")

@router.get("/api/update-connectivity")
def update_connectivity():
    targets = update_connectivity_targets()
    results = []
    for name, url, source, required in targets:
        item = connectivity_probe(name, url)
        item["source"] = source
        item["required"] = required
        results.append(item)
    sources = {}
    for source in ("github", "modelscope"):
        source_required = [item for item in results if item.get("source") == source and item.get("required")]
        sources[source] = {
            "ok": all(item["ok"] for item in source_required),
            "required": [item["name"] for item in source_required],
        }
    return {
        "ok": sources["github"]["ok"],
        "results": results,
        "sources": sources,
        "required": sources["github"]["required"],
        "optional": ["GitHub 主页", "ModelScope 空间页面", "ModelScope 主页", "Google 连通性"],
    }

@router.get("/api/check-update")
def check_update():
    """服务端检测 GitHub 与 ModelScope 两个源的远端版本（走系统代理，避免浏览器跨域/被墙）。"""
    current = current_app_version()
    # 并发检测两个源，避免串行 8s+8s 拖慢首屏更新提示
    holder: Dict[str, Dict[str, Any]] = {}
    def _probe(key: str, url: str):
        item = fetch_remote_version(url, timeout=5.0)
        item["source"] = key
        holder[key] = item
    threads = [
        Thread(target=_probe, args=("github", GITHUB_VERSION_URL), daemon=True),
        Thread(target=_probe, args=("modelscope", MODELSCOPE_VERSION_URL), daemon=True),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5.5)
    github = holder.get("github") or {"version": "", "ok": False, "error": "检测超时（超过 5s）", "url": GITHUB_VERSION_URL, "source": "github"}
    modelscope = holder.get("modelscope") or {"version": "", "ok": False, "error": "检测超时（超过 5s）", "url": MODELSCOPE_VERSION_URL, "source": "modelscope"}
    best: Dict[str, Any] = {}
    for item in (github, modelscope):
        if item["ok"] and item["version"]:
            if not best or version_gt(item["version"], best["version"]):
                best = {"source": item["source"], "version": item["version"]}
    update_available = bool(best and version_gt(best["version"], current))
    notes_by_source: Dict[str, Any] = {}
    if best and best.get("version"):
        best_notes, notes_by_source = fetch_update_notes_with_fallback(str(best.get("source") or "github"), best["version"], timeout=3.0)
        best["update_notes"] = best_notes if best_notes.get("ok") else {"version": best["version"], "items": []}
    return {
        "current": current,
        "github": github,
        "modelscope": modelscope,
        "latest": best,
        "update_notes": best.get("update_notes") if best else {},
        "update_notes_sources": notes_by_source,
        "update_available": update_available,
        "reachable": bool(github["ok"] or modelscope["ok"]),
    }

@router.post("/api/update-from-github")
def update_from_github(req: UpdateRequest = UpdateRequest()):
    if not UPDATE_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="正在更新中，请稍后再试")
    staging_root = ""
    requested_source = normalize_update_source(req.source)
    # 冗余设计：先用用户选择的源，失败后自动切换到另一个源兜底，全部失败才报错
    source_order = [requested_source]
    if req.fallback:
        other = "modelscope" if requested_source == "github" else "github"
        source_order.append(other)
    maintenance_enabled = False
    keep_maintenance = False
    restart_scheduled = False
    try:
        set_canvas_task_maintenance(True, "后端正在等待现有生成任务完成，完成后将自动升级")
        maintenance_enabled = True
        active_summary = active_canvas_task_summary()
        if active_summary["active"] and not req.force_update:
            if not req.wait_for_tasks:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "仍有生成任务正在运行，升级尚未开始",
                        "active": active_summary["active"],
                        "by_type": active_summary["by_type"],
                    },
                )
            wait_for_active_canvas_tasks(req.drain_timeout)
        backup_root = os.path.join(DATA_DIR, "update_backups", time.strftime("%Y%m%d-%H%M%S"))

        # 下载阶段（带兜底切换），任意源成功即停止
        source = requested_source
        root_files = static_files = files = None
        download_errors: List[str] = []
        fallback_used = False
        for idx, candidate in enumerate(source_order):
            attempt_staging = os.path.join(
                DATA_DIR, "update_staging",
                f"{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}-{candidate}",
            )
            if os.path.isdir(attempt_staging):
                shutil.rmtree(attempt_staging, ignore_errors=True)
            label = UPDATE_SOURCE_LABELS.get(candidate, candidate)
            print(f"[update] 尝试下载源 [{idx + 1}/{len(source_order)}] {label}（{candidate}）→ {attempt_staging}")
            try:
                root_files, static_files, files = stage_update_from_source(candidate, attempt_staging)
                source = candidate
                staging_root = attempt_staging
                fallback_used = idx > 0
                print(f"[update] 下载源 {label} 成功，共 {len(files or [])} 个文件")
                break
            except Exception as exc:  # noqa: BLE001 — 记录后尝试下一个源
                if os.path.isdir(attempt_staging):
                    shutil.rmtree(attempt_staging, ignore_errors=True)
                print(f"[update] 下载源 {label} 失败：{exc}")
                traceback.print_exc()
                download_errors.append(f"{label}：{exc}")
        if not staging_root:
            detail = "；".join(download_errors) or "未知错误"
            print(f"[update] 所有下载源均失败 → {detail}")
            raise HTTPException(status_code=502, detail=f"所有下载源均失败 → {detail}")

        updated = []
        for rel in root_files:
            target = safe_update_target(rel)
            if os.path.exists(target):
                backup_path = os.path.join(backup_root, *rel.split("/"))
                os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                shutil.copy2(target, backup_path)

        staged_static_dir = os.path.join(staging_root, "static")
        if not os.path.isdir(staged_static_dir):
            raise RuntimeError("GitHub static 暂存目录不存在，已取消更新")
        static_dir = safe_static_dir()
        backup_static_dir = os.path.join(backup_root, "static")
        if os.path.isdir(static_dir):
            os.makedirs(os.path.dirname(backup_static_dir), exist_ok=True)
            shutil.copytree(static_dir, backup_static_dir)
            shutil.rmtree(static_dir)
        try:
            shutil.copytree(staged_static_dir, static_dir)
        except Exception:
            if os.path.isdir(static_dir):
                shutil.rmtree(static_dir, ignore_errors=True)
            if os.path.isdir(backup_static_dir):
                shutil.copytree(backup_static_dir, static_dir)
            raise
        updated.extend(static_files)

        replaced_root_files = []
        try:
            for rel in root_files:
                target = safe_update_target(rel)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                temp_path = f"{target}.update_tmp"
                shutil.copy2(os.path.join(staging_root, *rel.split("/")), temp_path)
                os.replace(temp_path, target)
                replaced_root_files.append(rel)
                updated.append(rel)
        except Exception:
            for rel in reversed(replaced_root_files):
                backup_path = os.path.join(backup_root, *rel.split("/"))
                target = safe_update_target(rel)
                if os.path.exists(backup_path):
                    temp_path = f"{target}.rollback_tmp"
                    shutil.copy2(backup_path, temp_path)
                    os.replace(temp_path, target)
            if os.path.isdir(static_dir):
                shutil.rmtree(static_dir, ignore_errors=True)
            if os.path.isdir(backup_static_dir):
                shutil.copytree(backup_static_dir, static_dir)
            raise

        if req.auto_restart and updated:
            restart_scheduled = schedule_self_restart(req.restart_delay)
            keep_maintenance = restart_scheduled
        new_version = ""
        try:
            staged_version = os.path.join(staging_root, "VERSION")
            if os.path.exists(staged_version):
                with open(staged_version, "r", encoding="utf-8") as f:
                    new_version = (f.read().strip().splitlines() or [""])[0].strip()
        except Exception:
            new_version = ""
        notes_file = os.path.join(staging_root, "static", "update-notes.json")
        update_notes = {}
        try:
            if os.path.exists(notes_file):
                with open(notes_file, "r", encoding="utf-8") as f:
                    update_notes = safe_update_notes(json.load(f), new_version)
        except Exception:
            update_notes = {}
        return {
            "ok": True,
            "source": source,
            "source_label": UPDATE_SOURCE_LABELS.get(source, source),
            "requested_source": requested_source,
            "fallback_used": fallback_used,
            "download_errors": download_errors,
            "updated": updated,
            "count": len(updated),
            "version": new_version,
            "update_notes": update_notes,
            "backup_dir": backup_root if os.path.exists(backup_root) else "",
            "restart_required": True,
            "restart_scheduled": restart_scheduled,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"更新失败：{exc}") from exc
    finally:
        if staging_root and os.path.isdir(staging_root):
            shutil.rmtree(staging_root, ignore_errors=True)
        if maintenance_enabled and not keep_maintenance:
            set_canvas_task_maintenance(False)
        UPDATE_LOCK.release()

@router.get("/api/update-backups")
def get_update_backups():
    return {"backups": list_update_backups()}

@router.post("/api/update-rollback")
def rollback_update(req: RollbackRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="缺少备份名称")
    if not UPDATE_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="正在更新中，请稍后再试")
    maintenance_enabled = False
    keep_maintenance = False
    try:
        set_canvas_task_maintenance(True, "后端正在等待现有生成任务完成，完成后将自动回滚")
        maintenance_enabled = True
        active_summary = active_canvas_task_summary()
        if active_summary["active"] and not req.force_update:
            if not req.wait_for_tasks:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "仍有生成任务正在运行，回滚尚未开始",
                        "active": active_summary["active"],
                        "by_type": active_summary["by_type"],
                    },
                )
            wait_for_active_canvas_tasks(req.drain_timeout)
        backup_root_abs = os.path.abspath(os.path.join(DATA_DIR, "update_backups"))
        backup_dir = os.path.abspath(os.path.join(backup_root_abs, req.name))
        if os.path.commonpath([backup_root_abs, backup_dir]) != backup_root_abs:
            raise HTTPException(status_code=400, detail="备份路径不安全")
        if not os.path.isdir(backup_dir):
            raise HTTPException(status_code=404, detail="备份不存在")
        restored = []
        skipped = []
        backup_static_dir = os.path.join(backup_dir, "static")
        if os.path.isdir(backup_static_dir):
            static_dir = safe_static_dir()
            if os.path.isdir(static_dir):
                shutil.rmtree(static_dir)
            try:
                shutil.copytree(backup_static_dir, static_dir)
            except Exception:
                if os.path.isdir(static_dir):
                    shutil.rmtree(static_dir, ignore_errors=True)
                raise
            for dirpath, _, filenames in os.walk(backup_static_dir):
                for fn in filenames:
                    src = os.path.join(dirpath, fn)
                    restored.append(os.path.relpath(src, backup_dir).replace("\\", "/"))
        for dirpath, _, filenames in os.walk(backup_dir):
            for fn in filenames:
                src = os.path.join(dirpath, fn)
                rel = os.path.relpath(src, backup_dir).replace("\\", "/")
                if rel.startswith("static/"):
                    continue
                if not update_allowed_file(rel):
                    skipped.append(rel)
                    continue
                try:
                    target = safe_update_target(rel)
                except ValueError:
                    skipped.append(rel)
                    continue
                os.makedirs(os.path.dirname(target), exist_ok=True)
                temp_path = f"{target}.rollback_tmp"
                with open(src, "rb") as fin, open(temp_path, "wb") as fout:
                    shutil.copyfileobj(fin, fout)
                os.replace(temp_path, target)
                restored.append(rel)
        restart_scheduled = False
        if req.auto_restart and restored:
            restart_scheduled = schedule_self_restart(req.restart_delay)
            keep_maintenance = restart_scheduled
        return {
            "ok": True,
            "restored": restored,
            "skipped": skipped,
            "count": len(restored),
            "restart_required": True,
            "restart_scheduled": restart_scheduled,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"回滚失败：{exc}") from exc
    finally:
        if maintenance_enabled and not keep_maintenance:
            set_canvas_task_maintenance(False)
        UPDATE_LOCK.release()

# (CANVAS_TASKS, CANVAS_TASK_LOCK extracted to app/state.py)

