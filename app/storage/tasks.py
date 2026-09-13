"""Durable tasks with idempotent creation and fenced worker leases."""
import copy
import hashlib
import json
import time
from contextvars import ContextVar
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection

lease_context = ContextVar("cloud_task_lease", default=None)
ACTIVE = ("queued", "running", "submitting", "polling", "finalizing")
TERMINAL = ("succeeded", "failed", "cancelled", "needs_review")


def clean_request(value):
    if isinstance(value, dict):
        return {k: clean_request(v) for k, v in value.items()
                if k.lower() not in {"api_key", "apikey", "secret_key", "access_key", "authorization", "password"}}
    if isinstance(value, list):
        return [clean_request(v) for v in value]
    return value


def fingerprint(request):
    return hashlib.sha256(json.dumps(clean_request(request), ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def decode(row):
    if not row:
        return {}
    task = copy.deepcopy(row["legacy_metadata"])
    task.update(id=row["id"], type=row["kind"], status=row["status"], result=row["result"],
                created_at=row["created_at"].timestamp(), updated_at=row["updated_at"].timestamp())
    if row["upstream_task_id"]:
        task["upstream_task_id"] = row["upstream_task_id"]
    if row["error_message"]:
        task["error"] = row["error_message"]
    return task


def get(task_id):
    with connection() as conn:
        return decode(conn.execute("SELECT * FROM tasks WHERE workspace_id='default' AND id=%s", (task_id,)).fetchone())


def request(task_id):
    with connection() as conn:
        row = conn.execute("SELECT request FROM tasks WHERE workspace_id='default' AND id=%s", (task_id,)).fetchone()
        return row["request"] if row else {}


def list_tasks(statuses=None, task_type="", canvas_id=""):
    clauses, args = ["workspace_id='default'"], []
    for key, value in (("status", list(statuses or [])), ("kind", task_type), ("canvas_id", canvas_id)):
        if value:
            clauses.append(key + ("=ANY(%s)" if key == "status" else "=%s"))
            args.append(value)
    with connection() as conn:
        return [decode(r) for r in conn.execute("SELECT * FROM tasks WHERE " + " AND ".join(clauses) + " ORDER BY created_at,id", args)]


def save(task, request_payload=None):
    from app.storage.media import referenced_ids
    value = clean_request(copy.deepcopy(task))
    task_id = value.get("id")
    if not task_id:
        raise ValueError("Task id is required")
    with connection() as conn:
        # The lock also serializes two initial requests with the same id.
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (task_id,))
        old = conn.execute("SELECT * FROM tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone()
        if old:
            if request_payload is not None:
                if old["request_sha256"] != fingerprint(request_payload):
                    raise HTTPException(409, "相同任务 ID 的请求内容不同")
                return decode(old)
            lease = lease_context.get()
            if not lease or lease[0] != task_id:
                raise HTTPException(409, "任务更新必须持有执行租约")
            valid = conn.execute("SELECT 1 FROM tasks WHERE id=%s AND lease_token=%s AND lease_until>now()", lease).fetchone()
            if not valid:
                raise HTTPException(409, "任务租约已过期，拒绝旧执行者写入")
        status = value.get("status") or "queued"
        if status not in ACTIVE + TERMINAL:
            value["legacy_status"] = status
            status = "needs_review"
        now = float(value.get("updated_at") or time.time())
        if old:
            row = conn.execute("UPDATE tasks SET status=%s,legacy_metadata=%s,result=%s,upstream_task_id=%s,error_message=%s,updated_at=to_timestamp(%s),completed_at=CASE WHEN %s THEN now() ELSE NULL END,output_asset_ids=%s WHERE id=%s RETURNING *",
                               (status, Jsonb(value), Jsonb(value.get("result")), value.get("upstream_task_id") or None, value.get("error") or None, now, status in TERMINAL, Jsonb(sorted(referenced_ids(value.get("result")))), task_id)).fetchone()
        else:
            payload = clean_request(request_payload or {})
            canvas_id = value.get("canvas_id") or None
            if canvas_id and not conn.execute("SELECT 1 FROM canvases WHERE id=%s", (canvas_id,)).fetchone():
                canvas_id = None  # Historical/orphan id remains in legacy_metadata.
            row = conn.execute("INSERT INTO tasks(id,canvas_id,kind,status,provider_id,model,upstream_task_id,request,result,legacy_metadata,idempotency_key,request_sha256,created_at,updated_at,input_asset_ids,output_asset_ids) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,to_timestamp(%s),to_timestamp(%s),%s,%s) RETURNING *",
                               (task_id, canvas_id, value.get("type") or "unknown", status, value.get("provider_id"), value.get("model"), value.get("upstream_task_id") or None, Jsonb(payload), Jsonb(value.get("result")), Jsonb(value), task_id, fingerprint(payload), float(value.get("created_at") or now), now, Jsonb(sorted(referenced_ids(payload))), Jsonb(sorted(referenced_ids(value.get("result")))))).fetchone()
        return decode(row)


def recover_expired():
    with connection() as conn:
        from app.storage.finalization import has_source
        candidates = conn.execute("SELECT id FROM tasks WHERE workspace_id='default' AND status IN ('running','submitting') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 100").fetchall()
        for row in candidates:
            if has_source(row["id"]):
                conn.execute("UPDATE tasks SET status='finalizing',error_message=NULL,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", (row["id"],))
        # An upstream id is enough to resume polling. An uncertain paid submission
        # is never automatically sent again, including interrupted image calls.
        conn.execute("UPDATE tasks SET status=CASE WHEN kind='video' AND upstream_task_id IS NOT NULL THEN 'polling' WHEN status='running' AND attempt>0 THEN 'queued' ELSE 'needs_review' END,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),error_message=CASE WHEN upstream_task_id IS NULL AND (status<>'running' OR attempt=0) THEN '提交结果不明确，请核对供应商后处理' ELSE error_message END WHERE workspace_id='default' AND id=ANY(%s) AND status IN ('running','submitting') AND (lease_until IS NULL OR lease_until<now())", ([row['id'] for row in candidates],))


def claim(owner, seconds=90):
    with connection() as conn:
        return conn.execute("WITH candidate AS (SELECT id FROM tasks WHERE workspace_id='default' AND NOT EXISTS (SELECT 1 FROM workspace_documents WHERE workspace_id='default' AND kind='maintenance' AND id='default' AND value->>'mode'='draining') AND kind IN ('video','online-image') AND status IN ('queued','polling','finalizing') AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE tasks t SET status=CASE WHEN t.status='queued' THEN 'running' ELSE t.status END,lease_owner=%s,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>%s),attempt=attempt+1,updated_at=now() FROM candidate c WHERE t.id=c.id RETURNING t.*", (owner, seconds)).fetchone()


def heartbeat(task_id, token, seconds=90):
    with connection() as conn:
        return bool(conn.execute("UPDATE tasks SET lease_until=now()+make_interval(secs=>%s) WHERE id=%s AND lease_token=%s AND lease_until>now() RETURNING id", (seconds, task_id, token)).fetchone())


def release(task_id, token):
    with connection() as conn:
        conn.execute("UPDATE tasks SET lease_owner=NULL,lease_token=NULL,lease_until=NULL,available_at=GREATEST(available_at,now()+interval '5 seconds') WHERE id=%s AND lease_token=%s", (task_id, token))
