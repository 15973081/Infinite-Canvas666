import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.frontend_readiness import build_frontend_readiness_report


class FrontendReadinessTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "static" / "dist").mkdir(parents=True)
        self.canvas_dir = self.root / "canvases"
        self.canvas_dir.mkdir()
        (self.canvas_dir / "one.json").write_text(json.dumps({
            "id": "one", "kind": "smart", "nodes": [{"id": "legacy", "type": "smart-image"}], "connections": [],
        }), encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_entry(self, name="index.html", script="/static/dist/index-modern.js"):
        (self.root / "static" / name).write_text(
            f'<div id="root"></div><script type="module" src="{script}"></script>', encoding="utf-8",
        )
        asset = self.root / "static" / script.split("?", 1)[0].removeprefix("/static/")
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_text("export {};", encoding="utf-8")

    def report(self):
        return build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
        )

    def test_passes_code_migration_but_keeps_manual_release_gates_explicit(self):
        self.write_entry()
        report = self.report()

        self.assertTrue(report["code_migration_ready"])
        self.assertFalse(report["production_release_ready"])
        self.assertEqual(1, report["entries"]["passed"])
        self.assertEqual({"smart-image": 1}, report["canvas_audit"]["legacy_smart_node_types"])
        self.assertEqual(report["manual_release_gates"], report["release_blockers"])

    def test_blocks_missing_bundles_and_legacy_business_scripts(self):
        (self.root / "static" / "index.html").write_text(
            '<script src="/static/js/smart-canvas.js"></script>', encoding="utf-8",
        )
        report = self.report()

        self.assertFalse(report["code_migration_ready"])
        self.assertIn("entry:index.html:vite-module-missing", report["code_blockers"])
        self.assertIn("entry:index.html:legacy-business-script", report["code_blockers"])


if __name__ == "__main__":
    unittest.main()
