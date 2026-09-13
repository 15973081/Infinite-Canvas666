"""Bounded history queries with a stable (timestamp, id) continuation key."""
import base64
import json
import math

from fastapi import HTTPException
from app.storage.database import connection
from app.storage.workspace import current_workspace

STAMP = "CASE WHEN jsonb_typeof(value->'timestamp')='number' THEN (value->>'timestamp')::numeric ELSE 0 END"
VISIBLE = "jsonb_typeof(value->'images')='array' AND value->'images' != '[]'::jsonb"


def decode_cursor(cursor, kind):
    if not cursor:
        return None
    try:
        if len(cursor) > 2048:
            raise ValueError()
        stamp, key, scope, workspace = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        if workspace != current_workspace() or scope != kind or not isinstance(key, str) or not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
            raise ValueError()
        return stamp, key
    except (ValueError, TypeError, UnicodeError):
        raise HTTPException(400, "无效的历史分页游标") from None


def page(kind=None, limit=50, cursor=None):
    if not 1 <= limit <= 200:
        raise HTTPException(400, "每页历史数量必须为 1–200")
    after = decode_cursor(cursor, kind)
    clauses = ["workspace_id=%s", "kind='history'", VISIBLE]
    args = [current_workspace()]
    if kind:
        clauses.append("coalesce(value->>'type','zimage')=%s")
        args.append(kind)
    if after:
        clauses.append(f"({STAMP},id)<(%s,%s)")
        args.extend(after)
    args.append(limit + 1)
    with connection() as conn:
        rows = conn.execute(f"SELECT id,value,{STAMP} AS stamp FROM workspace_documents WHERE " +
                            " AND ".join(clauses) + f" ORDER BY {STAMP} DESC,id DESC LIMIT %s", args).fetchall()
    more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = None
    if more:
        stamp = rows[-1]["stamp"]
        stamp = int(stamp) if stamp == int(stamp) else float(stamp)
        next_cursor = base64.urlsafe_b64encode(json.dumps([stamp, rows[-1]["id"], kind, current_workspace()]).encode()).decode()
    return {"items": [row["value"] for row in rows], "next_cursor": next_cursor}


def legacy_list(kind=None):
    args = [current_workspace(), kind] if kind else [current_workspace()]
    filtering = " AND coalesce(value->>'type','zimage')=%s" if kind else ""
    with connection() as conn:
        return [row["value"] for row in conn.execute(f"SELECT value FROM workspace_documents WHERE workspace_id=%s AND kind='history' AND {VISIBLE}" +
                filtering + f" ORDER BY {STAMP} DESC,id DESC LIMIT 5000", args)]


def delete_timestamp(timestamp):
    if isinstance(timestamp, (int, float)):
        where, args = f"jsonb_typeof(value->'timestamp')='number' AND abs(({STAMP})-%s)<0.001", (timestamp,)
    else:
        where, args = "coalesce(value->>'timestamp','0')=%s", (str(timestamp),)
    with connection() as conn:
        return conn.execute("DELETE FROM workspace_documents WHERE workspace_id=%s AND kind='history' AND " + where, (current_workspace(), *args)).rowcount > 0
