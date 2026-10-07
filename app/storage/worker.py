"""PostgreSQL queue consumer. May run embedded or as a separate process."""
import asyncio
import logging
import os
import socket
import uuid
import threading
import time
from app.storage import tasks
from app.storage.media import operation_scope
from app.storage.workspace import workspace_scope


async def execute(row):
    # The persisted row is authoritative; consumer/request context is irrelevant.
    with workspace_scope(row["workspace_id"]):
        return await _execute_scoped(row)


async def _execute_scoped(row):
    from app.models import CanvasVideoRequest, OnlineImageRequest
    from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK
    from app.routers.canvas import run_canvas_video_task, resume_canvas_video_task
    from app.routers.image import run_canvas_image_task
    task_id, token = row["id"], row["lease_token"]
    task = tasks.decode(row)
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS[task_id] = task
    context = tasks.lease_context.set((task_id, token))
    owner_task = asyncio.current_task()

    loop = asyncio.get_running_loop()
    stopped = threading.Event()

    def renew():
        try:
            while not stopped.wait(20):
                with workspace_scope(row["workspace_id"]):
                    if not tasks.heartbeat(task_id, token):
                        loop.call_soon_threadsafe(owner_task.cancel)
                        return
        except Exception:
            logging.exception("Task heartbeat failed for %s", task_id)
            loop.call_soon_threadsafe(owner_task.cancel)

    # SDK downloads and some legacy media helpers are synchronous. Their I/O must
    # not prevent lease renewal while they are still doing useful work.
    heartbeat = threading.Thread(target=renew, name="cloud-lease-" + task_id, daemon=True)
    heartbeat.start()
    try:
        with operation_scope():
            from app.storage import finalization
            if finalization.has_source(task_id):
                from app.services.canvas_tasks import save_canvas_task
                result = await finalization.resume(task_id)
                current = tasks.get(task_id)
                current.update(status="succeeded", result=result, error="", submission_unknown=False, updated_at=time.time())
                await asyncio.to_thread(save_canvas_task, current)
                return
            from app.storage.image_receipts import recoverable
            image_recovery = row["kind"] == "online-image" and row["status"] in {"polling", "finalizing"} and recoverable(row)
            if row["status"] in {"polling", "finalizing"} and not image_recovery and (row["kind"] != "video" or not row["upstream_task_id"]):
                current = tasks.get(task_id)
                current.update(status="needs_review", error="缺少可恢复的上游任务信息，请人工核对；未重新提交生成")
                tasks.save(current)
                return
            from app.storage.task_requests import validate_execution
            request = await asyncio.to_thread(validate_execution, row)
            if row["kind"] == "video":
                payload = CanvasVideoRequest(**request)
                if row["upstream_task_id"]:
                    await resume_canvas_video_task(task_id, payload)
                else:
                    await run_canvas_video_task(task_id, payload)
            elif row["kind"] == "llm":
                from app.services.canvas_llm_tasks import run_task
                await run_task(task_id, request)
            else:
                if image_recovery:
                    await run_canvas_image_task(task_id, OnlineImageRequest(**request), resume=True)
                else:
                    await run_canvas_image_task(task_id, OnlineImageRequest(**request))
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        if isinstance(getattr(exc, 'detail', None), dict) and exc.detail.get('code') == 'maintenance_restricted':
            # A claimed but not submitted task is paused safely, not failed or
            # re-issued. The claim query will skip it until maintenance clears.
            current = tasks.get(task_id)
            if current.get('status') == 'running' and not current.get('upstream_task_id'):
                current.update(status='queued', error='维护中，等待恢复后提交')
                tasks.save(current)
                return
        logging.exception("Cloud task worker failed for %s", task_id)
        from app.storage.finalization import defer
        if defer(task_id, exc):
            return
        current = tasks.get(task_id)
        if current.get("status") in tasks.ACTIVE:
            current.update(status="needs_review", error=str(exc))
            if current.get('type') == 'llm':
                from app.services.canvas_tasks import save_canvas_task
                await asyncio.to_thread(save_canvas_task, current)
            else:
                tasks.save(current)
    finally:
        stopped.set()
        await asyncio.to_thread(heartbeat.join, 20)
        tasks.lease_context.reset(context)
        await asyncio.to_thread(tasks.release, task_id, token)


async def consume(stop):
    from app.services.maintenance_control import service_presence
    async with service_presence('worker'):
        await _consume(stop)


async def _consume(stop):
    owner = socket.gethostname() + ":" + str(os.getpid()) + ":" + uuid.uuid4().hex[:8]
    reconciliation_after, next_reconciliation = '', 0
    while not stop.is_set():
        try:
            if time.monotonic() >= next_reconciliation:
                next_reconciliation = time.monotonic() + 60
                from app.services.canvas_task_results import reconcile_pending
                reconciliation_after = await asyncio.to_thread(reconcile_pending, reconciliation_after)
            await asyncio.to_thread(tasks.recover_expired, all_workspaces=True)
            row = await asyncio.to_thread(tasks.claim, owner, all_workspaces=True)
            if row:
                await execute(row)
                continue
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("Cloud worker iteration failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=1)
        except asyncio.TimeoutError:
            pass


def start():
    stop = asyncio.Event()
    consumers = [asyncio.create_task(consume(stop)) for _ in range(max(1, min(8, int(os.getenv("CLOUD_WORKER_CONCURRENCY", "2")))))]
    return stop, consumers


async def shutdown(handle):
    stop, consumers = handle
    stop.set()
    done, pending = await asyncio.wait(consumers, timeout=10)
    for task in pending:
        task.cancel()
    await asyncio.gather(*consumers, return_exceptions=True)
