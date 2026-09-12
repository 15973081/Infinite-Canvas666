"""Repeatable import from a consistent legacy backup; no source files are changed."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from psycopg import sql
from psycopg.types.json import Jsonb
from app.storage import canvases, database, documents, media, tasks
from app.storage.ledger import COLUMNS


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
        with database.connection() as conn:
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
                resolved = path.resolve()
                if folder.resolve() not in resolved.parents:
                    raise ValueError("Source symlink escapes media root")
                ref = prefix + path.relative_to(folder).as_posix()
                size, sha = media.file_digest(path)
                entry = {"legacy_ref": ref, "size": size, "sha256": sha, "status": "planned"}
                if apply:
                    asset_id = "ast_" + digest({"namespace": os.getenv("ASSET_SOURCE_NAMESPACE", "local"), "ref": ref})[:32]
                    asset = media.publish(path, path.name, legacy_ref=ref, asset_id=asset_id)
                    entry.update(media_asset_id=asset["id"], object_key=asset["object_key"], version=asset["object_version_id"], status="ready")
                report["files"].append(entry)
                checkpoint()
        known_refs = {entry["legacy_ref"] for entry in report["files"]}

        def missing(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key not in {"prompt", "text", "logs", "cost", "registrations"}:
                        missing(child)
            elif isinstance(value, list):
                for child in value:
                    missing(child)
            elif isinstance(value, str) and value.startswith(("/assets/", "/output/")) and not media.id_from_ref(value):
                ref = media.canonical_legacy(value)
                if ref not in known_refs and ref not in report["missing_refs"]:
                    report["missing_refs"].append(ref)

        for path in sorted((source / "data/canvases").glob("*.json")):
            value = json.loads(path.read_text(encoding="utf-8-sig"))
            missing(value)
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
        for name, kind in (("canvas_folders.json", "canvas_folders"), ("asset_library.json", "asset_library"), ("prompt_libraries.json", "prompt_libraries"), ("api_providers.json", "api_providers"), ("shared_folders.json", "shared_folders")):
            path = source / "data" / name
            if path.exists():
                value = json.loads(path.read_text(encoding="utf-8-sig"))
                missing(value)
                import_document(kind, "default", value)
        for path in sorted((source / "data/canvases/backups").glob("*/*.json")):
            import_document("canvas_backup", path.parent.name + "/" + path.name, json.loads(path.read_text(encoding="utf-8-sig")))
        for base in (source / "conversations", source / "data/conversations"):
            for path in sorted(base.glob("*/*.json")):
                import_document("conversation", path.parent.name + "/" + path.stem, json.loads(path.read_text(encoding="utf-8-sig")))
        history = source / "history.json"
        if history.exists():
            for index, value in enumerate(json.loads(history.read_text(encoding="utf-8-sig"))):
                import_document("history", source_id + ":" + str(index), value)
        task_path = source / "data/canvas_tasks.sqlite3"
        if task_path.exists():
            snapshot = snapshot_sqlite(task_path)
            try:
                for row in snapshot.execute("SELECT * FROM canvas_tasks ORDER BY created_at,id"):
                    value = json.loads(row["task_json"])
                    payload = json.loads(row["request_json"])
                    if apply:
                        # Preserve unknown submission states; worker recovery makes
                        # them needs_review instead of resubmitting paid requests.
                        tasks.save(value, payload)
                    report["tasks"].append(row["id"])
            finally:
                snapshot.close()
        report["status"] = "complete" if not report["missing_refs"] else "needs_review"
    except Exception as exc:
        report["errors"].append(str(exc))
        report["status"] = "failed"
        checkpoint()
        raise
    checkpoint()
    return {"report": str(report_file), "status": report["status"], "files": len(report["files"]), "canvases": len(report["canvases"]), "missing_refs": len(report["missing_refs"])}
