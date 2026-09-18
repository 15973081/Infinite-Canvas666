"""Actual PostgreSQL/object-store recovery of concurrent image receipts."""
import asyncio
import os
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException
from test_cloud_finalization import new_task, claim, image_supplier, assert_committed
from test_cloud_member_gateway import world, operator
from test_cloud_management import platform
from test_cloud_managed_providers import create, assign

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py")


@pytest.fixture
def image_space(world, platform):
    from app.storage.workspace import workspace_scope
    pid, _, _ = create(platform)
    assert assign(platform, world, pid).status_code == 200
    with workspace_scope(world["a"]["id"]):
        yield pid


def row_for(tid):
    from app.storage import database
    with database.connection() as conn:
        return conn.execute("SELECT * FROM tasks WHERE id=%s", (tid,)).fetchone()


def info(tid):
    from app.storage import database, image_receipts
    with database.connection() as conn:
        return image_receipts.summary(row_for(tid), conn)


def test_each_upstream_receipt_survives_interruption_before_polling(image_space, world):
    from app.storage import worker, tasks, image_receipts, media, finalization
    from app.services import media as helpers
    from app.routers import providers
    tid, cid = new_task(count=2, provider_id=image_space)
    from app.storage import database
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET requested_by=%s WHERE id=%s", (world["people"][0]["id"], tid))
    paid, queries = [], []

    async def accepted(client, url, **kwargs):
        paid.append(url)
        return httpx.Response(200, json={"task_id": "task-receipt-" + str(len(paid))}, request=httpx.Request("POST", url))

    async def interrupted(client, task_id, provider):
        assert info(tid)["queryable"] >= 1  # Receipt is committed before first polling await.
        raise asyncio.CancelledError()

    with patch.object(httpx.AsyncClient, "post", accepted), patch.object(helpers, "wait_for_image_task", interrupted):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(worker.execute(claim(tid)))
    assert len(paid) == 2
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM task_submissions WHERE task_id=%s", (tid,)).fetchone()["n"] == 2
    assert info(tid) == {"requested": 2, "saved_results": 0, "queryable": 2, "unknown": 0, "complete": True}
    assert not finalization.has_source(tid)
    tasks.recover_expired()
    assert tasks.get(tid)["status"] == "polling"

    async def completed(client, upstream_id, provider):
        queries.append(upstream_id)
        source, _ = await image_supplier([])()
        return {"data": [{"b64_json": source["value"]}], "usage": {"count": 1}}

    with patch.object(providers, "generate_ai_image", side_effect=AssertionError("must not resubmit")), patch.object(providers, "wait_for_image_task", completed):
        asyncio.run(worker.execute(claim(tid)))
    assert sorted(queries) == ["task-receipt-1", "task-receipt-2"]
    assert info(tid)["saved_results"] == 2
    assert_committed(tid, cid, 2)
    with media.operation_scope():
        slots = [image_receipts.read(row_for(tid), i) for i in range(2)]
    assert all(slot["raw"]["usage"] == {"count": 1} for slot in slots)


def test_all_saved_images_resume_without_generation_or_polling():
    from app.storage import worker, tasks, image_receipts, media, finalization
    from app.routers import providers
    tid, cid = new_task(count=2)
    paid = []
    with patch.object(providers, "generate_ai_image", side_effect=image_supplier(paid)), patch.object(finalization, "checkpoint", side_effect=asyncio.CancelledError()):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(worker.execute(claim(tid)))
    assert info(tid)["saved_results"] == 2
    tasks.recover_expired()
    assert tasks.get(tid)["status"] == "polling"
    with patch.object(providers, "generate_ai_image", side_effect=AssertionError("must not resubmit")), patch.object(providers, "wait_for_image_task", side_effect=AssertionError("must reuse saved image")):
        asyncio.run(worker.execute(claim(tid)))
    assert paid == ["paid-image", "paid-image"]
    assert_committed(tid, cid, 2)


