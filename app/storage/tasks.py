"""Durable tasks with idempotent creation and fenced worker leases."""
import copy
import hashlib
import json
import time
import re
from contextvars import ContextVar
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace, workspace_scope

lease_context = ContextVar("cloud_task_lease", default=None)
ACTIVE = ("queued", "running", "submitting", "polling", "finalizing")
TERMINAL = ("succeeded", "failed", "cancelled", "needs_review")


def clean_request(value):
    if isinstance(value, dict):
        return {k: clean_request(v) for k, v in value.items()
                if re.sub(r"[^a-z0-9]", "", k.lower()) not in {
                    "apikey", "secretkey", "accesskey", "accesskeyid", "authorization", "password",
                    "accesstoken", "refreshtoken", "securitytoken", "sessiontoken", "xapikey", "xgoogapikey",
                    "cookie", "setcookie", "tosaccesskey", "tossecretkey", "volcengineaccesskey", "volcenginesecretkey"}}
    if isinstance(value, list):
        return [clean_request(v) for v in value]
    return value


def fingerprint(request, *, historical=False):
    from app.storage.task_requests import normalize
    public = {k: v for k, v in request.items() if k != '_canvas_binding'} if isinstance(request, dict) else request
    # Historical records are archived evidence, not newly authorized submissions.
    value = clean_request(public) if historical else normalize(clean_request(public))
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def decode(row):
    if not row:
        return {}
    task = copy.deepcopy(row["legacy_metadata"])
    task.update(id=row["id"], type=row["kind"], status=row["status"], result=row["result"],
                created_at=row["created_at"].timestamp(), updated_at=row["updated_at"].timestamp())
    task["provider_account_ref"] = row["provider_account_ref"]
    task["workspace_id"] = row["workspace_id"]
    task["requested_by"] = row.get("requested_by")
    task["canvas_revision"] = row.get("canvas_revision")
    task["canvas_edit_generation"] = row.get("canvas_edit_generation")
    from app.storage.task_canvas_bindings import stored
    task["canvas_binding"] = stored(row.get("request"))
    if row["provider_id"]:
        task["provider_id"] = row["provider_id"]
    if row["upstream_task_id"]:
        task["upstream_task_id"] = row["upstream_task_id"]
    if row["error_message"]:
        task["error"] = row["error_message"]
    return task


def get(task_id):
    with connection() as conn:
        return decode(conn.execute("SELECT * FROM tasks WHERE workspace_id=%s AND id=%s", (current_workspace(), task_id)).fetchone())


def request(task_id):
    with connection() as conn:
        row = conn.execute("SELECT request FROM tasks WHERE workspace_id=%s AND id=%s", (current_workspace(), task_id)).fetchone()
        return row["request"] if row else {}


def list_tasks(statuses=None, task_type="", canvas_id=""):
    clauses, args = ["workspace_id=%s"], [current_workspace()]
    for key, value in (("status", list(statuses or [])), ("kind", task_type), ("canvas_id", canvas_id)):
        if value:
            clauses.append(key + ("=ANY(%s)" if key == "status" else "=%s"))
            args.append(value)
    with connection() as conn:
        return [decode(r) for r in conn.execute("SELECT * FROM tasks WHERE " + " AND ".join(clauses) + " ORDER BY created_at,id", args)]


