import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services import canvas_rollout


class CanvasRolloutPolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.directory = self.root / "canvases"
        self.directory.mkdir()
        self.policy_path = self.root / "rollout.json"
        canvas_rollout.clear_canvas_rollout_cache()

    def tearDown(self):
        canvas_rollout.clear_canvas_rollout_cache()
        self.temp_dir.cleanup()

    def write_policy(self, **overrides):
        policy = {
            "enabled": True,
            "percentage": 25,
            "kill_switch": False,
            "require_audit": True,
            "max_audit_files": 20000,
            **overrides,
        }
        self.policy_path.write_text(json.dumps(policy), encoding="utf-8")

    def policy(self):
        with patch.object(canvas_rollout, "CANVAS_DIR", str(self.directory)), patch.dict(os.environ, {}, clear=True):
            return canvas_rollout.get_canvas_rollout_policy(str(self.policy_path))

    def test_missing_configuration_defaults_to_the_audited_react_canvas(self):
        result = self.policy()

        self.assertTrue(result["enabled"])
        self.assertEqual(100, result["effective_percentage"])
        self.assertEqual([], result["blocked_reasons"])
        self.assertTrue(result["audit"]["complete"])

    def test_compatible_audit_allows_configured_percentage(self):
        self.write_policy()
        (self.directory / "valid.json").write_text(
            json.dumps({"id": "valid", "nodes": [], "connections": []}), encoding="utf-8",
        )

        result = self.policy()

        self.assertEqual(25, result["effective_percentage"])
        self.assertEqual([], result["blocked_reasons"])
        self.assertEqual(1, result["audit"]["compatible"])

    def test_incompatible_history_blocks_an_enabled_rollout(self):
        self.write_policy()
        (self.directory / "broken.json").write_text("{not-json", encoding="utf-8")

        result = self.policy()

        self.assertEqual(0, result["effective_percentage"])
        self.assertIn("audit-incompatible", result["blocked_reasons"])
        self.assertEqual(1, result["audit"]["incompatible"])

    def test_environment_kill_switch_overrides_valid_configuration(self):
        self.write_policy(percentage=100)
        with patch.object(canvas_rollout, "CANVAS_DIR", str(self.directory)), patch.dict(
            os.environ, {"CANVAS_V2_KILL_SWITCH": "true"}, clear=True,
        ):
            result = canvas_rollout.get_canvas_rollout_policy(str(self.policy_path))

        self.assertTrue(result["kill_switch"])
        self.assertEqual(0, result["effective_percentage"])
        self.assertIn("kill-switch", result["blocked_reasons"])

    def test_invalid_environment_value_cannot_clear_a_file_kill_switch(self):
        self.write_policy(kill_switch=True)
        with patch.object(canvas_rollout, "CANVAS_DIR", str(self.directory)), patch.dict(
            os.environ, {"CANVAS_V2_KILL_SWITCH": "typo"}, clear=True,
        ):
            result = canvas_rollout.get_canvas_rollout_policy(str(self.policy_path))

        self.assertTrue(result["kill_switch"])
        self.assertIn("kill-switch", result["blocked_reasons"])


if __name__ == "__main__":
    unittest.main()