def test_unknown_sibling_stays_reviewable_without_losing_completed_image():
    from app.storage import worker, tasks, image_receipts, media
    from app.routers import providers
    tid, _ = new_task(count=2)

    async def scenario():
        started = asyncio.Event()
        calls = []
        async def generate(*args, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                return await image_supplier([])()
            started.set()
            await asyncio.Event().wait()
        with patch.object(providers, "generate_ai_image", generate):
            execution = asyncio.create_task(worker.execute(claim(tid)))
            await asyncio.wait_for(started.wait(), 5)
            for _ in range(200):
                if info(tid)["saved_results"] == 1:
                    break
                await asyncio.sleep(.01)
            assert info(tid)["saved_results"] == 1
            execution.cancel()
            with pytest.raises(asyncio.CancelledError):
                await execution
    asyncio.run(scenario())
    tasks.recover_expired()
    assert tasks.get(tid)["status"] == "needs_review"
    assert info(tid) == {"requested": 2, "saved_results": 1, "queryable": 0, "unknown": 1, "complete": False}
    with media.operation_scope():
        assert image_receipts.read(row_for(tid), 0)["source"]["type"] == "b64"
        with pytest.raises(HTTPException):
            image_receipts.read(row_for(tid), 1)


def test_receipts_are_immutable_private_and_fenced():
    from app.storage import tasks, media, image_receipts, database, task_requests
    tid, _ = new_task(count=1)
    row = claim(tid)
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        value = tasks.get(tid)
        value["status"] = "submitting"
        tasks.save(value)
        with media.operation_scope(), image_receipts.slot_scope(0):
            image_receipts.submitted("task-original")
            key = image_receipts.asset_id(tid, 0, "upstream")
            version = media.get_asset(key)["object_version_id"]
            image_receipts.submitted("task-original")
            assert media.get_asset(key)["object_version_id"] == version
            with pytest.raises(HTTPException) as conflict:
                image_receipts.submitted("task-different")
            assert conflict.value.status_code == 409
            with pytest.raises(HTTPException) as private:
                media.browser_url(media.get_asset(key))
            assert private.value.status_code == 404
            with database.connection() as conn:
                with pytest.raises(HTTPException):
                    task_requests.lock_ready(conn, [key])
            with database.connection() as conn:
                conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (tid,))
            with pytest.raises(HTTPException):
                image_receipts.submitted("task-original")
            with pytest.raises(HTTPException):
                image_receipts.completed({"type": "url", "value": "https://private.invalid/image"}, {})
    finally:
        tasks.lease_context.reset(token)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='needs_review',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s", (tid,))


