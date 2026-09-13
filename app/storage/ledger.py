"""Small SQL adapter for the existing five-table ledger, not a new pricing engine.

Every supported statement is bound to the current storage workspace.
Historical JSON values are returned in the canonical representation used by the
original deduplication code. Money and timestamps never pass through floats.
"""
import json
import re
from contextlib import contextmanager
from app.storage.database import connection as pg_connection
from app.storage.workspace import current_workspace

COLUMNS = {
    "ledger_entries": "id,canvas_id,created_at,log_json,cost_json,source,cost_status,amount_micros,currency,kind,estimated,status,updated_at",
    "ledger_aliases": "canvas_id,alias,entry_id",
    "ledger_conflicts": "canvas_id,entry_id,fingerprint,source,incoming_json,reason,created_at",
    "ledger_imports": "canvas_id,source,fingerprint,report_json",
    "ledger_versions": "canvas_id,revision",
}


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.rowcount = cursor.rowcount

    def _row(self, row):
        if row is None:
            return None
        return Row({k: json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
                    if k.endswith("_json") else v for k, v in row.items()})

    def fetchone(self):
        return self._row(self.cursor.fetchone())

    def fetchall(self):
        return [self._row(row) for row in self.cursor.fetchall()]

    def __iter__(self):
        return (self._row(row) for row in self.cursor)


class LedgerConnection:
    def __init__(self, conn):
        self.conn = conn
        self.workspace = current_workspace()
        self.rollback_requested = False

    def rollback(self):
        self.rollback_requested = True

    def execute(self, statement, args=()):
        if statement == "BEGIN IMMEDIATE":
            # Serialize merge/deduplication across processes, as SQLite did.
            return Cursor(self.conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("ledger:" + self.workspace,)))
        if statement == "BEGIN":
            return Cursor(self.conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        sql = statement.replace("?", "%s")
        ignored = sql.startswith("INSERT OR IGNORE")
        replaced = sql.startswith("INSERT OR REPLACE")
        sql = sql.replace("INSERT OR IGNORE", "INSERT").replace("INSERT OR REPLACE", "INSERT")
        for table, columns in COLUMNS.items():
            sql = sql.replace("INSERT INTO " + table + " VALUES", "INSERT INTO " + table + " (" + columns + ") VALUES")
        if ignored:
            sql += " ON CONFLICT DO NOTHING"
        if replaced:
            if "INTO ledger_imports " not in sql:
                raise ValueError("Unsupported ledger upsert")
            sql += " ON CONFLICT(workspace_id,canvas_id,source) DO UPDATE SET fingerprint=excluded.fingerprint,report_json=excluded.report_json"
        sql = sql.replace("ON CONFLICT(canvas_id)", "ON CONFLICT(workspace_id,canvas_id)")
        sql = sql.replace("SET revision=revision+1", "SET revision=ledger_versions.revision+1")
        # JSONB parameters need an explicit adapter; leave all other values unchanged.
        from psycopg.types.json import Jsonb
        values = list(args)
        if re.match(r"INSERT INTO ledger_", sql):
            table = re.search(r"INSERT INTO (ledger_\w+)", sql).group(1)
            for index, column in enumerate(COLUMNS[table].split(",")):
                if column.endswith("_json"):
                    values[index] = Jsonb(json.loads(values[index]))
        elif sql.startswith("UPDATE ledger_entries SET log_json="):
            values[0], values[1] = Jsonb(json.loads(values[0])), Jsonb(json.loads(values[1]))
        if sql.startswith("INSERT INTO ledger_"):
            match = re.match(r"INSERT INTO (ledger_\w+) \(([^)]+)\) VALUES\s*\(", sql)
            if not match or match[1] not in COLUMNS or match[2] != COLUMNS[match[1]]:
                raise ValueError("Unsupported ledger insert")
            sql = "INSERT INTO " + match[1] + " (workspace_id," + match[2] + ") VALUES(%s," + sql[match.end():]
            values.insert(0, self.workspace)
        else:
            # This is a closed adapter for the existing single-table ledger
            # statements, not a general SQL rewriting or authorization engine.
            if not re.match(r"(?:SELECT .+ FROM|UPDATE|DELETE FROM) ledger_\w+ ", sql) or " WHERE " not in sql:
                raise ValueError("Unsupported unscoped ledger statement")
            prefix, predicate = sql.split(" WHERE ", 1)
            if re.search(r"\b(?:JOIN|UNION|SELECT)\b", predicate) or ";" in sql:
                raise ValueError("Unsupported compound ledger statement")
            pieces = re.split(r"( ORDER BY | LIMIT | OFFSET )", predicate, maxsplit=1)
            sql = prefix + " WHERE workspace_id=%s AND (" + pieces[0] + ")" + "".join(pieces[1:])
            values.insert(prefix.count("%s"), self.workspace)
        return Cursor(self.conn.execute(sql, values))


@contextmanager
def connection():
    class PreviewRollback(Exception):
        pass
    try:
        with pg_connection() as conn:
            adapter = LedgerConnection(conn)
            yield adapter
            if adapter.rollback_requested:
                raise PreviewRollback()
    except PreviewRollback:
        pass
