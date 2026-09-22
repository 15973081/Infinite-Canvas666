"""Real PostgreSQL integration; run using python tools/cloud_test.py."""
import asyncio
import copy
import io
import json
import os
from pathlib import Path
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from cloud_fixtures import fake_supplier_catalog

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py for isolated PostgreSQL tests")


def canvas_value():
    return {"id": uuid.uuid4().hex, "title": "云测试", "kind": "smart", "nodes": [], "connections": [], "viewport": {"x": 0, "y": 0, "scale": 1}}


def test_schema_and_canvas_concurrent_compare_and_swap():
    from app.storage import canvases, database
    from fastapi import HTTPException
    database.migrate()
    value = canvas_value()
    canvases.save(value)
    assert value["revision"] == 1
    left, right = copy.deepcopy(value), copy.deepcopy(value)
    left["title"], right["title"] = "left", "right"

    def save(v):
        try:
            canvases.save(v)
            return 200
        except HTTPException as e:
            return e.status_code
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(save, [left, right])) == [200, 409]
    assert canvases.get(value["id"])["revision"] == 2


def test_ledger_amounts_aliases_conflicts_and_duplicate_import():
    from app.services import canvas_ledger as ledger
    cid = uuid.uuid4().hex
    log = {"id": "one", "createdAt": 1789000000000, "status": "success", "billingKind": "image", "providerId": "demo", "billingModel": "m", "cost": {"status": "priced", "kind": "image", "currency": "CNY", "amount_micros": 30001, "unit_price": "0.030001", "billing_type": "per_image", "quantity": 1}}
    with patch.object(ledger, "provider_list", return_value=[]):
        ledger.import_canvas_logs(cid, [log])
        ledger.import_canvas_logs(cid, [log])
        ledger.append_logs(cid, [copy.deepcopy(log)])
        result = ledger.read_page(cid)
        assert result["totals"]["total"] == 30001
        assert result["totals"]["records"] == 1
        assert result["logs"][0]["createdAt"] == 1789000000000
        changed = copy.deepcopy(log)
        changed["cost"]["amount_micros"] = 90000
        ledger.append_logs(cid, [changed])
        assert ledger.read_page(cid)["totals"]["total"] == 30001
    from app.storage.database import connection
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM ledger_conflicts WHERE canvas_id=%s", (cid,)).fetchone()["n"] == 1


def test_task_claim_concurrency_fencing_idempotency_and_recovery():
    from app.storage import tasks, database
    from fastapi import HTTPException
    tid = "canvas_vid_" + uuid.uuid4().hex
    value = {"id": tid, "type": "video", "status": "queued"}
    tasks.save(value, {"prompt": "test"})
    tasks.save(value, {"prompt": "test"})
    with pytest.raises(HTTPException) as conflict:
        tasks.save(value, {"prompt": "different"})
    assert conflict.value.status_code == 409
    with ThreadPoolExecutor(2) as pool:
        claims = list(pool.map(tasks.claim, ["worker-a", "worker-b"]))
    claimed = [r for r in claims if r]
    assert len(claimed) == 1 and claimed[0]["id"] == tid
    row = claimed[0]
    context = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        task = tasks.get(tid)
        task["status"] = "submitting"
        tasks.save(task)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (tid,))
        with pytest.raises(HTTPException):
            tasks.save({**task, "status": "succeeded"})
        tasks.recover_expired()
        assert tasks.get(tid)["status"] == "needs_review"
        assert tasks.claim("another") is None
    finally:
        tasks.lease_context.reset(context)


def test_task_completion_timestamp_survives_repeated_terminal_save():
    from app.storage import tasks, database
    tid, token = 'duration-' + uuid.uuid4().hex, uuid.uuid4()
    tasks.save({'id': tid, 'type': 'video', 'status': 'queued'}, {'prompt': 'test'})
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET lease_owner='duration-test',lease_token=%s,lease_until=now()+interval '1 minute' WHERE id=%s", (token, tid))
    context = tasks.lease_context.set((tid, token))
    try:
        first = tasks.save({**tasks.get(tid), 'status': 'failed', 'error': 'test failure'})
        assert first['completed_at'] >= first['created_at']
        second = tasks.save({**first, 'updated_at': first['updated_at'] + 3600})
        assert second['completed_at'] == first['completed_at']
        resumed = tasks.save({**second, 'status': 'running'})
        assert resumed['completed_at'] is None
    finally:
        tasks.lease_context.reset(context)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='cancelled',lease_owner=NULL,lease_until=NULL,lease_token=NULL WHERE id=%s", (tid,))


