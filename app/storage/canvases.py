import copy
import time
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection


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
        row = conn.execute("SELECT * FROM canvases WHERE workspace_id='default' AND id=%s", (canvas_id,)).fetchone()
        if not row or (row["deleted_at"] and not include_deleted):
            raise HTTPException(404, "画布不存在或已在回收站")
        return _document(row)


def all_documents():
    with connection() as conn:
        return [_document(row) for row in conn.execute("SELECT * FROM canvases WHERE workspace_id='default' ORDER BY updated_at DESC,id")]


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
        args = (value.get("title") or "未命名画布", value.get("kind") or "classic", Jsonb(value), now / 1000, deleted / 1000 if deleted else None)
        if revision is None:
            row = conn.execute("INSERT INTO canvases(id,title,kind,document,updated_at,deleted_at,created_at) VALUES(%s,%s,%s,%s,to_timestamp(%s),to_timestamp(%s),to_timestamp(%s)) ON CONFLICT(id) DO NOTHING RETURNING *", (value["id"], *args, created / 1000)).fetchone()
        else:
            row = conn.execute("UPDATE canvases SET title=%s,kind=%s,document=%s,updated_at=to_timestamp(%s),deleted_at=to_timestamp(%s),revision=revision+1 WHERE workspace_id='default' AND id=%s AND revision=%s RETURNING *", (*args, value["id"], revision)).fetchone()
        if not row:
            current = conn.execute("SELECT * FROM canvases WHERE workspace_id='default' AND id=%s", (value["id"],)).fetchone()
            raise HTTPException(409, {"message": "画布已更新，请重新加载后合并", "canvas": _document(current) if current else None})
        ids = sorted(referenced_ids(value))
        if ids:
            ready = conn.execute("SELECT id FROM assets WHERE workspace_id='default' AND id=ANY(%s) AND status='ready' AND deleted_at IS NULL ORDER BY id FOR SHARE", (ids,)).fetchall()
            if {r["id"] for r in ready} != set(ids):
                raise HTTPException(400, "画布引用了尚未就绪或不存在的素材")
        conn.execute("DELETE FROM canvas_assets WHERE workspace_id='default' AND canvas_id=%s", (value["id"],))
        for asset_id in ids:
            conn.execute("INSERT INTO canvas_assets(workspace_id,canvas_id,asset_id) VALUES('default',%s,%s)", (value["id"], asset_id))
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
