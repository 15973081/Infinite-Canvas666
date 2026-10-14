"""Resume publication from a private immutable supplier-result checkpoint.

No generation or polling API is called here. Large inline image responses live
in object storage, not task JSON. Output slots are fixed by task and position.
"""
import asyncio
import copy
import hashlib
import json
import time
from pathlib import Path

from fastapi import HTTPException
from app.storage import database, media, tasks
from app.storage.workspace import current_workspace


def source_id(task_id):
    return "ast_" + hashlib.sha256((task_id + ":result-source").encode()).hexdigest()[:32]


def output_id(task_id, index):
    return "ast_" + hashlib.sha256((task_id + ":result:" + str(index)).encode()).hexdigest()[:32]


def has_source(task_id):
    asset = media.get_asset(source_id(task_id), ready=False)
    return bool(asset and asset["status"] == "ready" and not asset["deleted_at"])


def checkpoint(result, sources, field, provider_id):
    lease = tasks.lease_context.get()
    if not lease:
        raise RuntimeError("Result checkpoint requires a task lease")
    task_id = lease[0]
    if field not in {"images", "videos", "audios", "models", "text"} or not sources:
        raise ValueError("A result must contain media or text sources")
    if field == "text" and (not isinstance(result.get("text"), str) or not result["text"] or sources != [result["text"]]):
        raise ValueError("Invalid text result")
    if not has_source(task_id):
        packet = {"task_id": task_id, "field": field, "provider_id": provider_id,
                  "result": tasks.clean_request(result), "sources": sources,
                  "outputs": [output_id(task_id, i) for i in range(len(sources))]}
        path = media.operation()["root"] / "supplier-result.json"
        with path.open("w", encoding="utf-8") as stream:
            json.dump(packet, stream, ensure_ascii=False, allow_nan=False)
        media.check_budget()
        media.publish(path, asset_id=source_id(task_id), role="task-result-source")
    # If this commit loses its connection, the deterministic source id lets
    # recover_expired discover the already durable checkpoint after lease expiry.
    current = tasks.get(task_id)
    current.update(status="finalizing", error="", result_source_asset_id=source_id(task_id), updated_at=time.time())
    tasks.save(current)


async def resume(task_id):
    lease = tasks.lease_context.get()
    if not lease or lease[0] != task_id:
        raise HTTPException(409, "结果恢复必须持有当前任务租约")
    path = await asyncio.to_thread(media.materialize, source_id(task_id))
    if not path:
        raise HTTPException(404, "结果来源尚未持久化，需人工核对")
    packet = json.loads(Path(path).read_text(encoding="utf-8"))
    if packet["task_id"] != task_id or packet["field"] not in {"images", "videos", "audios", "models", "text"}:
        raise ValueError("Invalid task result checkpoint")
    if packet["outputs"] != [output_id(task_id, i) for i in range(len(packet["sources"]))]:
        raise ValueError("Invalid task output slots")
    if packet["field"] == "text":
        result = copy.deepcopy(packet["result"])
        if not isinstance(result.get("text"), str) or not result["text"] or packet["sources"] != [result["text"]]:
            raise ValueError("Invalid text result checkpoint")
        return result
    from app.services.media import save_ai_image_to_output, save_remote_video_to_output
    from app.providers.registry import get_api_provider
    result = copy.deepcopy(packet["result"])
    urls = []
    for slot, source in zip(packet["outputs"], packet["sources"]):
        asset = await asyncio.to_thread(media.get_asset, slot, False)
        if asset and asset["status"] == "ready":
            # Never re-fetch a supplier URL after this slot has become ready.
            urls.append(media.stable_url(asset))
            continue
        provider = get_api_provider(packet["provider_id"]) if packet['field'] not in {'audios','models'} else None
        token = media.result_slot.set(slot)
        try:
            if packet["field"] == "images":
                url = await save_ai_image_to_output(source, provider=provider)
            elif packet["field"] == "audios":
                if isinstance(source, dict) and (result.get('audio_info') or {}).get('mode') == 'clone':
                    from app.services.canvas_voice_clone import save_preview
                    url = await save_preview(source, slot)
                else:
                    from app.services.canvas_audio_tasks import save_audio_source
                    url = await asyncio.to_thread(save_audio_source, source, slot, bool((result.get('audio_info') or {}).get('muted')))
            elif packet['field'] == 'models':
                from app.services.hunyuan3d import validate_glb
                url = await media.download_remote(source['url'], 'model_', provider={'proxy_url': source.get('proxy_url') or ''}, default_extension='.glb', validate_file=validate_glb)
            else:
                url = await save_remote_video_to_output(source, provider=provider)
            # References already in our store can be reused without a new slot.
            ready = await asyncio.to_thread(media.get_asset, url)
            if not ready:
                raise HTTPException(502, "结果素材未完成持久化")
            urls.append(media.stable_url(ready))
        finally:
            media.result_slot.reset(token)
    result[packet["field"]] = urls
    return result


async def publish_result(result, sources, field, provider_id):
    await asyncio.to_thread(checkpoint, result, sources, field, provider_id)
    return await resume(tasks.lease_context.get()[0])


def defer(task_id, error):
    """Retry only publication, then retain a reviewable result after five failures."""
    if not has_source(task_id):
        return False
    current = tasks.get(task_id)
    if current.get("status") == "succeeded":
        return True
    attempt = int(current.get("finalization_failures") or 0) + 1
    status_code = getattr(error, "status_code", None)
    if status_code is None:
        status_code = getattr(getattr(error, "response", None), "status_code", None)
    terminal = attempt >= 5 or status_code in {400, 401, 403, 404, 409, 410, 413}
    current.update(status="needs_review" if terminal else "finalizing", updated_at=time.time(),
                   finalization_failures=attempt, error="结果入库未完成；已保留来源，未重新生成：" + str(getattr(error, "detail", None) or error),
                   result_source_asset_id=source_id(task_id))
    with database.connection() as conn:
        tasks.save(current)
        conn.execute("UPDATE tasks SET available_at=now()+make_interval(secs=>%s) WHERE workspace_id=%s AND id=%s",
                     (min(300, 5 * 2 ** attempt), current_workspace(), task_id))
    return True


def retry(task_id):
    """Explicit administrative retry of publication; never submit generation."""
    with database.connection() as conn:
        row = conn.execute("SELECT *,lease_until>now() AS leased FROM tasks WHERE workspace_id=%s AND id=%s FOR UPDATE", (current_workspace(), task_id)).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        if row["status"] not in {"needs_review", "failed", "finalizing"} or row["leased"]:
            raise HTTPException(409, "只允许重试无执行租约的待核对结果入库任务")
        if not has_source(task_id):
            raise HTTPException(409, "没有已保存的结果来源，禁止自动重新生成")
        conn.execute("UPDATE tasks SET status='finalizing',error_message=NULL,completed_at=NULL,available_at=now(),updated_at=now(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,legacy_metadata=jsonb_set(legacy_metadata,'{finalization_failures}','0') || jsonb_build_object('error','') WHERE workspace_id=%s AND id=%s", (current_workspace(), task_id))
    return {"task_id": task_id, "status": "finalizing"}
