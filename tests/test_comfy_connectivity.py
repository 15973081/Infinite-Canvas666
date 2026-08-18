import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.comfy_connectivity import build_comfy_connectivity_report


class ComfyConnectivityTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "one.json").write_text(json.dumps({
            "1": {"class_type": "LoadImage", "inputs": {}},
            "2": {"class_type": "SaveImage", "inputs": {}},
        }), encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_all_instances_must_expose_every_workflow_dependency(self):
        calls = []

        def fetch(address, endpoint, timeout, max_bytes):
            calls.append((address, endpoint))
            if endpoint == "/object_info":
                return {"LoadImage": {}, **({"SaveImage": {}} if address == "ready:8188" else {})}
            return {}

        report = build_comfy_connectivity_report(
            instances=["ready:8188", "missing:8188"], workflow_directory=str(self.root),
            workflow_names=("one.json",), probe_network=True, fetch_json=fetch,
        )

        self.assertFalse(report["ready"])
        self.assertEqual(1, report["ready_instance_count"])
        self.assertTrue(report["instances"][0]["ready"])
        self.assertEqual(1, report["instances"][1]["missing_node_type_count"])
        self.assertEqual({"/queue", "/system_stats", "/object_info"}, {endpoint for _, endpoint in calls})
        self.assertTrue(all(endpoint != "/prompt" for _, endpoint in calls))

    def test_probe_never_serializes_addresses_or_exception_details(self):
        secret = "private-hostname-and-token"

        def fail(address, endpoint, timeout, max_bytes):
            raise RuntimeError(f"cannot reach {address}: {secret}")

        report = build_comfy_connectivity_report(
            instances=[f"{secret}:8188"], workflow_directory=str(self.root),
            workflow_names=("one.json",), probe_network=True, fetch_json=fail,
        )
        serialized = json.dumps(report)

        self.assertFalse(report["ready"])
        self.assertNotIn(secret, serialized)
        self.assertFalse(report["addresses_included"])
        self.assertFalse(report["secrets_included"])
        self.assertEqual("probe-failed", report["instances"][0]["error_code"])

    def test_no_network_mode_reports_static_dependencies_without_calling_fetcher(self):
        called = False

        def fail_if_called(address, endpoint, timeout, max_bytes):
            nonlocal called
            called = True
            return {}

        report = build_comfy_connectivity_report(
            instances=["127.0.0.1:8188"], workflow_directory=str(self.root),
            workflow_names=("one.json",), fetch_json=fail_if_called,
        )

        self.assertFalse(called)
        self.assertFalse(report["network_checked"])
        self.assertEqual("not-probed", report["instances"][0]["error_code"])

    def test_invalid_workflow_cannot_pass_even_with_available_nodes(self):
        (self.root / "broken.json").write_text("not-json", encoding="utf-8")
        report = build_comfy_connectivity_report(
            instances=["ready:8188"], workflow_directory=str(self.root),
            workflow_names=("broken.json",), probe_network=True,
            fetch_json=lambda address, endpoint, timeout, max_bytes: {},
        )

        self.assertFalse(report["ready"])
        self.assertFalse(report["workflow_json_valid"])


if __name__ == "__main__":
    unittest.main()
