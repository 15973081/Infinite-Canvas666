"""Append/merge generation records independently of canvas layout snapshots."""
import copy
import hashlib
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from threading import RLock

from app.config import DATA_DIR

_LOCK = RLock()
_INITIALIZED = set()
MAX_AMOUNT = 9007199254740991


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def db_path():
    return os.path.abspath(os.getenv("CANVAS_LEDGER_DB_PATH") or os.path.join(DATA_DIR, "canvas_ledger.sqlite3"))


@contextmanager
def connection():
    from app.storage.settings import postgres_enabled
    if postgres_enabled():
        from app.storage.ledger import connection as pg_connection
        with pg_connection() as conn:
            yield conn
        return
    path = db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _LOCK:
        conn = sqlite3.connect(path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            if path not in _INITIALIZED or not conn.execute("SELECT 1 FROM sqlite_master WHERE name='ledger_entries'").fetchone():
                conn.execute("PRAGMA journal_mode=WAL")
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS ledger_entries (
                        id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL, created_at INTEGER NOT NULL,
                        log_json TEXT NOT NULL, cost_json TEXT NOT NULL, source TEXT NOT NULL,
                        cost_status TEXT NOT NULL, amount_micros INTEGER NOT NULL DEFAULT 0,
                        currency TEXT NOT NULL, kind TEXT NOT NULL, estimated INTEGER NOT NULL DEFAULT 0,
                        status TEXT NOT NULL, updated_at INTEGER NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS ledger_canvas_time ON ledger_entries(canvas_id, created_at DESC, id DESC);
                    CREATE TABLE IF NOT EXISTS ledger_aliases (
                        canvas_id TEXT NOT NULL, alias TEXT NOT NULL, entry_id TEXT NOT NULL,
                        PRIMARY KEY(canvas_id, alias)
                    );
                    CREATE TABLE IF NOT EXISTS ledger_conflicts (
                        canvas_id TEXT NOT NULL, entry_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                        source TEXT NOT NULL, incoming_json TEXT NOT NULL, reason TEXT NOT NULL,
                        created_at INTEGER NOT NULL, PRIMARY KEY(canvas_id, entry_id, fingerprint)
                    );
                    CREATE TABLE IF NOT EXISTS ledger_imports (
                        canvas_id TEXT NOT NULL, source TEXT NOT NULL, fingerprint TEXT NOT NULL,
                        report_json TEXT NOT NULL, PRIMARY KEY(canvas_id, source)
                    );
                    CREATE TABLE IF NOT EXISTS ledger_versions (
                        canvas_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0
                    );
                """)
                _INITIALIZED.add(path)
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def provider_list():
    from app.providers.registry import load_api_providers
    return load_api_providers()


def identity(log, providers=()):
    request, saved = log.get("request") or {}, log.get("cost") or {}
    kind = log.get("billingKind") or saved.get("kind") or ("video" if log.get("nodeType") == "video" else "image" if log.get("nodeType") in ("generator", "msgen") else "")
    provider = log.get("providerId") or request.get("provider_id") or saved.get("providerId") or ""
    if not provider:
        provider = next((p["id"] for p in providers if log.get("platform") in (p.get("id"), p.get("name"))), "")
    model = log.get("billingModel") or request.get("model") or saved.get("model") or log.get("model") or ""
    return {"kind": kind, "providerId": provider, "model": model}


def _amount(value):
    try:
        number = Decimal(str(value))
        if number.is_finite() and number == number.to_integral_value() and 0 <= number <= MAX_AMOUNT:
            return int(number)
    except (InvalidOperation, ValueError, TypeError):
        pass
    return None


def historical_price(info, at, providers, request=None):
    request = request or {}
    provider = next((p for p in providers if p.get("id") == info["providerId"]), {})
    prices = []
    for price in provider.get("model_prices") or []:
        if price.get("kind") != info["kind"] or price.get("model") != info["model"]:
            continue
        try:
            if float(price.get("effective_from") or 0) > at or (price.get("effective_to") and at >= float(price["effective_to"])):
                continue
        except (ValueError, TypeError):
            continue
        if price.get("resolution") and price["resolution"] != request.get("resolution"):
            continue
        if isinstance(price.get("has_video_input"), bool) and price["has_video_input"] != request.get("has_video_input"):
            continue
        if price.get("service_tier") and price["service_tier"] != request.get("service_tier", "default"):
            continue
        prices.append(price)
    return copy.deepcopy(max(prices, key=lambda p: float(p.get("effective_from") or 0))) if prices else None


def price_log(log, providers=(), frozen_price=None):
    info = identity(log, providers)
    saved = log.get("cost") or {}
    unknown = {**info, "status": "unknown", "reason": "missing_price", "source": "estimated"}
    if log.get("status") == "failed" and saved.get("billing_source") != "volcengine_usage":
        return {**unknown, "status": "excluded", "reason": "failed"}
    if saved.get("status") == "priced":
        if _amount(saved.get("amount_micros")) is None:
            return {**unknown, "reason": "invalid_amount"}
        return {**info, **copy.deepcopy(saved), "amount_micros": _amount(saved["amount_micros"])}
    provider = next((p for p in providers if p.get("id") == info["providerId"]), {})
    # Preserve legacy priced snapshots, but never turn missing Ark usage into guessed seconds.
    if info["kind"] == "video" and (info["providerId"] == "volcengine" or provider.get("protocol") == "volcengine"):
        return {**unknown, **copy.deepcopy(saved), "status": "unknown"}
    price = frozen_price if frozen_price is not None else historical_price(info, log.get("createdAt", 0), providers, log.get("request"))
    if not price:
        return unknown
    billing_type = price.get("billing_type")
    quantity = 1
    if billing_type == "per_image":
        quantity = max(1, len(log.get("outputs") or []))
    elif billing_type == "per_second":
        quantity = log.get("durationSeconds") or (log.get("request") or {}).get("duration") or (log.get("video_info") or {}).get("duration") or 0
    elif billing_type != "per_call":
        return {**unknown, "reason": "missing_usage"}
    try:
        unit = Decimal(str(price["unit_price"]))
        qty = Decimal(str(quantity))
        if not unit.is_finite() or unit < 0 or not qty.is_finite() or qty <= 0:
            return unknown
        micros = int(((unit * 1000000).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * qty).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if _amount(micros) is None:
            return {**unknown, "reason": "invalid_amount"}
    except (InvalidOperation, ValueError, TypeError, KeyError):
        return unknown
    return {**info, "status": "priced", "source": "actual" if frozen_price is not None else "estimated", "currency": price.get("currency") or "CNY",
            "billing_type": billing_type, "quantity": float(qty), "unit_price": str(price["unit_price"]),
            "amount_micros": micros, "price_effective_from": price.get("effective_from", 0)}


def aliases(log, providers=()):
    info = identity(log, providers)
    request = log.get("request") or {}
    result = []
    if log.get("id"):
        result.append("log:" + str(log["id"]))
    local_id = log.get("canvas_task_id") or request.get("canvas_task_id") or request.get("client_task_id")
    if local_id:
        result.append("local-task:" + str(local_id))
    upstream_id = request.get("task_id") or request.get("taskId") or (log.get("video_info") or {}).get("task_id")
    if upstream_id and info["providerId"]:
        result.append("upstream:" + info["providerId"] + ":" + str(upstream_id))
    if not result:
        stable = {key: log.get(key) for key in ("createdAt", "created_at", "platform", "model", "providerId", "billingModel", "prompt", "outputs")}
        result.append("fingerprint:" + digest(stable))
    return sorted(set(result))


def _cost_columns(cost):
    return (cost.get("status", "unknown"), _amount(cost.get("amount_micros")) or 0,
            cost.get("currency") or "CNY", cost.get("kind") or "", int(cost.get("source") == "estimated"))


def revision(conn, canvas_id):
    row = conn.execute("SELECT revision FROM ledger_versions WHERE canvas_id=?", (canvas_id,)).fetchone()
    return row[0] if row else 0


def _bump(conn, canvas_id):
    conn.execute("INSERT INTO ledger_versions VALUES(?,1) ON CONFLICT(canvas_id) DO UPDATE SET revision=revision+1", (canvas_id,))


def ingest(conn, canvas_id, candidates, providers):
    report = {"scanned": 0, "added": 0, "updated": 0, "duplicate": 0, "conflicts": 0, "invalid": 0, "issues": []}
    for original, source in candidates:
        report["scanned"] += 1
        try:
            if not isinstance(original, dict):
                raise ValueError("日志不是对象")
            log = copy.deepcopy(original)
            log.pop("_ledger", None)
            log.pop("_ledger_cost", None)
            at = int(log.get("createdAt") or log.get("created_at") or 0)
            if at <= 0 or at > 8640000000000000:
                raise ValueError("日志缺少有效时间")
            log["createdAt"] = at
            keys = aliases(log, providers)
            incoming = _json(log)
            cost = price_log(log, providers)
        except (ValueError, TypeError, OverflowError, AttributeError) as exc:
            report["invalid"] += 1
            if len(report["issues"]) < 20:
                report["issues"].append({"source": source, "reason": str(exc)})
            continue
        matched = conn.execute("SELECT DISTINCT entry_id FROM ledger_aliases WHERE canvas_id=? AND alias IN (%s)" % ",".join("?" for _ in keys), (canvas_id, *keys)).fetchall()
        ids = [row[0] for row in matched]
        if len(ids) > 1:
            report["conflicts"] += 1
            if len(report["issues"]) < 20:
                report["issues"].append({"id": log.get("id"), "source": source, "reason": "任务标识关联到多条已有流水，未自动合并"})
            continue
        now = int(time.time() * 1000)
        if not ids:
            entry_id = uuid.uuid4().hex
            conn.execute("INSERT INTO ledger_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (entry_id, canvas_id, at, incoming, _json(cost), source, *_cost_columns(cost), log.get("status") or "success", now))
            report["added"] += 1
            _bump(conn, canvas_id)
        else:
            entry_id = ids[0]
            old = conn.execute("SELECT * FROM ledger_entries WHERE id=?", (entry_id,)).fetchone()
            old_log, old_cost = json.loads(old["log_json"]), json.loads(old["cost_json"])
            if old_cost.get("status") == "priced" and cost.get("status") == "priced" and (
                old_cost.get("amount_micros") != cost.get("amount_micros") or (old_cost.get("currency") or "CNY") != (cost.get("currency") or "CNY")
            ):
                fingerprint = digest(cost)
                change = conn.execute("INSERT OR IGNORE INTO ledger_conflicts VALUES(?,?,?,?,?,?,?)",
                                      (canvas_id, entry_id, fingerprint, source, incoming, "费用快照不一致，保留已有金额", now))
                if change.rowcount:
                    _bump(conn, canvas_id)
                report["conflicts"] += 1
                if len(report["issues"]) < 20:
                    report["issues"].append({"id": log.get("id"), "source": source, "reason": "费用快照不一致，保留已有金额",
                                             "existing_amount": old_cost.get("amount_micros"), "incoming_amount": cost.get("amount_micros")})
            merged = copy.deepcopy(old_log)
            for key, value in log.items():
                if key not in merged or merged[key] in (None, "", [], {}):
                    merged[key] = value
            # A successful manual result query may recover an earlier failed delivery.
            if log.get("status") == "success" and log.get("outputs") and old_log.get("status") == "failed":
                merged["status"] = "success"
                merged["error"] = ""
            # A backend completion can fill media/delivery state after usage was already saved.
            if source == "task" and log.get("status") in ("success", "failed") and (
                float(log.get("_task_updated_at") or 0) > float(old_log.get("_task_updated_at") or 0)
            ):
                merged["status"] = log["status"]
                merged["error"] = log.get("error", "")
                merged["_task_updated_at"] = log["_task_updated_at"]
            chosen_cost = old_cost
            if old_cost.get("status") != "priced" and cost.get("status") == "priced":
                chosen_cost = cost
                if log.get("cost"):
                    merged["cost"] = log["cost"]
            if _json(merged) != old["log_json"] or _json(chosen_cost) != old["cost_json"]:
                conn.execute("UPDATE ledger_entries SET log_json=?,cost_json=?,cost_status=?,amount_micros=?,currency=?,kind=?,estimated=?,status=?,updated_at=? WHERE id=?",
                             (_json(merged), _json(chosen_cost), *_cost_columns(chosen_cost), merged.get("status") or "success", now, entry_id))
                report["updated"] += 1
                _bump(conn, canvas_id)
            else:
                report["duplicate"] += 1
        for alias in keys:
            change = conn.execute("INSERT OR IGNORE INTO ledger_aliases VALUES(?,?,?)", (canvas_id, alias, entry_id))
            if ids and change.rowcount:
                _bump(conn, canvas_id)
    return report


def append_logs(canvas_id, logs, source="client", providers=None):
    if not canvas_id or not logs:
        return {}
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        return ingest(conn, canvas_id, [(log, source) for log in logs], providers if providers is not None else provider_list())


def import_canvas_logs(canvas_id, logs):
    if not canvas_id or not logs:
        return
    fingerprint = digest(logs)
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        previous = conn.execute("SELECT fingerprint FROM ledger_imports WHERE canvas_id=? AND source='canvas'", (canvas_id,)).fetchone()
        if previous and previous[0] == fingerprint:
            return
        report = ingest(conn, canvas_id, [(log, "canvas") for log in logs], provider_list())
        conn.execute("INSERT OR REPLACE INTO ledger_imports VALUES(?,?,?,?)", (canvas_id, "canvas", fingerprint, _json(report)))


def _query_scope(canvas_id, from_ms=0, to_ms=0):
    sql, params = "canvas_id=?", [canvas_id]
    if from_ms:
        sql += " AND created_at>=?"
        params.append(from_ms)
    if to_ms:
        sql += " AND created_at<?"
        params.append(to_ms)
    return sql, params


def _totals(conn, canvas_id, from_ms=0, to_ms=0):
    scope, params = _query_scope(canvas_id, from_ms, to_ms)
    result = dict(total=0, image=0, video=0, estimated=0, unknown=0, calls=0, failed=0, records=0, other_currencies={})
    for row in conn.execute(f"SELECT cost_status, currency, kind, estimated, status, amount_micros FROM ledger_entries WHERE {scope}", params):
        result["records"] += 1
        result["failed"] += int(row["status"] == "failed")
        if row["cost_status"] != "priced":
            result["unknown"] += int(row["cost_status"] == "unknown")
            continue
        if row["currency"] != "CNY":
            result["other_currencies"][row["currency"]] = result["other_currencies"].get(row["currency"], 0) + row["amount_micros"]
            continue
        result["total"] += row["amount_micros"]
        result["calls"] += 1
        if row["kind"] in ("image", "video"):
            result[row["kind"]] += row["amount_micros"]
        if row["estimated"]:
            result["estimated"] += row["amount_micros"]
    if result["total"] > MAX_AMOUNT or any(value > MAX_AMOUNT for value in result["other_currencies"].values()):
        raise ValueError("金额超过前端精确显示范围")
    return result


def read_page(canvas_id, page=1, page_size=50, from_ms=0, to_ms=0, expected_revision=None):
    with connection() as conn:
        conn.execute("BEGIN")
        version = revision(conn, canvas_id)
        if expected_revision is not None and expected_revision != version:
            raise ValueError("流水已更新，请重新读取")
        totals = _totals(conn, canvas_id, from_ms, to_ms)
        scope, params = _query_scope(canvas_id, from_ms, to_ms)
        pages = max(1, (totals["records"] + page_size - 1) // page_size)
        page = min(max(1, page), pages)
        rows = conn.execute(f"SELECT * FROM ledger_entries WHERE {scope} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", (*params, page_size, (page - 1) * page_size)).fetchall()
        logs = []
        for row in rows:
            log = json.loads(row["log_json"])
            log["_ledger"] = {"id": row["id"], "source": row["source"]}
            log["_ledger_cost"] = json.loads(row["cost_json"])
            logs.append(log)
        return {"canvas_id": canvas_id, "logs": logs, "totals": totals, "page": page, "pages": pages,
                "page_size": page_size, "revision": version}


def task_log(task):
    result = task.get("result") or {}
    if task.get("status") not in ("succeeded", "failed") and task.get("upstream_status") != "succeeded":
        return None
    request = task.get("billing_request") or {}
    kind = "video" if task.get("type") == "video" else "image"
    log = {"id": "task-log:" + str(task["id"]), "canvas_task_id": task["id"],
           "createdAt": int(float(task.get("created_at") or 0) * 1000),
           "_task_updated_at": task.get("updated_at") or task.get("created_at") or 0,
           "status": "failed" if task.get("status") == "failed" else "success",
           "nodeType": "video" if kind == "video" else "generator", "billingKind": kind,
           "providerId": task.get("provider_id", ""), "platform": task.get("provider_name") or task.get("provider_id", ""),
           "billingModel": task.get("model", ""), "model": task.get("model", ""),
           "request": {**request, "canvas_task_id": task["id"], "task_id": result.get("task_id") or task.get("upstream_task_id") or ""},
           "prompt": request.get("prompt", ""), "outputs": result.get("videos") or result.get("images") or [],
           "error": task.get("error", ""), "durationSeconds": (result.get("video_info") or {}).get("duration") or request.get("duration") or 0}
    for key in ("cost", "usage", "video_info"):
        if key in result:
            log[key] = copy.deepcopy(result[key])
    if "cost" not in log:
        # Empty snapshot means unpriced at submission; do not silently use a later price.
        log["cost"] = price_log(log, (), frozen_price=task.get("billing_price") or {})
    return log


def record_task(task):
    if task.get("canvas_id"):
        log = task_log(task)
        if log:
            append_logs(task["canvas_id"], [log], "task", providers=[])


def task_billing_fields(payload, kind):
    data = payload.model_dump(mode="json") if hasattr(payload, "model_dump") else payload.dict()
    info = {"providerId": data.get("provider_id", ""), "kind": kind, "model": data.get("model", "")}
    request = {key: data[key] for key in ("prompt", "provider_id", "model", "duration", "resolution", "size", "quality", "n") if key in data}
    request["has_video_input"] = bool(data.get("videos"))
    return {"canvas_id": data.get("canvas_id", ""), "billing_request": request,
            "billing_price": historical_price(info, int(time.time() * 1000), provider_list(), request)}


def sync_canvas_tasks(canvas_id):
    from app.services.canvas_tasks import list_canvas_tasks
    logs = [log for task in list_canvas_tasks(canvas_id=canvas_id) if (log := task_log(task))]
    if not logs:
        return
    fingerprint = digest(logs)
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        previous = conn.execute("SELECT fingerprint FROM ledger_imports WHERE canvas_id=? AND source='tasks'", (canvas_id,)).fetchone()
        if previous and previous[0] == fingerprint:
            return
        report = ingest(conn, canvas_id, [(log, "task") for log in logs], [])
        conn.execute("INSERT OR REPLACE INTO ledger_imports VALUES(?,?,?,?)", (canvas_id, "tasks", fingerprint, _json(report)))
