"""pg_dump plus a manifest of immutable object versions. No retention deletion."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from app.storage import database


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
    if path.exists():
        raise ValueError("Refusing to overwrite an existing backup")
    with database.connection() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        conn.execute("SET LOCAL idle_in_transaction_session_timeout='10min'")
        snapshot = conn.execute("SELECT pg_export_snapshot() AS id").fetchone()["id"]
        assets = conn.execute("SELECT id,bucket,region,object_key,object_version_id,size_bytes,sha256,status FROM assets ORDER BY id").fetchall()
        subprocess.run([pg_tool("pg_dump"), "--format=custom", "--schema=" + database.schema_name(), "--snapshot=" + snapshot, "--file=" + str(path)],
                       env=pg_environment(), check=True, capture_output=True, timeout=600, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    manifest = {"created_at": time.time(), "database_dump": path.name, "schema": database.schema_name(), "objects": assets,
                "note": "Object bytes are not contained in pg_dump; retain/copy every listed version separately."}
    path.with_suffix(".objects.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"dump": str(path), "manifest": str(path.with_suffix(".objects.json")), "objects": len(assets)}
