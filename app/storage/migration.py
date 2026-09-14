"""Repeatable import from a consistent legacy backup; no source files are changed."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from contextlib import nullcontext
from psycopg import sql
from psycopg.types.json import Jsonb
from app.storage import canvases, database, documents, media, tasks
from app.storage.ledger import COLUMNS
from app.storage.migration_audit import Audit, DOCUMENTS, checked_path, read_json, read_json_tasks


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def snapshot_sqlite(path):
    """SQLite backup API includes committed WAL contents; source is read-only."""
    snapshot = sqlite3.connect(":memory:")
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as source:
        source.backup(snapshot)
    snapshot.row_factory = sqlite3.Row
    return snapshot


def ledger_import(path, apply):
    result = {"tables": {}, "source_totals": [], "target_totals": []}
    snapshot = snapshot_sqlite(path)
    try:
        present = {row[0] for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(COLUMNS).issubset(present):
            raise ValueError("Ledger backup is missing one of the five compatibility tables")
        totals_query = "SELECT currency,cost_status,count(*) AS records,sum(amount_micros) AS amount_micros FROM ledger_entries GROUP BY currency,cost_status ORDER BY currency,cost_status"
        result["source_totals"] = [dict(row) for row in snapshot.execute(totals_query)]
        with database.connection() if apply else nullcontext() as conn:
            for table, columns in COLUMNS.items():
                count = 0
                for row in snapshot.execute("SELECT " + columns + " FROM " + table):
                    raw = dict(row)
                    parsed = {k: json.loads(v) if k.endswith("_json") else v for k, v in raw.items()}
                    if apply:
                        primary = ["id"] if table == "ledger_entries" else ["canvas_id", "alias"] if table == "ledger_aliases" else ["canvas_id", "entry_id", "fingerprint"] if table == "ledger_conflicts" else ["canvas_id", "source"] if table == "ledger_imports" else ["canvas_id"]
                        params = [Jsonb(v) if k.endswith("_json") else v for k, v in parsed.items()]
                        statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING").format(sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, parsed)), sql.SQL(",").join([sql.Placeholder()] * len(parsed)))
                        conn.execute(statement, params)
                        where = sql.SQL(" AND ").join(sql.SQL("{}=%s").format(sql.Identifier(k)) for k in primary)
                        existing = conn.execute(sql.SQL("SELECT {} FROM {} WHERE workspace_id='default' AND ").format(sql.SQL(",").join(map(sql.Identifier, parsed)), sql.Identifier(table)) + where, [parsed[k] for k in primary]).fetchone()
                        if existing != parsed:
                            raise ValueError("Ledger row conflict: " + table + " (historical values were not overwritten)")
                    count += 1
                result["tables"][table] = count
            if apply:
                # A nonempty target may have additional records; every imported row
                # was compared above, so do not claim whole-target totals must match.
                result["target_totals"] = conn.execute(totals_query).fetchall()
    finally:
        snapshot.close()
    return result


def migrate_legacy(source, apply=False, report_path=None):
    source = source.resolve()
    if not source.is_dir():
        raise ValueError("Source backup directory does not exist")
    source_id = digest({"source": str(source), "namespace": os.getenv("ASSET_SOURCE_NAMESPACE", "local")})[:24]
    report = {"source": str(source), "applied": apply, "files": [], "documents": [], "canvases": [], "tasks": [], "missing_refs": [], "errors": [], "ledger": None}
    report_file = Path(report_path) if report_path else Path(__file__).resolve().parents[2] / ".local/cloud/reports" / (source_id + ".json")
    if report_file.resolve().is_relative_to(source) or report_file.with_suffix(".tmp").resolve().is_relative_to(source):
        raise ValueError("Migration report must be outside the source backup")
    report["namespace"] = os.getenv("ASSET_SOURCE_NAMESPACE", "local")
    audit = Audit(source, report)

    def checkpoint():
        report_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = report_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        temporary.replace(report_file)

    def import_document(kind, key, value):
        if apply:
            with database.connection():
                marker = kind + ":" + key
                original_digest = digest(value)
                previous = documents.get("migration_item:" + source_id, marker)
                if previous:
                    if previous["sha256"] != original_digest:
                        raise ValueError("Migration source changed: " + marker)
                    report["documents"].append({"kind": kind, "id": key, "status": "already_imported"})
                    return
                if documents.get(kind, key) is not None:
                    raise ValueError("Target document already exists: " + marker)
                documents.put(kind, key, media.normalize_document(tasks.clean_request(value)) if kind == "api_providers" else media.normalize_document(value))
                documents.put("migration_item:" + source_id, marker, {"sha256": original_digest})
        report["documents"].append({"kind": kind, "id": key, "status": "imported" if apply else "planned"})

    try:
        # Inventory every supported source before the first target write. Invalid
        # JSON, missing SQLite tables and escaping links fail without partial import.
        audit.scan(snapshot_sqlite, COLUMNS)
        checkpoint()
        # Ledger first, before any canvas log ingestion can alter its imported state.
        ledger_path = source / "data/canvas_ledger.sqlite3"
        if ledger_path.exists():
            report["ledger"] = ledger_import(ledger_path, apply)
        for folder, prefix in ((source / "assets", "/assets/"), (source / "output", "/output/")):
            if not folder.exists():
                continue
            for path in sorted(folder.rglob("*")):
                if not path.is_file():
                    continue
                resolved = checked_path(source, path).resolve()
                if folder.resolve() not in resolved.parents:
                    raise ValueError("Source symlink escapes media root")
                ref = prefix + path.relative_to(folder).as_posix()
                size, sha = media.file_digest(path)
                entry = {"legacy_ref": ref, "size": size, "sha256": sha, "status": "planned", "namespace": report["namespace"]}
                report["files"].append(entry)
                if apply:
                    asset_id = "ast_" + digest({"namespace": os.getenv("ASSET_SOURCE_NAMESPACE", "local"), "ref": ref})[:32]
                    try:
                        asset = media.publish(path, path.name, legacy_ref=ref, asset_id=asset_id)
                    except Exception:
                        entry.update(status="failed", media_asset_id=asset_id)
                        raise
                    entry.update(media_asset_id=asset["id"], object_key=asset["object_key"], version=asset["object_version_id"], status="ready")
                checkpoint()

        for path in sorted((source / "data/canvases").glob("*.json")):
            value = read_json(source, path)
            cid = value["id"]
            if apply:
                with database.connection():
                    marker = "canvas:" + cid
                    sha = digest(value)
                    previous = documents.get("migration_item:" + source_id, marker)
                    if previous:
                        if previous["sha256"] != sha:
                            raise ValueError("Canvas source changed since import: " + cid)
                    else:
                        value.pop("revision", None)
                        value.setdefault("nodes", [])
                        value.setdefault("connections", [])
                        value.setdefault("viewport", {"x": 0, "y": 0, "scale": 1})
                        canvases.save(value, touch=False)
                        documents.put("migration_item:" + source_id, marker, {"sha256": sha})
            report["canvases"].append(cid)
        for name, kind in DOCUMENTS:
            path = source / "data" / name
            if path.exists():
                value = read_json(source, path)
                import_document(kind, "default", value)
        for path in sorted((source / "data/canvases/backups").glob("*/*.json")):
            import_document("canvas_backup", path.parent.name + "/" + path.name, read_json(source, path))
        for base in (source / "conversations", source / "data/conversations"):
            for path in sorted(base.glob("*/*.json")):
                import_document("conversation", path.parent.name + "/" + path.stem, read_json(source, path))
        history = source / "history.json"
        if history.exists():
            for index, value in enumerate(read_json(source, history)):
                import_document("history", source_id + ":" + str(index), value)
        task_path = source / "data/canvas_tasks.sqlite3"
        if task_path.exists():
            snapshot = snapshot_sqlite(checked_path(source, task_path))
            try:
                for row in snapshot.execute("SELECT * FROM canvas_tasks ORDER BY created_at,id"):
                    value = json.loads(row["task_json"])
                    payload = json.loads(row["request_json"])
                    if apply:
                        # Preserve unknown submission states; worker recovery makes
                        # them needs_review instead of resubmitting paid requests.
                        with database.connection():
                            marker = "task:" + row["id"]
                            sha = digest({"task": value, "request": payload})
                            previous = documents.get("migration_item:" + source_id, marker)
                            if previous:
                                if previous["sha256"] != sha:
                                    raise ValueError("Migration source changed: " + marker)
                            else:
                                existing = tasks.get(row["id"])
                                if existing:
                                    raise ValueError("Target task already exists: " + row["id"])
                                tasks.save(value, payload, historical=True)
                                documents.put("migration_item:" + source_id, marker, {"sha256": sha})
                    report["tasks"].append(row["id"])
            finally:
                snapshot.close()
        # Some older releases kept independent task history only in JSON.
        # SQLite wins for shared ids; retain the JSON snapshot separately.
        sqlite_ids = set(report["tasks"])
        report["task_json_shadowed"] = []
        for original in read_json_tasks(source):
            tid = original["id"]
            if tid in sqlite_ids:
                import_document("legacy_task_snapshot", source_id + ":" + tid, tasks.clean_request(original))
                report["task_json_shadowed"].append(tid)
                continue
            if apply:
                with database.connection():
                    marker = "json-task:" + tid
                    sha = digest(original)
                    previous = documents.get("migration_item:" + source_id, marker)
                    if previous:
                        if previous["sha256"] != sha:
                            raise ValueError("JSON task source changed since import: " + tid)
                    else:
                        if tasks.get(tid):
                            raise ValueError("Target task already exists: " + tid)
                        value = dict(original)
                        if value.get("status") not in tasks.TERMINAL:
                            value.update(legacy_status=value.get("status"), status="needs_review", submission_unknown=True)
                        tasks.save(value, {}, historical=True)
                        documents.put("migration_item:" + source_id, marker, {"sha256": sha})
            report["tasks"].append(tid)
        report["status"] = "needs_review" if audit.needs_review() else "complete"
        report["total_file_bytes"] = sum(entry["size"] for entry in report["files"])
    except Exception as exc:
        report["errors"].append(str(exc))
        report["status"] = "failed"
        checkpoint()
        raise
    checkpoint()
    return {"report": str(report_file), "status": report["status"], "files": len(report["files"]), "canvases": len(report["canvases"]), "missing_refs": len(report["missing_refs"])}
