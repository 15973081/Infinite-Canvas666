import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.frontend_readiness import MANUAL_RELEASE_GATES, build_frontend_readiness_report


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
        provider_report = {
            "ready": True, "missing_capabilities": [],
            "readiness": {"image": True, "video": True, "chat": True, "modelscope": True, "comfy": True},
        }
        return build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
            provider_report=provider_report,
            evidence_report={"pending_gates": MANUAL_RELEASE_GATES},
            rollout_health_report={"status": "healthy", "ready_for_promotion": True},
            historical_coverage_report={"ready": True},
        )

    def test_passes_code_migration_but_keeps_manual_release_gates_explicit(self):
        self.write_entry()
        report = self.report()

        self.assertTrue(report["code_migration_ready"])
        self.assertFalse(report["production_release_ready"])
        self.assertEqual(1, report["entries"]["passed"])
        self.assertEqual({"smart-image": 1}, report["canvas_audit"]["legacy_smart_node_types"])
        self.assertEqual(0, report["billing_audit"]["duplicate_logs"])
        self.assertEqual(report["manual_release_gates"], report["release_blockers"])

    def test_blocks_missing_bundles_and_legacy_business_scripts(self):
        (self.root / "static" / "index.html").write_text(
            '<script src="/static/js/smart-canvas.js"></script>', encoding="utf-8",
        )
        report = self.report()

        self.assertFalse(report["code_migration_ready"])
        self.assertIn("entry:index.html:vite-module-missing", report["code_blockers"])
        self.assertIn("entry:index.html:legacy-business-script", report["code_blockers"])

    def test_blocks_inline_business_scripts_but_allows_the_theme_preload(self):
        self.write_entry()
        path = self.root / "static" / "index.html"
        path.write_text(
            path.read_text(encoding="utf-8") + '<script>window.runLegacyPage = () => {};</script>',
            encoding="utf-8",
        )

        report = self.report()

        self.assertFalse(report["code_migration_ready"])
        self.assertIn("entry:index.html:inline-business-script", report["code_blockers"])
        self.assertEqual(1, report["entries"]["items"][0]["inline_business_scripts"])

        path.write_text(
            '<script data-theme-preload>document.documentElement.classList.add("theme-dark")</script>'
            '<script type="module" src="/static/dist/index-modern.js"></script>',
            encoding="utf-8",
        )
        allowed = self.report()
        self.assertTrue(allowed["code_migration_ready"])
        self.assertEqual(0, allowed["entries"]["items"][0]["inline_business_scripts"])

    def test_blocks_missing_vite_stylesheets(self):
        self.write_entry()
        path = self.root / "static" / "index.html"
        path.write_text(
            path.read_text(encoding="utf-8") + '<link rel="stylesheet" href="/static/dist/missing.css">',
            encoding="utf-8",
        )

        report = self.report()

        self.assertFalse(report["code_migration_ready"])
        self.assertIn("entry:index.html:dist-asset-missing", report["code_blockers"])
        self.assertEqual(["dist/missing.css"], report["entries"]["items"][0]["missing_assets"])

    def test_blocks_stylesheets_outside_the_vite_build(self):
        self.write_entry()
        path = self.root / "static" / "index.html"
        path.write_text(
            path.read_text(encoding="utf-8") + '<link rel="stylesheet" href="/static/css/legacy.css">',
            encoding="utf-8",
        )

        report = self.report()

        self.assertFalse(report["code_migration_ready"])
        self.assertIn("entry:index.html:legacy-stylesheet", report["code_blockers"])
        self.assertEqual(["/static/css/legacy.css"], report["entries"]["items"][0]["legacy_stylesheets"])

    def test_keeps_missing_provider_capabilities_out_of_code_migration_status(self):
        self.write_entry()
        report = build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
            provider_report={"ready": False, "missing_capabilities": ["video", "comfy"]},
            evidence_report={"pending_gates": MANUAL_RELEASE_GATES},
            rollout_health_report={"status": "healthy", "ready_for_promotion": True},
            historical_coverage_report={"ready": True},
        )

        self.assertTrue(report["code_migration_ready"])
        self.assertIn("provider-capability-missing:video", report["release_blockers"])
        self.assertIn("provider-capability-missing:comfy", report["release_blockers"])

    def test_complete_evidence_can_close_only_the_manual_release_gates(self):
        self.write_entry()
        report = build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
            provider_report={"ready": True, "missing_capabilities": []},
            evidence_report={"ready": True, "pending_gates": []},
            rollout_health_report={"status": "healthy", "ready_for_promotion": True},
            historical_coverage_report={"ready": True},
        )

        self.assertTrue(report["production_release_ready"])
        self.assertEqual([], report["release_blockers"])

    def test_active_rollout_requires_healthy_joint_telemetry(self):
        self.write_entry()
        report = build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
            provider_report={"ready": True, "missing_capabilities": []},
            evidence_report={"ready": True, "pending_gates": []},
            rollout_health_report={"status": "insufficient", "ready_for_promotion": False},
            historical_coverage_report={"ready": True},
        )

        self.assertIn("rollout-health-insufficient", report["release_blockers"])
        self.assertFalse(report["production_release_ready"])

    def test_missing_historical_feature_coverage_blocks_release_not_code_migration(self):
        self.write_entry()
        report = build_frontend_readiness_report(
            str(self.root), str(self.canvas_dir), expected_entries={"index.html"},
            policy={"effective_percentage": 5, "blocked_reasons": []},
            metrics={"events": {"board-mounted": 1}, "dimensions": {}, "counters": {}},
            provider_report={"ready": True, "missing_capabilities": []},
            evidence_report={"ready": True, "pending_gates": []},
            rollout_health_report={"status": "healthy", "ready_for_promotion": True},
            historical_coverage_report={"ready": False, "missing_features": ["video-path"]},
        )

        self.assertTrue(report["code_migration_ready"])
        self.assertIn("historical-production-coverage-insufficient", report["release_blockers"])


if __name__ == "__main__":
    unittest.main()