def test_upload_preview_references_range_expiry_and_temp_cleanup():
    from fastapi.testclient import TestClient
    from PIL import Image
    from main import app
    from app.storage import media
    auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), "red").save(buffer, format="PNG")
    raw = buffer.getvalue()
    with TestClient(app) as client:
        assert client.get("/api/canvases").status_code == 401
        response = client.post("/api/ai/upload", files={"files": ("测试.png", raw, "image/png")}, auth=auth)
        assert response.status_code == 200, response.text
        item = response.json()["files"][0]
        redirect = client.get(item["url"], auth=auth, follow_redirects=False)
        assert redirect.status_code == 307, redirect.text
        signed = redirect.headers["location"]
        assert client.get(signed).content == raw
        part = client.get(signed, headers={"Range": "bytes=0-7"})
        assert part.status_code == 206 and part.content == raw[:8]
        assert client.get(signed + "bad").status_code == 403
        expired = f"/api/media/{item['media_asset_id']}/signed?expires=1&signature=bad"
        assert client.get(expired).status_code == 403
        assert client.post(f"/api/media/uploads/{item['media_asset_id']}/complete", auth=auth).json()["status"] == "ready"
        preview = client.get("/api/media-preview", params={"url": item["url"]}, auth=auth)
        assert preview.status_code == 200, preview.text
        with media.operation_scope():
            from app.services.media import reference_to_data_url
            assert reference_to_data_url({"url": item["url"]}).startswith("data:image/")
        assert not list(media.temp_root().iterdir())


def test_cloud_login_session_uses_isolated_auth_database():
    from fastapi.testclient import TestClient
    from main import app
    assert Path(os.environ["AUTH_DB_PATH"]).parent == Path(os.environ["APP_RUNTIME_DIR"]).parent
    with TestClient(app) as client:
        response = client.post("/api/auth/login", json={
            "username": os.environ["CLOUD_ACCESS_USER"],
            "password": os.environ["CLOUD_ACCESS_PASSWORD"],
        }, headers={"Origin": os.environ["PUBLIC_BASE_URL"]})
        assert response.status_code == 200, response.text
        assert client.get("/api/canvases").status_code == 200
        assert client.post("/api/auth/logout", headers={"Origin": os.environ["PUBLIC_BASE_URL"]}).status_code == 200
        assert client.get("/api/canvases").status_code == 401


def test_cloud_entry_protects_pages_api_and_realtime_connections():
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    from main import app
    origin = os.environ["PUBLIC_BASE_URL"]
    with TestClient(app) as client:
        assert client.get("/static/smart-canvas.html", follow_redirects=False).status_code == 303
        assert client.get("/api/history/page").status_code == 401
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/stats", headers={"Origin": origin}):
                pass
        assert client.post("/api/auth/login", json={"username": os.environ["CLOUD_ACCESS_USER"],
                           "password": os.environ["CLOUD_ACCESS_PASSWORD"]}, headers={"Origin": origin}).status_code == 200
        with client.websocket_connect("/ws/stats", headers={"Origin": origin}):
            pass
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/stats", headers={"Origin": "https://untrusted.invalid"}):
                pass
        assert client.post("/api/history/delete", json={"timestamp": 0}, headers={"Origin": "https://untrusted.invalid"}).status_code == 403
        assert client.post("/api/auth/logout", headers={"Origin": origin}).status_code == 200
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/stats", headers={"Origin": origin}):
                pass