def save(task, request_payload=None, *, historical=False):
    from app.storage.media import referenced_ids
    from app.storage.task_requests import normalize, asset_ids, lock_ready, account_ref
    value = clean_request(copy.deepcopy(task))
    task_id = value.get("id")
    if not task_id:
        raise ValueError("Task id is required")
    workspace = current_workspace()
    if value.get("workspace_id", workspace) != workspace:
        raise HTTPException(409, "任务不属于当前空间")
    value["workspace_id"] = workspace
    from app.services.member_context import current_access
    access = current_access.get()
    requester = access.principal.member_id if access and not historical else None
    with connection() as conn:
        canvas_admission = None
        if value.get('canvas_id') and access and not historical:
            from app.services.canvas_leases import request_write
            canvas_admission = request_write(conn, value['canvas_id'], operation='write')
        # The lock also serializes two initial requests with the same id.
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (task_id,))
        old = conn.execute("SELECT * FROM tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone()
        if old and old["workspace_id"] != workspace:
            raise HTTPException(409, "任务 ID 不可用于当前空间")
        if old:
            if request_payload is not None:
                if fingerprint(old["request"], historical=historical) != fingerprint(request_payload, historical=historical):
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
            if status == "succeeded":
                lock_ready(conn, asset_ids(value.get("result")))
            row = conn.execute("UPDATE tasks SET status=%s,legacy_metadata=%s,result=%s,upstream_task_id=%s,error_message=%s,updated_at=to_timestamp(%s),completed_at=CASE WHEN %s THEN now() ELSE NULL END,output_asset_ids=%s WHERE id=%s RETURNING *",
                               (status, Jsonb(value), Jsonb(value.get("result")), value.get("upstream_task_id") or None, value.get("error") or None, now, status in TERMINAL, Jsonb(sorted(referenced_ids(value.get("result")))), task_id)).fetchone()
        else:
            if not historical:
                from app.services.maintenance_control import ensure
                ensure(conn, workspace, 'write')
            payload = clean_request(request_payload or {}) if historical else normalize(clean_request(request_payload or {}), strict=True)
            if not historical and "_canvas_binding" in payload:
                raise HTTPException(400, {"code": "task_binding_server_field"})
            if not historical and payload.get("canvas_target"):
                if not canvas_admission:
                    raise HTTPException(428, {"code": "task_binding_edit_proof_required"})
                if payload.get("canvas_id") != canvas_admission[0]["id"]:
                    raise HTTPException(409, {"code": "task_binding_canvas_mismatch"})
                from app.storage.task_canvas_bindings import capture
                payload["_canvas_binding"] = capture(canvas_admission[0], payload["canvas_target"], fingerprint(payload))
            inputs = asset_ids(payload)
            if not historical:
                lock_ready(conn, inputs)
            provider_id = payload.get("provider_id") or value.get("provider_id")
            provider_account = None if historical else account_ref(provider_id)
            if not historical and provider_id:
                from app.providers.registry import managed_providers_enabled, get_api_provider_exact
                if managed_providers_enabled():
                    from app.services.model_commercial import enforce
                    from app.services.canvas_ledger import historical_price
                    from app.services.volcengine_billing import pricing_context
                    provider = get_api_provider_exact(provider_id)
                    kind = "image" if value.get("type") == "online-image" else "chat" if value.get("type") == "llm" else "video"
                    enforce(provider, kind, payload)
                    at = int(time.time() * 1000)
                    now = at / 1000
                    value["created_at"] = value["updated_at"] = now
                    value["billing_price"] = historical_price({"providerId":provider_id,"kind":kind,"model":payload.get("model", "")}, at, [provider], payload)
                    value["billing_basis_at"] = at
                    if kind == "video": value["video_pricing"] = pricing_context(provider, at)
            canvas_id = value.get("canvas_id") or None
            if canvas_id and not conn.execute("SELECT 1 FROM canvases WHERE workspace_id=%s AND id=%s", (workspace, canvas_id)).fetchone():
                if conn.execute("SELECT 1 FROM canvases WHERE id=%s", (canvas_id,)).fetchone():
                    raise HTTPException(404, "画布不存在")
                canvas_id = None  # Historical/orphan id remains in legacy_metadata.
            row = conn.execute("INSERT INTO tasks(workspace_id,id,canvas_id,kind,status,provider_id,provider_account_ref,model,upstream_task_id,request,result,legacy_metadata,idempotency_key,request_sha256,created_at,updated_at,input_asset_ids,output_asset_ids) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,to_timestamp(%s),to_timestamp(%s),%s,%s) RETURNING *",
                               (workspace, task_id, canvas_id, value.get("type") or "unknown", status, provider_id, provider_account, value.get("model") or payload.get("model"), value.get("upstream_task_id") or None, Jsonb(payload), Jsonb(value.get("result")), Jsonb(value), task_id, fingerprint(payload, historical=historical), float(value.get("created_at") or now), now, Jsonb(inputs), Jsonb(sorted(referenced_ids(value.get("result")))))).fetchone()
            if requester:
                row = conn.execute("UPDATE tasks SET requested_by=%s,requester_snapshot=(SELECT jsonb_build_object('username',username,'display_name',display_name) FROM members WHERE id=%s) WHERE workspace_id=%s AND id=%s RETURNING *", (requester, requester, workspace, task_id)).fetchone()
            if canvas_admission:
                canvas, edit_lease = canvas_admission
                row = conn.execute('UPDATE tasks SET canvas_revision=%s,canvas_edit_generation=%s WHERE workspace_id=%s AND id=%s RETURNING *',
                                   (canvas['revision'], edit_lease['generation'], workspace, task_id)).fetchone()
        return decode(row)


def recover_expired(*, all_workspaces=False):
    with connection() as conn:
        from app.storage.finalization import has_source
        scope = "" if all_workspaces else "workspace_id=%s AND "
        args = () if all_workspaces else (current_workspace(),)
        candidates = conn.execute("SELECT * FROM tasks WHERE " + scope + "status IN ('running','submitting') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 100", args).fetchall()
        for row in candidates:
            with workspace_scope(row["workspace_id"]):
                if has_source(row["id"]):
                    conn.execute("UPDATE tasks SET status='finalizing',error_message=NULL,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", (row["id"],))
                else:
                    from app.storage.image_receipts import recoverable
                    if row["kind"] == "online-image" and recoverable(row):
                        conn.execute("UPDATE tasks SET status='polling',error_message=NULL,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", (row["id"],))
        # An upstream id is enough to resume polling. An uncertain paid submission
        # is never automatically sent again, including interrupted image calls.
        conn.execute("UPDATE tasks SET status=CASE WHEN kind='video' AND upstream_task_id IS NOT NULL THEN 'polling' WHEN status='running' AND attempt>0 THEN 'queued' ELSE 'needs_review' END,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now(),error_message=CASE WHEN upstream_task_id IS NULL AND (status<>'running' OR attempt=0) THEN '提交结果不明确，请核对供应商后处理' ELSE error_message END WHERE id=ANY(%s) AND status IN ('running','submitting') AND (lease_until IS NULL OR lease_until<now())", ([row['id'] for row in candidates],))


def claim(owner, seconds=90, *, all_workspaces=False):
    from app.storage.settings import member_auth_enabled
    legacy = "" if member_auth_enabled() else " AND NOT EXISTS (SELECT 1 FROM workspace_documents d WHERE d.workspace_id=q.workspace_id AND d.kind='maintenance' AND d.id='default' AND d.value->>'mode'='draining')"
    with connection() as conn:
        scope = "" if all_workspaces else "q.workspace_id=%s AND "
        args = () if all_workspaces else (current_workspace(),)
        return conn.execute("WITH candidate AS (SELECT q.id FROM tasks q JOIN workspaces w ON w.id=q.workspace_id WHERE " + scope + "(q.status IN ('polling','finalizing') OR (w.status='active' AND NOT EXISTS (SELECT 1 FROM maintenance_controls m WHERE (m.workspace_id IS NULL OR m.workspace_id=q.workspace_id) AND (m.mode IN ('draining','read_only','offline','recovering') OR (m.mode='scheduled' AND m.planned_at<=clock_timestamp())))" + legacy + ")) AND q.kind IN ('video','online-image','llm') AND q.status IN ('queued','polling','finalizing') AND q.available_at<=now() AND (q.lease_until IS NULL OR q.lease_until<now()) ORDER BY q.available_at,q.created_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1) UPDATE tasks t SET status=CASE WHEN t.status='queued' THEN 'running' ELSE t.status END,lease_owner=%s,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>%s),attempt=attempt+1,updated_at=now() FROM candidate c WHERE t.id=c.id RETURNING t.*", (*args, owner, seconds)).fetchone()


def heartbeat(task_id, token, seconds=90):
    with connection() as conn:
        return bool(conn.execute("UPDATE tasks SET lease_until=now()+make_interval(secs=>%s) WHERE workspace_id=%s AND id=%s AND lease_token=%s AND lease_until>now() RETURNING id", (seconds, current_workspace(), task_id, token)).fetchone())


def release(task_id, token):
    with connection() as conn:
        conn.execute("UPDATE tasks SET lease_owner=NULL,lease_token=NULL,lease_until=NULL,available_at=GREATEST(available_at,now()+interval '5 seconds') WHERE workspace_id=%s AND id=%s AND lease_token=%s", (current_workspace(), task_id, token))
