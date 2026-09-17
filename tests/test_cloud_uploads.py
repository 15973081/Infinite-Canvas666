"""Staged upload acceptance on real PostgreSQL and private local objects."""
import hashlib
import os
from pathlib import Path
import uuid
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as client:
        client.auth = (os.environ["CLOUD_ACCESS_USER"], os.environ["CLOUD_ACCESS_PASSWORD"])
        yield client


def start(client, raw, name="data.bin", key=None):
    response = client.post("/api/media/uploads", json={"name": name, "size": len(raw), "idempotency_key": key or uuid.uuid4().hex})
    assert response.status_code == 200, response.text
    value = response.json()
    return "/api/media/uploads/" + value["media_asset_id"], value


def send_part(client, base, raw, number=1):
    response = client.post(base + f"/parts/{number}", json={"sha256": hashlib.sha256(raw).hexdigest()})
    assert response.status_code == 200, response.text
    signed = response.json()
    put = client.put(signed["url"], content=raw, headers=signed["headers"], auth=None)
    assert put.status_code == 200, put.text
    confirmed = client.post(base + f"/parts/{number}/complete")
    assert confirmed.status_code == 200, confirmed.text
    return signed


def test_multipart_resume_and_ready_immutability(client):
    from app.storage import media
    raw = b"a" * (8 * 1024 * 1024) + b"last-part"
    key = uuid.uuid4().hex
    base, value = start(client, raw, key=key)
    assert value["part_count"] == 2
    signed = send_part(client, base, raw[:value["part_size"]])
    assert client.post(base + "/complete").status_code == 409
    assert client.get(f"/api/media/{value['media_asset_id']}/content").status_code == 404
    again_base, again = start(client, raw, key=key)
    assert again_base == base and [p["part_number"] for p in again["parts"]] == [1]
    send_part(client, base, raw[value["part_size"]:], 2)
    ready = client.post(base + "/complete")
    assert ready.status_code == 200, ready.text
    asset = media.get_asset(value["media_asset_id"])
    assert asset["sha256"] == hashlib.sha256(raw).hexdigest()
    assert asset["staging_version_id"] and asset["object_version_id"]
    assert client.get(ready.json()["url"]).content == raw
    assert client.post(base + "/complete").json() == ready.json()
    assert client.put(signed["url"], content=raw[:value["part_size"]], auth=None).status_code == 409
    assert client.delete(base).status_code == 409
    assert media.get_asset(value["media_asset_id"])["object_version_id"] == asset["object_version_id"]


def test_upload_declaration_and_part_bounds(client):
    from app.storage import media
    with patch.dict(os.environ, {"MEDIA_MAX_FILE_BYTES": "4"}):
        response = client.post("/api/media/uploads", json={"name": "huge.bin", "size": 5, "idempotency_key": uuid.uuid4().hex})
        assert response.status_code == 413
    base, _ = start(client, b"four")
    digest = hashlib.sha256(b"four").hexdigest()
    for number in (0, 2):
        assert client.post(base + f"/parts/{number}", json={"sha256": digest}).status_code == 400
    signed = client.post(base + "/parts/1", json={"sha256": digest}).json()
    assert client.put(signed["url"], content=b"five!", auth=None).status_code == 413
    assert client.put(signed["url"], content=b"bad!", auth=None).status_code == 422
    assert client.put(signed["url"] + "bad", content=b"four", auth=None).status_code == 403
    assert not client.get(base).json()["parts"]
    send_part(client, base, b"four")
    assert client.post(base + "/parts/1", json={"sha256": "a"*64}).status_code == 409
    assert not list(media.temp_root().iterdir())


@pytest.mark.parametrize("extension", ["png", "webp"])
def test_staged_content_is_validated_before_publication(client, extension):
    from app.storage import media
    base, upload = start(client, b"not an image", name="fake." + extension)
    send_part(client, base, b"not an image")
    assert client.post(base + "/complete").status_code == 422
    assert media.get_asset(upload["media_asset_id"], ready=False)["status"] == "verifying"
    assert client.delete(base).status_code == 200
    assert client.post(base + "/complete").status_code == 409