def test_canvas_api_save_backup_restore_and_media_index():
    from fastapi.testclient import TestClient
    from main import app
    from app.storage import media
    from PIL import Image
    auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
    raw = io.BytesIO()
    Image.new("RGB", (12, 12), "blue").save(raw, format="PNG")
    with TestClient(app) as client:
        item = client.post("/api/ai/upload", files={"files": ("blue.png", raw.getvalue(), "image/png")}, auth=auth).json()["files"][0]
        for kind in ("classic", "smart"):
            response = client.post("/api/canvases", json={"title": kind, "kind": kind}, auth=auth)
            assert response.status_code == 200, response.text
            canvas = response.json()["canvas"]
            url = "/api/canvases/" + canvas["id"]
            body = {"nodes": [{"id": "node-1", "type": "image", "url": item["url"]}], "connections": [], "base_revision": canvas["revision"]}
            saved = client.put(url, json=body, auth=auth)
            assert saved.status_code == 200, saved.text
            assert saved.json()["canvas"]["nodes"][0]["media_asset_id"] == item["media_asset_id"]
            assert client.put(url, json=body, auth=auth).status_code == 409
            assert client.put(url, json={"nodes": [], "connections": []}, auth=auth).status_code == 400
            backup = client.post(url + "/backup", auth=auth).json()
            latest = saved.json()["canvas"]
            client.put(url, json={"nodes": [], "connections": [], "base_revision": latest["revision"]}, auth=auth).raise_for_status()
            restored = client.post(url + "/backups/" + backup["filename"] + "/restore", auth=auth)
            assert restored.status_code == 200 and len(restored.json()["canvas"]["nodes"]) == 1
            assert client.get(url + "/backups", auth=auth).json()["backups"]
            client.delete(url, auth=auth).raise_for_status()
            assert media.get_asset(item["media_asset_id"])["status"] == "ready"


def test_real_ffmpeg_trim_and_workflow_zip_round_trip(tmp_path):
    import shutil
    import subprocess
    import zipfile
    from fastapi.testclient import TestClient
    from main import app
    from app.storage import media
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg, "FFmpeg is required for cloud media acceptance"
    path = tmp_path / "source.mp4"
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x120:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)], check=True, capture_output=True)
    auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
    with TestClient(app) as client:
        uploaded = client.post("/api/ai/upload", files={"files": ("source.mp4", path.read_bytes(), "video/mp4")}, auth=auth).json()["files"][0]
        trimmed = client.post("/api/smart-canvas/video-trim", json={"url": uploaded["url"], "start_seconds": 0.2, "end_seconds": 1.2}, auth=auth)
        assert trimmed.status_code == 200, trimmed.text
        result = trimmed.json()
        assert media.get_asset(result["url"])["status"] == "ready"
        payload = {"nodes": [{"id": "keep-id", "type": "video", "url": result["url"]}], "connections": [], "include_resources": True}
        archive = client.post("/api/canvas-workflows/export", json=payload, auth=auth)
        assert archive.status_code == 200, archive.text
        with zipfile.ZipFile(io.BytesIO(archive.content)) as package:
            workflow = json.loads(package.read("workflow.json"))
            assert len(workflow["resources"]) == 1
            assert package.read(workflow["resources"][0]["archive"])
        imported = client.post("/api/canvas-workflows/import", files={"file": ("workflow.zip", archive.content, "application/zip")}, auth=auth)
        assert imported.status_code == 200, imported.text
        assert imported.json()["nodes"][0]["id"] == "keep-id"
        assert media.get_asset(imported.json()["nodes"][0]["url"])["status"] == "ready"
        assert not list(media.temp_root().iterdir())


def test_worker_runs_fake_supplier_once_and_resumes_upstream_without_submission(fake_supplier_catalog):
    from app.storage import tasks, worker, database
    from app.models import CanvasVideoRequest
    from app.routers import canvas as routes
    from app.state import CANVAS_TASKS
    tid = "canvas_vid_" + uuid.uuid4().hex
    payload = CanvasVideoRequest(prompt="simulation", provider_id="comfly", model="mock-video").model_dump(mode="json")
    payload["client_task_id"] = tid
    tasks.save({"id": tid, "type": "video", "status": "queued"}, payload)
    calls = []

    async def fake_impl(payload, on_submitted=None):
        calls.append("submitted")
        on_submitted("supplier-123", "https://example.test/jobs", "video")
        raise asyncio.CancelledError()

    async def interrupt():
        with patch.object(routes, "canvas_video_impl", side_effect=fake_impl):
            with pytest.raises(asyncio.CancelledError):
                await worker.execute(tasks.claim("before-crash"))
    asyncio.run(interrupt())
    CANVAS_TASKS.clear()
    assert tasks.get(tid)["upstream_task_id"] == "supplier-123"
    assert tasks.get(tid)["status"] == "polling"
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET available_at=now() WHERE id=%s", (tid,))

    async def fake_resume(task_id, request):
        calls.append("resumed")
        value = tasks.get(task_id)
        value.update(status="succeeded", result={"videos": [], "task_id": "supplier-123"})
        tasks.save(value)

    async def resume():
        with patch.object(routes, "canvas_video_impl", side_effect=AssertionError("duplicate paid submit")), patch.object(routes, "resume_canvas_video_task", side_effect=fake_resume):
            await worker.execute(tasks.claim("after-crash"))
    asyncio.run(resume())
    assert calls == ["submitted", "resumed"]
    assert tasks.get(tid)["status"] == "succeeded"


