from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_rollout_health import build_canvas_rollout_health_report


def metrics(events=None, counters=None):
    event_dimensions = {
        name: {"mode": {"enabled": count}}
        for name, count in (events or {}).items()
    }
    event_counters = {"page-summary": {"enabled": counters or {}}}
    return {"event_dimensions": event_dimensions, "event_counters": event_counters}


class CanvasRolloutHealthTest(unittest.TestCase):
    def test_marks_complete_low_failure_samples_healthy(self):
        report = build_canvas_rollout_health_report(metrics({
            "board-mounted": 100, "board-mount-failed": 1,
            "save-succeeded": 100, "save-failed": 1,
            "execution-succeeded": 50, "execution-failed": 1,
        }, {"task_polls": 100, "task_poll_errors": 2}), {"effective_percentage": 5})

        self.assertEqual("healthy", report["status"])
        self.assertTrue(report["ready_for_promotion"])
        self.assertTrue(all(item["passed"] for item in report["checks"]))

    def test_fails_early_on_high_error_rate(self):
        report = build_canvas_rollout_health_report(metrics({
            "board-mounted": 1, "board-mount-failed": 1,
        }), {"effective_percentage": 1})

        self.assertEqual("unhealthy", report["status"])
        self.assertEqual("unhealthy", report["checks"][0]["status"])

    def test_requires_minimum_samples_before_promotion(self):
        report = build_canvas_rollout_health_report(metrics({
            "board-mounted": 10, "save-succeeded": 10, "execution-succeeded": 5,
        }, {"task_polls": 10}), {"effective_percentage": 1})

        self.assertEqual("insufficient", report["status"])
        self.assertFalse(report["ready_for_promotion"])

    def test_inactive_rollout_is_reported_without_promotion(self):
        report = build_canvas_rollout_health_report({}, {"effective_percentage": 0})

        self.assertEqual("inactive", report["status"])
        self.assertFalse(report["ready_for_promotion"])


if __name__ == "__main__":
    unittest.main()
