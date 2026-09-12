"""Bounded connection pool and explicit, transactional schema migrations."""
import hashlib
import os
import re
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from threading import get_ident
from contextvars import ContextVar

_pool = None
_lock = Lock()
_transaction = ContextVar("storage_transaction", default=None)


def schema_name():
    name = os.getenv("DATABASE_SCHEMA", "canvas_cloud")
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", name):
        raise ValueError("Invalid DATABASE_SCHEMA")
    return name


def pool():
    global _pool
    with _lock:
        if _pool is None:
            from psycopg_pool import ConnectionPool
            from psycopg.rows import dict_row
            from psycopg import sql

            def configure(conn):
                conn.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema_name())))
                conn.execute("SET statement_timeout TO '30s'")
                conn.execute("SET idle_in_transaction_session_timeout TO '30s'")
                conn.commit()

            _pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=1,
                                   max_size=int(os.getenv("DATABASE_POOL_SIZE", "10")),
                                   kwargs={"row_factory": dict_row, "connect_timeout": 10},
                                   configure=configure, open=True, timeout=15)
        return _pool


@contextmanager
def connection():
    active = _transaction.get()
    if active and active[1] == get_ident():
        with active[0].transaction():
            yield active[0]
        return
    with pool().connection() as conn:
        with conn.transaction():
            token = _transaction.set((conn, get_ident()))
            try:
                yield conn
            finally:
                _transaction.reset(token)


def close():
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None


def migrate():
    from psycopg import sql
    path = Path(__file__).parent / "migrations" / "001_shared_workspace.sql"
    source = path.read_text(encoding="utf-8")
    digest = hashlib.sha256(source.encode()).hexdigest()
    schema = schema_name()
    with connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(642193001)")
        conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz DEFAULT now())")
        row = conn.execute("SELECT sha256 FROM schema_migrations WHERE version=1").fetchone()
        if row:
            if row["sha256"] != digest:
                raise RuntimeError("Migration checksum mismatch; do not edit an applied migration")
            return
        conn.execute(source.replace("canvas_cloud.", schema + "."), prepare=False)
        conn.execute("INSERT INTO schema_migrations(version,sha256) VALUES(1,%s)", (digest,))


def check():
    with connection() as conn:
        row = conn.execute("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").fetchone()
        if not row or row["version"] != 1:
            raise RuntimeError("Run python tools/cloud_storage.py init-db before startup")
