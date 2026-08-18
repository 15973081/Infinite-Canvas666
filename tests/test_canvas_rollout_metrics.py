import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_rollout_metrics import get_canvas_rollout_metrics, record_canvas_rollout_event


class CanvasRolloutMetricsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp_dir.name) / "metrics.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_aggregates_only_low_cardinality_dimensions_and_counters(self):
        payload = {
            "event": "page-summary",
            "dimensions": {"mode": "enabled", "reason": "none", "source": "server"},
            "counters": {"repository_conflicts": 2, "task_recoveries": 1},
        }
        record_canvas_rollout_event(payload, self.path)
        record_canvas_rollout_event(payload, self.path)

        metrics = get_canvas_rollout_metrics(self.path)

        self.assertEqual(2, metrics["events"]["page-summary"])
        self.assertEqual(2, metrics["dimensions"]["mode"]["enabled"])
        self.assertEqual(4, metrics["counters"]["repository_conflicts"])
        self.assertEqual(2, metrics["counters"]["task_recoveries"])

    def test_unknown_reason_is_collapsed_and_unknown_fields_are_discarded(self):
        record_canvas_rollout_event({
            "event": "save-failed",
            "dimensions": {"reason": "provider-specific-secret", "canvas_id": "private"},
            "counters": {"repository_errors": 999999, "private": 8},
        }, self.path)

        metrics = get_canvas_rollout_metrics(self.path)

        self.assertEqual({"other": 1}, metrics["dimensions"]["reason"])
        self.assertEqual({"repository_errors": 10000}, metrics["counters"])
        self.assertNotIn("private", json.dumps(metrics))

    def test_rejects_unsupported_events(self):
        with self.assertRaisesRegex(ValueError, "unsupported"):
            record_canvas_rollout_event({"event": "arbitrary-event"}, self.path)
        self.assertFalse(Path(self.path).exists())

    def test_disabled_metrics_accept_without_touching_the_store(self):
        with patch.dict(os.environ, {"CANVAS_ROLLOUT_METRICS_DISABLED": "true"}):
            result = record_canvas_rollout_event({"event": "rollout-decision"}, self.path)

        self.assertFalse(result["persisted"])
        self.assertFalse(Path(self.path).exists())

    def test_corrupt_store_recovers_to_a_clean_aggregate(self):
        Path(self.path).write_text("{broken", encoding="utf-8")

        record_canvas_rollout_event({"event": "board-mounted"}, self.path)

        metrics = get_canvas_rollout_metrics(self.path)
        self.assertEqual({"board-mounted": 1}, metrics["events"])
        self.assertEqual(1, metrics["dimensions"]["reason"]["none"])


if __name__ == "__main__":
    unittest.main()
