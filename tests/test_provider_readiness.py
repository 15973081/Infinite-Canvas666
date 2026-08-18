import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.provider_readiness import build_provider_readiness_report


class ProviderReadinessTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workflow_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_workflows(self, names):
        for name in names:
            (self.workflow_dir / name).write_text(
                json.dumps({"1": {"class_type": "TestNode", "inputs": {}}}), encoding="utf-8",
            )

    def test_reports_static_capabilities_without_leaking_secret_values(self):
        required = ("image.json", "video.json")
        self.write_workflows(required)
        secret = "super-secret-value-never-serialize"
        providers = [
            {
                "id": "modelscope", "enabled": True,
                "base_url": f"https://user:{secret}@example.invalid/v1",
                "image_models": ["image-model"], "chat_models": ["chat-model"],
            },
            {
                "id": "video", "enabled": True, "base_url": "https://example.invalid/v1",
                "video_models": ["video-model"], "api_key": secret,
            },
        ]
        report = build_provider_readiness_report(
            providers=providers,
            workflow_directory=str(self.workflow_dir),
            comfy_instances=["127.0.0.1:8188"],
            credential_status={
                "modelscope": {"has_api_key": True, "has_credential": True},
                "video": {"has_api_key": True, "has_credential": True},
            },
            required_workflows=required,
        )

        serialized = json.dumps(report)
        self.assertTrue(report["ready"])
        self.assertFalse(report["network_checked"])
        self.assertFalse(report["secrets_included"])
        self.assertNotIn(secret, serialized)
        provider_keys = set().union(*(item.keys() for item in report["providers"]["items"]))
        self.assertFalse({"base_url", "api_key", "proxy_url", "key_preview"} & provider_keys)

    def test_identifies_missing_credentials_models_and_invalid_workflow(self):
        (self.workflow_dir / "broken.json").write_text("not-json", encoding="utf-8")
        report = build_provider_readiness_report(
            providers=[{
                "id": "modelscope", "enabled": True, "base_url": "https://example.invalid/v1",
                "image_models": ["image-model"], "chat_models": [], "video_models": [],
            }],
            workflow_directory=str(self.workflow_dir),
            comfy_instances=["127.0.0.1:8188"],
            credential_status={"modelscope": {"has_credential": False}},
            required_workflows=("broken.json", "missing.json"),
        )

        self.assertFalse(report["ready"])
        self.assertEqual(["image", "video", "chat", "modelscope", "comfy"], report["missing_capabilities"])
        self.assertEqual(["missing.json"], report["comfy"]["workflows"]["missing"])
        self.assertEqual(["broken.json"], report["comfy"]["workflows"]["invalid"])

    def test_volcengine_access_pair_only_proves_direct_video_capability(self):
        self.write_workflows(("workflow.json",))
        report = build_provider_readiness_report(
            providers=[{
                "id": "volcengine", "enabled": True, "base_url": "https://example.invalid/v1",
                "image_models": ["image-model"], "video_models": ["video-model"],
            }],
            workflow_directory=str(self.workflow_dir),
            comfy_instances=["127.0.0.1:8188"],
            credential_status={
                "volcengine": {"has_api_key": False, "has_access_pair": True, "has_credential": True},
            },
            required_workflows=("workflow.json",),
        )

        item = report["providers"]["items"][0]
        self.assertEqual(["video"], item["usable_capabilities"])
        self.assertFalse(report["readiness"]["image"])
        self.assertTrue(report["readiness"]["video"])


if __name__ == "__main__":
    unittest.main()
