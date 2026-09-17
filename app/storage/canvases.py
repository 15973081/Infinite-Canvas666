import copy
import time
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace


def _document(row):
    value = copy.deepcopy(row["document"])
    value.update(id=row["id"], title=row["title"], kind=row["kind"], revision=row["revision"],
                 created_at=int(row["created_at"].timestamp() * 1000), updated_at=int(row["updated_at"].timestamp() * 1000))
    if row["deleted_at"]:
        value["deleted_at"] = int(row["deleted_at"].timestamp() * 1000)
    else:
        value.pop("deleted_at", None)
    return value


def get(canvas_id, include_deleted=False):
    with connection() as conn:
        row = conn.execute("SELECT * FROM canvases WHERE workspace_id=%s AND id=%s", (current_workspace(), canvas_id)).fetchone()
        if not row or (row["deleted_at"] and not include_deleted):
            raise HTTPException(404, "画布不存在或已在回收站")
        return _document(row)


def all_documents():
    after = ""
    while True:
        with connection() as conn:
            rows = conn.execute("SELECT * FROM canvases WHERE workspace_id=%s AND id>%s ORDER BY id LIMIT 100", (current_workspace(), after)).fetchall()
        if not rows:
            return
        yield from (_document(row) for row in rows)
        after = rows[-1]["id"]


def list_records(include_deleted=False):
    """Directory listings never transfer canvas nodes, logs or media payloads."""
    after = ""
    while True:
        with connection() as conn:
            rows = conn.execute("""SELECT id,title,kind,revision,created_at,updated_at,deleted_at,
                jsonb_build_object('icon',document->'icon','owner',document->'owner','color',document->'color',
                'cover_style',document->'cover_style','pinned',document->'pinned','folder_id',document->'folder_id',
                'node_count',jsonb_array_length(coalesce(document->'nodes','[]'::jsonb))) AS document
                FROM canvases WHERE workspace_id=%s AND id>%s AND (deleted_at IS NOT NULL)=%s
                AND coalesce(document->>'purged_at','0') IN ('0','') ORDER BY id LIMIT 100""", (current_workspace(), after, include_deleted)).fetchall()
        if not rows:
            return
        yield from (_document(row) for row in rows)
        after = rows[-1]["id"]


def save(canvas, touch=True):
    from app.storage.media import normalize_document, referenced_ids
    value = normalize_document(copy.deepcopy(canvas))
    revision = value.pop("revision", None)
    # Ledger ingestion belongs to the service. Keep a bounded compatibility log snapshot.
    value["logs"] = (value.get("logs") or [])[-5000:]
    now = max(int(time.time() * 1000), int(value.get("updated_at") or 0) + 1) if touch else int(value.get("updated_at") or time.time() * 1000)
    value["updated_at"] = now
    created = int(value.get("created_at") or now)
    deleted = value.get("deleted_at")
    with connection() as conn:
        from app.services.member_context import current_access
        from app.services import authorization as az
        access = current_access.get()
        if access:
            if revision is None:
                az.require(conn, access.principal, 'canvas.create', current_workspace())
            else:
                from app.services.canvas_leases import request_write
                request_write(conn, value['id'])
        args = (value.get("title") or "未命名画布", value.get("kind") or "classic", Jsonb(value), now / 1000, deleted / 1000 if deleted else None)
        if revision is None:
            row = conn.execute("INSERT INTO canvases(workspace_id,id,title,kind,document,updated_at,deleted_at,created_at) VALUES(%s,%s,%s,%s,%s,to_timestamp(%s),to_timestamp(%s),to_timestamp(%s)) ON CONFLICT(id) DO NOTHING RETURNING *", (current_workspace(), value["id"], *args, created / 1000)).fetchone()
        else:
            row = conn.execute("UPDATE canvases SET title=%s,kind=%s,document=%s,updated_at=to_timestamp(%s),deleted_at=to_timestamp(%s),revision=revision+1 WHERE workspace_id=%s AND id=%s AND revision=%s RETURNING *", (*args, current_workspace(), value["id"], revision)).fetchone()
        if not row:
            current = conn.execute("SELECT * FROM canvases WHERE workspace_id=%s AND id=%s", (current_workspace(), value["id"])).fetchone()
            raise HTTPException(409, {"message": "画布已更新，请重新加载后合并", "canvas": _document(current) if current else None})
        if access:
            row = conn.execute('''UPDATE canvases SET updated_by=%s,
                created_by=CASE WHEN %s THEN %s ELSE created_by END
                WHERE workspace_id=%s AND id=%s RETURNING *''',
                (access.principal.member_id, revision is None, access.principal.member_id, current_workspace(), value['id'])).fetchone()
        ids = sorted(referenced_ids(value))
        if ids:
            ready = conn.execute("SELECT id FROM assets WHERE workspace_id=%s AND id=ANY(%s) AND status='ready' AND deleted_at IS NULL ORDER BY id FOR SHARE", (current_workspace(), ids)).fetchall()
            if {r["id"] for r in ready} != set(ids):
                raise HTTPException(400, "画布引用了尚未就绪或不存在的素材")
        conn.execute("DELETE FROM canvas_assets WHERE workspace_id=%s AND canvas_id=%s", (current_workspace(), value["id"]))
        for asset_id in ids:
            conn.execute("INSERT INTO canvas_assets(workspace_id,canvas_id,asset_id) VALUES(%s,%s,%s)", (current_workspace(), value["id"], asset_id))
        from app.storage.canvas_asset_groups import save_group
        save_group(conn, _document(row))
    canvas.clear()
    canvas.update(_document(row))
    return canvas


def purge(canvas_id):
    # Retain the tombstone and backups; fee history and objects must remain recoverable.
    value = get(canvas_id, include_deleted=True)
    if not value.get("deleted_at"):
        raise HTTPException(409, "请先将画布移入回收站")
    value["purged_at"] = int(time.time() * 1000)
    save(value)
