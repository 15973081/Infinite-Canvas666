"""Interrupt real result publication against isolated PostgreSQL/object storage."""
import asyncio
import base64
import io
import os
from pathlib import Path
import uuid
from unittest.mock import patch

import pytest
from cloud_fixtures import fake_supplier_catalog
from fastapi import HTTPException
from PIL import Image

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py")


def new_task(kind="online-image", count=2, provider_id="comfly", model_name="test"):
    from app.storage import canvases, tasks
    from app.models import OnlineImageRequest, CanvasVideoRequest
    cid = uuid.uuid4().hex
    canvases.save({"id": cid, "title": "恢复验收", "kind": "smart", "nodes": [], "connections": []})
    tid = ("canvas_img_" if kind == "online-image" else "canvas_vid_") + uuid.uuid4().hex
    model = OnlineImageRequest if kind == "online-image" else CanvasVideoRequest
    args = {"prompt": "publication recovery", "provider_id": provider_id, "model": model_name, "canvas_id": cid}
    if kind == "online-image":
        args["n"] = count
    payload = model(**args).model_dump(mode="json")
    tasks.save({"id": tid, "type": kind, "status": "queued", "canvas_id": cid,
                "provider_id": provider_id, "model": model_name, "billing_request": args,
                "billing_price": {"unit_price": "0.05", "billing_type": "per_image" if kind == "online-image" else "per_call", "currency": "CNY"}}, payload)
    return tid, cid


def claim(tid):
    from app.storage import database, tasks
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at='2000-01-01' WHERE id=%s", (tid,))
    row = tasks.claim("recovery-test")
    assert row["id"] == tid
    return row


def image_supplier(calls):
    async def generate(*args, **kwargs):
        calls.append("paid-image")
        stream = io.BytesIO()
        Image.new("RGB", (8, 8), "blue" if len(calls) % 2 else "red").save(stream, format="PNG")
        return {"type": "b64", "value": base64.b64encode(stream.getvalue()).decode()}, {"id": "upstream-image", "usage": {"count": 1}}
    return generate


def assert_committed(tid, cid, count):
    from app.storage import tasks, database, media
    from app.services import canvas_ledger
    task = tasks.get(tid)
    assert task["status"] == "succeeded"
    for url in task["result"]["images"]:
        assert media.get_asset(url)["status"] == "ready"
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE kind='history' AND id=%s", ("task:" + tid,)).fetchone()["n"] == 1
    totals = canvas_ledger.read_page(cid)["totals"]
    assert totals["records"] == 1
    assert totals["total"] == 50000 * count


def test_interrupted_second_image_resumes_same_slots_without_generation(fake_supplier_catalog):
    from app.storage import media, tasks, worker, finalization
    from app.routers import providers
    from app.state import CANVAS_TASKS
    tid, cid = new_task()
    paid = []
    real_put = media.FilesystemStore.put

    def interrupt_second(store, key, path, content_type):
        if finalization.output_id(tid, 1) in key:
            raise asyncio.CancelledError()
        return real_put(store, key, path, content_type)

    with patch.object(providers, "generate_ai_image", side_effect=image_supplier(paid)), patch.object(media.FilesystemStore, "put", interrupt_second):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(worker.execute(claim(tid)))
    assert len(paid) == 2
    assert tasks.get(tid)["status"] == "finalizing"
    first = media.get_asset(finalization.output_id(tid, 0))
    CANVAS_TASKS.clear()
    with patch.object(providers, "generate_ai_image", side_effect=AssertionError("must not generate again")):
        asyncio.run(worker.execute(claim(tid)))
    assert media.get_asset(first["id"])["object_version_id"] == first["object_version_id"]
    assert_committed(tid, cid, 2)


def test_result_and_ledger_rollback_together_then_reuse_ready_objects(fake_supplier_catalog):
    from app.storage import worker, tasks, media, finalization, database
    from app.routers import providers
    from app.services import canvas_ledger
    tid, cid = new_task(count=1)
    real_record = canvas_ledger.record_task

    def unavailable(task):
        if task.get("status") == "succeeded":
            raise OSError("ledger temporarily unavailable")
        return real_record(task)

    with patch.object(providers, "generate_ai_image", side_effect=image_supplier([])), patch.object(canvas_ledger, "record_task", unavailable):
        asyncio.run(worker.execute(claim(tid)))
    assert tasks.get(tid)["status"] == "finalizing"
    ready = media.get_asset(finalization.output_id(tid, 0))
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE canvas_id=%s", (cid,)).fetchone()["n"] == 0
        assert not conn.execute("SELECT 1 FROM workspace_documents WHERE kind='history' AND id=%s", ("task:" + tid,)).fetchone()
    with patch.object(providers, "generate_ai_image", side_effect=AssertionError("duplicate paid submit")), patch.object(media.FilesystemStore, "put", side_effect=AssertionError("ready output must be reused")):
        asyncio.run(worker.execute(claim(tid)))
    assert media.get_asset(ready["id"])["object_version_id"] == ready["object_version_id"]
    assert_committed(tid, cid, 1)


def test_checkpoint_survives_lost_task_status_commit(fake_supplier_catalog):
    from app.storage import tasks, worker, finalization
    from app.routers import providers
    tid, cid = new_task(count=1)
    real_save = tasks.save

    def interrupt(task, *args, **kwargs):
        if task.get("status") == "finalizing":
            raise asyncio.CancelledError()
        return real_save(task, *args, **kwargs)

    with patch.object(providers, "generate_ai_image", side_effect=image_supplier([])), patch.object(tasks, "save", interrupt):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(worker.execute(claim(tid)))
    assert finalization.has_source(tid)
    assert tasks.get(tid)["status"] == "submitting"
    tasks.recover_expired()
    assert tasks.get(tid)["status"] == "finalizing"
    with patch.object(providers, "generate_ai_image", side_effect=AssertionError("duplicate paid submit")):
        asyncio.run(worker.execute(claim(tid)))
    assert_committed(tid, cid, 1)


