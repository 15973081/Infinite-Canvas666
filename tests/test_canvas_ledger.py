import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import canvas_ledger as ledger
from app.services import canvas_ledger_recovery as recovery
from app.services import canvas as canvases
from app.services import canvas_tasks as tasks

AT = 1789000000000


def log(key, amount=30000, **fields):
    return {"id": str(key), "createdAt": AT + int(key) if str(key).isdigit() else AT,
            "status": "success", "billingKind": "image", "providerId": "demo", "billingModel": "image-m",
            "outputs": ["/output/example.png"],
            "cost": {"status": "priced", "kind": "image", "currency": "CNY", "amount_micros": amount,
                     "unit_price": "0.03", "billing_type": "per_image", "quantity": 1}, **fields}


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.prices = [{"id": "demo", "model_prices": [{"kind": "image", "model": "image-m",
                        "unit_price": "0.03", "billing_type": "per_image", "effective_from": 0}]}]
        patches = [patch.dict(os.environ, {"CANVAS_LEDGER_DB_PATH": str(self.root / "ledger.sqlite3"),
                                          "CANVAS_TASK_DB_PATH": str(self.root / "tasks.sqlite3")}),
                   patch.object(canvases, "CANVAS_DIR", str(self.root)),
                   patch.object(canvases, "BACKUP_DIR", str(self.root / "backups")),
                   patch.object(ledger, "provider_list", lambda: self.prices)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.temp.cleanup)
        self.write_canvas([])

    def write_canvas(self, logs):
        (self.root / "c.json").write_text(json.dumps({"id": "c", "nodes": [{"id": "keep-layout"}], "logs": logs}), encoding="utf-8")

    def backup(self, name, logs):
        folder = self.root / "backups" / "c"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(json.dumps({"id": "c", "nodes": [], "logs": logs}), encoding="utf-8")

    def totals(self):
        return ledger.read_page("c")["totals"]

    def test_full_history_over_5000_and_old_save_cannot_decrease(self):
        original = [log(i) for i in range(5101)]
        ledger.import_canvas_logs("c", original)
        ledger.import_canvas_logs("c", original[:1])
        result = ledger.read_page("c")
        self.assertEqual(result["totals"]["total"], 5101 * 30000)
        self.assertEqual(result["totals"]["records"], 5101)
        self.assertEqual(len(result["logs"]), 50)
        self.assertEqual(result["pages"], 103)

    def test_backend_and_frontend_task_aliases_are_idempotent(self):
        task = {"id": "task-a", "canvas_id": "c", "type": "online-image", "status": "succeeded",
                "created_at": AT / 1000, "provider_id": "demo", "model": "image-m",
                "billing_price": self.prices[0]["model_prices"][0], "result": {"images": ["x"]}}
        tasks.save_canvas_task(task)
        ledger.append_logs("c", [log("client", canvas_task_id="task-a")])
        tasks.save_canvas_task(task)
        ledger.sync_canvas_tasks("c")
        self.assertEqual(self.totals()["records"], 1)
        self.assertEqual(self.totals()["total"], 30000)
        tasks.update_canvas_task("task-a", status="succeeded", result={"images": ["x"], "usage": {"total_tokens": 321}})
        self.assertEqual(ledger.read_page("c")["logs"][0]["usage"]["total_tokens"], 321)

    def test_recovered_success_is_not_reverted_by_stale_failed_task(self):
        task = {"id": "recoverable", "canvas_id": "c", "type": "online-image", "status": "failed",
                "created_at": AT/1000, "updated_at": AT/1000, "error": "download failed"}
        tasks.save_canvas_task(task)
        ledger.append_logs("c", [log("recovered", canvas_task_id=task["id"])])
        tasks.save_canvas_task(task)
        result = ledger.read_page("c")
        self.assertEqual(result["totals"]["records"], 1)
        self.assertEqual(result["totals"]["failed"], 0)
        self.assertEqual(result["logs"][0]["status"], "success")

    def test_retry_from_durable_task_after_ledger_failure(self):
        task = {"id": "a", "canvas_id": "c", "type": "video", "created_at": AT/1000, "status": "succeeded",
                "result": {"cost": log(1, 92000)["cost"], "videos": ["video"]}}
        with patch.object(tasks, "_record_ledger"):
            tasks.save_canvas_task(task)
        self.assertEqual(self.totals()["records"], 0)
        ledger.sync_canvas_tasks("c")
        self.assertEqual(self.totals()["total"], 92000)

    def test_preview_is_read_only_and_apply_deduplicates_and_keeps_layout(self):
        self.write_canvas([log(1)])
        self.backup("manual_1.json", [log(1), log(2)])
        before = (self.root / "c.json").read_bytes()
        preview = recovery.recover("c")
        self.assertEqual(preview["report"]["added"], 2)
        self.assertEqual(preview["report"]["duplicate"], 1)
        self.assertEqual(self.totals()["records"], 0)
        applied = recovery.recover("c", preview["preview_token"])
        self.assertEqual(applied["after"]["total"], 60000)
        again = recovery.recover("c")
        self.assertEqual(again["report"]["added"], 0)
        recovery.recover("c", again["preview_token"])
        self.assertEqual(self.totals()["records"], 2)
        self.assertEqual((self.root / "c.json").read_bytes(), before)

    def test_preview_rejects_changed_ledger_or_backup(self):
        preview = recovery.recover("c")
        ledger.append_logs("c", [log(1)])
        with self.assertRaises(ValueError):
            recovery.recover("c", preview["preview_token"])
        preview = recovery.recover("c")
        self.backup("new.json", [log(2)])
        with self.assertRaises(ValueError):
            recovery.recover("c", preview["preview_token"])

    def test_conflicting_backup_keeps_original_amount_and_audits_candidate(self):
        ledger.append_logs("c", [log(1)])
        self.backup("old.json", [log(1, 999999)])
        preview = recovery.recover("c")
        self.assertEqual(preview["report"]["conflicts"], 1)
        recovery.recover("c", preview["preview_token"])
        self.assertEqual(self.totals()["total"], 30000)
        with ledger.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM ledger_conflicts").fetchone()[0], 1)

    def test_corrupt_backup_is_reported_without_blocking_good_backup(self):
        self.backup("good.json", [log(1)])
        (self.root / "backups/c/bad.json").write_text("{bad")
        preview = recovery.recover("c")
        self.assertEqual(preview["report"]["added"], 1)
        self.assertEqual(len(preview["source_errors"]), 1)

    def test_no_guessing_cross_canvas_task_association(self):
        task = {"id": "a", "canvas_id": "other", "type": "video", "created_at": AT/1000,
                "status": "succeeded", "result": {"cost": log(1)["cost"]}}
        tasks.save_canvas_task(task)
        tasks.save_canvas_task({**task, "id": "unassociated", "canvas_id": ""})
        self.assertEqual(recovery.recover("c")["report"]["added"], 0)

    def test_historical_price_is_frozen_and_unknown_does_not_become_free(self):
        ledger.append_logs("c", [log(1, cost=None), log(2, cost=None, billingModel="missing")])
        self.prices[0]["model_prices"][0]["unit_price"] = "0.01"
        ledger.append_logs("c", [log(1, cost=None)])
        self.assertEqual(self.totals()["total"], 30000)
        self.assertEqual(self.totals()["unknown"], 1)

    def test_failed_volcengine_usage_preserved_unknown_ark_never_guesses_seconds(self):
        cost = {**log(1, 7654321)["cost"], "kind": "video", "billing_source": "volcengine_usage",
                "billing_type": "per_million_tokens"}
        ark = log(1, cost=cost, billingKind="video", providerId="volcengine", status="failed",
                  usage={"completion_tokens": 1234}, video_info={"duration": 8, "resolution": "720p"})
        ledger.append_logs("c", [ark, log(2, cost=None, billingKind="video", providerId="volcengine")])
        self.assertEqual(self.totals()["total"], 7654321)
        self.assertEqual(self.totals()["failed"], 1)
        self.assertEqual(self.totals()["unknown"], 1)
        saved = next(x for x in ledger.read_page("c")["logs"] if x["id"] == "1")
        self.assertEqual(saved["usage"], ark["usage"])
        self.assertEqual(saved["video_info"], ark["video_info"])

    def test_second_pricing_preserves_decimal_micros_and_exact_historical_scope(self):
        prices = [{"id": "demo", "model_prices": [
            {"kind": "video", "model": "video-m", "billing_type": "per_second", "unit_price": "0.1234565",
             "resolution": "720p", "effective_from": AT-1, "effective_to": AT+1}]}]
        item = log("decimal", billingKind="video", billingModel="video-m", cost=None,
                   durationSeconds=5, request={"resolution": "720p"})
        ledger.append_logs("c", [item], providers=prices)
        self.assertEqual(self.totals()["total"], 617285)
        outside = {**item, "createdAt": AT+1}
        self.assertEqual(ledger.price_log(outside, prices)["status"], "unknown")
        self.assertEqual(ledger.price_log({**item, "request": {"resolution": "1080p"}}, prices)["status"], "unknown")

    def test_currency_invalid_amounts_dates_and_revision(self):
        usd = log(1, cost={**log(1)["cost"], "currency": "USD"})
        ledger.append_logs("c", [usd, log(2, -1), log(3, 0), log(4)])
        totals = self.totals()
        self.assertEqual(totals["total"], 30000)
        self.assertEqual(totals["other_currencies"], {"USD": 30000})
        self.assertEqual(totals["unknown"], 1)
        self.assertEqual(ledger.read_page("c", from_ms=AT+3, to_ms=AT+4)["totals"]["records"], 1)
        version = ledger.read_page("c")["revision"]
        ledger.append_logs("c", [log(5)])
        with self.assertRaises(ValueError):
            ledger.read_page("c", expected_revision=version)

    def test_invalid_logs_do_not_block_valid_rows(self):
        result = ledger.append_logs("c", [None, {}, log(1), log(2, request="invalid")])
        self.assertEqual(result["invalid"], 3)
        self.assertEqual(result["added"], 1)

    def test_routes_migrate_and_preview_without_touching_canvas(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.routers.canvas_ledger import router
        app = FastAPI()
        app.include_router(router)
        self.write_canvas([log(1)])
        before = (self.root / "c.json").read_bytes()
        with TestClient(app) as client:
            result = client.get("/api/canvases/c/ledger").json()
            self.assertEqual(result["totals"]["total"], 30000)
            self.assertEqual(client.get("/api/canvases/c/ledger?page_size=10000").status_code, 422)
            self.assertEqual(client.get("/api/canvases/c/ledger?from_ms=2&to_ms=1").status_code, 400)
            self.assertEqual(client.get("/api/canvases/missing/ledger").status_code, 404)
            preview = client.post("/api/canvases/c/ledger/recovery/preview").json()
            self.assertEqual(client.post("/api/canvases/c/ledger/recovery/apply", json={"preview_token": preview["preview_token"]}).status_code, 200)
        self.assertEqual((self.root / "c.json").read_bytes(), before)

    def test_image_task_creation_freezes_price_and_completion_bills_without_browser(self):
        import asyncio
        from unittest.mock import AsyncMock
        from app.models import OnlineImageRequest
        from app.routers import canvas as router, image
        from app.state import CANVAS_TASKS
        payload = OnlineImageRequest(canvas_id="c", provider_id="demo", model="image-m", prompt="test")
        async def run():
            with patch.object(router.asyncio, "create_task", side_effect=lambda coroutine: coroutine.close()):
                created = await router.create_canvas_image_task(payload)
            key = created["task_id"]
            try:
                self.assertEqual(tasks.get_canvas_task(key)["canvas_id"], "c")
                self.prices[0]["model_prices"][0]["unit_price"] = "9"
                with patch.object(image, "build_online_image_result", AsyncMock(return_value={"images": ["result"]})):
                    await image.run_canvas_image_task(key, payload)
                self.assertEqual(self.totals()["total"], 30000)
                self.assertEqual(ledger.read_page("c")["logs"][0]["_ledger_cost"]["source"], "actual")
            finally:
                CANVAS_TASKS.pop(key, None)
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
