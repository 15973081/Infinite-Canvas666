import argparse
import json
import os
from pathlib import Path
import sys
import time
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import CANVAS_DIR


KNOWN_NODE_TYPES = {
    "comfy", "generator", "group", "image", "llm", "loop", "ltxDirector",
    "msgen", "output", "prompt", "promptGroup", "video",
}
TRANSIENT_NODE_FIELDS = {"_cascadeFailed", "_cascadeIdx", "running"}
SUPPORTED_SCHEMA_VERSION = 1


def audit_canvas_directory(
    directory: str = CANVAS_DIR, include_deleted: bool = False, include_details: bool = True,
    max_files: int = 5000,
) -> Dict[str, Any]:
    started = time.time()
    reports: List[Dict[str, Any]] = []
    node_types: Counter[str] = Counter()
    unknown_types: Counter[str] = Counter()
    filenames = []
    discovered_files = 0
    try:
        all_filenames = sorted(name for name in os.listdir(directory) if name.lower().endswith(".json"))
        discovered_files = len(all_filenames)
        filenames = all_filenames[:max_files]
    except FileNotFoundError:
        filenames = []

    for filename in filenames:
        report = audit_canvas_file(os.path.join(directory, filename))
        if not include_deleted and report.get("deleted"):
            continue
        reports.append(report)
        node_types.update(report.pop("_node_types", {}))
        unknown_types.update(report.get("unknown_node_types", {}))

    errors = sum(report["error_count"] for report in reports)
    warnings = sum(report["warning_count"] for report in reports)
    compatible = sum(1 for report in reports if report["compatible"])
    result = {
        "directory": os.path.abspath(directory),
        "generated_at": int(time.time() * 1000),
        "duration_ms": int((time.time() - started) * 1000),
        "summary": {
            "complete": discovered_files <= max_files,
            "compatible": compatible,
            "discovered_files": discovered_files,
            "errors": errors,
            "files": len(reports),
            "incompatible": len(reports) - compatible,
            "node_types": dict(sorted(node_types.items())),
            "truncated": discovered_files > max_files,
            "unknown_node_types": dict(sorted(unknown_types.items())),
            "warnings": warnings,
        },
    }
    if include_details:
        result["canvases"] = reports
    return result