def test_ledger_recovery_preview_rolls_back():
    from app.storage import canvases, backups
    from app.services import canvas_ledger as ledger, canvas_ledger_recovery as recovery
    value = canvas_value()
    value["logs"] = [{"id": "snapshot-log", "createdAt": 1789000000001, "status": "success", "billingKind": "image", "cost": {"status": "priced", "kind": "image", "currency": "CNY", "amount_micros": 45}}]
    canvases.save(value)
    backups.create(value["id"])
    with patch.object(ledger, "provider_list", return_value=[]):
        preview = recovery.recover(value["id"])
        assert ledger.read_page(value["id"])["totals"]["records"] == 0
        assert preview["after"]["total"] == 45
        applied = recovery.recover(value["id"], preview["preview_token"])
        assert applied["applied"]
        assert ledger.read_page(value["id"])["totals"]["total"] == 45


def test_repeatable_migration_keeps_five_ledger_tables_and_legacy_aliases(tmp_path):
    from app.storage.migration import migrate_legacy
    from app.services import canvas_ledger as ledger
    from app.storage import media, database
    root = tmp_path / "backup"
    (root / "data/canvases").mkdir(parents=True)
    (root / "assets/input").mkdir(parents=True)
    (root / "assets/library").mkdir(parents=True)
    (root / "assets/input/same.png").write_bytes(b"input-file")
    (root / "assets/library/same.png").write_bytes(b"library-file")
    cid = uuid.uuid4().hex
    value = {**canvas_value(), "id": cid, "nodes": [{"id": "legacy-node", "url": "/assets/input/same.png", "prompt": "/assets/input/same.png", "registrations": {"volcengine": {"asset_uri": "asset://keep"}}}]}
    (root / "data/canvases" / (cid + ".json")).write_text(json.dumps(value), encoding="utf-8")
    (root / "data/canvases/backups" / cid).mkdir(parents=True)
    (root / "data/canvases/backups" / cid / "old.json").write_text(json.dumps(value), encoding="utf-8")
    (root / "conversations" / cid).mkdir(parents=True)
    (root / "conversations" / cid / "chat.json").write_text(json.dumps({"messages": [{"url": "/assets/input/same.png"}]}), encoding="utf-8")
    (root / "data/maintenance_state.json").write_text(json.dumps({"mode": "normal", "message": "legacy maintenance"}), encoding="utf-8")
    legacy_log = {"id": "legacy", "createdAt": 1789000000000, "status": "success", "billingKind": "image", "cost": {"status": "priced", "kind": "image", "currency": "CNY", "amount_micros": 912345}}
    with patch.dict(os.environ, {"DATABASE_BACKEND": "local", "CANVAS_LEDGER_DB_PATH": str(root / "data/canvas_ledger.sqlite3")}), patch.object(ledger, "provider_list", return_value=[]):
        ledger.import_canvas_logs(cid, [legacy_log])
        altered = copy.deepcopy(legacy_log)
        altered["cost"]["amount_micros"] = 1
        ledger.append_logs(cid, [altered])
    from app.services import canvas_tasks as old_tasks
    legacy_task_id = "canvas_img_" + uuid.uuid4().hex
    with patch.dict(os.environ, {"DATABASE_BACKEND": "local", "CANVAS_TASK_DB_PATH": str(root / "data/canvas_tasks.sqlite3")}):
        old_tasks.save_canvas_task({"id": legacy_task_id, "type": "online-image", "status": "running", "created_at": 1789000000.25,
                                   "billing_price": {"unit_price": "0.030001"}, "canvas_id": cid}, {"prompt": "legacy request"})
    original = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
    preview = migrate_legacy(root, report_path=tmp_path / "preview.json")
    assert preview["status"] == "complete"
    assert media.get_asset("/assets/input/same.png") is None
    # The API startup tests have already created maintenance state in this run's
    # disposable schema. A first migration deliberately requires an empty target.
    from app.storage import documents
    previous_maintenance = documents.get("maintenance")
    documents.delete("maintenance", "default")
    applied = migrate_legacy(root, apply=True, report_path=tmp_path / "applied.json")
    again = migrate_legacy(root, apply=True, report_path=tmp_path / "again.json")
    assert applied["status"] == again["status"] == "complete"
    assert media.get_asset("/assets/input/same.png")["id"] != media.get_asset("/assets/library/same.png")["id"]
    assert ledger.read_page(cid)["totals"]["total"] == 912345
    from app.storage import tasks
    assert tasks.request(legacy_task_id)["prompt"] == "legacy request"
    assert tasks.get(legacy_task_id)["created_at"] == 1789000000.25
    assert tasks.get(legacy_task_id)["billing_price"]["unit_price"] == "0.030001"
    assert tasks.get(legacy_task_id)["status"] == "needs_review"
    assert tasks.get(legacy_task_id)["legacy_status"] == "running"
    tasks.recover_expired()
    assert tasks.get(legacy_task_id)["status"] == "needs_review"
    report = json.loads((tmp_path / "again.json").read_text(encoding="utf-8"))
    assert len(report["ledger"]["tables"]) == 5
    assert report["ledger"]["tables"]["ledger_conflicts"] == 1
    from app.storage.canvases import get
    node = get(cid)["nodes"][0]
    assert node["url"].startswith("/assets/cloud/") and node["prompt"] == "/assets/input/same.png"
    assert node["registrations"]["volcengine"]["asset_uri"] == "asset://keep"
    from app.storage import documents
    assert documents.get("canvas_backup", cid + "/old.json")["nodes"][0]["url"] == node["url"]
    assert documents.get("conversation", cid + "/chat")["messages"][0]["url"] == node["url"]
    assert documents.get("maintenance")["message"] == "legacy maintenance"
    assert report["inventory"]["canvas_backup"]["files"] == 1
    assert report["inventory"]["ledger_conflicts"]["records"] == 1
    for relative, data in original.items():
        assert (root / relative).read_bytes() == data
    import sqlite3
    with sqlite3.connect(root / "data/canvas_tasks.sqlite3") as connection:
        task_json = json.loads(connection.execute("SELECT task_json FROM canvas_tasks WHERE id=?", (legacy_task_id,)).fetchone()[0])
        task_json["billing_price"]["unit_price"] = "99.9"
        connection.execute("UPDATE canvas_tasks SET task_json=? WHERE id=?", (json.dumps(task_json), legacy_task_id))
    with pytest.raises(ValueError, match="Migration source changed: task:"):
        migrate_legacy(root, apply=True, report_path=tmp_path / "changed-task.json")
    assert tasks.get(legacy_task_id)["billing_price"]["unit_price"] == "0.030001"
    (root / "assets/input/same.png").write_bytes(b"changed")
    with pytest.raises(Exception):
        migrate_legacy(root, apply=True, report_path=tmp_path / "conflict.json")
    if previous_maintenance is not None:
        documents.put("maintenance", "default", previous_maintenance)


