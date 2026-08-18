"""Read-only, address-safe ComfyUI connectivity and workflow dependency probe."""
import argparse
import json
import re
from pathlib import Path
import sys
import time
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional
import urllib.request

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import COMFYUI_INSTANCES, WORKFLOW_DIR
from app.services.provider_readiness import REQUIRED_WORKFLOWS


JsonFetcher = Callable[[str, str, float, int], Any]
READ_ONLY_ENDPOINTS = ("/queue", "/system_stats", "/object_info")


def _clean_instances(instances: Iterable[str]) -> List[str]:
    result = []
    for raw in instances:
        value = re.sub(r"^https?://", "", str(raw or "").strip(), flags=re.I).rstrip("/")
        if value and ":" in value and value not in result:
            result.append(value)
    return result


def _fetch_json(address: str, endpoint: str, timeout: float, max_bytes: int) -> Any:
    request = urllib.request.Request(
        f"http://{address}{endpoint}", headers={"Accept": "application/json"}, method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError("response-too-large")
    return json.loads(payload.decode("utf-8"))


def _workflow_dependencies(directory: str, names: Iterable[str]) -> List[Dict[str, Any]]:
    root = Path(directory)
    reports = []
    for name in names:
        valid = False
        dependencies = set()
        try:
            payload = json.loads((root / name).read_text(encoding="utf-8-sig"))
            if isinstance(payload, dict) and payload:
                for node in payload.values():
                    if isinstance(node, dict) and str(node.get("class_type") or "").strip():
                        dependencies.add(str(node["class_type"]).strip())
                valid = bool(dependencies)
        except (OSError, UnicodeError, json.JSONDecodeError):
            pass
        reports.append({"name": name, "valid_json": valid, "dependencies": dependencies})
    return reports


def _probe_instance(
    index: int,
    address: str,
    workflows: List[Dict[str, Any]],
    fetch_json: JsonFetcher,
    timeout: float,
    max_bytes: int,
) -> Dict[str, Any]:
    started = time.perf_counter()
    responses: Dict[str, Any] = {}
    endpoint_status = {endpoint.removeprefix("/"): False for endpoint in READ_ONLY_ENDPOINTS}
    error_code = ""
    for endpoint in READ_ONLY_ENDPOINTS:
        try:
            payload = fetch_json(address, endpoint, timeout, max_bytes)
            if not isinstance(payload, dict):
                raise TypeError("invalid-response")
            responses[endpoint] = payload
            endpoint_status[endpoint.removeprefix("/")] = True
        except Exception as exc:
            error_code = "response-too-large" if str(exc) == "response-too-large" else "probe-failed"
            if endpoint == "/queue":
                break
    available_types = set(responses.get("/object_info", {}).keys())
    workflow_reports = []
    for workflow in workflows:
        dependencies = workflow["dependencies"]
        missing_count = len(dependencies - available_types) if endpoint_status["object_info"] else len(dependencies)
        workflow_reports.append({
            "name": workflow["name"],
            "valid_json": workflow["valid_json"],
            "required_node_type_count": len(dependencies),
            "missing_node_type_count": missing_count,
            "ready": workflow["valid_json"] and endpoint_status["object_info"] and missing_count == 0,
        })
    ready = all(endpoint_status.values()) and all(item["ready"] for item in workflow_reports)
    return {
        "instance_index": index,
        "address_included": False,
        "network_checked": True,
        "reachable": endpoint_status["queue"],
        "ready": ready,
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "endpoint_status": endpoint_status,
        "error_code": "" if ready else error_code or "workflow-dependency-missing",
        "available_node_type_count": len(available_types),
        "missing_node_type_count": sum(item["missing_node_type_count"] for item in workflow_reports),
        "workflows": workflow_reports,
    }


def build_comfy_connectivity_report(
    instances: Optional[Iterable[str]] = None,
    workflow_directory: str = WORKFLOW_DIR,
    workflow_names: Iterable[str] = REQUIRED_WORKFLOWS,
    probe_network: bool = False,
    fetch_json: JsonFetcher = _fetch_json,
    timeout: float = 2.0,
    max_bytes: int = 32 * 1024 * 1024,
) -> Dict[str, Any]:
    cleaned = _clean_instances(instances if instances is not None else COMFYUI_INSTANCES)
    workflows = _workflow_dependencies(workflow_directory, workflow_names)
    if probe_network:
        instance_reports = [
            _probe_instance(index, address, workflows, fetch_json, max(0.1, timeout), max(1024, max_bytes))
            for index, address in enumerate(cleaned)
        ]
    else:
        instance_reports = [{
            "instance_index": index,
            "address_included": False,
            "network_checked": False,
            "reachable": False,
            "ready": False,
            "endpoint_status": {endpoint.removeprefix("/"): False for endpoint in READ_ONLY_ENDPOINTS},
            "error_code": "not-probed",
            "available_node_type_count": 0,
            "missing_node_type_count": sum(len(item["dependencies"]) for item in workflows),
            "workflows": [{
                "name": item["name"], "valid_json": item["valid_json"],
                "required_node_type_count": len(item["dependencies"]),
                "missing_node_type_count": len(item["dependencies"]), "ready": False,
            } for item in workflows],
        } for index, _ in enumerate(cleaned)]
    return {
        "version": 1,
        "network_checked": probe_network,
        "read_only_endpoints": list(READ_ONLY_ENDPOINTS),
        "addresses_included": False,
        "secrets_included": False,
        "instance_count": len(cleaned),
        "ready_instance_count": sum(1 for item in instance_reports if item["ready"]),
        "ready": bool(instance_reports) and all(item["ready"] for item in instance_reports),
        "workflow_count": len(workflows),
        "workflow_json_valid": all(item["valid_json"] for item in workflows),
        "instances": instance_reports,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only ComfyUI connectivity and workflow dependency probe")
    parser.add_argument("--workflow-directory", default=WORKFLOW_DIR)
    parser.add_argument("--network", action="store_true", help="GET queue, system stats, and object info from configured instances")
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--strict", action="store_true", help="Fail unless every configured instance is ready")
    args = parser.parse_args(argv)
    report = build_comfy_connectivity_report(
        workflow_directory=args.workflow_directory, probe_network=args.network, timeout=args.timeout,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if args.strict and not report["ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
