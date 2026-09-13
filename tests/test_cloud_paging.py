import os
import uuid

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.getenv("CLOUD_INTEGRATION_TEST") != "1", reason="Use tools/cloud_test.py")


def test_history_cursor_handles_ties_deletion_and_newer_insertion():
    from app.storage import documents, history
    kind = "paging-" + uuid.uuid4().hex
    for index in range(5):
        documents.put("history", kind + str(index), {"type": kind, "timestamp": 123.125, "images": ["image"], "index": index})
    first = history.page(kind, 2)
    assert [row["index"] for row in first["items"]] == [4, 3]
    documents.delete("history", kind + "4")
    documents.put("history", kind + "new", {"type": kind, "timestamp": 999, "images": ["new"]})
    second = history.page(kind, 2, first["next_cursor"])
    third = history.page(kind, 2, second["next_cursor"])
    assert [row["index"] for row in second["items"] + third["items"]] == [2, 1, 0]
    assert third["next_cursor"] is None
    with pytest.raises(HTTPException):
        history.page("another-filter", 2, first["next_cursor"])
    for invalid in ("not base64", "e30=", "W10=", "null", "x" * 2049):
        with pytest.raises(HTTPException):
            history.page(kind, 2, invalid)
    assert history.delete_timestamp(123.125)
    assert len(history.page(kind)["items"]) == 1


def test_history_http_bounds_and_legacy_array_compatibility():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routers.history import router
    from app.storage import documents
    kind = "paging-http-" + uuid.uuid4().hex
    for index in range(3):
        documents.put("history", kind + str(index), {"type": kind, "timestamp": index, "images": ["media"]})
    documents.put("history", kind + "empty", {"type": kind, "images": []})
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        assert len(client.get("/api/history", params={"type": kind}).json()) == 3
        response = client.get("/api/history/page", params={"type": kind, "limit": 2}).json()
        assert len(response["items"]) == 2 and response["next_cursor"]
        assert client.get("/api/history/page?limit=0").status_code == 400
        assert client.get("/api/history/page?limit=201").status_code == 400


def test_conversation_pages_scope_and_summary_excludes_large_messages():
    from app.storage import documents
    from app.services.chat import list_conversations
    user = "paging-" + uuid.uuid4().hex
    for index in range(4):
        documents.put("conversation", user + "/" + str(index), {"id": str(index), "title": "title", "updated_at": index,
                      "messages": [{"role": "user", "content": "x" * 10000}, {"role": "system", "content": "hidden"}]})
    documents.put("conversation", user + "-other/4", {"id": "other", "updated_at": 99})
    first, second = list_conversations(user, 2), list_conversations(user, 2, 2)
    assert [row["id"] for row in first + second] == ["3", "2", "1", "0"]
    assert all(len(row["last_message"]) == 800 and "messages" not in row for row in first + second)


def test_batched_scans_allow_deletion_and_canvas_listing_uses_metadata():
    from app.storage import documents, canvases
    kind = "batch-" + uuid.uuid4().hex
    for index in range(7):
        documents.put(kind, str(index), {"value": index})
    visited = []
    for row in documents.list_values(kind, batch_size=2):
        visited.append(row["id"])
        documents.delete(kind, row["id"])
    assert visited == list(map(str, range(7)))
    value = {"id": uuid.uuid4().hex, "title": "metadata", "kind": "smart", "nodes": [{"id": "node", "text": "large" * 10000}], "logs": [], "connections": [], "viewport": {"x": 0, "y": 0, "scale": 1}}
    canvases.save(value)
    record = next(row for row in canvases.list_records() if row["id"] == value["id"])
    assert record["node_count"] == 1 and "nodes" not in record and "logs" not in record
    assert canvases.get(value["id"])["nodes"][0]["text"] == "large" * 10000
