import time
from fastapi import HTTPException
from app.storage import documents, canvases
from app.storage.database import connection
from app.storage.workspace import current_workspace


def create(canvas_id, automatic=False):
    with connection():
        value = canvases.get(canvas_id)
        stamp = int(time.time() * 1000)
        filename = str(stamp) + ("-auto.json" if automatic else ".json")
        documents.put("canvas_backup", canvas_id + "/" + filename, value)
    # No automatic snapshot removal in the first cloud release.
    return {"ok": True, "filename": filename, "updated_at": stamp}


def list_backups(canvas_id):
    values = []
    with connection() as conn:
        rows = conn.execute("""SELECT id,coalesce(value->>'title','') AS title,
            octet_length(value::text) AS size,
            CASE WHEN jsonb_typeof(value->'nodes')='array' THEN jsonb_array_length(value->'nodes') ELSE 0 END AS node_count
            FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_backup' AND starts_with(id,%s)
                AND split_part(id,'/',2) ~ '^[0-9]+[.]json$'""",
            (current_workspace(), canvas_id + '/')).fetchall()
    for row in rows:
        filename = row["id"].split("/", 1)[1]
        if not filename[:-5].isdigit() or not filename.endswith(".json"):
            continue
        values.append({"filename": filename, "timestamp": int(filename[:-5]), "title": row['title'],
                       "size": row['size'], "node_count": row['node_count']})
    return {"backups": sorted(values, key=lambda v: v["timestamp"], reverse=True)}


def restore(canvas_id, filename):
    with connection():
        current = canvases.get(canvas_id, include_deleted=True)
        value = documents.get("canvas_backup", canvas_id + "/" + filename)
        if not value:
            raise HTTPException(404, "备份不存在")
        value.update(id=canvas_id, revision=current["revision"])
        from app.services.canvas import save_canvas
        save_canvas(value)
    return {"canvas": value}
