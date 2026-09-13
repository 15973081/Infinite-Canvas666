import json
import time
from fastapi import HTTPException
from app.storage import documents, canvases


def create(canvas_id, automatic=False):
    value = canvases.get(canvas_id)
    stamp = int(time.time() * 1000)
    filename = str(stamp) + ("-auto.json" if automatic else ".json")
    documents.put("canvas_backup", canvas_id + "/" + filename, value)
    # No automatic snapshot removal in the first cloud release.
    return {"ok": True, "filename": filename, "updated_at": stamp}


def list_backups(canvas_id):
    values = []
    for row in documents.list_values("canvas_backup", prefix=canvas_id + "/"):
        if not row["id"].startswith(canvas_id + "/"):
            continue
        filename = row["id"].split("/", 1)[1]
        if not filename[:-5].isdigit() or not filename.endswith(".json"):
            continue
        value = row["value"]
        values.append({"filename": filename, "timestamp": int(filename[:-5]), "title": value.get("title", ""),
                       "size": len(json.dumps(value, ensure_ascii=False).encode()), "node_count": len(value.get("nodes") or [])})
    return {"backups": sorted(values, key=lambda v: v["timestamp"], reverse=True)}


def restore(canvas_id, filename):
    current = canvases.get(canvas_id, include_deleted=True)
    value = documents.get("canvas_backup", canvas_id + "/" + filename)
    if not value:
        raise HTTPException(404, "备份不存在")
    value.update(id=canvas_id, revision=current["revision"])
    from app.services.canvas import save_canvas
    save_canvas(value)
    return {"canvas": value}
