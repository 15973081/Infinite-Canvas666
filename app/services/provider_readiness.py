"""Read-only, secret-safe provider and workflow readiness audit.

This module deliberately performs no network requests. It reports only booleans,
counts, provider identifiers, and missing workflow filenames; credentials, URLs,
environment values, and raw provider/workflow payloads are never returned.
"""
import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, Iterable, List, Mapping, Optional

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[2]))

from app.config import COMFYUI_INSTANCES, WORKFLOW_DIR
from app.providers.registry import (
    load_api_providers,
    provider_env_key_value,
    read_api_env_value,
    volcengine_access_key_value,
    volcengine_secret_key_value,
)


REQUIRED_WORKFLOWS = (
    "Z-Image.json",
    "Z-Image-Enhance.json",
    "upscale.json",
    "Flux2-Klein.json",
    "2511.json",
    "LTXDirectorv2-API.json",
)
CAPABILITY_MODEL_FIELDS = {
    "image": "image_models",
    "video": "video_models",
    "chat": "chat_models",
}


def _workflow_status(workflow_directory: str, required: Iterable[str]) -> Dict[str, Any]:
    root = Path(workflow_directory)
    items = []
    for name in required:
        path = root / name
        present = path.is_file()
        valid_json = False
        node_count = 0
        if present:
            try:
                payload = json.loads(path.read_text(encoding="utf-8-sig"))
                valid_json = isinstance(payload, dict) and bool(payload)
                node_count = len(payload) if valid_json else 0
            except (OSError, UnicodeError, json.JSONDecodeError):
                pass
        items.append({
            "name": name,
            "present": present,
            "valid_json": valid_json,
            "node_count": node_count,
        })
    missing = [item["name"] for item in items if not item["present"]]
    invalid = [item["name"] for item in items if item["present"] and not item["valid_json"]]
    return {
        "required": len(items),
        "passed": sum(1 for item in items if item["present"] and item["valid_json"]),
        "ready": not missing and not invalid,
        "missing": missing,
        "invalid": invalid,
        "items": items,
    }


def _credential_status(provider_id: str) -> Dict[str, bool]:
    has_api_key = bool(provider_env_key_value(provider_id))
    has_access_pair = False
    if provider_id == "volcengine":
        has_access_pair = bool(volcengine_access_key_value() and volcengine_secret_key_value())
    return {
        "has_api_key": has_api_key,
        "has_access_pair": has_access_pair,
        "has_credential": has_api_key or has_access_pair,
    }


def build_provider_readiness_report(
    providers: Optional[Iterable[Mapping[str, Any]]] = None,
    workflow_directory: str = WORKFLOW_DIR,
    comfy_instances: Optional[Iterable[str]] = None,
    credential_status: Optional[Mapping[str, Mapping[str, bool]]] = None,
    required_workflows: Iterable[str] = REQUIRED_WORKFLOWS,
) -> Dict[str, Any]:
    """Build a static readiness report without exposing or testing credentials."""
    loaded = list(providers if providers is not None else load_api_providers())
    provider_items: List[Dict[str, Any]] = []
    capability_ready = {name: False for name in CAPABILITY_MODEL_FIELDS}

    for provider in loaded:
        provider_id = str(provider.get("id") or "").strip().lower()
        enabled = bool(provider.get("enabled", True))
        supplied_status = (credential_status or {}).get(provider_id)
        credentials = (
            {key: bool(value) for key, value in supplied_status.items()}
            if supplied_status is not None
            else _credential_status(provider_id)
        )
        has_credential = bool(credentials.get("has_credential"))
        model_counts = {
            name: len(provider.get(field) or [])
            for name, field in CAPABILITY_MODEL_FIELDS.items()
        }
        has_base_url = bool(str(provider.get("base_url") or "").strip())
        capabilities = [name for name, count in model_counts.items() if count]
        usable_capabilities = [
            name for name in capabilities
            if enabled
            and has_base_url
            and (
                bool(credentials.get("has_api_key"))
                or (provider_id == "volcengine" and name == "video" and bool(credentials.get("has_access_pair")))
            )
        ]
        for name in usable_capabilities:
            capability_ready[name] = True
        provider_items.append({
            "id": provider_id,
            "enabled": enabled,
            "has_base_url": has_base_url,
            "has_credential": has_credential,
            "has_api_key": bool(credentials.get("has_api_key")),
            "has_access_pair": bool(credentials.get("has_access_pair")),
            "model_counts": model_counts,
            "capabilities": capabilities,
            "usable_capabilities": usable_capabilities,
        })

    workflows = _workflow_status(workflow_directory, required_workflows)
    instances = [str(item).strip() for item in (comfy_instances if comfy_instances is not None else COMFYUI_INSTANCES) if str(item).strip()]
    comfy_explicit = bool(os.getenv("COMFYUI_INSTANCES") or read_api_env_value("COMFYUI_INSTANCES"))
    modelscope = next((item for item in provider_items if item["id"] == "modelscope"), None)
    modelscope_ready = bool(
        modelscope
        and modelscope["enabled"]
        and modelscope["has_base_url"]
        and modelscope["has_credential"]
        and (modelscope["model_counts"]["image"] or modelscope["model_counts"]["chat"])
    )
    comfy_ready = bool(instances and workflows["ready"])
    readiness = {
        "image": capability_ready["image"],
        "video": capability_ready["video"],
        "chat": capability_ready["chat"],
        "modelscope": modelscope_ready,
        "comfy": comfy_ready,
    }
    missing = [name for name, ready in readiness.items() if not ready]

    return {
        "version": 1,
        "network_checked": False,
        "secrets_included": False,
        "ready": not missing,
        "missing_capabilities": missing,
        "readiness": readiness,
        "providers": {
            "total": len(provider_items),
            "enabled": sum(1 for item in provider_items if item["enabled"]),
            "items": provider_items,
        },
        "comfy": {
            "declared_instance_count": len(instances),
            "explicitly_configured": comfy_explicit,
            "network_checked": False,
            "workflows": workflows,
        },
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only, secret-safe provider capability preflight")
    parser.add_argument("--workflow-directory", default=WORKFLOW_DIR)
    parser.add_argument("--strict", action="store_true", help="Fail if a required static capability is unavailable")
    args = parser.parse_args(argv)
    report = build_provider_readiness_report(workflow_directory=args.workflow_directory)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if args.strict and not report["ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
