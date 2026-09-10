"""Read existing logs/backups, then preview or apply an idempotent ledger recovery."""
import json
import os
import sqlite3

from app.services import canvas_ledger as ledger
from app.services.canvas_tasks import canvas_task_db_path


def read_canvas_file(canvas_id):
    from app.services.canvas import canvas_path
    with open(canvas_path(canvas_id), encoding="utf-8") as handle:
        return json.load(handle)


def candidates_for_canvas(canvas_id):
    from app.services.canvas import _backup_dir
    current = read_canvas_file(canvas_id)
    candidates, errors = [], []
    sources = {"canvas": 0, "backups": 0, "tasks": 0}
    documents = [(current, "canvas")]
    directory = _backup_dir(canvas_id)
    if os.path.isdir(directory):
        for filename in sorted(os.listdir(directory), reverse=True):
            if not filename.endswith(".json"):
                continue
            try:
                with open(os.path.join(directory, filename), encoding="utf-8") as handle:
                    data = json.load(handle)
                if data.get("id") and data["id"] != canvas_id:
                    raise ValueError("备份画布 ID 不一致")
                documents.append((data, "backup:" + filename))
                sources["backups"] += 1
            except (OSError, ValueError, AttributeError) as exc:
                errors.append({"source": filename, "reason": str(exc)})
    known_aliases, local_tasks = set(), set()
    providers = ledger.provider_list()
    for document, source in documents:
        logs = document.get("logs") or []
        sources["canvas"] += len(logs) if source == "canvas" else 0
        for log in logs:
            candidates.append((log, source))
            if isinstance(log, dict):
                try:
                    known_aliases.update(ledger.aliases(log, providers))
                except (ValueError, AttributeError, TypeError):
                    pass
        for node in document.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            for pending in (node.get("_pending") or []) + (node.get("pendingTasks") or []):
                if not isinstance(pending, dict):
                    continue
                task_id = pending.get("canvasTaskId") or pending.get("taskId")
                if task_id:
                    local_tasks.add(str(task_id))
    path = canvas_task_db_path()
    if os.path.exists(path):
        conn = sqlite3.connect("file:" + path.replace("\\", "/") + "?mode=ro", uri=True)
        try:
            for task_id, task_json, request_json in conn.execute("SELECT id,task_json,request_json FROM canvas_tasks ORDER BY created_at,id"):
                try:
                    task = json.loads(task_json)
                    request = json.loads(request_json)
                    if task.get("canvas_id") and task["canvas_id"] != canvas_id:
                        continue
                    task.setdefault("billing_request", {key: request[key] for key in ("prompt", "provider_id", "model", "duration", "resolution", "size", "quality", "n") if key in request})
                    log = ledger.task_log(task)
                    if not log:
                        continue
                    associated = task.get("canvas_id") == canvas_id or task.get("id") in local_tasks or bool(set(ledger.aliases(log, providers)) & known_aliases)
                    if associated:
                        candidates.append((log, "task"))
                        sources["tasks"] += 1
                except (ValueError, AttributeError, TypeError, KeyError, OverflowError) as exc:
                    errors.append({"source": "task:" + str(task_id), "reason": str(exc)})
        except (sqlite3.Error, ValueError, AttributeError, TypeError) as exc:
            errors.append({"source": "task-store", "reason": str(exc)})
        finally:
            conn.close()
    return candidates, sources, errors, providers


def recover(canvas_id, preview_token=None):
    candidates, sources, errors, providers = candidates_for_canvas(canvas_id)
    with ledger.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        version = ledger.revision(conn, canvas_id)
        # Bind approval to the reviewed input and ledger version. New calls require a fresh preview.
        token = ledger.digest({"canvas_id": canvas_id, "revision": version, "candidates": candidates,
                               "prices": [{"id": p.get("id"), "model_prices": p.get("model_prices")} for p in providers], "errors": errors})
        if preview_token is not None and preview_token != token:
            raise ValueError("日志、价格或流水已变化，请重新预览恢复结果")
        before = ledger._totals(conn, canvas_id)
        report = ledger.ingest(conn, canvas_id, candidates, providers)
        after = ledger._totals(conn, canvas_id)
        result = {"canvas_id": canvas_id, "preview_token": token, "applied": preview_token is not None,
                  "sources": sources, "source_errors": errors, "report": report,
                  "before": before, "after": after, "coverage_note": "仅恢复现存日志、备份及明确关联的任务；无法保证已丢失的历史完整。"}
        if preview_token is None:
            conn.rollback()
        else:
            conn.execute("INSERT OR REPLACE INTO ledger_imports VALUES(?,?,?,?)", (canvas_id, "recovery", token, ledger._json(result)))
        return result