def test_final_object_failure_resumes_fixed_staging_version(client):
    from app.storage import media
    base, upload = start(client, b"durable upload")
    send_part(client, base, b"durable upload")
    original = media.FilesystemStore.put

    def fail_final(store, key, path, content_type):
        if key.startswith("media/"):
            raise OSError("simulated publish outage")
        return original(store, key, path, content_type)

    with patch.object(media.FilesystemStore, "put", fail_final), pytest.raises(OSError):
        client.post(base + "/complete")
    staged_version = media.get_asset(upload["media_asset_id"], ready=False)["staging_version_id"]
    assert staged_version
    completed = client.post(base + "/complete")
    assert completed.status_code == 200, completed.text
    assert media.get_asset(upload["media_asset_id"])["staging_version_id"] == staged_version


def test_parallel_confirmation_fences_second_publisher(client):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from app.storage import media
    base, _ = start(client, b"parallel")
    send_part(client, base, b"parallel")
    writing, resume = Event(), Event()
    original = media.FilesystemStore.put

    def pause_final(store, key, path, content_type):
        if key.startswith("media/"):
            writing.set()
            assert resume.wait(5)
        return original(store, key, path, content_type)

    with patch.object(media.FilesystemStore, "put", pause_final), ThreadPoolExecutor(1) as pool:
        first = pool.submit(client.post, base + "/complete")
        try:
            assert writing.wait(5)
            assert client.post(base + "/complete").status_code == 409
        finally:
            resume.set()
        assert first.result().status_code == 200
    assert client.post(base + "/complete").status_code == 200


def test_expired_staging_cleanup_preserves_originals(client):
    from app.storage import uploads, media, database
    base, value = start(client, b"keep original")
    send_part(client, base, b"keep original")
    ready = client.post(base + "/complete").json()
    unfinished, pending = start(client, b"expire")
    signed = send_part(client, unfinished, b"expire")
    with database.connection() as conn:
        conn.execute("UPDATE media_uploads SET expires_at=now()-interval '2 hours' WHERE asset_id=ANY(%s)",
                     ([value["media_asset_id"], pending["media_asset_id"]],))
    assert client.put(signed["url"], content=b"expire", auth=None).status_code == 410
    with database.connection() as conn:
        conn.execute("UPDATE assets SET upload_expires_at=now()-interval '2 hours' WHERE id=ANY(%s)", ([value['media_asset_id'],pending['media_asset_id']],))
    assert uploads.cleanup(apply=True)['completed'] == 2
    assert uploads.cleanup(apply=True)['completed'] == 0
    assert client.get(ready["url"]).content == b"keep original"
    assert client.get(unfinished).json()["status"] == "aborted"
    assert not (media.store().root / "staging/default" / value["media_asset_id"]).exists()


def test_preview_variant_is_a_derived_asset(client):
    from PIL import Image
    import io
    from app.storage import database
    stream = io.BytesIO()
    Image.new("RGB", (100, 60), "blue").save(stream, format="PNG")
    base, value = start(client, stream.getvalue(), "blue.png")
    send_part(client, base, stream.getvalue())
    assert client.post(base + "/complete").status_code == 200
    response = client.get(f"/api/media/{value['media_asset_id']}/content?variant=preview")
    assert response.status_code == 200, response.text
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM assets WHERE parent_asset_id=%s AND role='preview'", (value["media_asset_id"],)).fetchone()["n"] == 1


def test_tos_multipart_signing_binds_size_and_part(client):
    from types import SimpleNamespace
    from urllib.parse import urlsplit, parse_qs
    from unittest.mock import Mock
    from app.storage import media, uploads
    settings = {"MEDIA_BACKEND": "tos", "TOS_BUCKET": "canvas-offline-test", "TOS_REGION": "cn-beijing",
                "TOS_INTERNAL_ENDPOINT": "https://tos-cn-beijing.ivolces.com", "TOS_PUBLIC_ENDPOINT": "https://tos-cn-beijing.volces.com",
                "TOS_ACCESS_KEY": "offline-ak", "TOS_SECRET_KEY": "offline-sk"}
    with patch.dict(os.environ, settings):
        store = media.TosStore()
        store.client.create_multipart_upload = Mock(return_value=SimpleNamespace(upload_id="native-upload"))
        store.client.list_parts = Mock(return_value=SimpleNamespace(parts=[SimpleNamespace(part_number=1, size=4, etag="fixed-etag")]))
        with patch.object(media, "store", return_value=store):
            value = uploads.create("tos.bin", 4, uuid.uuid4().hex)
            signed = uploads.sign_part(value["media_asset_id"], 1, hashlib.sha256(b"test").hexdigest())
            parsed = urlsplit(signed["url"])
            query = parse_qs(parsed.query)
            assert parsed.hostname == "canvas-offline-test.tos-cn-beijing.volces.com"
            assert query["uploadId"] == ["native-upload"]
            assert query["partNumber"] == ["1"]
            assert "content-length" in query["X-Tos-SignedHeaders"][0]
            assert "content-type" in query["X-Tos-SignedHeaders"][0]
            uploads.confirm_part(value["media_asset_id"], 1)
            assert uploads.parts(value["media_asset_id"])[0]["etag"] == "fixed-etag"


