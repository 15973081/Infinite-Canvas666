"""Canonical requests, ready references, and provider account fencing."""
import asyncio
import json
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py")


def asset(tmp_path):
    from app.storage import media
    path = tmp_path / "reference.png"
    path.write_bytes(b"reference fixture")
    return media.publish(path, legacy_ref="/assets/requests/" + uuid.uuid4().hex + ".png")


def test_known_signed_aliases_share_fingerprint_without_rewriting_text(tmp_path):
    from app.storage import media, tasks, task_requests, database
    item = asset(tmp_path)
    with database.connection() as conn:
        legacy = conn.execute("SELECT legacy_ref FROM asset_aliases WHERE asset_id=%s", (item["id"],)).fetchone()["legacy_ref"]
    refs = [media.stable_url(item), legacy, "/api/media/" + item["id"] + "/signed?expires=1&signature=expired",
            os.environ["PUBLIC_BASE_URL"] + "/api/media/" + item["id"] + "/signed?expires=2&signature=new"]
    values = [{"prompt": "preserve " + refs[2], "images": [{"url": ref, "name": "reference"}],
               "videos": ["asset://provider-owned"], "registrations": {"url": refs[2]}} for ref in refs]
    assert len({tasks.fingerprint(value) for value in values}) == 1
    normalized = task_requests.normalize(values[-1], strict=True)
    assert normalized["prompt"] == values[-1]["prompt"]
    assert normalized["registrations"] == values[-1]["registrations"]
    assert normalized["videos"] == ["asset://provider-owned"]
    assert normalized["images"][0]["url"] == "/api/media/" + item["id"] + "/content"
    assert task_requests.normalize({"images": [{"url": refs[0], "media_asset_id": item["id"]}]})["images"][0]["media_asset_id"] == item["id"]
    external = {"images": [{"url": "https://elsewhere.invalid/api/media/" + item["id"] + "/signed?signature=keep"}]}
    assert task_requests.normalize(external) == external
    secret = {"API-Key": "secret-one", "nested": {"AccessKeyId": "secret-two", "X-Goog-Api-Key": "secret-three", "max_tokens": 12}, "prompt": "unchanged"}
    assert tasks.clean_request(secret) == {"nested": {"max_tokens": 12}, "prompt": "unchanged"}


def test_tos_signed_url_resolves_only_exact_known_version(tmp_path):
    from app.storage import task_requests
    item = asset(tmp_path)
    url = "https://local-simulation.tos.example/" + item["object_key"] + "?versionId=" + item["object_version_id"] + "&X-Tos-Signature=old"
    with patch.dict(os.environ, {"TOS_PUBLIC_ENDPOINT": "https://tos.example", "TOS_BUCKET": "local-simulation"}):
        normalized = task_requests.normalize({"videos": [url]})
        assert normalized["videos"] == ["/api/media/" + item["id"] + "/content"]
        assert task_requests.normalize({"videos": [url.replace("=old", "=new")]}) == normalized
        with pytest.raises(HTTPException) as unknown:
            task_requests.normalize({"videos": [url.replace(item["object_version_id"], "missing-version")]})
        assert unknown.value.status_code == 404
        with pytest.raises(HTTPException):
            task_requests.normalize({"videos": [url + "&x-tos-process=image/resize,w_10"]})
        with pytest.raises(HTTPException):
            task_requests.normalize({"images": [{"url": "https://name:password@example.test/image.png"}]})


def test_new_task_rejects_unready_missing_and_deleted_inputs(tmp_path):
    from app.storage import tasks, database, media, uploads
    item = asset(tmp_path)
    pending = uploads.create("pending.png", 10, uuid.uuid4().hex)
    for ref in ["/api/media/" + pending["media_asset_id"] + "/content", "/assets/not-imported.png", "/api/media/ast_" + "a" * 32 + "/content", "data:image/png;base64,YQ=="]:
        tid = "canvas_vid_" + uuid.uuid4().hex
        with pytest.raises(HTTPException):
            tasks.save({"id": tid, "type": "video"}, {"images": [{"url": ref}]})
        assert not tasks.get(tid)
    with database.connection() as conn:
        conn.execute("UPDATE assets SET deleted_at=now() WHERE id=%s", (item["id"],))
    with pytest.raises(HTTPException):
        tasks.save({"id": "canvas_vid_" + uuid.uuid4().hex, "type": "video"}, {"videos": [media.stable_url(item)]})


@pytest.mark.parametrize("kind", ["image", "video"])
def test_task_api_retries_canonical_request_and_rejects_changed_content(tmp_path, kind):
    from app.storage import tasks, media, database
    from main import app
    from fastapi.testclient import TestClient
    item = asset(tmp_path)
    tid = ("canvas_img_" if kind == "image" else "canvas_vid_") + uuid.uuid4().hex
    field = "reference_images" if kind == "image" else "images"
    request = {"client_task_id": tid, "prompt": "same task", "provider_id": "volcengine", field: [{"url": media.stable_url(item)}]}
    auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
    with TestClient(app) as client:
        url = "/api/canvas-" + kind + "-tasks"
        first = client.post(url, json=request, auth=auth)
        assert first.status_code == 200, first.text
        request[field][0]["url"] = os.environ["PUBLIC_BASE_URL"] + "/api/media/" + item["id"] + "/signed?expires=1&signature=new"
        second = client.post(url, json=request, auth=auth)
        assert second.status_code == 200, second.text
        assert first.json()["task_id"] == second.json()["task_id"] == tid
        request["prompt"] = "changed task"
        assert client.post(url, json=request, auth=auth).status_code == 409
    stored = tasks.request(tid)
    assert "signature=" not in json.dumps(stored)
    with database.connection() as conn:
        row = conn.execute("SELECT input_asset_ids,provider_account_ref FROM tasks WHERE id=%s", (tid,)).fetchone()
        assert row["input_asset_ids"] == [item["id"]]
        assert row["provider_account_ref"].startswith(("env:", "account:"))
        conn.execute("UPDATE tasks SET status='needs_review' WHERE id=%s", (tid,))


