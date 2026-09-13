"""Guard local acceptance against credential, database and filesystem leakage."""
import importlib
import os
from pathlib import Path
from unittest.mock import Mock

import pytest

pytest.importorskip("psycopg")
from psycopg.conninfo import conninfo_to_dict
from tools import cloud_test


def test_import_does_not_load_private_configuration(monkeypatch):
    monkeypatch.setenv("STORAGE_ENV_FILE", "missing-private-config.env")
    before = dict(os.environ)
    importlib.reload(cloud_test)
    assert dict(os.environ) == before


def test_database_target_preserves_connection_options():
    source = "postgresql://tester:p%40ss@localhost:54329/dev?sslmode=require&connect_timeout=7"
    target = conninfo_to_dict(cloud_test.test_database_url(source))
    assert target == {**conninfo_to_dict(source), "dbname": "canvas_cloud_test"}
    keyword_source = "host=127.0.0.1 dbname=dev password='a b' application_name=acceptance"
    assert conninfo_to_dict(cloud_test.test_database_url(keyword_source)) == {
        **conninfo_to_dict(keyword_source), "dbname": "canvas_cloud_test"
    }


@pytest.mark.parametrize("source", [
    "host=production.example dbname=dev",
    "dbname=dev",
    "host=localhost hostaddr=203.0.113.1 dbname=dev",
    "host=localhost service=production dbname=dev",
])
def test_database_target_rejects_nonlocal_or_implicit_hosts(source):
    with pytest.raises(ValueError, match="loopback"):
        cloud_test.test_database_url(source)


@pytest.mark.parametrize("fail_migration", [False, True])
def test_runner_isolates_paths_and_cleans_its_schema(tmp_path, monkeypatch, fail_migration):
    from app.storage import database
    env_file = tmp_path / "storage.env"
    env_file.write_text("DATABASE_URL=postgresql://tester@127.0.0.1/dev\n", encoding="utf-8")
    monkeypatch.setenv("STORAGE_ENV_FILE", str(env_file))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("AUTH_DB_PATH", str(tmp_path / "real-auth.sqlite3"))
    before = dict(os.environ)
    conn = Mock()
    context = Mock()
    context.__enter__ = Mock(return_value=conn)
    context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(database, "connection", lambda: context)
    close = Mock()
    monkeypatch.setattr(database, "close", close)
    observed = {}

    def migrate():
        observed.update(os.environ)
        if fail_migration:
            raise RuntimeError("migration failed")

    monkeypatch.setattr(database, "migrate", migrate)
    run = Mock(return_value=5)
    monkeypatch.setattr(pytest, "main", run)
    if fail_migration:
        with pytest.raises(RuntimeError, match="migration failed"):
            cloud_test.main([])
        run.assert_not_called()
    else:
        assert cloud_test.main(["-x"]) == 5
        assert run.call_args.args[0][-1] == "-x"
    assert observed["DATABASE_BACKEND"] == "postgres"
    assert observed["MEDIA_BACKEND"] == "filesystem"
    assert observed["AUTH_DB_PATH"] != before["AUTH_DB_PATH"]
    root = Path(observed["AUTH_DB_PATH"]).parent
    for key in ("APP_RUNTIME_DIR", "OBJECT_STORE_ROOT", "MEDIA_TEMP_DIR"):
        assert Path(observed[key]).parent == root
    assert not root.exists()
    assert observed["DATABASE_SCHEMA"] in conn.execute.call_args.args[0].as_string()
    assert close.call_count == 2
    assert dict(os.environ) == before
