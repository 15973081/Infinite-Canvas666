"""Run integration tests in a disposable schema and private object directory."""
import os
from pathlib import Path
import sys
import tempfile
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def test_database_url(source):
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    config = conninfo_to_dict(source)
    if config.get("host") not in {"127.0.0.1", "localhost", "::1"} or config.get("service"):
        raise ValueError("Local acceptance requires an explicit loopback PostgreSQL host")
    if config.get("hostaddr") and config["hostaddr"] not in {"127.0.0.1", "::1"}:
        raise ValueError("Local acceptance requires a loopback PostgreSQL hostaddr")
    return make_conninfo(source, dbname="canvas_cloud_test")


def main(argv=None):
    from app.storage import database
    from app.storage.settings import load_storage_env, validate
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict
    with patch.dict(os.environ), tempfile.TemporaryDirectory(prefix="cloud-integration-") as directory:
        os.environ.setdefault("STORAGE_ENV_FILE", str(ROOT / ".local/cloud/storage.env"))
        load_storage_env()
        source = os.getenv("DATABASE_URL")
        if not source:
            raise ValueError("Run tools/cloud_local.py init before local acceptance")
        target = test_database_url(source)
        schema = "cloud_test_" + uuid.uuid4().hex
        os.environ["DATABASE_URL"] = target
        os.environ["DATABASE_SCHEMA"] = schema
        os.environ["DATABASE_BACKEND"] = "postgres"
        os.environ["CLOUD_EMBEDDED_WORKER"] = "false"
        os.environ["CLOUD_INTEGRATION_TEST"] = "1"
        os.environ["APP_RUNTIME_DIR"] = str(Path(directory) / "runtime")
        os.environ["AUTH_DB_PATH"] = str(Path(directory) / "auth.sqlite3")
        os.environ["OBJECT_STORE_ROOT"] = str(Path(directory) / "objects")
        os.environ["MEDIA_TEMP_DIR"] = str(Path(directory) / "tmp")
        os.environ["MEDIA_BACKEND"] = "filesystem"
        os.environ["CLOUD_ACCESS_USER"] = "canvas-test"
        os.environ["CLOUD_ACCESS_PASSWORD"] = uuid.uuid4().hex
        os.environ["MEDIA_SIGNING_KEY"] = uuid.uuid4().hex
        os.environ["PUBLIC_BASE_URL"] = "http://testserver"
        validate()
        database.close()
        try:
            database.migrate()
            import pytest
            return pytest.main([str(ROOT / "tests/test_cloud_storage.py"), str(ROOT / "tests/test_cloud_uploads.py"), str(ROOT / "tests/test_cloud_finalization.py"), "-q", *(argv or [])])
        finally:
            try:
                if (database.schema_name() != schema or os.environ["DATABASE_URL"] != target
                        or conninfo_to_dict(target)["dbname"] != "canvas_cloud_test"):
                    raise RuntimeError("Refusing cleanup outside this run's isolated test schema/database")
                with database.connection() as conn:
                    conn.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            finally:
                database.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
