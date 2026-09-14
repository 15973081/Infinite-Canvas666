"""Explicit storage operations; defaults to the isolated local configuration."""
import argparse
import asyncio
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init-db", "check", "serve", "worker", "migrate", "backup", "verify-backup", "restore-objects", "retry-finalization", "cleanup-temp", "cleanup-uploads"])
    parser.add_argument("--env", default=str(ROOT / ".local/cloud/storage.env"))
    parser.add_argument("--source")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report")
    parser.add_argument("--destination")
    parser.add_argument("--task-id")
    parser.add_argument("--workspace", help="Existing target workspace for legacy migration")
    args = parser.parse_args()
    # Offline operations must remain usable when the original DB/store is lost.
    if args.command in {"verify-backup", "restore-objects"}:
        if not args.source:
            parser.error(args.command + " requires --source (database dump path)")
        from app.storage import backup
        if args.command == "verify-backup":
            manifest = backup.verify(args.source)
            print({"verified": True, "objects": sum(a["status"] == "ready" for a in manifest["objects"])})
        else:
            if not args.destination:
                parser.error("restore-objects requires --destination (a new object directory)")
            print(backup.restore_objects(args.source, args.destination))
        return
    os.environ["STORAGE_ENV_FILE"] = args.env
    from app.storage.settings import load_storage_env, validate
    load_storage_env()
    validate()
    from app.storage import database
    if args.command == "init-db":
        database.migrate()
        database.check()
        print("PostgreSQL schema ready")
    elif args.command == "check":
        database.check()
        with database.connection() as conn:
            print(conn.execute("SELECT version() AS version").fetchone()["version"])
            for name in ("canvases", "assets", "tasks", "ledger_entries"):
                print(name, conn.execute("SELECT count(*) AS n FROM " + name).fetchone()["n"])
    elif args.command == "cleanup-temp":
        from app.storage.media import cleanup_orphaned_operations
        print({"removed_operation_directories": cleanup_orphaned_operations()})
    elif args.command == "cleanup-uploads":
        from app.storage.uploads import cleanup
        print({"cleaned_staging_uploads": cleanup(all_workspaces=True)})
    elif args.command == "retry-finalization":
        if not args.task_id:
            parser.error("retry-finalization requires --task-id")
        from app.storage.finalization import retry
        print(retry(args.task_id))
    elif args.command == "backup":
        from app.storage.backup import dump
        import datetime
        target = args.report or str(ROOT / ".local/cloud/backups" / (datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".dump"))
        print(dump(target))
    elif args.command == "serve":
        import uvicorn
        uvicorn.run("main:app", host=os.getenv("SERVER_HOST", "127.0.0.1"), port=int(os.getenv("SERVER_PORT", "6004")))
    elif args.command == "worker":
        from app.storage.worker import start, shutdown

        async def run():
            database.check()
            handle = start()
            try:
                await asyncio.Event().wait()
            finally:
                await shutdown(handle)
        asyncio.run(run())
    else:
        if not args.source:
            parser.error("migrate requires --source (a consistent legacy backup directory)")
        from app.storage.migration import migrate_legacy
        from app.storage.workspace import workspace_scope
        if os.getenv("AUTH_MODE") == "members" and not args.workspace:
            parser.error("member-mode migration requires --workspace (existing target space)")
        with workspace_scope(args.workspace or "default") as workspace:
            if args.apply:
                with database.connection() as conn:
                    if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND status='active'", (workspace,)).fetchone():
                        parser.error("migration target workspace must exist and be active")
            print(migrate_legacy(Path(args.source), apply=args.apply, report_path=args.report))
    database.close()


if __name__ == "__main__":
    main()