def test_partial_completed_task_keeps_each_receipt_without_rewriting_aggregate():
    from app.storage import worker, image_receipts, media, finalization
    from app.routers import providers
    tid, cid = new_task(count=2)
    calls = []
    async def supplier(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            return await image_supplier([])()
        await asyncio.to_thread(image_receipts.submitted, "task-still-running")
        raise HTTPException(504, "not ready")
    with patch.object(providers, "generate_ai_image", supplier):
        asyncio.run(worker.execute(claim(tid)))
    assert_committed(tid, cid, 1)
    assert info(tid) == {"requested": 2, "saved_results": 1, "queryable": 1, "unknown": 0, "complete": True}
    with media.operation_scope():
        assert image_receipts.read(row_for(tid), 1)["upstream_task_id"] == "task-still-running"
    assert finalization.has_source(tid)


def test_receipts_reject_different_workspace_and_account():
    from app.storage import tasks, image_receipts, media, database
    from app.storage.workspace import workspace_scope
    tid, _ = new_task(count=1)
    row = claim(tid)
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        task = tasks.get(tid)
        task["status"] = "submitting"
        tasks.save(task)
        with media.operation_scope(), image_receipts.slot_scope(0):
            image_receipts.submitted("task-original")
            with workspace_scope("other-space"):
                with pytest.raises(HTTPException):
                    image_receipts.read(row_for(tid), 0)
            changed = dict(row_for(tid), provider_account_ref="changed")
            with pytest.raises(HTTPException):
                image_receipts.read(changed, 0)
            with image_receipts.slot_scope(1), pytest.raises(HTTPException):
                image_receipts.submitted("outside-original-request")
    finally:
        tasks.lease_context.reset(token)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='needs_review',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s", (tid,))


def test_legacy_single_id_is_recoverable_but_never_expands_into_multiple_slots():
    from app.storage import database, tasks
    tid, _ = new_task(count=1)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review',upstream_task_id='legacy' WHERE id=%s", (tid,))
    assert info(tid)["complete"]
    multi, _ = new_task(count=2)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review',upstream_task_id='only-one' WHERE id=%s", (multi,))
    assert info(multi)["unknown"] == 2


def test_image_task_id_is_one_encoded_path_segment():
    from app.services.media import image_task_url_for_provider
    value = image_task_url_for_provider({"id": "comfly", "base_url": "https://supplier.invalid/v1"}, "task/a?x=1#f")
    assert value == "https://supplier.invalid/v1/images/tasks/task%2Fa%3Fx%3D1%23f"


@pytest.mark.parametrize("account_mode", ["assigned", "unassigned", "changed_before", "changed_after"])
def test_management_recovers_image_receipts_with_original_account_during_drain(image_space, world, platform, monkeypatch, account_mode):
    import uuid
    from app.storage import tasks, database, media, image_receipts, worker
    from app.services import maintenance_control
    from app.routers import providers
    from test_cloud_task_reviews import detail, payload, submit
    tid, cid = new_task(count=2, provider_id=image_space)
    row = claim(tid)
    context = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        task = tasks.get(tid)
        task["status"] = "submitting"
        tasks.save(task)
        with media.operation_scope():
            source, raw = asyncio.run(image_supplier([])())
            with image_receipts.slot_scope(0):
                image_receipts.completed(source, raw)
            with image_receipts.slot_scope(1):
                image_receipts.submitted("task-pending-second-image")
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='needs_review',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s", (tid,))
            for _ in range(2):
                conn.execute("INSERT INTO task_submissions(id,task_id,workspace_id,outcome) VALUES(%s,%s,%s,'responded')", (uuid.uuid4(), tid, world['a']['id']))
    finally:
        tasks.lease_context.reset(context)
    if account_mode == "unassigned":
        assert assign(platform, world, image_space, version=2, selected=False).status_code == 200
    if account_mode == "changed_before":
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET provider_account_ref='managed:changed' WHERE id=%s", (tid,))
    overview = detail(platform, world, tid)
    assert overview['image_receipts'] == {"requested": 2, "saved_results": 1, "queryable": 1, "unknown": 0, "complete": True}
    assert 'source' not in overview and 'provider_account_ref' not in overview
    action = payload(overview, 'resume_polling')
    if account_mode == "changed_before":
        assert 'resume_polling' not in overview['actions']
        assert submit(platform, world, tid, action).status_code == 409
        return
    assert 'resume_polling' in overview['actions']
    maintenance_control.change(platform['operator'], world['a']['id'], 'draining', 0, reason='查询原图片任务')
    accepted = submit(platform, world, tid, action)
    assert accepted.status_code == 200, accepted.text
    assert submit(platform, world, tid, action).json() == accepted.json()
    queries = []
    async def queried(client, upstream_id, provider):
        queries.append(upstream_id)
        return {"data": [{"b64_json": source['value']}], "usage": {"count": 1}}
    monkeypatch.setattr(providers, 'generate_ai_image', lambda *a, **kw: pytest.fail('must not generate'))
    monkeypatch.setattr(providers, 'wait_for_image_task', queried)
    if account_mode == "changed_after":
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET provider_account_ref='managed:changed' WHERE id=%s", (tid,))
    asyncio.run(worker.execute(claim(tid)))
    if account_mode == "changed_after":
        assert tasks.get(tid)['status'] == 'needs_review'
        assert queries == []
    else:
        assert queries == ['task-pending-second-image']
        assert_committed(tid, cid, 2)
    with database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (tid,)).fetchone()['n'] == 2
        assert conn.execute('SELECT count(*) AS n FROM task_reviews WHERE task_id=%s', (tid,)).fetchone()['n'] == 1


def test_missing_image_receipt_cannot_be_resubmitted_through_management(image_space, world, platform):
    from app.storage import database
    from test_cloud_task_reviews import detail, payload, submit
    tid, _ = new_task(count=2, provider_id=image_space)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review',upstream_task_id='one-id-for-two-images' WHERE id=%s", (tid,))
    overview = detail(platform, world, tid)
    assert overview['image_receipts']['unknown'] == 2
    assert 'resume_polling' not in overview['actions']
    assert submit(platform, world, tid, payload(overview, 'resume_polling')).status_code == 409


def test_legacy_query_network_failure_keeps_original_id(image_space, monkeypatch):
    from app.storage import database, tasks, worker
    from app.routers import providers
    tid, _ = new_task(count=1, provider_id=image_space)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='polling',upstream_task_id='legacy-original' WHERE id=%s", (tid,))
    async def offline(*args, **kwargs):
        raise httpx.ReadTimeout('query interrupted')
    monkeypatch.setattr(providers, 'wait_for_image_task', offline)
    monkeypatch.setattr(providers, 'generate_ai_image', lambda *a, **kw: pytest.fail('must not generate'))
    asyncio.run(worker.execute(claim(tid)))
    assert tasks.get(tid)['status'] == 'failed'
    assert tasks.get(tid)['upstream_task_id'] == 'legacy-original'
    assert info(tid)['complete']
