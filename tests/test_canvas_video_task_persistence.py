from canvas_source import read_canvas_source
import asyncio
import importlib
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class CanvasVideoTaskStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "canvas_tasks.sqlite3"
        self.previous_path = os.environ.get("CANVAS_TASK_DB_PATH")
        os.environ["CANVAS_TASK_DB_PATH"] = str(self.db_path)
        from app.services import canvas_tasks

        self.store = importlib.reload(canvas_tasks)

    def tearDown(self):
        if self.previous_path is None:
            os.environ.pop("CANVAS_TASK_DB_PATH", None)
        else:
            os.environ["CANVAS_TASK_DB_PATH"] = self.previous_path
        self.temp_dir.cleanup()

    def test_task_and_request_survive_memory_reset(self):
        now = time.time()
        task = {
            "id": "canvas_vid_persist1234",
            "type": "video",
            "status": "queued",
            "provider_id": "demo",
            "model": "video-model",
            "created_at": now,
            "updated_at": now,
            "result": None,
            "error": "",
        }
        request = {
            "client_task_id": task["id"],
            "prompt": "persistent video",
            "provider_id": "demo",
            "model": "video-model",
        }
        self.store.save_canvas_task(task, request)
        self.store.update_canvas_task(
            task["id"],
            status="polling",
            upstream_task_id="upstream-42",
            upstream_submit_url="https://provider.example/v1/videos",
        )

        # Reloading the module simulates a fresh backend process with no memory cache.
        reloaded = importlib.reload(self.store)
        restored = reloaded.get_canvas_task(task["id"])
        self.assertEqual(restored["status"], "polling")
        self.assertEqual(restored["upstream_task_id"], "upstream-42")
        self.assertEqual(reloaded.get_canvas_task_request(task["id"])["prompt"], "persistent video")
        self.assertEqual([item["id"] for item in reloaded.active_durable_canvas_tasks()], [task["id"]])

        reloaded.update_canvas_task(task["id"], status="succeeded", result={"videos": ["/output/a.mp4"]})
        self.assertEqual(reloaded.active_durable_canvas_tasks(), [])

    def test_maintenance_drain_tracks_a_durable_task_until_it_finishes(self):
        from fastapi import HTTPException
        from app.services import maintenance
        from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK, set_canvas_task_maintenance

        task_id = "canvas_vid_drain12345"
        now = time.time()
        self.store.save_canvas_task({
            "id": task_id,
            "type": "video",
            "status": "polling",
            "provider_id": "demo",
            "model": "video-model",
            "created_at": now,
            "updated_at": now,
        }, {"prompt": "drain", "provider_id": "demo"})
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id] = self.store.get_canvas_task(task_id)

        def finish_task():
            time.sleep(0.1)
            self.store.update_canvas_task(task_id, status="succeeded", result={"videos": ["/output/a.mp4"]})
            with CANVAS_TASK_LOCK:
                CANVAS_TASKS[task_id]["status"] = "succeeded"

        worker = threading.Thread(target=finish_task, daemon=True)
        worker.start()
        set_canvas_task_maintenance(True, "test maintenance")
        try:
            with self.assertRaises(HTTPException):
                maintenance.ensure_generation_allowed()
            deadline = time.time() + 3
            summary = maintenance.active_task_summary()
            while summary["active"] and time.time() < deadline:
                time.sleep(0.02)
                summary = maintenance.active_task_summary()
        finally:
            set_canvas_task_maintenance(False)
        worker.join(timeout=2)
        self.assertEqual(summary["active"], 0)

    def test_upstream_id_is_durable_even_when_the_runner_is_interrupted(self):
        from app.models import CanvasVideoRequest
        from app.routers import canvas as canvas_router
        from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK

        task_id = "canvas_vid_interrupt123"
        now = time.time()
        request = {
            "client_task_id": task_id,
            "prompt": "interrupt after submit",
            "provider_id": "demo",
            "model": "video-model",
        }
        task = {
            "id": task_id,
            "type": "video",
            "status": "queued",
            "provider_id": "demo",
            "model": "video-model",
            "created_at": now,
            "updated_at": now,
        }
        self.store.save_canvas_task(task, request)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id] = dict(task)

        original_impl = canvas_router.canvas_video_impl

        async def interrupted_impl(payload, on_submitted=None):
            on_submitted("provider-task-99", "https://provider.example/v1/videos", "video")
            raise asyncio.CancelledError()

        canvas_router.canvas_video_impl = interrupted_impl
        try:
            with self.assertRaises(asyncio.CancelledError):
                asyncio.run(canvas_router.run_canvas_video_task(task_id, CanvasVideoRequest(**request)))
        finally:
            canvas_router.canvas_video_impl = original_impl
            with CANVAS_TASK_LOCK:
                CANVAS_TASKS.pop(task_id, None)

        restored = self.store.get_canvas_task(task_id)
        self.assertEqual(restored["status"], "polling")
        self.assertEqual(restored["upstream_task_id"], "provider-task-99")


