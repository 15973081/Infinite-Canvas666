"""Isolated Windows development PostgreSQL. Never touches legacy data/ or assets/."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local" / "cloud"
RUNTIME = Path(os.getenv("LOCALAPPDATA", str(ROOT))) / "Temp" / "canvas-cloud-runtime" / "pgsql" / "bin"


def run(args):
    return subprocess.run([str(x) for x in args], check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def install_postgres():
    import requests
    root = RUNTIME.parent.parent
    root.mkdir(parents=True, exist_ok=True)
    archive = root / "postgresql-16.15-3-windows-x64-binaries.zip"
    url = "https://get.enterprisedb.com/postgresql/" + archive.name
    print("Downloading official PostgreSQL 16 Windows binaries", flush=True)
    with requests.get(url, stream=True, timeout=(30, 120)) as response:
        response.raise_for_status()
        with archive.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                stream.write(chunk)
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            if item.filename.startswith(("pgsql/bin/", "pgsql/lib/", "pgsql/share/")):
                target = (root / item.filename).resolve()
                if root.resolve() not in target.parents:
                    raise ValueError("Archive path escaped runtime directory")
                package.extract(item, root)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["init", "start", "stop", "status"])
    args = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    data = LOCAL / "pgdata"
    config = LOCAL / "storage.env"
    if args.action == "init":
        if not (RUNTIME / "initdb.exe").exists():
            install_postgres()
        if not config.exists():
            password = secrets.token_urlsafe(32)
            config.write_text("\n".join([
                "DATABASE_BACKEND=postgres", "DATABASE_URL=postgresql://canvas_local:" + password + "@127.0.0.1:54329/canvas_cloud_dev",
                "DATABASE_SCHEMA=canvas_cloud", "MEDIA_BACKEND=filesystem", "OBJECT_STORE_ROOT=" + (LOCAL / "objects").as_posix(),
                "MEDIA_TEMP_DIR=" + (LOCAL / "tmp").as_posix(), "MEDIA_TEMP_MAX_BYTES=10737418240", "MEDIA_MAX_FILE_BYTES=2147483648",
                "MEDIA_SIGNING_KEY=" + secrets.token_urlsafe(48), "CLOUD_ACCESS_USER=canvas", "CLOUD_ACCESS_PASSWORD=" + secrets.token_urlsafe(20),
                "CLOUD_WORKER_CONCURRENCY=2", "PUBLIC_BASE_URL=http://127.0.0.1:6004", "SERVER_PORT=6004", "SERVER_HOST=127.0.0.1",
            ]) + "\n", encoding="utf-8")
        settings = dict(line.split("=", 1) for line in config.read_text().splitlines() if "=" in line)
        from urllib.parse import urlparse
        parsed = urlparse(settings["DATABASE_URL"])
        if parsed.hostname != "127.0.0.1" or parsed.port != 54329 or parsed.username != "canvas_local" or parsed.path != "/canvas_cloud_dev":
            raise SystemExit("cloud_local init only operates on its isolated loopback database")
        password = parsed.password
        if not (data / "PG_VERSION").exists():
            pwfile = LOCAL / "init-password.tmp"
            pwfile.write_text(password, encoding="utf-8")
            try:
                run([RUNTIME / "initdb.exe", "-D", data, "-U", "canvas_local", "--pwfile=" + str(pwfile), "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"])
            finally:
                pwfile.unlink(missing_ok=True)
            with (data / "postgresql.conf").open("a", encoding="utf-8") as f:
                f.write("\nlisten_addresses='127.0.0.1'\nport=54329\nmax_connections=40\nshared_buffers='128MB'\n")
        status = subprocess.run([str(RUNTIME / "pg_ctl.exe"), "-D", str(data), "status"], capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if status.returncode:
            run([RUNTIME / "pg_ctl.exe", "-D", data, "-l", LOCAL / "postgres.log", "-w", "start"])
        import psycopg
        from psycopg import sql
        with psycopg.connect(settings["DATABASE_URL"].rsplit("/", 1)[0] + "/postgres", autocommit=True) as conn:
            for name in ("canvas_cloud_dev", "canvas_cloud_test"):
                if not conn.execute("SELECT 1 FROM pg_database WHERE datname=%s", (name,)).fetchone():
                    conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        print("Local PostgreSQL ready at 127.0.0.1:54329. Private config:", config)
    else:
        command = [RUNTIME / "pg_ctl.exe", "-D", data]
        command += ["-l", LOCAL / "postgres.log", "-w", "start"] if args.action == "start" else ["-m", "fast", "stop"] if args.action == "stop" else ["status"]
        run(command)


if __name__ == "__main__":
    main()
