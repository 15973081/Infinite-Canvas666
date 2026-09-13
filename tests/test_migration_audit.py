"""Offline audit must cover every legacy source without database or network writes."""
import json
import sqlite3
from unittest.mock import patch

import pytest

from app.storage.migration import migrate_legacy, ledger_import


def write(root, name, value):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_offline_inventory_covers_documents_backups_tasks_and_redacts_urls(tmp_path):
    root = tmp_path / "backup"
    payload = {"url": "/assets/input/present.png", "images": ["/output/missing.png"],
               "thumbnail": "https://user:private@media.invalid/preview.png?signature=secret#token",
               "prompt": "/assets/not-a-reference.png", "registrations": {"url": "asset://keep"}}
    (root / "assets/input").mkdir(parents=True)
    (root / "assets/input/present.png").write_bytes(b"original")
    names = ["data/canvases/one.json", "data/canvases/backups/one/old.json", "conversations/u/one.json",
             "data/conversations/u/two.json", "data/asset_library.json", "data/canvas_folders.json",
             "data/prompt_libraries.json", "data/shared_folders.json", "data/api_providers.json",
             "data/maintenance_state.json"]
    for name in names:
        write(root, name, {"id": "one", **payload})
    write(root, "history.json", [payload])
    write(root, "data/unknown.json", {"old": "unhandled"})
    write(root, "localStorage.json", {"draft": payload})
    with sqlite3.connect(root / "data/canvas_tasks.sqlite3") as conn:
        conn.execute("CREATE TABLE canvas_tasks (id TEXT, created_at REAL, task_json TEXT, request_json TEXT)")
        conn.execute("INSERT INTO canvas_tasks VALUES ('legacy', 1, ?, ?)", (json.dumps(payload), json.dumps(payload)))
    original = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    report_path = tmp_path / "audit.json"
    with patch("app.storage.database.connection", side_effect=AssertionError("offline audit opened PostgreSQL")), \
         patch("app.storage.media.publish", side_effect=AssertionError("offline audit published an object")):
        result = migrate_legacy(root, report_path=report_path)
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert result["status"] == "needs_review"
    assert report["missing_refs"] == ["/output/missing.png"]
    assert report["total_file_bytes"] == len(b"original")
    assert report["inventory"]["conversation"]["records"] == 2
    assert report["inventory"]["canvas_backup"]["files"] == 1
    assert report["inventory"]["tasks"]["records"] == 1
    assert report["inventory"]["maintenance"]["files"] == 1
    assert report["inventory"]["output"]["files"] == 0
    assert report["unknown_json"] == ["data/unknown.json"]
    assert report["browser_local_storage"]["status"] == "requires_manual_review"
    assert report["browser_local_storage"]["imported"] is False
    assert len(report["external_refs"]) == len(names) + 4
    assert all(item["ref"] == "https://media.invalid/preview.png" for item in report["external_refs"])
    assert "signature=secret" not in report_path.read_text(encoding="utf-8")
    assert "user:private" not in report_path.read_text(encoding="utf-8")
    assert any("/canvas_tasks/0/request_json/" in item["pointer"] for item in report["reference_issues"])
    assert all(p.read_bytes() == value for p, value in original.items())


def test_invalid_source_preflight_does_not_apply_and_report_cannot_overwrite_backup(tmp_path):
    root = tmp_path / "backup"
    path = write(root, "data/canvases/bad.json", {})
    path.write_text("invalid json", encoding="utf-8")
    with patch("app.storage.media.publish", side_effect=AssertionError("preflight wrote objects")), \
         patch("app.storage.database.connection", side_effect=AssertionError("preflight wrote database")):
        with pytest.raises(json.JSONDecodeError):
            migrate_legacy(root, apply=True, report_path=tmp_path / "failed.json")
    assert json.loads((tmp_path / "failed.json").read_text())["status"] == "failed"
    with pytest.raises(ValueError, match="outside"):
        migrate_legacy(root, report_path=path)
    assert path.read_text() == "invalid json"


def test_ledger_dry_run_preserves_unknown_amount_without_database(tmp_path):
    from app.services import canvas_ledger as ledger
    import os
    path = tmp_path / "ledger.sqlite3"
    with patch.dict(os.environ, {"DATABASE_BACKEND": "local", "CANVAS_LEDGER_DB_PATH": str(path)}), \
         patch.object(ledger, "provider_list", return_value=[]):
        ledger.import_canvas_logs("audit", [{"id": "unknown", "status": "success", "createdAt": 1789000000000,
                                           "cost": {"status": "unknown", "currency": "CNY", "amount_micros": None}}])
    with patch("app.storage.database.connection", side_effect=AssertionError("dry run opened database")):
        report = ledger_import(path, False)
    assert len(report["tables"]) == 5
    assert report["tables"]["ledger_entries"] == 1
    # Legacy schema stores zero in its NOT NULL aggregate column, but unknown
    # status and the null historical JSON price must not be turned into free use.
    assert report["source_totals"][0]["cost_status"] == "unknown"
    with sqlite3.connect(path) as conn:
        cost = json.loads(conn.execute("SELECT cost_json FROM ledger_entries").fetchone()[0])
        assert cost.get("amount_micros") is None
    assert report["target_totals"] == []
