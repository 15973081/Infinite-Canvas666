import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services.stage8_release_evidence import RELEASE_GATES, build_stage8_evidence_report


NOW = datetime(2026, 8, 19, 8, 0, tzinfo=timezone.utc)


def complete_manifest(secret="internal-evidence-reference"):
    completed = "2026-08-19T07:00:00Z"
    checks = {
        name: {"status": "passed", "evidence_ref": f"{secret}-{name}"}
        for name in ("image", "video", "chat", "modelscope", "comfy")
    }
    return {
        "version": 1,
        "gates": {
            "real-provider-validation": {
                "status": "passed", "completed_at": completed, "reviewer": "release-owner",
                "evidence_refs": [secret], "checks": checks,
            },
            "historical-production-fixtures": {
                "status": "passed", "completed_at": completed, "reviewer": "release-owner",
                "evidence_refs": [secret], "sample_count": 12,
            },
            "billing-reconciliation": {
                "status": "passed", "completed_at": completed, "reviewer": "release-owner",
                "evidence_refs": [secret], "compared_task_count": 8, "duplicate_charge_count": 0,
            },
            "two-stable-release-cycles": {
                "status": "passed", "completed_at": completed, "reviewer": "release-owner",
                "evidence_refs": [secret],
                "cycles": [
                    {"release": "v1", "status": "passed", "completed_at": completed, "evidence_ref": secret},
                    {"release": "v2", "status": "passed", "completed_at": completed, "evidence_ref": secret},
                ],
            },
        },
    }


class Stage8ReleaseEvidenceTest(unittest.TestCase):
    def test_accepts_complete_evidence_without_returning_sensitive_values(self):
        secret = "private-ticket-and-provider-task-id"
        report = build_stage8_evidence_report(payload=complete_manifest(secret), now=NOW)

        self.assertTrue(report["ready"])
        self.assertEqual(4, report["passed_gate_count"])
        self.assertEqual([], report["pending_gates"])
        self.assertNotIn(secret, json.dumps(report))
        self.assertFalse(report["evidence_values_included"])

    def test_requires_each_provider_check_and_two_distinct_stable_cycles(self):
        manifest = complete_manifest()
        del manifest["gates"]["real-provider-validation"]["checks"]["video"]
        cycles = manifest["gates"]["two-stable-release-cycles"]["cycles"]
        cycles[1]["release"] = cycles[0]["release"]
        report = build_stage8_evidence_report(payload=manifest, now=NOW)

        self.assertFalse(report["ready"])
        self.assertEqual(
            ["real-provider-validation", "two-stable-release-cycles"], report["pending_gates"],
        )
        provider = report["gates"][0]
        stable = report["gates"][3]
        self.assertIn("provider-check-incomplete:video", provider["issues"])
        self.assertIn("stable-cycles-insufficient", stable["issues"])

    def test_missing_or_corrupt_manifest_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = build_stage8_evidence_report(str(Path(directory) / "missing.json"), now=NOW)
            corrupt_path = Path(directory) / "corrupt.json"
            corrupt_path.write_text("not-json", encoding="utf-8")
            corrupt = build_stage8_evidence_report(str(corrupt_path), now=NOW)

        self.assertEqual(list(RELEASE_GATES), missing["pending_gates"])
        self.assertFalse(missing["file_present"])
        self.assertFalse(corrupt["valid_json"])
        self.assertEqual(list(RELEASE_GATES), corrupt["pending_gates"])

    def test_rejects_future_or_incomplete_common_attestation(self):
        manifest = complete_manifest()
        gate = manifest["gates"]["historical-production-fixtures"]
        gate["completed_at"] = "2026-08-20T00:00:00Z"
        gate["reviewer"] = ""
        gate["evidence_refs"] = []
        report = build_stage8_evidence_report(payload=manifest, now=NOW)
        fixture = report["gates"][1]

        self.assertFalse(fixture["passed"])
        self.assertIn("completed-at-invalid", fixture["issues"])
        self.assertIn("reviewer-missing", fixture["issues"])
        self.assertIn("evidence-missing", fixture["issues"])


if __name__ == "__main__":
    unittest.main()
