"""Anonymous, read-only feature coverage audit for historical Canvas documents."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import CANVAS_DIR
from app.services.canvas_audit import KNOWN_NODE_TYPES, LEGACY_SMART_NODE_TYPES, audit_canvas_file
from app.services.canvas_billing_audit import billing_amount_micros


REQUIRED_FEATURES = (
    "classic-document",
    "smart-document",
    "connected-graph",
    "generator-path",
    "modelscope-path",
    "video-path",
    "comfy-path",
    "llm-path",
    "ltx-timeline",
    "output-path",
    "pending-recovery",
    "priced-billing",
    "failure-log",
)
SAFE_NODE_TYPES = KNOWN_NODE_TYPES | LEGACY_SMART_NODE_TYPES
FAILURE_STATUSES = {"cancelled", "error", "failed", "failure"}


def _documents(directory: str, max_files: int) -> tuple[List[Mapping[str, Any]], Dict[str, int]]:
    documents = []
    stats = {"discovered_files": 0, "invalid_files": 0, "deleted_files": 0}
    try:
        filenames = sorted(name for name in os.listdir(directory) if name.lower().endswith(".json"))
    except FileNotFoundError:
        filenames = []
    stats["discovered_files"] = len(filenames)
    for filename in filenames[:max_files]:
        path = Path(directory, filename)
        audit = audit_canvas_file(str(path))
        if not audit.get("compatible"):
            stats["invalid_files"] += 1
            continue
        if audit.get("deleted"):
            stats["deleted_files"] += 1
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            stats["invalid_files"] += 1
            continue
        if not isinstance(payload, dict) or not isinstance(payload.get("nodes", []), list) or not isinstance(payload.get("connections", []), list):
            stats["invalid_files"] += 1
            continue
        documents.append(payload)
    return documents, stats


def _node_type(node: Mapping[str, Any], kind: str) -> str:
    value = str(node.get("type") or "").strip()
    return value or ("smart-image" if kind == "smart" else "")


def _has_value(item: Mapping[str, Any], names: Iterable[str]) -> bool:
    for name in names:
        value = item.get(name)
        if value is not None and value != "" and value is not False:
            return True
    return False


def _document_features(document: Mapping[str, Any]) -> tuple[Set[str], Counter[str], int]:
    kind = "smart" if str(document.get("kind") or "").lower() == "smart" else "classic"
    features = {f"{kind}-document"}
    nodes = [node for node in document.get("nodes", []) if isinstance(node, dict)]
    connections = [edge for edge in document.get("connections", []) if isinstance(edge, dict)]
    if connections:
        features.add("connected-graph")
    node_types: Counter[str] = Counter()
    unknown_count = 0
    for node in nodes:
        node_type = _node_type(node, kind)
        if node_type in SAFE_NODE_TYPES:
            node_types[node_type] += 1
        elif node_type:
            unknown_count += 1
        if node_type == "generator":
            features.add("generator-path")
        if node_type == "msgen":
            features.add("modelscope-path")
        if node_type == "video":
            features.add("video-path")
        if node_type == "comfy":
            features.add("comfy-path")
        if node_type == "llm":
            features.add("llm-path")
        if node_type == "ltxDirector" and _has_value(node, ("ltxTimelineData", "timeline_data", "segments")):
            features.add("ltx-timeline")
        if node_type in {"output", "smart-image"}:
            features.add("output-path")
        pending = node.get("_pending")
        if (isinstance(pending, list) and pending) or _has_value(node, ("recoveryStatus", "recovery_status", "recovered_after_restart")):
            features.add("pending-recovery")
        run_settings = node.get("runSettings") if isinstance(node.get("runSettings"), dict) else {}
        if str(run_settings.get("engine") or "").lower() == "modelscope":
            features.add("modelscope-path")
    settings = document.get("settings") if isinstance(document.get("settings"), dict) else {}
    if str(settings.get("engine") or "").lower() == "modelscope":
        features.add("modelscope-path")
    logs = document.get("logs") if isinstance(document.get("logs"), list) else []
    for log in (item for item in logs if isinstance(item, dict)):
        if billing_amount_micros(log) is not None:
            features.add("priced-billing")
        if str(log.get("status") or "").strip().lower() in FAILURE_STATUSES:
            features.add("failure-log")
    return features, node_types, unknown_count


def build_canvas_production_coverage_report(
    directory: str = CANVAS_DIR,
    max_files: int = 5000,
    minimum_documents: int = 2,
    required_features: Iterable[str] = REQUIRED_FEATURES,
) -> Dict[str, Any]:
    limit = max(1, int(max_files))
    minimum = max(1, int(minimum_documents))
    allowed_features = set(REQUIRED_FEATURES)
    required = tuple(dict.fromkeys(str(value) for value in required_features if str(value) in allowed_features))
    documents, stats = _documents(directory, limit)
    feature_documents: Counter[str] = Counter()
    node_types: Counter[str] = Counter()
    unknown_node_count = 0
    for document in documents:
        features, document_node_types, unknown = _document_features(document)
        feature_documents.update(features)
        node_types.update(document_node_types)
        unknown_node_count += unknown
    missing = [name for name in required if not feature_documents[name]]
    complete = stats["discovered_files"] <= limit
    ready = complete and not stats["invalid_files"] and len(documents) >= minimum and not missing
    return {
        "version": 1,
        "ready": ready,
        "complete": complete,
        "secrets_included": False,
        "identifiers_included": False,
        "discovered_files": stats["discovered_files"],
        "documents": len(documents),
        "minimum_documents": minimum,
        "invalid_files": stats["invalid_files"],
        "deleted_files": stats["deleted_files"],
        "known_node_types": dict(sorted(node_types.items())),
        "unknown_node_count": unknown_node_count,
        "required_features": list(required),
        "covered_feature_count": len(required) - len(missing),
        "missing_features": missing,
        "feature_document_counts": {name: feature_documents[name] for name in required},
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Anonymous historical Canvas production coverage audit")
    parser.add_argument("--directory", default=CANVAS_DIR)
    parser.add_argument("--max-files", type=int, default=5000)
    parser.add_argument("--minimum-documents", type=int, default=2)
    parser.add_argument("--strict", action="store_true", help="Fail unless all required historical features are covered")
    args = parser.parse_args(argv)
    report = build_canvas_production_coverage_report(args.directory, args.max_files, max(1, args.minimum_documents))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["complete"]:
        return 1
    return 2 if args.strict and not report["ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
