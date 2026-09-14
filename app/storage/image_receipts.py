"""Private, immutable per-image receipts, independent of aggregate finalization.

Each concurrent image has its own submission/result slot. A complete set can be
queried after a crash without replaying generation. These objects share the
private checkpoint role and must never be exposed as user media.
"""
import hashlib
import json
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

from fastapi import HTTPException
from app.storage import database, media, tasks
from app.storage.settings import postgres_enabled
from app.storage.workspace import current_workspace

_slot = ContextVar("image_receipt_slot", default=None)


@contextmanager
def slot_scope(index):
    token = _slot.set(index)
    try:
        yield
    finally:
        _slot.reset(token)


def count(row):
    return max(1, min(8, int(row["request"].get("n") or 1)))


def asset_id(task_id, index, kind):
    if type(index) is not int or not 0 <= index < 8 or kind not in {"upstream", "result"}:
        raise ValueError("Invalid image receipt slot")
    return "ast_" + hashlib.sha256(f"{task_id}:image-receipt:{index}:{kind}".encode()).hexdigest()[:32]


def summary(row, conn):
    if row["kind"] != "online-image":
        return None
    n = count(row)
    slots = [(asset_id(row["id"], i, "upstream"), asset_id(row["id"], i, "result")) for i in range(n)]
    ready = {r["id"] for r in conn.execute("""SELECT id FROM assets WHERE workspace_id=%s
        AND id=ANY(%s) AND role='task-result-source' AND status='ready' AND deleted_at IS NULL""",
        (row["workspace_id"], [key for pair in slots for key in pair]))}
    # Old single-image tasks sometimes retained one upstream id in the task row.
    legacy = n == 1 and bool(row.get("upstream_task_id"))
    saved = sum(result in ready for _, result in slots)
    known = sum(result in ready or upstream in ready or legacy for upstream, result in slots)
    return {"requested": n, "saved_results": saved, "queryable": known - saved,
            "unknown": n - known, "complete": known == n}


def recoverable(row):
    with database.connection() as conn:
        value = summary(row, conn)
        return bool(value and value["complete"])


def current_row():
    lease = tasks.lease_context.get()
    if not lease:
        raise HTTPException(409, "图片回执需要有效的任务执行租约")
    with database.connection() as conn:
        row = conn.execute("""SELECT * FROM tasks WHERE workspace_id=%s AND id=%s
            AND lease_token=%s AND lease_until>clock_timestamp()
            AND kind='online-image' AND status IN ('submitting','polling')""",
            (current_workspace(), *lease)).fetchone()
    if not row:
        raise HTTPException(409, "图片回执的任务执行资格已失效")
    return row


def _write(kind, value):
    index = _slot.get()
    if not postgres_enabled() or tasks.lease_context.get() is None or index is None:
        return
    row = current_row()
    if type(index) is not int or not 0 <= index < count(row):
        raise HTTPException(409, "图片回执不属于原请求的输出位置")
    packet = {"version": 1, "task_id": row["id"], "workspace_id": row["workspace_id"],
              "provider_id": row["provider_id"], "provider_account_ref": row["provider_account_ref"],
              "index": index, "kind": kind, **value}
    path = media.operation()["root"] / f"image-receipt-{index}-{kind}.json"
    path.write_text(json.dumps(packet, ensure_ascii=False, sort_keys=True, allow_nan=False), encoding="utf-8")
    media.check_budget()
    media.publish(path, asset_id=asset_id(row["id"], index, kind), role="task-result-source")


def submitted(upstream_task_id):
    if not isinstance(upstream_task_id, str) or not upstream_task_id.strip() or len(upstream_task_id) > 512:
        raise ValueError("Invalid upstream image task id")
    _write("upstream", {"upstream_task_id": upstream_task_id})


def completed(source, raw):
    # Keep accounting facts, not the entire upstream envelope or credentials.
    from app.services.media import extract_task_id
    facts = ({"id": raw.get("id"), "task_id": extract_task_id(raw), "usage": raw.get("usage")}
             if isinstance(raw, dict) else {})
    _write("result", {"source": source, "raw": tasks.clean_request(facts)})


def read(row, index):
    if row["workspace_id"] != current_workspace() or not 0 <= index < count(row):
        raise HTTPException(404, "图片任务回执不存在")
    for kind in ("result", "upstream"):
        key = asset_id(row["id"], index, kind)
        asset = media.get_asset(key, ready=False)
        if not asset or asset["status"] != "ready" or asset["deleted_at"]:
            continue
        if asset["role"] != "task-result-source":
            raise HTTPException(409, "图片任务回执类型不匹配")
        packet = json.loads(Path(media.materialize(key)).read_text(encoding="utf-8"))
        expected = {"version": 1, "task_id": row["id"], "workspace_id": row["workspace_id"],
                    "provider_id": row["provider_id"], "provider_account_ref": row["provider_account_ref"],
                    "index": index, "kind": kind}
        if any(packet.get(k) != v for k, v in expected.items()):
            raise HTTPException(409, "图片任务回执与原任务不匹配")
        return packet
    if count(row) == 1 and row.get("upstream_task_id"):
        return {"kind": "upstream", "upstream_task_id": row["upstream_task_id"]}
    raise HTTPException(409, "缺少原图片提交回执，禁止重新生成")