class CanvasVideoRecoveryWiringTests(unittest.TestCase):
    def test_backend_persists_upstream_id_before_polling_and_recovers_on_startup(self):
        router = (ROOT / "app" / "routers" / "canvas.py").read_text(encoding="utf-8")
        media = (ROOT / "app" / "services" / "media.py").read_text(encoding="utf-8")
        self.assertIn('status="submitting"', router)
        self.assertIn('status="polling"', router)
        self.assertIn("upstream_task_id=str(upstream_task_id", router)
        self.assertIn('submit_headers.setdefault("Idempotency-Key", payload.client_task_id)', router)
        main = (ROOT / "main.py").read_text(encoding="utf-8")
        self.assertIn("await canvas.recover_durable_canvas_video_tasks()", main)
        self.assertIn("resume_canvas_video_task(task_id, payload)", router)
        self.assertIn("on_submitted(upstream_id, submit_url", media)

    def test_manual_maintenance_blocks_new_tasks_and_has_no_remote_updater(self):
        maintenance_router = (ROOT / "app" / "routers" / "maintenance.py").read_text(encoding="utf-8")
        maintenance_service = (ROOT / "app" / "services" / "maintenance.py").read_text(encoding="utf-8")
        canvas = (ROOT / "app" / "routers" / "canvas.py").read_text(encoding="utf-8")
        main = (ROOT / "main.py").read_text(encoding="utf-8")
        page = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn('router.post("/api/maintenance/start")', maintenance_router)
        self.assertIn("require_local_operator(request)", maintenance_router)
        self.assertIn("set_canvas_task_maintenance(True", maintenance_service)
        self.assertIn("begin_transient_generation", main)
        self.assertIn("_canvas_task_gate_error()", canvas)
        self.assertNotIn('id="maintenance-modal"', page)
        self.assertIn('id="management-entry"', page)
        self.assertIn('HTTPException(410, {"code": "management_entry_required"})', maintenance_router)
        self.assertIn("connectStudioWebSocket", page)
        self.assertNotIn("update-from-github", page)
        self.assertFalse((ROOT / "app" / "routers" / "update.py").exists())

    def test_both_canvases_keep_polling_through_a_temporary_backend_restart(self):
        classic = read_canvas_source((ROOT / "static" / "js" / "canvas.js"))
        smart = read_canvas_source((ROOT / "static" / "js" / "smart-canvas.js"))
        self.assertIn("function canvasTaskPollRetryWindow", classic)
        self.assertIn("function smartTaskPollRetryWindow", smart)
        self.assertIn("30 * 60 * 1000", classic)
        self.assertIn("30 * 60 * 1000", smart)
        self.assertIn("unavailableSince", classic)
        self.assertIn("unavailableSince", smart)


if __name__ == "__main__":
    unittest.main()
