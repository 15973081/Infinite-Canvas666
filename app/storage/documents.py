from psycopg.types.json import Jsonb
from app.storage.database import connection
from contextvars import ContextVar

read_versions = ContextVar("document_read_versions", default=None)


def get(kind, key="default", default=None):
    with connection() as conn:
        row = conn.execute("SELECT value,revision FROM workspace_documents WHERE workspace_id='default' AND kind=%s AND id=%s", (kind, key)).fetchone()
        versions = read_versions.get()
        if versions is not None:
            versions[(kind, key)] = row["revision"] if row else 0
        return row["value"] if row else default


def put(kind, key, value, expected_revision=None):
    from fastapi import HTTPException
    versions = read_versions.get()
    if expected_revision is None and versions is not None:
        expected_revision = versions.get((kind, key))
    with connection() as conn:
        if expected_revision == 0:
            row = conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES('default',%s,%s,%s) ON CONFLICT DO NOTHING RETURNING revision", (kind, key, Jsonb(value))).fetchone()
            if not row:
                raise HTTPException(409, "Document was created concurrently; reload before saving")
        elif expected_revision is not None:
            row = conn.execute("UPDATE workspace_documents SET value=%s,revision=revision+1,updated_at=now() WHERE workspace_id='default' AND kind=%s AND id=%s AND revision=%s RETURNING revision",
                               (Jsonb(value), kind, key, expected_revision)).fetchone()
            if not row:
                raise HTTPException(409, "Document changed; reload before saving")
        else:
            row = conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES('default',%s,%s,%s) ON CONFLICT(workspace_id,kind,id) DO UPDATE SET value=excluded.value,revision=workspace_documents.revision+1,updated_at=now() RETURNING revision", (kind, key, Jsonb(value))).fetchone()
        if versions is not None:
            versions[(kind, key)] = row["revision"]
        return row["revision"]


def list_values(kind, prefix="", batch_size=100):
    """Administrative scans release the connection after each bounded batch."""
    if not 1 <= batch_size <= 500:
        raise ValueError("Document batch size must be 1–500")
    after = None
    while True:
        clauses, args = ["workspace_id='default'", "kind=%s"], [kind]
        if prefix:
            clauses.append("starts_with(id,%s)")
            args.append(prefix)
        if after is not None:
            clauses.append("id>%s")
            args.append(after)
        with connection() as conn:
            rows = conn.execute("SELECT id,value,revision,created_at,updated_at FROM workspace_documents WHERE " +
                                " AND ".join(clauses) + " ORDER BY id LIMIT %s", [*args, batch_size]).fetchall()
        if not rows:
            return
        yield from rows
        after = rows[-1]["id"]


def delete(kind, key):
    with connection() as conn:
        return conn.execute("DELETE FROM workspace_documents WHERE workspace_id='default' AND kind=%s AND id=%s", (kind, key)).rowcount
