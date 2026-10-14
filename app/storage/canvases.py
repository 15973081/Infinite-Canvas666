import copy
import time
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.services.canvas_cover import cover_sql

_RECORD_COLUMNS = """id,title,kind,revision,created_at,updated_at,deleted_at,
    jsonb_build_object('icon',document->'icon','owner',document->'owner','color',document->'color',
    'cover',document->'cover',
    'cover_style',document->'cover_style','pinned',document->'pinned','folder_id',document->'folder_id',
    'node_count',jsonb_array_length(coalesce(document->'nodes','[]'::jsonb))) AS document"""


def _document(row):
    value = copy.deepcopy(row["document"])
    registry = value.pop('_task_results', None)
    if registry:
        value['task_result_version'] = registry['version']
    value.update(id=row["id"], title=row["title"], kind=row["kind"], revision=row["revision"],
                 created_at=int(row["created_at"].timestamp() * 1000), updated_at=int(row["updated_at"].timestamp() * 1000))
    if row["deleted_at"]:
        value["deleted_at"] = int(row["deleted_at"].timestamp() * 1000)
    else:
        value.pop("deleted_at", None)
    return value


def get(canvas_id, include_deleted=False, *, metadata_only=False):
    with connection() as conn:
        columns = _RECORD_COLUMNS if metadata_only else '*'
        row = conn.execute(f"SELECT {columns} FROM canvases WHERE workspace_id=%s AND id=%s", (current_workspace(), canvas_id)).fetchone()
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
            # Expand JSON once per row: separate document-> expressions repeatedly
            # decompress large historical canvases even though only labels are returned.
            rows = conn.execute(f"""SELECT c.id,c.title,c.kind,c.revision,c.created_at,c.updated_at,c.deleted_at,
                jsonb_build_object('icon',m.icon,'owner',m.owner,'color',m.color,'cover_style',m.cover_style,
                    'cover',m.cover,'cover_media',{cover_sql('m.nodes', 'm.cover')},
                    'pinned',m.pinned,'folder_id',m.folder_id,'node_count',jsonb_array_length(coalesce(m.nodes,'[]'::jsonb))) AS document
                FROM canvases c CROSS JOIN LATERAL jsonb_to_record(c.document) AS m(
                    icon jsonb,owner jsonb,color jsonb,cover_style jsonb,cover jsonb,pinned jsonb,folder_id jsonb,nodes jsonb,purged_at text)
                WHERE c.workspace_id=%s AND c.id>%s AND (c.deleted_at IS NOT NULL)=%s
                    AND coalesce(m.purged_at,'0') IN ('0','') ORDER BY c.id LIMIT 100""", (current_workspace(), after, include_deleted)).fetchall()
        if not rows:
            return
        yield from (_document(row) for row in rows)
        after = rows[-1]["id"]


def save_metadata(canvas):
    """Patch directory fields without revisiting nodes, media or historical logs."""
    from app.services.member_context import current_access
    fields = {'title', 'icon', 'owner', 'color', 'cover_style', 'pinned', 'folder_id'}
    patch = {key: canvas[key] for key in fields if canvas.get(key) is not None}
    workspace = current_workspace()
    with connection() as conn:
        from app.storage.canvas_directory import lock
        lock(conn)
        access = current_access.get()
        if patch.get('folder_id'):
            from app.storage.canvas_directory import validate_folder
            existing=conn.execute("SELECT document->>'folder_id' AS folder_id FROM canvases WHERE workspace_id=%s AND id=%s",(workspace,canvas['id'])).fetchone()
            if not existing or existing['folder_id']!=patch['folder_id']:validate_folder(conn,patch['folder_id'])
        if access:
            from app.services.canvas_leases import request_write
            request_write(conn, canvas['id'])
        row = conn.execute(f"""UPDATE canvases SET title=coalesce(%s,title),
            document=document || %s,revision=revision+1,updated_by=coalesce(%s,updated_by)
            WHERE workspace_id=%s AND id=%s AND revision=%s
            RETURNING {_RECORD_COLUMNS}""",
            (patch.get('title'), Jsonb(patch), access.principal.member_id if access else None,
             workspace, canvas['id'], canvas.get('revision'))).fetchone()
        if not row:
            raise HTTPException(409, {'code': 'canvas_revision_conflict', 'message': '画布已更新，请重新加载后合并'})
        # Asset membership is unchanged; keep the asset library's label in sync.
        conn.execute("""UPDATE canvas_asset_groups SET document=document || %s,updated_at=now()
            WHERE workspace_id=%s AND canvas_id=%s""", (Jsonb(patch), workspace, canvas['id']))
    canvas.update(_document(row))
    return canvas


def save(canvas, touch=True):
    from app.storage.media import normalize_document, referenced_ids
    value = normalize_document(copy.deepcopy(canvas))
    seen_result_version = value.pop('task_result_version', 0) or 0
    value.pop('_task_results', None)
    revision = value.pop("revision", None)
    # Ledger ingestion belongs to the service. Keep a bounded compatibility log snapshot.
    value["logs"] = (value.get("logs") or [])[-5000:]
    now = max(int(time.time() * 1000), int(value.get("updated_at") or 0) + 1) if touch else int(value.get("updated_at") or time.time() * 1000)
    value["updated_at"] = now
    created = int(value.get("created_at") or now)
    deleted = value.get("deleted_at")
    with connection() as conn:
        from app.storage.canvas_directory import lock
        lock(conn)
        from app.services.member_context import current_access
        from app.services import authorization as az
        access = current_access.get()
        if access:
            if revision is None:
                az.require(conn, access.principal, 'canvas.create', current_workspace())
            else:
                from app.services.canvas_leases import request_write
                request_write(conn, value['id'])
        if value.get('folder_id'):
            from app.storage.canvas_directory import validate_folder
            existing=conn.execute("SELECT document->>'folder_id' AS folder_id FROM canvases WHERE workspace_id=%s AND id=%s",(current_workspace(),value['id'])).fetchone()
            if not existing or existing['folder_id']!=value['folder_id']:validate_folder(conn,value['folder_id'])
        if revision is not None:
            stored = conn.execute('SELECT document FROM canvases WHERE workspace_id=%s AND id=%s FOR UPDATE', (current_workspace(), value['id'])).fetchone()
            if stored:
                from app.services.canvas_task_results import merge_unseen_deliveries
                merge_unseen_deliveries(value, stored['document'], seen_result_version)
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
        ids = sorted(referenced_ids({key: item for key, item in value.items() if key != '_task_results'}))
        if ids:
            from app.storage.media import lock_retained_references
            lock_retained_references(conn,ids)
            ready = conn.execute("SELECT id FROM assets WHERE workspace_id=%s AND id=ANY(%s) AND status='ready' AND deleted_at IS NULL ORDER BY id FOR SHARE", (current_workspace(), ids)).fetchall()
            if {r["id"] for r in ready} != set(ids):
                raise HTTPException(400, "画布引用了尚未就绪或不存在的素材")
        conn.execute("DELETE FROM canvas_assets WHERE workspace_id=%s AND canvas_id=%s", (current_workspace(), value["id"]))
        if ids:
            conn.execute("INSERT INTO canvas_assets(workspace_id,canvas_id,asset_id) SELECT %s,%s,unnest(%s::text[])",
                         (current_workspace(), value["id"], ids))
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
