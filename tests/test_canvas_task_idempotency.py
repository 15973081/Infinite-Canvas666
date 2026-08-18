import unittest
from unittest.mock import patch
from pathlib import Path
import sys
import json
import tempfile
import time

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.models import CanvasVideoRequest, OnlineImageRequest
from app.routers.canvas import create_canvas_image_task, create_canvas_video_task
from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK
from app.services.canvas_tasks import load_canvas_tasks, update_canvas_task


class CanvasTaskIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.task_file = str(Path(self.temp_dir.name) / "canvas_tasks.json")
        self.path_patch = patch("app.services.canvas_tasks.CANVAS_TASKS_FILE", self.task_file)
        self.path_patch.start()
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS.clear()

    def tearDown(self):
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS.clear()
        self.path_patch.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def close_background_task(coroutine):
        coroutine.close()
        return None

    async def test_image_submission_reuses_task_for_same_key(self):
        payload = OnlineImageRequest(prompt="same", idempotency_key="canvas:node:run")
        with patch("app.routers.canvas.asyncio.create_task", side_effect=self.close_background_task) as create_task:
            first = await create_canvas_image_task(payload)
            duplicate = await create_canvas_image_task(payload)

        self.assertEqual(first["task_id"], duplicate["task_id"])
        self.assertTrue(duplicate["deduplicated"])
        self.assertEqual(1, create_task.call_count)
        self.assertEqual(1, len(CANVAS_TASKS))

    async def test_different_keys_and_task_kinds_remain_independent(self):
        image = OnlineImageRequest(prompt="same", idempotency_key="shared")
        video = CanvasVideoRequest(prompt="same", idempotency_key="shared")
        with patch("app.routers.canvas.asyncio.create_task", side_effect=self.close_background_task) as create_task:
            first = await create_canvas_image_task(image)
            second = await create_canvas_image_task(OnlineImageRequest(prompt="same", idempotency_key="other"))
            third = await create_canvas_video_task(video)

        self.assertEqual(3, len({first["task_id"], second["task_id"], third["task_id"]}))
        self.assertEqual(3, create_task.call_count)

    async def test_registry_survives_restart_and_marks_inflight_task_recoverable(self):
        payload = OnlineImageRequest(prompt="persist", idempotency_key="persisted")
        with patch("app.routers.canvas.asyncio.create_task", side_effect=self.close_background_task):
            created = await create_canvas_image_task(payload)
        self.assertTrue(Path(self.task_file).exists())

        with CANVAS_TASK_LOCK:
            CANVAS_TASKS.clear()
        report = load_canvas_tasks()
        restored = CANVAS_TASKS[created["task_id"]]

        self.assertEqual({"loaded": 1, "interrupted": 1, "pruned": 0}, report)
        self.assertEqual("failed", restored["status"])
        self.assertTrue(restored["recoverable"])
        self.assertEqual("interrupted", restored["recovery_status"])

    async def test_terminal_tasks_are_retained_and_expired_records_are_pruned(self):
        payload = CanvasVideoRequest(prompt="persist", idempotency_key="terminal")
        with patch("app.routers.canvas.asyncio.create_task", side_effect=self.close_background_task):
            created = await create_canvas_video_task(payload)
        update_canvas_task(created["task_id"], status="succeeded", result={"videos": ["/output/a.mp4"]})
        old_id = "canvas_img_expired"
        persisted = json.loads(Path(self.task_file).read_text(encoding="utf-8"))
        persisted["tasks"].append({
            "id": old_id, "type": "online-image", "status": "failed",
            "created_at": 1, "updated_at": time.time() - 8 * 24 * 60 * 60,
        })
        Path(self.task_file).write_text(json.dumps(persisted), encoding="utf-8")

        report = load_canvas_tasks()

        self.assertEqual({"loaded": 1, "interrupted": 0, "pruned": 1}, report)
        self.assertEqual("succeeded", CANVAS_TASKS[created["task_id"]]["status"])
        self.assertNotIn(old_id, CANVAS_TASKS)


if __name__ == "__main__":
    unittest.main()
