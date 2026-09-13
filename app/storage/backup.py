"""Snapshot-consistent database and verified immutable object bytes.

The manifest is published last and is the completion marker. Failed exports are
kept for diagnosis, never reported as complete. No retention deletion.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from app.storage import database, media
from app.storage.settings import media_backend


def pg_tool(name):
    found = shutil.which(name)
    if found:
        return found
    root = Path(os.getenv("LOCALAPPDATA", "")) / "Temp/canvas-cloud-runtime/pgsql/bin"
    path = root / (name + ".exe")
    if path.exists():
        return str(path)
    raise RuntimeError(name + " is required (PostgreSQL client tools)")


def pg_environment(url=None):
    from psycopg.conninfo import conninfo_to_dict
    config = conninfo_to_dict(url or os.environ["DATABASE_URL"])
    env = os.environ.copy()
    for name, key in (("PGHOST", "host"), ("PGPORT", "port"), ("PGUSER", "user"), ("PGPASSWORD", "password"), ("PGDATABASE", "dbname"), ("PGSSLMODE", "sslmode"), ("PGSSLROOTCERT", "sslrootcert")):
        if key in config:
            env[name] = config[key]
    return env


def dump(path):
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = path.with_suffix(".objects.json")
    objects_dir = path.with_suffix(".objects")
    if path.exists() or manifest_path.exists() or objects_dir.exists():
        raise ValueError("Refusing to overwrite an existing backup")
    # Exclusive directory creation also serializes concurrent exports to this name.
    objects_dir.mkdir()
    with database.connection() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        conn.execute("SET LOCAL idle_in_transaction_session_timeout='10min'")
        snapshot = conn.execute("SELECT pg_export_snapshot() AS id").fetchone()["id"]
        assets = conn.execute("SELECT id,bucket,region,object_key,object_version_id,size_bytes,sha256,status FROM assets ORDER BY id").fetchall()
        subprocess.run([pg_tool("pg_dump"), "--format=custom", "--schema=" + database.schema_name(), "--snapshot=" + snapshot, "--file=" + str(objects_dir / "database.dump")],
                       env=pg_environment(), check=True, capture_output=True, timeout=600, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    # Originals are immutable and physical deletion is disabled. Release the DB
    # snapshot before potentially slow object IO; only copy the frozen manifest.
    backend = media.store()
    for index, asset in enumerate(assets):
        if asset["status"] != "ready":
            continue
        if not asset["object_version_id"] or not asset["sha256"]:
            raise ValueError("Ready asset lacks a fixed version or checksum")
        target = objects_dir / f"{index:08d}.blob"
        if shutil.disk_usage(objects_dir).free < asset["size_bytes"] + 128 * 1024 ** 2:
            raise OSError("Insufficient space for object backup")
        backend.download(asset, target)
        if digest(target) != (asset["size_bytes"], asset["sha256"]):
            raise ValueError("Backup object checksum mismatch: " + asset["id"])
        asset["backup_file"] = target.name
    dump_size, dump_hash = digest(objects_dir / "database.dump")
    manifest = {"format_version": 2, "created_at": time.time(), "database_dump": path.name,
                "database_size_bytes": dump_size, "database_sha256": dump_hash,
                "schema": database.schema_name(), "media_backend": media_backend(),
                "objects_directory": objects_dir.name, "objects": assets,
                "note": "All ready versions, including retained originals, are included. In-flight uploads are not durable backups; restart unfinished uploads after disaster recovery."}
    # Hard links publish without overwriting an existing destination. Keep the
    # dump inside the bundle too, so failed publication cannot lose exported data.
    os.link(objects_dir / "database.dump", path)
    pending = objects_dir / "manifest.json"
    pending.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.link(pending, manifest_path)
    ready = sum(a["status"] == "ready" for a in assets)
    return {"dump": str(path), "manifest": str(manifest_path), "objects": ready,
            "unfinished_assets": len(assets) - ready,
            "object_bytes": sum(a["size_bytes"] for a in assets if a["status"] == "ready")}


def digest(path):
    """Bounded memory; backup size is independent of today's upload limit."""
    size, checksum = 0, hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            checksum.update(chunk)
    return size, checksum.hexdigest()


def verify(path):
    """Verify a complete export offline, without reading the original store."""
    path = Path(path).resolve()
    manifest = json.loads(path.with_suffix(".objects.json").read_text(encoding="utf-8"))
    objects_dir = path.with_suffix(".objects")
    if (manifest.get("format_version") != 2 or manifest.get("database_dump") != path.name
            or manifest.get("objects_directory") != objects_dir.name or objects_dir.is_symlink()
            or objects_dir.resolve().parent != path.parent):
        raise ValueError("Unsupported or invalid backup manifest")
    if digest(path) != (manifest["database_size_bytes"], manifest["database_sha256"]):
        raise ValueError("Database backup checksum mismatch")
    ids, files, versions = set(), set(), set()
    for asset in manifest["objects"]:
        if asset["id"] in ids:
            raise ValueError("Duplicate backup asset")
        ids.add(asset["id"])
        if asset["status"] != "ready":
            continue
        name = asset.get("backup_file", "")
        version = (asset["bucket"], asset["object_key"], asset["object_version_id"])
        if not re.fullmatch(r"[0-9]{8}\.blob", name) or name in files or version in versions:
            raise ValueError("Invalid or duplicate backup object")
        files.add(name)
        versions.add(version)
        source = objects_dir / name
        if source.is_symlink() or source.resolve().parent != objects_dir.resolve():
            raise ValueError("Backup object escaped bundle")
        if digest(source) != (asset["size_bytes"], asset["sha256"]):
            raise ValueError("Backup object checksum mismatch: " + asset["id"])
    return manifest


def restore_objects(path, destination):
    """Restore local simulation versions into a new, independent directory.

    Database restore is deliberately separate and must target an isolated DB.
    Native TOS versions require a cloud restore/remapping procedure.
    """
    path = Path(path).resolve()
    manifest = verify(path)
    if manifest["media_backend"] != "filesystem":
        raise ValueError("Local object restore requires a filesystem backup")
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError("Object restore destination must not exist")
    destination.parent.mkdir(parents=True, exist_ok=True)
    objects_dir = path.with_suffix(".objects")
    if destination == objects_dir or objects_dir in destination.parents:
        raise ValueError("Object restore destination overlaps backup")
    with tempfile.TemporaryDirectory(prefix=".restore-", dir=destination.parent) as temp:
        # Reuse exactly the live store's path validation without changing env or
        # instantiating a store at the production path.
        restored = media.FilesystemStore.__new__(media.FilesystemStore)
        restored.root = Path(temp).resolve()
        count, total = 0, 0
        for asset in manifest["objects"]:
            if asset["status"] != "ready":
                continue
            target = restored.path(asset["object_key"], asset["object_version_id"])
            target.parent.mkdir(parents=True, exist_ok=True)
            source = objects_dir / asset["backup_file"]
            with source.open("rb") as src, target.open("xb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            if digest(target) != (asset["size_bytes"], asset["sha256"]):
                raise ValueError("Restored object checksum mismatch")
            count += 1
            total += asset["size_bytes"]
        # New destination only. On Windows rename refuses existing directories.
        # mkdir reserves it on all platforms; never replace a populated store.
        destination.mkdir()
        try:
            for child in restored.root.iterdir():
                child.rename(destination / child.name)
        except BaseException:
            # A partial new directory remains explicit; existing data is untouched.
            raise
    return {"object_root": str(destination), "objects": count, "object_bytes": total}