def test_document_conflict_and_failed_media_publish_are_not_silently_accepted(tmp_path):
    from threading import Barrier
    from fastapi import HTTPException
    from app.storage import documents, media, database
    key = uuid.uuid4().hex
    documents.put("test-document", key, {"value": 1})
    barrier = Barrier(2)

    def edit(number):
        with media.operation_scope():
            documents.get("test-document", key)
            barrier.wait()
            try:
                documents.put("test-document", key, {"value": number})
                return 200
            except HTTPException as exc:
                return exc.status_code
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(edit, [2, 3])) == [200, 409]
    path = tmp_path / "object.bin"
    path.write_bytes(b"object bytes")
    aid = "ast_" + uuid.uuid4().hex
    with patch.object(media.FilesystemStore, "put", side_effect=OSError("simulated offline object service")):
        with pytest.raises(OSError):
            media.publish(path, asset_id=aid)
    assert media.get_asset(aid, ready=False)["status"] == "uploading"
    with pytest.raises(HTTPException):
        media.get_asset(aid)
    asset = media.publish(path, asset_id=aid)
    with media.operation_scope():
        assert Path(media.materialize(aid)).read_bytes() == b"object bytes"
    assert asset["status"] == "ready"
    path.write_bytes(b"changed")
    with pytest.raises(HTTPException):
        media.publish(path, asset_id=aid)