def audit_canvas_file(path: str) -> Dict[str, Any]:
    issues: List[Dict[str, str]] = []
    filename = os.path.basename(path)
    report: Dict[str, Any] = {
        "compatible": False,
        "deleted": False,
        "edge_count": 0,
        "error_count": 0,
        "file": filename,
        "id": "",
        "issues": issues,
        "kind": "classic",
        "node_count": 0,
        "schema_version": 1,
        "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        "title": "",
        "unknown_node_types": {},
        "warning_count": 0,
        "_node_types": {},
    }
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            document = json.load(handle)
    except Exception as exc:
        _issue(issues, "error", "invalid-json", "$", str(exc))
        return _finish(report)
    if not isinstance(document, dict):
        _issue(issues, "error", "invalid-root", "$", "Canvas document must be an object")
        return _finish(report)

    report.update({
        "deleted": bool(document.get("deleted_at")),
        "id": str(document.get("id") or ""),
        "kind": "smart" if str(document.get("kind") or "").lower() == "smart" else "classic",
        "schema_version": document.get("schemaVersion", 1),
        "title": str(document.get("title") or ""),
    })
    if not report["id"]:
        _issue(issues, "error", "missing-canvas-id", "id", "Canvas ID is required")
    elif os.path.splitext(filename)[0] != report["id"]:
        _issue(issues, "warning", "filename-id-mismatch", "id", "Filename and canvas ID differ")
    schema_version = document.get("schemaVersion", 1)
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version < 1:
        _issue(issues, "error", "invalid-schema-version", "schemaVersion", "schemaVersion must be a positive integer")
    elif schema_version > SUPPORTED_SCHEMA_VERSION:
        _issue(issues, "warning", "future-schema-version", "schemaVersion", f"Future schema version {schema_version}")

    nodes = document.get("nodes", [])
    edges = document.get("connections", [])
    if not isinstance(nodes, list):
        _issue(issues, "error", "invalid-nodes", "nodes", "nodes must be an array")
        nodes = []
    if not isinstance(edges, list):
        _issue(issues, "error", "invalid-connections", "connections", "connections must be an array")
        edges = []
    report["node_count"] = len(nodes)
    report["edge_count"] = len(edges)

    node_ids = set()
    node_types: Counter[str] = Counter()
    unknown_types: Counter[str] = Counter()
    for index, node in enumerate(nodes):
        path_prefix = f"nodes[{index}]"
        if not isinstance(node, dict):
            _issue(issues, "error", "invalid-node", path_prefix, "Node must be an object")
            continue
        node_id = str(node.get("id") or "")
        node_type = str(node.get("type") or "")
        if not node_id:
            _issue(issues, "error", "missing-node-id", f"{path_prefix}.id", "Node ID is required")
        elif node_id in node_ids:
            _issue(issues, "error", "duplicate-node-id", f"{path_prefix}.id", node_id)
        else:
            node_ids.add(node_id)
        if not node_type:
            _issue(issues, "error", "missing-node-type", f"{path_prefix}.type", "Node type is required")
        else:
            node_types[node_type] += 1
            if node_type not in KNOWN_NODE_TYPES:
                unknown_types[node_type] += 1
                _issue(issues, "warning", "unknown-node-type", f"{path_prefix}.type", node_type)
        for field in TRANSIENT_NODE_FIELDS.intersection(node):
            if node.get(field):
                _issue(issues, "warning", "persisted-runtime-field", f"{path_prefix}.{field}", field)
        inputs = node.get("inputs")
        if inputs is not None and not isinstance(inputs, list):
            _issue(issues, "error", "invalid-node-inputs", f"{path_prefix}.inputs", "inputs must be an array")
        pending = node.get("_pending")
        if pending is not None and not isinstance(pending, list):
            _issue(issues, "error", "invalid-pending", f"{path_prefix}._pending", "_pending must be an array")

    for index, edge in enumerate(edges):
        path_prefix = f"connections[{index}]"
        if not isinstance(edge, dict):
            _issue(issues, "error", "invalid-connection", path_prefix, "Connection must be an object")
            continue
        source, target = str(edge.get("from") or ""), str(edge.get("to") or "")
        if not source or not target:
            _issue(issues, "error", "invalid-connection-endpoint", path_prefix, "from and to are required")
        elif source not in node_ids or target not in node_ids:
            _issue(issues, "error", "orphan-connection", path_prefix, f"{source}->{target}")
        elif source == target:
            _issue(issues, "error", "self-connection", path_prefix, source)

    _audit_references(nodes, node_ids, issues)
    try:
        encoded = json.dumps(document, ensure_ascii=False, sort_keys=True, allow_nan=False)
        if json.loads(encoded) != document:
            _issue(issues, "error", "roundtrip-mismatch", "$", "JSON roundtrip changed the document")
    except Exception as exc:
        _issue(issues, "error", "not-json-roundtrippable", "$", str(exc))

    report["_node_types"] = dict(node_types)
    report["unknown_node_types"] = dict(unknown_types)
    return _finish(report)


def _audit_references(nodes: Iterable[Any], node_ids: set, issues: List[Dict[str, str]]) -> None:
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        for field in ("inputs", "items", "inputNodeIds"):
            values = node.get(field)
            if not isinstance(values, list):
                continue
            for ref_index, value in enumerate(values):
                ref = str(value or "")
                if ref and ref not in node_ids:
                    _issue(issues, "warning", "orphan-node-reference", f"nodes[{index}].{field}[{ref_index}]", ref)


def _issue(issues: List[Dict[str, str]], severity: str, code: str, path: str, message: str) -> None:
    issues.append({"severity": severity, "code": code, "path": path, "message": message})


def _finish(report: Dict[str, Any]) -> Dict[str, Any]:
    report["error_count"] = sum(1 for issue in report["issues"] if issue["severity"] == "error")
    report["warning_count"] = sum(1 for issue in report["issues"] if issue["severity"] == "warning")
    report["compatible"] = report["error_count"] == 0
    return report


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only compatibility audit for historical canvas JSON files")
    parser.add_argument("--directory", default=CANVAS_DIR)
    parser.add_argument("--include-deleted", action="store_true")
    parser.add_argument("--summary-only", action="store_true")
    parser.add_argument("--max-files", type=int, default=5000)
    args = parser.parse_args(argv)
    report = audit_canvas_directory(args.directory, args.include_deleted, not args.summary_only, max(1, args.max_files))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["summary"]["truncated"]:
        return 2
    return 1 if report["summary"]["incompatible"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
