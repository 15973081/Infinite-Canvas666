from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_audit import audit_canvas_directory
from app.services.canvas_billing_audit import audit_canvas_billing


class CanvasProductionFixturesTest(unittest.TestCase):
    def test_regression_fixtures_are_compatible_and_billing_distinct(self):
        directory = ROOT / "tests" / "fixtures" / "canvases"

        canvas = audit_canvas_directory(str(directory), include_details=True)
        billing = audit_canvas_billing(str(directory))

        self.assertEqual(2, canvas["summary"]["compatible"])
        self.assertEqual(0, canvas["summary"]["incompatible"])
        self.assertEqual({"smart-image": 2, "smart-loop": 1, "smart-prompt": 1}, canvas["summary"]["legacy_smart_node_types"])
        self.assertEqual(0, billing["duplicate_logs"])
        self.assertEqual(2_250_000, billing["priced_amount_micros"])
        self.assertEqual(0, billing["unidentified_logs"])


if __name__ == "__main__":
    unittest.main()
