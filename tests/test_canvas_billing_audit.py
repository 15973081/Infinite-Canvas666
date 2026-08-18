import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_billing_audit import audit_canvas_billing, billing_amount_micros, billing_identity


class CanvasBillingAuditTest(unittest.TestCase):
    def test_normalizes_legacy_and_v2_billing_evidence(self):
        self.assertEqual("canvas-task:canvas_img_1", billing_identity({"canvasTaskId": "canvas_img_1"}))
        self.assertEqual("upstream-task:provider_1", billing_identity({"upstream_task_id": "provider_1", "task_id": "local"}))
        self.assertEqual(1_250_000, billing_amount_micros({"cost": {"status": "priced", "amount_micros": 1_250_000}}))
        self.assertEqual(2_500_000, billing_amount_micros({"cost_cny": 2.5}))
        self.assertIsNone(billing_amount_micros({"cost": {"status": "priced", "amount_micros": "invalid"}}))

    def test_reports_duplicate_success_logs_without_counting_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "canvas.json"
            path.write_text(json.dumps({
                "id": "canvas", "nodes": [], "connections": [], "logs": [
                    {"id": "one", "status": "done", "taskId": "task-1", "cost": {"status": "priced", "amount_micros": 2_000_000}},
                    {"id": "two", "status": "success", "request": {"task_id": "task-1"}, "cost_cny": 2},
                    {"id": "failed", "status": "failed", "taskId": "task-1", "cost_cny": 2},
                    {"id": "unknown", "status": "done"},
                ],
            }), encoding="utf-8")

            report = audit_canvas_billing(directory)

        self.assertEqual(3, report["successful_logs"])
        self.assertEqual(1, report["duplicate_logs"])
        self.assertEqual(2_000_000, report["duplicate_amount_micros"])
        self.assertEqual(1, report["unidentified_logs"])
        self.assertEqual(1, report["unknown_cost_logs"])