def test_expired_finalizer_cannot_publish_ready_asset(client):
    from app.storage import media, database
    base, value = start(client, b"old publisher")
    send_part(client, base, b"old publisher")
    original = media.FilesystemStore.put

    def expire(store, key, path, content_type):
        version = original(store, key, path, content_type)
        if key.startswith("media/"):
            with database.connection() as conn:
                conn.execute("UPDATE media_uploads SET lease_until=now()-interval '1 second' WHERE asset_id=%s", (value["media_asset_id"],))
        return version

    with patch.object(media.FilesystemStore, "put", expire):
        assert client.post(base + "/complete").status_code == 409
    assert media.get_asset(value["media_asset_id"], ready=False)["status"] == "verifying"
    assert client.post(base + "/complete").status_code == 200


def test_tos_lost_complete_response_recovers_staging_without_resubmission(client):
    from types import SimpleNamespace
    from unittest.mock import Mock
    from app.storage import media, uploads
    from tos.exceptions import TosServerError
    raw = b"native multipart body"
    settings = {"MEDIA_BACKEND": "tos", "TOS_BUCKET": "canvas-offline-test", "TOS_REGION": "cn-beijing",
                "TOS_INTERNAL_ENDPOINT": "https://tos-cn-beijing.ivolces.com", "TOS_PUBLIC_ENDPOINT": "https://tos-cn-beijing.volces.com",
                "TOS_ACCESS_KEY": "offline-ak", "TOS_SECRET_KEY": "offline-sk"}
    with patch.dict(os.environ, settings):
        store = media.TosStore()
        store.client.create_multipart_upload = Mock(return_value=SimpleNamespace(upload_id="native-upload"))
        store.client.list_parts = Mock(return_value=SimpleNamespace(parts=[SimpleNamespace(part_number=1, size=len(raw), etag="native-etag")]))
        missing = TosServerError(SimpleNamespace(request_id="offline", status=404, headers={}), "missing", "NoSuchKey", "", "")
        store.client.head_object = Mock(side_effect=[missing, SimpleNamespace(version_id="staging-v1")])
        store.client.complete_multipart_upload = Mock(side_effect=OSError("response lost after server completed"))
        store.download = Mock(side_effect=lambda asset, path: Path(path).write_bytes(raw))
        store.put = Mock(return_value="final-v1")
        with patch.object(media, "store", return_value=store):
            value = uploads.create("native.bin", len(raw), uuid.uuid4().hex)
            aid = value["media_asset_id"]
            uploads.sign_part(aid, 1, hashlib.sha256(raw).hexdigest())
            uploads.confirm_part(aid, 1)
            with media.operation_scope(), pytest.raises(OSError):
                uploads.complete(aid)
            with media.operation_scope():
                ready = uploads.complete(aid)
            assert ready["status"] == "ready"
            assert ready["sha256"] == hashlib.sha256(raw).hexdigest()
            assert store.client.complete_multipart_upload.call_count == 1
            assert store.download.call_args.args[0]["object_version_id"] == "staging-v1"


def test_staged_webp_keeps_image_type_and_fixed_version(client):
    import io
    from PIL import Image
    from app.storage import media
    buffer = io.BytesIO()
    Image.new('RGB', (16, 12), 'blue').save(buffer, 'WEBP')
    raw = buffer.getvalue()
    base, upload = start(client, raw, name='image.WEBP')
    pending = media.get_asset(upload['media_asset_id'], ready=False)
    assert pending['kind'] == 'image' and pending['content_type'] == 'image/webp'
    send_part(client, base, raw)
    ready = client.post(base + '/complete')
    assert ready.status_code == 200, ready.text
    asset = media.get_asset(upload['media_asset_id'])
    response = client.get(ready.json()['url'])
    assert response.status_code == 200 and response.content == raw
    assert response.headers['content-type'] == 'image/webp'
    assert client.post(base + '/complete').json() == ready.json()
    assert media.get_asset(upload['media_asset_id'])['object_version_id'] == asset['object_version_id']