def test_changed_account_or_removed_input_stops_before_supplier_calls(tmp_path):
    from app.storage import tasks, database, worker, media
    from app.routers import canvas
    from app.models import CanvasVideoRequest
    item = asset(tmp_path)
    for change in ("account", "input"):
        tid = "canvas_vid_" + uuid.uuid4().hex
        request = CanvasVideoRequest(prompt="guard", provider_id="volcengine", images=[{"url": media.stable_url(item)}]).model_dump(mode="json")
        with patch.dict(os.environ, {"ARK_API_KEY": "original-simulation-key", "ARK_API_KEY_ACCOUNT_REF": ""}):
            tasks.save({"id": tid, "type": "video"}, request)
            with database.connection() as conn:
                conn.execute("UPDATE tasks SET available_at='1900-01-01' WHERE id=%s", (tid,))
            row = tasks.claim("guard-test")
            assert row["id"] == tid
            assert "original-simulation-key" not in json.dumps(tasks.get(tid))
            if change == "input":
                with database.connection() as conn:
                    conn.execute("UPDATE assets SET deleted_at=now() WHERE id=%s", (item["id"],))
            config = {"ARK_API_KEY": "different-simulation-key"} if change == "account" else {}
            with patch.dict(os.environ, config), patch.object(canvas, "run_canvas_video_task", side_effect=AssertionError("must not submit")), patch.object(canvas, "resume_canvas_video_task", side_effect=AssertionError("must not poll")):
                asyncio.run(worker.execute(row))
            assert tasks.get(tid)["status"] == "needs_review"


def test_changed_account_blocks_existing_upstream_polling():
    from app.storage import tasks, database, worker
    from app.models import CanvasVideoRequest
    from app.routers import canvas
    tid = "canvas_vid_" + uuid.uuid4().hex
    request = CanvasVideoRequest(prompt="resume", provider_id="volcengine").model_dump(mode="json")
    with patch.dict(os.environ, {"ARK_API_KEY_ACCOUNT_REF": "original-account"}):
        tasks.save({"id": tid, "type": "video", "status": "polling", "upstream_task_id": "paid-upstream"}, request)
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at='1900-01-01' WHERE id=%s", (tid,))
    row = tasks.claim("poll-guard")
    assert row["id"] == tid
    with patch.dict(os.environ, {"ARK_API_KEY_ACCOUNT_REF": "different-account"}), patch.object(canvas, "resume_canvas_video_task", side_effect=AssertionError("must not poll another account")):
        asyncio.run(worker.execute(row))
    assert tasks.get(tid)["status"] == "needs_review"
    assert tasks.get(tid)["upstream_task_id"] == "paid-upstream"


def test_input_lock_lasts_until_task_insert_commits(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from psycopg.errors import LockNotAvailable
    from app.storage import tasks, database, media
    item = asset(tmp_path)
    tid = "canvas_vid_" + uuid.uuid4().hex

    def attempt_exclusive_lock():
        try:
            with database.connection() as conn:
                conn.execute("SELECT id FROM assets WHERE id=%s FOR UPDATE NOWAIT", (item["id"],))
            return True
        except LockNotAvailable:
            return False

    with ThreadPoolExecutor(1) as pool:
        with database.connection():
            tasks.save({"id": tid, "type": "video"}, {"images": [{"url": media.stable_url(item)}]})
            assert pool.submit(attempt_exclusive_lock).result(timeout=5) is False
        assert pool.submit(attempt_exclusive_lock).result(timeout=5) is True
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET status='needs_review' WHERE id=%s", (tid,))


def test_success_cannot_commit_an_unready_output():
    from app.storage import tasks, database, uploads
    tid = "canvas_img_" + uuid.uuid4().hex
    pending = uploads.create("not-finished.png", 10, uuid.uuid4().hex)
    tasks.save({"id": tid, "type": "online-image"}, {})
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at='1800-01-01' WHERE id=%s", (tid,))
    row = tasks.claim("output-guard")
    assert row["id"] == tid
    token = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        value = tasks.get(tid)
        value.update(status="succeeded", result={"images": ["/api/media/" + pending["media_asset_id"] + "/content"]})
        with pytest.raises(HTTPException):
            tasks.save(value)
        assert tasks.get(tid)["status"] == "running"
        value.update(status="needs_review", result=None)
        tasks.save(value)
    finally:
        tasks.lease_context.reset(token)
        tasks.release(tid, row["lease_token"])