def test_video_with_known_result_resumes_without_poll_or_submission(tmp_path):
    from app.storage import worker, tasks, media
    from app.routers import canvas
    from app.services import media as helpers, canvas_ledger
    from app.services.volcengine_billing import pricing_context, timestamp_ms
    model = "doubao-seedance-2-5-260628"
    provider = {"id": "volcengine", "protocol": "volcengine", "base_url": "https://ark.cn-beijing.volces.com/api/v3"}
    context = pricing_context(provider, timestamp_ms("2026-09-09T12:00:00+08:00"))
    tid, cid = new_task("video", provider_id="volcengine", model_name=model)
    paid = []

    async def generated(payload, on_submitted=None):
        paid.append("paid-video")
        raw = {"id": "known-upstream", "status": "succeeded", "model": model,
               "usage": {"completion_tokens": 108900, "total_tokens": 108900},
               "resolution": "720p", "duration": 5, "ratio": "16:9", "framespersecond": 24,
               "content": {"video_url": "https://supplier.example/result.mp4"}}
        return await canvas._finish_canvas_video(payload, provider, raw, "known-upstream", context)

    async def downloaded(url, **kwargs):
        path = Path(media.scratch_directory()) / "recovered.mp4"
        path.write_bytes(b"fake upstream video bytes")
        return media.publish_output(path.name)

    with patch.object(canvas, "canvas_video_impl", generated), patch.object(canvas, "video_output_urls", return_value=["https://supplier.example/result.mp4"]), patch.object(helpers, "save_remote_video_to_output", side_effect=asyncio.CancelledError()):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(worker.execute(claim(tid)))
    assert tasks.get(tid)["status"] == "finalizing"
    with patch.object(canvas, "canvas_video_impl", side_effect=AssertionError("duplicate paid submit")), patch.object(canvas, "resume_canvas_video_task", side_effect=AssertionError("already have result; no polling")), patch.object(canvas, "video_accounting", side_effect=AssertionError("reuse saved accounting; no repricing")), patch.object(helpers, "save_remote_video_to_output", downloaded):
        asyncio.run(worker.execute(claim(tid)))
    task = tasks.get(tid)
    assert task["status"] == "succeeded"
    assert task["result"]["task_id"] == "known-upstream"
    assert media.get_asset(task["result"]["videos"][0])["status"] == "ready"
    assert paid == ["paid-video"]
    assert task["result"]["usage"]["completion_tokens"] == 108900
    assert task["result"]["cost"]["amount_micros"] == 7623000
    assert canvas_ledger.read_page(cid)["totals"]["total"] == 7623000


def test_expired_source_enters_review_and_retains_checkpoint():
    from app.storage import finalization, tasks, worker, media
    from app.services import media as helpers
    tid, _ = new_task("video")
    row = claim(tid)
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        with media.operation_scope():
            finalization.checkpoint({"videos": [], "task_id": "paid"}, ["https://supplier.example/expired.mp4"], "videos", "comfly")
    finally:
        tasks.lease_context.reset(token)
        tasks.release(tid, row["lease_token"])
    with patch.object(helpers, "save_remote_video_to_output", side_effect=HTTPException(410, "expired")):
        asyncio.run(worker.execute(claim(tid)))
    assert tasks.get(tid)["status"] == "needs_review"
    assert finalization.has_source(tid)


def test_old_lease_cannot_publish_checkpoint_or_success(tmp_path):
    from app.storage import finalization, tasks, database, media
    from app.services.canvas_tasks import save_canvas_task
    tid, _ = new_task(count=1)
    row = claim(tid)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (tid,))
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        with media.operation_scope():
            with pytest.raises(HTTPException) as error:
                finalization.checkpoint({"images": []}, [{"type": "url", "value": "https://supplier.example/image.png"}], "images", "comfly")
            assert error.value.status_code == 409
        task = tasks.get(tid)
        task.update(status="succeeded", result={"images": []})
        with pytest.raises(HTTPException):
            save_canvas_task(task)
    finally:
        tasks.lease_context.reset(token)
    assert tasks.get(tid)["status"] != "succeeded"
    # Prevent this intentionally expired test task from occupying a later claim.
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review' WHERE id=%s", (tid,))


def test_finalization_retry_is_bounded_and_admin_cannot_resubmit_unknown_work():
    from app.storage import finalization, tasks, worker, media
    from app.services import media as helpers
    tid, _ = new_task("video")
    row = claim(tid)
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        with media.operation_scope():
            finalization.checkpoint({"videos": []}, ["https://supplier.example/result.mp4"], "videos", "comfly")
        with pytest.raises(HTTPException):
            finalization.retry(tid)
    finally:
        tasks.lease_context.reset(token)
        tasks.release(tid, row["lease_token"])
    for attempt in range(1, 6):
        with patch.object(helpers, "save_remote_video_to_output", side_effect=HTTPException(503, "temporary outage")):
            asyncio.run(worker.execute(claim(tid)))
        value = tasks.get(tid)
        assert value["finalization_failures"] == attempt
        assert value["status"] == ("needs_review" if attempt == 5 else "finalizing")
    assert finalization.retry(tid)["status"] == "finalizing"
    assert tasks.get(tid)["finalization_failures"] == 0
    unknown, _ = new_task("video")
    with pytest.raises(HTTPException):
        finalization.retry(unknown)
    # Keep these intentionally unfinished fixtures out of subsequent queue tests.
    from app.storage.database import connection
    with connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review' WHERE id=ANY(%s)", ([tid, unknown],))
