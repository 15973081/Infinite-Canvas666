import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_production_coverage import build_canvas_production_coverage_report


class CanvasProductionCoverageTest(unittest.TestCase):
    def test_complex_regression_fixtures_cover_required_matrix_without_leaking_content(self):
        directory = ROOT / "tests" / "fixtures" / "canvases"
        report = build_canvas_production_coverage_report(str(directory))
        serialized = json.dumps(report, ensure_ascii=False)

        self.assertTrue(report["ready"])
        self.assertEqual(13, report["covered_feature_count"])
        self.assertEqual([], report["missing_features"])
        self.assertNotIn("cinematic city", serialized)
        self.assertNotIn("/uploads/reference.png", serialized)
        self.assertNotIn("classic-production", serialized)
        self.assertFalse(report["secrets_included"])
        self.assertFalse(report["identifiers_included"])

    def test_reports_only_safe_counts_for_invalid_deleted_and_unknown_documents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "private-name.json").write_text(json.dumps({
                "id": "private-id", "title": "private-title", "nodes": [
                    {"id": "secret-node", "type": "private-custom-type", "prompt": "private prompt"},
                ], "connections": [],
            }), encoding="utf-8")
            (root / "deleted.json").write_text(json.dumps({
                "id": "deleted", "deleted_at": 1, "nodes": [], "connections": [],
            }), encoding="utf-8")
            (root / "broken.json").write_text("not-json", encoding="utf-8")
            (root / "orphan.json").write_text(json.dumps({
                "id": "orphan", "nodes": [{"id": "prompt", "type": "prompt"}],
                "connections": [{"from": "prompt", "to": "missing"}],
            }), encoding="utf-8")
            report = build_canvas_production_coverage_report(directory)

        serialized = json.dumps(report)
        self.assertFalse(report["ready"])
        self.assertEqual(1, report["documents"])
        self.assertEqual(1, report["unknown_node_count"])
        self.assertEqual(2, report["invalid_files"])
        self.assertEqual(1, report["deleted_files"])
        for private in ("private-name", "private-id", "private-title", "private-custom-type", "private prompt"):
            self.assertNotIn(private, serialized)

    def test_marks_limited_scan_incomplete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index in range(3):
                (root / f"{index}.json").write_text(json.dumps({
                    "id": str(index), "nodes": [], "connections": [],
                }), encoding="utf-8")
            report = build_canvas_production_coverage_report(directory, max_files=2, required_features=())

        self.assertFalse(report["complete"])
        self.assertFalse(report["ready"])
        self.assertEqual(3, report["discovered_files"])


if __name__ == "__main__":
    unittest.main()
