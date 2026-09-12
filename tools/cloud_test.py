"""Run integration tests in a disposable schema and private object directory."""
import os
from pathlib import Path
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("STORAGE_ENV_FILE", str(ROOT / ".local/cloud/storage.env"))
from app.storage.settings import load_storage_env
load_storage_env()
os.environ["DATABASE_URL"] = os.environ["DATABASE_URL"].rsplit("/", 1)[0] + "/canvas_cloud_test"
os.environ["DATABASE_SCHEMA"] = "cloud_test_" + uuid.uuid4().hex
os.environ["CLOUD_EMBEDDED_WORKER"] = "false"
os.environ["CLOUD_INTEGRATION_TEST"] = "1"

if __name__ == "__main__":
    from app.storage import database
    from psycopg import sql
    with tempfile.TemporaryDirectory(prefix="cloud-integration-") as directory:
        os.environ["APP_RUNTIME_DIR"] = str(Path(directory) / "runtime")
        os.environ["OBJECT_STORE_ROOT"] = str(Path(directory) / "objects")
        os.environ["MEDIA_TEMP_DIR"] = str(Path(directory) / "tmp")
        os.environ["MEDIA_BACKEND"] = "filesystem"
        database.migrate()
        try:
            import pytest
            result = pytest.main([str(ROOT / "tests/test_cloud_storage.py"), "-q", *sys.argv[1:]])
        finally:
            schema = database.schema_name()
            if not schema.startswith("cloud_test_") or not os.environ["DATABASE_URL"].endswith("/canvas_cloud_test"):
                raise RuntimeError("Refusing cleanup outside isolated test schema/database")
            with database.connection() as conn:
                conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
            database.close()
    raise SystemExit(result)
