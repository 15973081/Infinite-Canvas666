import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.canvas_audit import audit_canvas_directory, audit_canvas_file, main


class CanvasAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_canvas(self, canvas_id, document):
        path = self.directory / f"{canvas_id}.json"
        path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
        return path

    def test_future_nodes_and_unknown_fields_remain_compatible(self):
        path = self.write_canvas("future", {
            "id": "future", "title": "Historical", "futureRoot": {"keep": True},
            "nodes": [
                {"id": "prompt", "type": "prompt", "text": "hello", "future": 7},
                {"id": "future-node", "type": "plugin-node", "payload": {"x": 1}},
            ],
            "connections": [{"from": "prompt", "to": "future-node", "futureEdge": True}],
        })

        report = audit_canvas_file(str(path))

        self.assertTrue(report["compatible"])
        self.assertEqual({"plugin-node": 1}, report["unknown_node_types"])
        self.assertEqual(["unknown-node-type"], [issue["code"] for issue in report["issues"]])

    def test_duplicate_nodes_and_orphan_connections_block_rollout(self):
        path = self.write_canvas("broken", {
            "id": "broken",
            "nodes": [
                {"id": "same", "type": "prompt"},
                {"id": "same", "type": "generator", "inputs": "invalid"},
            ],
            "connections": [{"from": "same", "to": "missing"}],
        })

        report = audit_canvas_file(str(path))
        codes = {issue["code"] for issue in report["issues"]}

        self.assertFalse(report["compatible"])
        self.assertTrue({"duplicate-node-id", "invalid-node-inputs", "orphan-connection"}.issubset(codes))

    def test_legacy_smart_nodes_are_reported_as_convertible(self):
        path = self.write_canvas("smart", {
            "id": "smart", "kind": "smart",
            "nodes": [
                {"id": "prompt", "type": "smart-prompt", "text": "hello"},
                {"id": "loop", "type": "smart-loop", "count": 2},
                {"id": "typed", "type": "smart-image", "images": [{"url": "/a.png"}]},
                {"id": "typeless", "images": [{"url": "/b.png"}]},
            ],
            "connections": [{"from": "prompt", "to": "typed"}],
        })

        report = audit_canvas_file(str(path))

        self.assertTrue(report["compatible"])
        self.assertEqual({"smart-image": 2, "smart-loop": 1, "smart-prompt": 1}, report["legacy_smart_node_types"])
        self.assertEqual({}, report["unknown_node_types"])
        self.assertEqual(4, report["warning_count"])

    def test_directory_summary_includes_corruption_and_skips_deleted_by_default(self):
        self.write_canvas("valid", {"id": "valid", "nodes": [], "connections": []})
        self.write_canvas("deleted", {"id": "deleted", "deleted_at": 1, "nodes": [], "connections": []})
        (self.directory / "corrupt.json").write_text("{not-json", encoding="utf-8")

        active = audit_canvas_directory(str(self.directory))
        all_records = audit_canvas_directory(str(self.directory), include_deleted=True)

        self.assertEqual({"files": 2, "compatible": 1, "incompatible": 1}, {
            key: active["summary"][key] for key in ("files", "compatible", "incompatible")
        })
        self.assertEqual(3, all_records["summary"]["files"])
        corrupt = next(item for item in active["canvases"] if item["file"] == "corrupt.json")
        self.assertEqual("invalid-json", corrupt["issues"][0]["code"])

    def test_cli_returns_nonzero_only_for_incompatible_documents(self):
        self.write_canvas("valid", {"id": "valid", "nodes": [], "connections": []})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = main(["--directory", str(self.directory), "--summary-only"])
        payload = json.loads(output.getvalue())

        self.assertEqual(0, result)
        self.assertNotIn("canvases", payload)
        self.assertEqual(1, payload["summary"]["compatible"])

    def test_cli_marks_limited_scans_incomplete(self):
        self.write_canvas("one", {"id": "one", "nodes": [], "connections": []})
        self.write_canvas("two", {"id": "two", "nodes": [], "connections": []})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = main(["--directory", str(self.directory), "--summary-only", "--max-files", "1"])
        payload = json.loads(output.getvalue())

        self.assertEqual(2, result)
        self.assertFalse(payload["summary"]["complete"])
        self.assertTrue(payload["summary"]["truncated"])
        self.assertEqual(2, payload["summary"]["discovered_files"])


if __name__ == "__main__":
    unittest.main()
