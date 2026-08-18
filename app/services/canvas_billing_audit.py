import argparse
from collections import defaultdict
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import CANVAS_DIR


FAILED_STATUSES = {"cancelled", "error", "failed"}


def audit_canvas_billing(directory: str = CANVAS_DIR, max_files: int = 20000) -> Dict[str, Any]:
    files = sorted(name for name in os.listdir(directory) if name.lower().endswith(".json")) if os.path.isdir(directory) else []
    selected = files[:max_files]
    identities: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    priced_micros = 0
    successful = unidentified = unknown_cost = 0
    invalid_files = []

    for filename in selected:
        try:
            with open(os.path.join(directory, filename), "r", encoding="utf-8-sig") as handle:
                document = json.load(handle)
        except Exception as exc:
            invalid_files.append({"file": filename, "error": str(exc)})
            continue
        if not isinstance(document, dict) or document.get("deleted_at"):
            continue
        for index, raw in enumerate(document.get("logs") or []):
            if not isinstance(raw, dict) or str(raw.get("status") or "").lower() in FAILED_STATUSES:
                continue
            successful += 1
            identity = billing_identity(raw)
            amount = billing_amount_micros(raw)
            if amount is None:
                unknown_cost += 1
            else:
                priced_micros += amount
            record = {
                "canvas_id": str(document.get("id") or Path(filename).stem),
                "file": filename,
                "log_id": str(raw.get("id") or index),
                "amount_micros": amount,
            }
            if identity:
                identities[identity].append(record)
            else:
                unidentified += 1

    duplicates = []
    duplicate_micros = 0
    for identity, records in sorted(identities.items()):
        if len(records) < 2:
            continue
        amounts = [int(item["amount_micros"] or 0) for item in records]
        duplicate_micros += sum(sorted(amounts, reverse=True)[1:])
        duplicates.append({"identity": identity, "count": len(records), "records": records})

    return {
        "directory": os.path.abspath(directory),
        "complete": len(files) <= max_files,
        "discovered_files": len(files),
        "files": len(selected),
        "invalid_files": invalid_files,
        "successful_logs": successful,
        "identified_logs": sum(len(value) for value in identities.values()),
        "unidentified_logs": unidentified,
        "unknown_cost_logs": unknown_cost,
        "priced_amount_micros": priced_micros,
        "duplicate_groups": duplicates,
        "duplicate_logs": sum(item["count"] - 1 for item in duplicates),
        "duplicate_amount_micros": duplicate_micros,
    }


def billing_identity(log: Dict[str, Any]) -> str:
    request = log.get("request") if isinstance(log.get("request"), dict) else {}
    run = log.get("run") if isinstance(log.get("run"), dict) else {}
    sources: List[Tuple[str, Any]] = [
        ("upstream-task", log.get("upstreamTaskId") or log.get("upstream_task_id") or request.get("upstream_task_id")),
        ("canvas-task", log.get("canvasTaskId") or log.get("taskId") or log.get("task_id") or request.get("task_id") or request.get("taskId")),
        ("idempotency", log.get("idempotencyKey") or log.get("idempotency_key") or request.get("idempotency_key")),
        ("request", log.get("requestId") or log.get("request_id") or request.get("request_id") or request.get("requestId")),
        ("run-task", run.get("taskId") or run.get("task_id")),
    ]
    for kind, value in sources:
        text = str(value or "").strip()
        if text:
            return f"{kind}:{text}"
    return ""


def billing_amount_micros(log: Dict[str, Any]) -> Optional[int]:
    cost = log.get("cost")
    if isinstance(cost, dict):
        amount = cost.get("amount_micros")
        if amount is not None and str(cost.get("status") or "priced") == "priced":
            return normalized_micros(amount)
    for key in ("amount_micros", "cost_micros"):
        if log.get(key) is not None:
            return normalized_micros(log[key])
    for value in (cost, log.get("cost_cny")):
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return normalized_micros(value, 1_000_000)
    return None


def normalized_micros(value: Any, scale: int = 1) -> Optional[int]:
    try:
        number = float(value) * scale
        return max(0, int(round(number))) if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only duplicate billing evidence audit for Canvas logs")
    parser.add_argument("--directory", default=CANVAS_DIR)
    parser.add_argument("--max-files", type=int, default=20000)
    args = parser.parse_args(argv)
    report = audit_canvas_billing(args.directory, max(1, args.max_files))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["complete"]:
        return 2
    return 1 if report["invalid_files"] or report["duplicate_logs"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
