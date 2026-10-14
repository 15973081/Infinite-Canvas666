from psycopg.types.json import Jsonb
from app.storage.database import connection
from contextvars import ContextVar
from app.storage.workspace import current_workspace

read_versions = ContextVar("document_read_versions", default=None)


def get(kind, key="default", default=None):
    if kind == 'subject_library' and key.startswith('personal:'):
        from app.storage.deletion_ledger import member_blocked
        if member_blocked(key[len('personal:'):]): return default
    if kind=='conversation':
        from app.storage.deletion_ledger import document_blocked
        if document_blocked(current_workspace(),key): return default
    with connection() as conn:
        row = conn.execute("SELECT value,revision FROM workspace_documents WHERE workspace_id=%s AND kind=%s AND id=%s", (current_workspace(), kind, key)).fetchone()
        versions = read_versions.get()
        if versions is not None:
            versions[(current_workspace(), kind, key)] = row["revision"] if row else 0
        return row["value"] if row else default


def put(kind, key, value, expected_revision=None):
    from fastapi import HTTPException
    if kind == 'subject_library' and key.startswith('personal:'):
        from app.storage.deletion_ledger import member_blocked
        if member_blocked(key[len('personal:'):]): raise HTTPException(409, '账号已注销，不能重新保存个人主体。')
    if kind=='conversation':
        from app.storage.deletion_ledger import document_blocked
        if document_blocked(current_workspace(),key): raise HTTPException(409,'对话已删除或账号已注销，不能重新保存。')
    versions = read_versions.get()
    if expected_revision is None and versions is not None:
        expected_revision = versions.get((current_workspace(), kind, key))
    with connection() as conn:
        if kind=='canvas_folders':
            from app.storage.canvas_directory import lock
            lock(conn)
        from app.storage.media import lock_retained_references
        lock_retained_references(conn, value, allow_private=kind == 'conversation')
        if expected_revision == 0:
            row = conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING revision", (current_workspace(), kind, key, Jsonb(value))).fetchone()
            if not row:
                raise HTTPException(409, "Document was created concurrently; reload before saving")
        elif expected_revision is not None:
            row = conn.execute("UPDATE workspace_documents SET value=%s,revision=revision+1,updated_at=now() WHERE workspace_id=%s AND kind=%s AND id=%s AND revision=%s RETURNING revision",
                               (Jsonb(value), current_workspace(), kind, key, expected_revision)).fetchone()
            if not row:
                raise HTTPException(409, "Document changed; reload before saving")
        else:
            row = conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,%s,%s,%s) ON CONFLICT(workspace_id,kind,id) DO UPDATE SET value=excluded.value,revision=workspace_documents.revision+1,updated_at=now() RETURNING revision", (current_workspace(), kind, key, Jsonb(value))).fetchone()
        if kind == 'history':
            from app.services.online_inbox import register
            register(conn, key, value)
        elif kind in {'asset_library', 'subject_library'}:
            from app.services.online_inbox import mark_library_saved
            mark_library_saved(conn,value)
        if versions is not None:
            versions[(current_workspace(), kind, key)] = row["revision"]
        return row["revision"]


def list_values(kind, prefix="", batch_size=100):
    """Administrative scans release the connection after each bounded batch."""
    if not 1 <= batch_size <= 500:
        raise ValueError("Document batch size must be 1–500")
    after = None
    while True:
        clauses, args = ["workspace_id=%s", "kind=%s"], [current_workspace(), kind]
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
        if kind=='conversation':
            from app.services.member_context import current_access
            access=current_access.get()
            if access:
                if not key.startswith(access.principal.member_id+'/'):
                    from fastapi import HTTPException
                    raise HTTPException(404,'对话不存在。')
                from app.storage.deletion_ledger import write_record
                write_record({'version':1,'kind':'conversation','workspace_id':current_workspace(),
                              'owner_id':access.principal.member_id,'document_id':key,'objects':[]})
        return conn.execute("DELETE FROM workspace_documents WHERE workspace_id=%s AND kind=%s AND id=%s", (current_workspace(), kind, key)).rowcount
