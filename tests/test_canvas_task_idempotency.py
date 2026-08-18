import unittest
from unittest.mock import patch
from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.models import CanvasVideoRequest, OnlineImageRequest
from app.routers.canvas import create_canvas_image_task, create_canvas_video_task
from app.state import CANVAS_TASKS, CANVAS_TASK_LOCK


class CanvasTaskIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS.clear()

    def tearDown(self):
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS.clear()

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


if __name__ == "__main__":
    unittest.main()
