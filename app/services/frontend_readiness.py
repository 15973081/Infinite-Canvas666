import argparse
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Dict, Iterable, List, Optional

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import BASE_DIR, CANVAS_DIR, CANVAS_ROLLOUT_FILE, CANVAS_ROLLOUT_METRICS_FILE, STAGE8_RELEASE_EVIDENCE_FILE
from app.services.canvas_audit import audit_canvas_directory
from app.services.canvas_billing_audit import audit_canvas_billing
from app.services.canvas_production_coverage import build_canvas_production_coverage_report
from app.services.canvas_rollout import get_canvas_rollout_policy
from app.services.canvas_rollout_metrics import get_canvas_rollout_metrics
from app.services.canvas_rollout_health import build_canvas_rollout_health_report
from app.services.provider_readiness import build_provider_readiness_report
from app.services.stage8_release_evidence import RELEASE_GATES, build_stage8_evidence_report


PRODUCTION_ENTRIES = {
    "angle.html", "api-settings.html", "asset-manager.html", "canvas.html",
    "comfyui-settings.html", "enhance.html", "gpt-chat.html", "index.html",
    "klein.html", "online.html", "smart-canvas.html", "zimage.html",
}
LEGACY_BUSINESS_SCRIPTS = {
    "angle.js", "api-settings.js", "asset-manager.js", "canvas-api.js", "canvas-core.js",
    "canvas.js", "comfyui-settings.js", "enhance.js", "gpt-chat.js", "klein.js",
    "online.js", "smart-canvas.js", "zimage.js",
}
MANUAL_RELEASE_GATES = list(RELEASE_GATES)


def build_frontend_readiness_report(
    repo_root: str = BASE_DIR,
    canvas_directory: str = CANVAS_DIR,
    rollout_path: str = CANVAS_ROLLOUT_FILE,
    metrics_path: str = CANVAS_ROLLOUT_METRICS_FILE,
    expected_entries: Optional[Iterable[str]] = None,
    policy: Optional[Dict[str, Any]] = None,
    metrics: Optional[Dict[str, Any]] = None,
    provider_report: Optional[Dict[str, Any]] = None,
    evidence_path: str = STAGE8_RELEASE_EVIDENCE_FILE,
    evidence_report: Optional[Dict[str, Any]] = None,
    rollout_health_report: Optional[Dict[str, Any]] = None,
    historical_coverage_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    root = Path(repo_root).resolve()
    static = root / "static"
    expected = set(expected_entries or PRODUCTION_ENTRIES)
    entry_reports = []
    code_blockers: List[str] = []

    for name in sorted(expected):
        path = static / name
        issues = []
        if not path.is_file():
            issues.append("entry-missing")
            source = ""
        else:
            source = path.read_text(encoding="utf-8-sig")
        script_sources = re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', source, flags=re.I)
        dist_modules = [value for value in script_sources if "/static/dist/" in value]
        if not re.search(r'<script\b[^>]*\btype=["\']module["\'][^>]*>', source, flags=re.I) or not dist_modules:
            issues.append("vite-module-missing")
        legacy = sorted({Path(value.split("?", 1)[0]).name for value in script_sources} & LEGACY_BUSINESS_SCRIPTS)
        if legacy:
            issues.append("legacy-business-script")
        missing_assets = []
        for value in dist_modules:
            relative = value.split("?", 1)[0].removeprefix("/static/")
            if relative and not (static / relative).is_file():
                missing_assets.append(relative)
        if missing_assets:
            issues.append("dist-asset-missing")
        entry_reports.append({
            "entry": name,
            "dist_modules": dist_modules,
            "legacy_business_scripts": legacy,
            "missing_assets": missing_assets,
            "ok": not issues,
            "issues": issues,
        })
        code_blockers.extend(f"entry:{name}:{issue}" for issue in issues)

    canvas_audit = audit_canvas_directory(canvas_directory, include_details=False, max_files=20000)
    audit_summary = canvas_audit["summary"]
    if not audit_summary.get("complete"):
        code_blockers.append("canvas-audit-incomplete")
    if int(audit_summary.get("incompatible") or 0):
        code_blockers.append("canvas-audit-incompatible")
    billing_audit = audit_canvas_billing(canvas_directory, max_files=20000)
    active_historical_coverage = historical_coverage_report if historical_coverage_report is not None else build_canvas_production_coverage_report(canvas_directory, max_files=20000)

    active_policy = policy if policy is not None else get_canvas_rollout_policy(rollout_path)
    active_metrics = metrics if metrics is not None else get_canvas_rollout_metrics(metrics_path)
    release_blockers = list(dict.fromkeys(str(item) for item in active_policy.get("blocked_reasons", []) if item))
    if int(active_policy.get("effective_percentage") or 0) <= 0:
        release_blockers.append("rollout-percentage-zero")
    if not any(int(value or 0) > 0 for value in active_metrics.get("events", {}).values()):
        release_blockers.append("telemetry-empty")
    active_rollout_health = rollout_health_report if rollout_health_report is not None else build_canvas_rollout_health_report(active_metrics, active_policy)
    if int(active_policy.get("effective_percentage") or 0) > 0 and active_rollout_health.get("status") != "healthy":
        release_blockers.append(f"rollout-health-{active_rollout_health.get('status') or 'unknown'}")
    if billing_audit["invalid_files"]:
        release_blockers.append("billing-audit-invalid-files")
    if billing_audit["duplicate_logs"]:
        release_blockers.append("billing-duplicate-records")
    if not active_historical_coverage.get("ready"):
        release_blockers.append("historical-production-coverage-insufficient")
    active_provider_report = provider_report if provider_report is not None else build_provider_readiness_report()
    for capability in active_provider_report.get("missing_capabilities", []):
        release_blockers.append(f"provider-capability-missing:{capability}")
    active_evidence_report = evidence_report if evidence_report is not None else build_stage8_evidence_report(evidence_path)
    release_blockers.extend(active_evidence_report.get("pending_gates", MANUAL_RELEASE_GATES))

    return {
        "version": 1,
        "repo_root": str(root),
        "code_migration_ready": not code_blockers,
        "production_release_ready": not code_blockers and not release_blockers,
        "code_blockers": code_blockers,
        "release_blockers": list(dict.fromkeys(release_blockers)),
        "entries": {
            "expected": len(expected),
            "passed": sum(1 for item in entry_reports if item["ok"]),
            "items": entry_reports,
        },
        "canvas_audit": audit_summary,
        "billing_audit": billing_audit,
        "historical_production_coverage": active_historical_coverage,
        "provider_readiness": active_provider_report,
        "release_evidence": active_evidence_report,
        "rollout": active_policy,
        "rollout_health": active_rollout_health,
        "telemetry": active_metrics,
        "manual_release_gates": MANUAL_RELEASE_GATES,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only full-site React migration and stage 8 readiness report")
    parser.add_argument("--repo-root", default=BASE_DIR)
    parser.add_argument("--canvas-directory", default=CANVAS_DIR)
    parser.add_argument("--rollout-file", default=CANVAS_ROLLOUT_FILE)
    parser.add_argument("--metrics-file", default=CANVAS_ROLLOUT_METRICS_FILE)
    parser.add_argument("--evidence-file", default=STAGE8_RELEASE_EVIDENCE_FILE)
    parser.add_argument("--strict", action="store_true", help="Also fail while any production release gate is open")
    args = parser.parse_args(argv)
    report = build_frontend_readiness_report(
        args.repo_root, args.canvas_directory, args.rollout_file, args.metrics_file,
        evidence_path=args.evidence_file,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["code_blockers"]:
        return 1
    if args.strict and report["release_blockers"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