def test_real_pg_dump_restore_keeps_object_versions_readable(tmp_path):
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo
    import subprocess
    import zipfile
    from fastapi.testclient import TestClient
    from main import app
    from app.storage import backup, database, canvases, media
    aid = "ast_" + uuid.uuid4().hex
    path = tmp_path / "restore.bin"
    path.write_bytes(b"restored immutable object")
    asset = media.publish(path, asset_id=aid)
    values = []
    for kind in ("classic", "smart"):
        value = canvas_value()
        value["kind"] = kind
        value["nodes"] = [{"id": "restored-node", "url": media.stable_url(asset)}]
        canvases.save(value)
        values.append(value)
    dump = tmp_path / "database.dump"
    exported = backup.dump(dump)
    assert exported["objects"] >= 1
    assert backup.verify(dump)["format_version"] == 2
    restored_objects = tmp_path / "independent-objects"
    assert backup.restore_objects(dump, restored_objects)["objects"] == exported["objects"]
    old_url = os.environ["DATABASE_URL"]
    restore_db = "cloud_restore_" + uuid.uuid4().hex
    with psycopg.connect(make_conninfo(old_url, dbname="postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(restore_db)))
        try:
            restored_url = make_conninfo(old_url, dbname=restore_db)
            subprocess.run([backup.pg_tool("pg_restore"), "--exit-on-error", "--no-owner", "--dbname=" + restore_db, str(dump)], env=backup.pg_environment(restored_url), check=True, capture_output=True)
            database.close()
            with patch.dict(os.environ, {"DATABASE_URL": restored_url, "OBJECT_STORE_ROOT": str(restored_objects)}):
                database.check()
                assert canvases.get(value["id"])["nodes"][0]["id"] == "restored-node"
                assert media.get_asset(aid)["object_version_id"] == asset["object_version_id"]
                assert media.store().root.samefile(restored_objects)
                with media.operation_scope():
                    assert Path(media.materialize(aid)).read_bytes() == path.read_bytes()
                auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
                with TestClient(app) as client:
                    for value in values:
                        response = client.get("/api/canvases/" + value["id"], auth=auth)
                        assert response.status_code == 200, response.text
                        restored = response.json()["canvas"]
                        assert restored["kind"] == value["kind"]
                        archive = client.post("/api/canvas-workflows/export", auth=auth, json={
                            "nodes": restored["nodes"], "connections": restored["connections"], "include_resources": True})
                        assert archive.status_code == 200, archive.text
                        with zipfile.ZipFile(io.BytesIO(archive.content)) as package:
                            resources = json.loads(package.read("workflow.json"))["resources"]
                            assert len(resources) == 1
                            assert package.read(resources[0]["archive"]) == path.read_bytes()
                database.close()
        finally:
            assert restore_db.startswith("cloud_restore_") and len(restore_db) == 46
            admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(restore_db)))


def test_backup_detects_corruption_and_never_overwrites(tmp_path):
    from app.storage import backup, media
    path = tmp_path / "source.bin"
    path.write_bytes(b"independent recovery")
    asset = media.publish(path)
    dump = tmp_path / "database.dump"
    backup.dump(dump)
    with pytest.raises(ValueError, match="overwrite"):
        backup.dump(dump)
    manifest = backup.verify(dump)
    entry = next(a for a in manifest["objects"] if a["id"] == asset["id"])
    saved = dump.with_suffix(".objects") / entry["backup_file"]
    saved.write_bytes(b"corrupt backup bytes")
    destination = tmp_path / "restored"
    with pytest.raises(ValueError, match="checksum"):
        backup.restore_objects(dump, destination)
    assert not destination.exists()
    saved.write_bytes(path.read_bytes())
    destination.mkdir()
    marker = destination / "keep.txt"
    marker.write_text("existing data")
    with pytest.raises(ValueError, match="must not exist"):
        backup.restore_objects(dump, destination)
    assert marker.read_text() == "existing data"
    with dump.open("ab") as stream:
        stream.write(b"corruption")
    with pytest.raises(ValueError, match="Database backup checksum"):
        backup.verify(dump)


def test_failed_object_backup_has_no_completion_manifest(tmp_path):
    from app.storage import backup, media
    path = tmp_path / "source.bin"
    path.write_bytes(b"object outage")
    media.publish(path)
    dump = tmp_path / "failed.dump"
    with patch.object(media.FilesystemStore, "download", side_effect=OSError("object unavailable")):
        with pytest.raises(OSError, match="unavailable"):
            backup.dump(dump)
    assert not dump.with_suffix(".objects.json").exists()
    assert not dump.exists()
    with pytest.raises(FileNotFoundError):
        backup.verify(dump)


