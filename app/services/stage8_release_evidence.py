"""Validate Stage 8 manual release evidence without exposing evidence contents."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Mapping, Optional, Tuple

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import STAGE8_RELEASE_EVIDENCE_FILE


RELEASE_GATES = (
    "real-provider-validation",
    "historical-production-fixtures",
    "billing-reconciliation",
    "two-stable-release-cycles",
)
REQUIRED_PROVIDER_CHECKS = {"image", "video", "chat", "modelscope", "comfy"}


def _positive_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _timestamp(value: Any, now: datetime) -> Tuple[str, bool]:
    text = str(value or "").strip()
    if not text:
        return "", False
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return "", False
        parsed = parsed.astimezone(timezone.utc)
        if parsed > now + timedelta(minutes=5):
            return "", False
        return parsed.isoformat().replace("+00:00", "Z"), True
    except (TypeError, ValueError):
        return "", False


def _base_gate(name: str, raw: Any, now: datetime) -> Tuple[Dict[str, Any], Mapping[str, Any]]:
    item = raw if isinstance(raw, dict) else {}
    issues: List[str] = []
    status = str(item.get("status") or "pending").strip().lower()
    if status != "passed":
        issues.append("status-not-passed")
    completed_at, timestamp_ok = _timestamp(item.get("completed_at"), now)
    if not timestamp_ok:
        issues.append("completed-at-invalid")
    reviewer_present = bool(str(item.get("reviewer") or "").strip())
    if not reviewer_present:
        issues.append("reviewer-missing")
    evidence = item.get("evidence_refs") if isinstance(item.get("evidence_refs"), list) else []
    evidence_count = sum(1 for value in evidence if str(value or "").strip())
    if not evidence_count:
        issues.append("evidence-missing")
    return ({
        "gate": name,
        "status": status if status in {"pending", "passed", "failed"} else "invalid",
        "passed": False,
        "completed_at": completed_at,
        "reviewer_present": reviewer_present,
        "evidence_count": evidence_count,
        "issues": issues,
    }, item)


def _provider_gate(report: Dict[str, Any], item: Mapping[str, Any]) -> None:
    checks = item.get("checks") if isinstance(item.get("checks"), dict) else {}
    passed = set()
    for name in REQUIRED_PROVIDER_CHECKS:
        check = checks.get(name)
        if (
            isinstance(check, dict)
            and str(check.get("status") or "").strip().lower() == "passed"
            and bool(str(check.get("evidence_ref") or "").strip())
        ):
            passed.add(name)
    missing = sorted(REQUIRED_PROVIDER_CHECKS - passed)
    report["issues"].extend(f"provider-check-incomplete:{name}" for name in missing)
    report["required_check_count"] = len(REQUIRED_PROVIDER_CHECKS)
    report["passed_check_count"] = len(passed)


def _fixture_gate(report: Dict[str, Any], item: Mapping[str, Any]) -> None:
    sample_count = _positive_int(item.get("sample_count"))
    if sample_count < 1:
        report["issues"].append("production-sample-missing")
    report["sample_count"] = sample_count


def _billing_gate(report: Dict[str, Any], item: Mapping[str, Any]) -> None:
    compared = _positive_int(item.get("compared_task_count"))
    duplicates = _positive_int(item.get("duplicate_charge_count"))
    if compared < 1:
        report["issues"].append("compared-task-missing")
    if duplicates:
        report["issues"].append("duplicate-charge-detected")
    report["compared_task_count"] = compared
    report["duplicate_charge_count"] = duplicates


def _stable_cycles_gate(report: Dict[str, Any], item: Mapping[str, Any], now: datetime) -> None:
    raw_cycles = item.get("cycles") if isinstance(item.get("cycles"), list) else []
    valid_releases = set()
    for cycle in raw_cycles:
        if not isinstance(cycle, dict) or str(cycle.get("status") or "").lower() != "passed":
            continue
        release = str(cycle.get("release") or "").strip()
        _, completed_ok = _timestamp(cycle.get("completed_at"), now)
        evidence_ok = bool(str(cycle.get("evidence_ref") or "").strip())
        if release and completed_ok and evidence_ok:
            valid_releases.add(release)
    if len(valid_releases) < 2:
        report["issues"].append("stable-cycles-insufficient")
    report["required_cycle_count"] = 2
    report["valid_cycle_count"] = len(valid_releases)


def build_stage8_evidence_report(
    path: str = STAGE8_RELEASE_EVIDENCE_FILE,
    payload: Optional[Mapping[str, Any]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    file_present = payload is not None or Path(path).is_file()
    valid_json = True
    manifest: Mapping[str, Any]
    if payload is not None:
        manifest = payload
    else:
        try:
            loaded = json.loads(Path(path).read_text(encoding="utf-8-sig"))
            manifest = loaded if isinstance(loaded, dict) else {}
            valid_json = isinstance(loaded, dict)
        except FileNotFoundError:
            manifest = {}
        except (OSError, UnicodeError, json.JSONDecodeError):
            manifest = {}
            valid_json = False
    version_valid = manifest.get("version") == 1
    gates = manifest.get("gates") if isinstance(manifest.get("gates"), dict) else {}
    reports = []
    for name in RELEASE_GATES:
        report, item = _base_gate(name, gates.get(name), current)
        if name == "real-provider-validation":
            _provider_gate(report, item)
        elif name == "historical-production-fixtures":
            _fixture_gate(report, item)
        elif name == "billing-reconciliation":
            _billing_gate(report, item)
        else:
            _stable_cycles_gate(report, item, current)
        if not file_present:
            report["issues"].append("manifest-missing")
        elif not valid_json or not version_valid:
            report["issues"].append("manifest-invalid")
        report["issues"] = list(dict.fromkeys(report["issues"]))
        report["passed"] = not report["issues"]
        reports.append(report)
    pending = [report["gate"] for report in reports if not report["passed"]]
    return {
        "version": 1,
        "file_present": file_present,
        "valid_json": valid_json,
        "manifest_version_valid": version_valid,
        "evidence_values_included": False,
        "ready": not pending,
        "passed_gate_count": len(reports) - len(pending),
        "required_gate_count": len(reports),
        "pending_gates": pending,
        "gates": reports,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Stage 8 release evidence validator")
    parser.add_argument("--evidence-file", default=STAGE8_RELEASE_EVIDENCE_FILE)
    parser.add_argument("--strict", action="store_true", help="Fail while any evidence gate remains open")
    args = parser.parse_args(argv)
    report = build_stage8_evidence_report(args.evidence_file)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["valid_json"]:
        return 1
    return 2 if args.strict and not report["ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
