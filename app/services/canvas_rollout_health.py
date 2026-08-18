"""Read-only health assessment for Canvas V2 staged rollout telemetry."""
import argparse
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Mapping, Optional

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import CANVAS_ROLLOUT_FILE, CANVAS_ROLLOUT_METRICS_FILE
from app.services.canvas_rollout import get_canvas_rollout_policy
from app.services.canvas_rollout_metrics import get_canvas_rollout_metrics


DEFAULT_THRESHOLDS = {
    "board_mount": {"minimum_samples": 20, "maximum_failure_rate": 0.01},
    "save": {"minimum_samples": 20, "maximum_failure_rate": 0.02},
    "execution": {"minimum_samples": 10, "maximum_failure_rate": 0.05},
    "task_poll": {"minimum_samples": 50, "maximum_failure_rate": 0.05},
}


def _event_count(metrics: Mapping[str, Any], event: str, mode: str = "enabled") -> int:
    try:
        return max(0, int(metrics.get("event_dimensions", {}).get(event, {}).get("mode", {}).get(mode, 0)))
    except (AttributeError, TypeError, ValueError):
        return 0


def _event_counter(metrics: Mapping[str, Any], event: str, counter: str, mode: str = "enabled") -> int:
    try:
        return max(0, int(metrics.get("event_counters", {}).get(event, {}).get(mode, {}).get(counter, 0)))
    except (AttributeError, TypeError, ValueError):
        return 0


def _check(name: str, failures: int, samples: int, threshold: Mapping[str, Any]) -> Dict[str, Any]:
    minimum = max(1, int(threshold.get("minimum_samples") or 1))
    maximum_rate = max(0.0, min(1.0, float(threshold.get("maximum_failure_rate") or 0)))
    rate = failures / samples if samples else 0.0
    sufficient = samples >= minimum
    within_threshold = rate <= maximum_rate
    status = "unhealthy" if samples and not within_threshold else "healthy" if sufficient else "insufficient"
    return {
        "name": name,
        "status": status,
        "passed": status == "healthy",
        "failures": failures,
        "samples": samples,
        "failure_rate": round(rate, 6),
        "minimum_samples": minimum,
        "maximum_failure_rate": maximum_rate,
    }


def build_canvas_rollout_health_report(
    metrics: Optional[Mapping[str, Any]] = None,
    policy: Optional[Mapping[str, Any]] = None,
    thresholds: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> Dict[str, Any]:
    active_metrics = metrics if metrics is not None else get_canvas_rollout_metrics(CANVAS_ROLLOUT_METRICS_FILE)
    active_policy = policy if policy is not None else get_canvas_rollout_policy(CANVAS_ROLLOUT_FILE)
    configured = {**DEFAULT_THRESHOLDS, **(thresholds or {})}

    board_failures = _event_count(active_metrics, "board-mount-failed")
    board_samples = board_failures + _event_count(active_metrics, "board-mounted")
    save_failures = _event_count(active_metrics, "save-failed")
    save_samples = save_failures + _event_count(active_metrics, "save-succeeded")
    execution_failures = _event_count(active_metrics, "execution-failed")
    execution_samples = execution_failures + _event_count(active_metrics, "execution-succeeded") + _event_count(active_metrics, "execution-stopped")
    task_failures = _event_counter(active_metrics, "page-summary", "task_poll_errors")
    task_samples = _event_counter(active_metrics, "page-summary", "task_polls")

    checks = [
        _check("board-mount", board_failures, board_samples, configured["board_mount"]),
        _check("save", save_failures, save_samples, configured["save"]),
        _check("execution", execution_failures, execution_samples, configured["execution"]),
        _check("task-poll", task_failures, task_samples, configured["task_poll"]),
    ]
    percentage = max(0, int(active_policy.get("effective_percentage") or 0))
    if percentage <= 0:
        status = "inactive"
    elif any(item["status"] == "unhealthy" for item in checks):
        status = "unhealthy"
    elif any(item["status"] == "insufficient" for item in checks):
        status = "insufficient"
    else:
        status = "healthy"
    return {
        "version": 1,
        "status": status,
        "ready_for_promotion": status == "healthy",
        "effective_percentage": percentage,
        "joint_telemetry_present": bool(active_metrics.get("event_dimensions")),
        "checks": checks,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Canvas V2 rollout health evaluator")
    parser.add_argument("--metrics-file", default=CANVAS_ROLLOUT_METRICS_FILE)
    parser.add_argument("--rollout-file", default=CANVAS_ROLLOUT_FILE)
    parser.add_argument("--strict", action="store_true", help="Fail unless active rollout telemetry is healthy")
    args = parser.parse_args(argv)
    report = build_canvas_rollout_health_report(
        get_canvas_rollout_metrics(args.metrics_file), get_canvas_rollout_policy(args.rollout_file),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if args.strict and not report["ready_for_promotion"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