def test_object_restore_rejects_manifest_path_escape(tmp_path):
    from app.storage import backup, media
    path = tmp_path / "source.bin"
    path.write_bytes(b"bounded restore")
    asset = media.publish(path)
    dump = tmp_path / "database.dump"
    backup.dump(dump)
    manifest_path = dump.with_suffix(".objects.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entry = next(a for a in manifest["objects"] if a["id"] == asset["id"])
    entry["backup_file"] = "../source.bin"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid or duplicate"):
        backup.verify(dump)
    entry["backup_file"] = f"{manifest['objects'].index(entry):08d}.blob"
    entry["object_key"] = "../../escape"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    destination = tmp_path / "restored"
    with pytest.raises(ValueError, match="escaped private root"):
        backup.restore_objects(dump, destination)
    assert not destination.exists()


def test_tos_adapter_uses_fixed_versions_and_public_signing_endpoint(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import Mock
    from app.storage import media
    path = tmp_path / "file.bin"
    path.write_bytes(b"test")
    client = Mock()
    client.put_object_from_file.return_value = SimpleNamespace(version_id="fixed-version")
    client.head_object.return_value = SimpleNamespace(content_length=4)
    client.pre_signed_url.return_value = SimpleNamespace(signed_url="https://public.example/object?signature=test")
    settings = {"TOS_BUCKET": "test-private", "TOS_REGION": "cn-beijing", "TOS_INTERNAL_ENDPOINT": "https://internal.example", "TOS_PUBLIC_ENDPOINT": "https://public.example", "TOS_ACCESS_KEY": "simulation-ak", "TOS_SECRET_KEY": "simulation-sk"}
    with patch.dict(os.environ, settings), patch("tos.TosClientV2", return_value=client):
        store = media.TosStore()
        assert store.put("media/default/test.bin", path, "application/octet-stream") == "fixed-version"
        assert client.put_object_from_file.call_args.kwargs["forbid_overwrite"] is True
        asset = {"bucket": "test-private", "object_key": "media/default/test.bin", "object_version_id": "fixed-version", "size_bytes": 4}
        store.download(asset, path)
        assert client.get_object_to_file.call_args.kwargs["version_id"] == "fixed-version"
        assert store.signed_url(asset, 3600).startswith("https://public.example/")
        assert client.pre_signed_url.call_args.kwargs["query"] == {
            "versionId": "fixed-version", "response-cache-control": "private, no-store"}
        assert client.pre_signed_url.call_args.kwargs["alternative_endpoint"] == "https://public.example"
        client.put_object_from_file.return_value = SimpleNamespace(version_id="null")
        with pytest.raises(RuntimeError, match="versioning"):
            store.put("key", path, "application/octet-stream")


def test_image_worker_publishes_result_and_maintenance_blocks_claiming(fake_supplier_catalog):
    from app.storage import tasks, worker, documents, media
    from app.routers import image as image_routes
    from app.models import OnlineImageRequest
    tid = "canvas_img_" + uuid.uuid4().hex
    request = OnlineImageRequest(prompt="simulation", provider_id="comfly", model="mock-image").model_dump(mode="json")
    tasks.save({"id": tid, "type": "online-image", "status": "queued"}, request)
    documents.put("maintenance", "default", {"mode": "draining"})
    assert tasks.claim("paused") is None
    documents.put("maintenance", "default", {"mode": "normal"})

    async def fake_image(payload):
        from PIL import Image
        from app.services.media import output_path_for, output_url_for
        assert tasks.get(tid)["status"] == "submitting"
        Image.new("RGB", (16, 16), "green").save(output_path_for("worker.png"))
        return {"images": [output_url_for("worker.png")]}

    async def run():
        with patch.object(image_routes, "build_online_image_result", side_effect=fake_image):
            await worker.execute(tasks.claim("image-worker"))
    asyncio.run(run())
    value = tasks.get(tid)
    assert value["status"] == "succeeded"
    assert media.get_asset(value["result"]["images"][0])["status"] == "ready"
    assert not list(media.temp_root().iterdir())


def test_real_tos_sdk_signs_versioned_url_offline():
    from urllib.parse import urlsplit, parse_qs
    from app.storage import media
    settings = {"TOS_BUCKET": "canvas-offline-test", "TOS_REGION": "cn-beijing", "TOS_INTERNAL_ENDPOINT": "https://tos-cn-beijing.ivolces.com", "TOS_PUBLIC_ENDPOINT": "https://tos-cn-beijing.volces.com", "TOS_ACCESS_KEY": "offline-test-ak", "TOS_SECRET_KEY": "offline-test-sk"}
    with patch.dict(os.environ, settings):
        store = media.TosStore()
        url = store.signed_url({"object_key": "media/default/test.png", "object_version_id": "fixed-version"}, 300)
        parsed = urlsplit(url)
        assert parsed.scheme == "https"
        assert parsed.hostname == "canvas-offline-test.tos-cn-beijing.volces.com"
        query = parse_qs(parsed.query)
        assert query["versionId"] == ["fixed-version"]
        assert query["X-Tos-Expires"] == ["300"]
        assert query["X-Tos-Signature"]


def test_expired_worker_cannot_publish_ready_object(tmp_path):
    from app.storage import tasks, media, database
    from fastapi import HTTPException
    tid = "canvas_vid_" + uuid.uuid4().hex
    tasks.save({"id": tid, "type": "video", "status": "queued"}, {"prompt": "lease expiry"})
    row = tasks.claim("old-worker")
    aid = "ast_" + uuid.uuid4().hex
    path = tmp_path / "result.bin"
    path.write_bytes(b"late result")
    with database.connection() as conn:
        conn.execute("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=%s", (tid,))
    context = tasks.lease_context.set((tid, row["lease_token"]))
    try:
        with pytest.raises(HTTPException) as expired:
            media.publish(path, asset_id=aid)
        assert expired.value.status_code == 409
        assert media.get_asset(aid, ready=False)["status"] != "ready"
    finally:
        tasks.lease_context.reset(context)
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=%s", (tid,))


def test_migration_preserves_json_only_tasks_and_sqlite_precedence(tmp_path):
    import sqlite3
    from app.storage import tasks, documents
    from app.storage.migration import migrate_legacy
    source = tmp_path / "legacy"
    (source / "data").mkdir(parents=True)
    identity = uuid.uuid4().hex
    json_id, shared_id = "json-" + identity, "shared-" + identity
    cached = {"id": shared_id, "type": "video", "status": "failed", "error": "old cache"}
    only_json = {"id": json_id, "type": "online-image", "status": "queued", "api_key": "must-not-import", "model": "old-model"}
    (source / "data/canvas_tasks.json").write_text(json.dumps({"tasks": [only_json, cached]}), encoding="utf8")
    with sqlite3.connect(source / "data/canvas_tasks.sqlite3") as conn:
        conn.execute("CREATE TABLE canvas_tasks (id TEXT,created_at REAL,task_json TEXT,request_json TEXT)")
        conn.execute("INSERT INTO canvas_tasks VALUES (?,1,?,?)", (shared_id, json.dumps(dict(cached, status="succeeded", error="")), json.dumps({"prompt": "original request", "provider_id": "retired-provider"})))
    report_path = tmp_path / "migration.json"
    with patch("app.providers.registry.managed_providers_enabled", return_value=True), patch("app.providers.registry.load_api_providers", return_value=[]):
        migrate_legacy(source, apply=True, report_path=report_path)
    report = json.loads(report_path.read_text(encoding="utf8"))
    assert "data/canvas_tasks.json" not in report["unknown_json"]
    assert report["tasks"] == [shared_id, json_id]
    assert report["task_json_shadowed"] == [shared_id]
    assert tasks.get(json_id)["status"] == "needs_review"
    assert tasks.get(json_id)["legacy_status"] == "queued"
    assert tasks.get(json_id)["model"] == "old-model"
    assert "api_key" not in tasks.get(json_id)
    assert tasks.get(shared_id)["status"] == "succeeded"
    assert tasks.request(shared_id)["prompt"] == "original request"
    assert tasks.request(shared_id)["provider_id"] == "retired-provider"
    from app.storage.migration import digest
    source_id = digest({"source": str(source.resolve()), "namespace": os.getenv("ASSET_SOURCE_NAMESPACE", "local")})[:24]
    assert documents.get("legacy_task_snapshot", source_id + ":" + shared_id)["error"] == "old cache"
    before = tasks.get(json_id)
    migrate_legacy(source, apply=True, report_path=tmp_path / "again.json")
    assert tasks.get(json_id) == before
