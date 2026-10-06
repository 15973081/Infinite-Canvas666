"""Shared-workspace authentication; opaque, revocable server-side sessions."""
import base64
import hashlib
import hmac
import ipaddress
import os
from pathlib import Path
import secrets
import sqlite3
import time
from contextlib import contextmanager
from http.cookies import SimpleCookie
from urllib.parse import quote, urlsplit, parse_qs

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse, RedirectResponse
from app.storage.settings import postgres_enabled, member_auth_enabled
from app.services.static_pages import static_html_response

router = APIRouter()
COOKIE = "canvas_session"
PUBLIC = {'/static/js/infinity-hero.js', '/static/vendor/js/three-0.160.0.module.js', "/login", "/static/login.html", "/static/css/login.css",
          "/static/js/login.js", "/static/js/frontend-version.js",
          "/api/frontend/version", "/api/auth/status", "/api/auth/login",
          "/api/auth/setup"}


@contextmanager
def database():
    path = Path(os.getenv("AUTH_DB_PATH", str(Path(__file__).resolve().parents[2] / ".local" / "auth.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    try:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS account (
                id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL,
                salt TEXT NOT NULL, digest TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY, username TEXT NOT NULL,
                revision TEXT NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts (
                source TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
        """)
        with db:
            yield db
    finally:
        db.close()


def account():
    password = os.getenv("CLOUD_ACCESS_PASSWORD", "")
    if password:
        username = os.getenv("CLOUD_ACCESS_USER", "canvas")
        return username, "", password
    if postgres_enabled():
        return None  # Cloud deployments must explicitly configure credentials.
    with database() as db:
        return db.execute("SELECT username, salt, digest FROM account WHERE id=1").fetchone()


def revision(info):
    return hashlib.sha256("\0".join(info).encode()).hexdigest()


def password_digest(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def valid_credentials(username, password, info):
    if not info:
        return False
    expected_user, salt, expected = info
    candidate = password_digest(password, salt) if salt else password
    return hmac.compare_digest(username.encode(), expected_user.encode()) & hmac.compare_digest(candidate.encode(), expected.encode())


def token_from_scope(scope):
    cookie = SimpleCookie()
    try:
        cookie.load(dict(scope.get("headers", [])).get(b"cookie", b"").decode("latin-1"))
        return cookie[COOKIE].value if COOKIE in cookie else ""
    except Exception:
        return ""


def session_user(scope):
    if member_auth_enabled():
        from app.services.member_gateway import principal
        actor = principal(scope)
        return actor.member_id if actor else None
    token = token_from_scope(scope)
    if not token or len(token) > 128:
        return None
    info = account()
    if not info:
        return None
    with database() as db:
        row = db.execute("SELECT username FROM sessions WHERE token=? AND revision=? AND expires>?",
                         (hashlib.sha256(token.encode()).hexdigest(), revision(info), time.time())).fetchone()
    return row[0] if row else None


def basic_user(scope):
    # Preserve the existing cloud CLI contract, without browser Basic challenges.
    if member_auth_enabled() or not postgres_enabled():
        return None
    info = account()
    if not info:
        return None
    value = dict(scope.get("headers", [])).get(b"authorization", b"")
    expected = b"Basic " + base64.b64encode((info[0] + ":" + info[2]).encode())
    return info[0] if hmac.compare_digest(value, expected) else None


def origin_allowed(scope):
    headers = dict(scope.get("headers", []))
    if headers.get(b"sec-fetch-site") == b"cross-site":
        return False
    origin = headers.get(b"origin", b"").decode("latin-1")
    if not origin:
        return True  # Non-browser clients; JSON-only auth endpoints prevent form CSRF.
    public = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
    host = headers.get(b"host", b"").decode("latin-1")
    expected = public or scope.get("scheme", "http").replace("ws", "http") + "://" + host
    return origin == expected


def can_setup(scope):
    if postgres_enabled() or account():
        return False
    host = dict(scope.get("headers", [])).get(b"host", b"").decode("latin-1")
    try:
        local_host = urlsplit("http://" + host).hostname
        peer = (scope.get("client") or ("", 0))[0]
        return local_host in {"localhost", "127.0.0.1", "::1"} and ipaddress.ip_address(peer).is_loopback
    except ValueError:
        return False


def issue_session(request, info, remember):
    token = secrets.token_urlsafe(32)
    ttl = (30 * 86400) if remember else (12 * 3600)
    with database() as db:
        db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                   (hashlib.sha256(token.encode()).hexdigest(), info[0], revision(info), time.time() + ttl))
    response = JSONResponse({"username": info[0]})
    response.set_cookie(COOKIE, token, max_age=ttl if remember else None, httponly=True,
                        secure=request.url.scheme == "https" or os.getenv("PUBLIC_BASE_URL", "").startswith("https://"),
                        samesite="strict", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False


@router.get("/login")
def login_page():
    return static_html_response("login.html")


@router.get("/api/auth/status")
def auth_status(request: Request):
    if member_auth_enabled():
        from app.services import members
        from app.services.member_gateway import principal
        actor = principal(request.scope)
        info = None
        if actor:
            from app.services import authorization as az
            with az.policy_transaction() as conn:
                info = members.profile(az.active_member(conn, actor))
        return JSONResponse({"authenticated": bool(actor), "mode": "members", "member": info,
                             "username": info["username"] if info else None,
                             "setup_required": False, "can_setup": False}, headers={"Cache-Control": "no-store"})
    user = session_user(request.scope)
    return JSONResponse({"authenticated": bool(user), "username": user,
                         "setup_required": account() is None,
                         "can_setup": can_setup(request.scope)},
                        headers={"Cache-Control": "no-store"})


@router.post("/api/auth/setup")
def setup(request: Request, data: LoginInput):
    if not can_setup(request.scope):
        raise HTTPException(403, "请在服务器本机打开 localhost 完成初始化，或由管理员配置访问账号。")
    username = data.username.strip()
    if not username or len(data.password) < 12:
        raise HTTPException(400, "请填写账号，并设置至少 12 位密码。")
    salt = secrets.token_hex(16)
    digest = password_digest(data.password, salt)
    try:
        with database() as db:
            db.execute("INSERT INTO account VALUES (1, ?, ?, ?)", (username, salt, digest))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "访问账号已创建，请直接登录。")
    return issue_session(request, (username, salt, digest), data.remember)


@router.post("/api/auth/login")
def login(request: Request, data: LoginInput):
    if member_auth_enabled():
        from app.services import members
        from app.services.member_gateway import COOKIE as member_cookie
        result = members.login(data.username, data.password, audience="workbench",
                               source=request.client.host if request.client else "unknown", remember=data.remember)
        response = JSONResponse({"member": result["member"], "username": result["member"]["username"]}, headers={"Cache-Control": "no-store"})
        response.set_cookie(member_cookie, result["token"], max_age=result["ttl"] if data.remember else None,
                            httponly=True, secure=request.url.scheme == "https" or os.getenv("PUBLIC_BASE_URL", "").startswith("https://"),
                            samesite="strict", path="/")
        response.delete_cookie(COOKIE, path="/")
        return response
    source = (request.client.host if request.client else "unknown")
    now = time.time()
    with database() as db:
        db.execute("DELETE FROM attempts WHERE expires<=?", (now,))
        db.execute("INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(source) DO UPDATE SET count=count+1",
                   (source, now + 300))
        count = db.execute("SELECT count FROM attempts WHERE source=?", (source,)).fetchone()[0]
    if count > 10:
        raise HTTPException(429, "尝试次数过多，请 5 分钟后重试。", headers={"Retry-After": "300"})
    info = account()
    if not valid_credentials(data.username.strip(), data.password, info):
        raise HTTPException(401, "账号或密码不正确，请重试。")
    with database() as db:
        db.execute("DELETE FROM attempts WHERE source=?", (source,))
    return issue_session(request, info, data.remember)


@router.post("/api/auth/logout")
def logout(request: Request):
    if member_auth_enabled():
        from app.services import members
        from app.services.member_gateway import COOKIE as member_cookie, principal
        actor = principal(request.scope)
        if actor:
            members.logout(actor)
        response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
        response.delete_cookie(member_cookie, path="/")
        return response
    token = token_from_scope(request.scope)
    with database() as db:
        db.execute("DELETE FROM sessions WHERE token=?", (hashlib.sha256(token.encode()).hexdigest(),))
    response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    response.delete_cookie(COOKIE, path="/")
    return response


class AuthenticationMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        import re
        signed = postgres_enabled() and scope["type"] == "http" and scope.get("method") in {"GET", "HEAD"} and bool(re.fullmatch(r"/api/media/ast_[a-f0-9]{32}/signed", path))
        signed = signed or (postgres_enabled() and scope["type"] == "http" and scope.get("method") == "PUT"
                            and bool(re.fullmatch(r"/api/media/uploads/ast_[a-f0-9]{32}/parts/[0-9]+/content", path)))
        browser_bound = "member" in parse_qs(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
        if member_auth_enabled() and (not signed or browser_bound):
            from app.services.member_gateway import dispatch
            return await dispatch(self.app, scope, receive, send)
        if not signed:
            if (scope["type"] == "websocket" or scope.get("method") not in {"GET", "HEAD", "OPTIONS"}) and not origin_allowed(scope):
                if scope["type"] == "websocket":
                    return await send({"type": "websocket.close", "code": 1008})
                return await JSONResponse({"detail": "请求来源不匹配，请刷新页面后重试。"}, 403)(scope, receive, send)
            if path not in PUBLIC:
                user = session_user(scope) or basic_user(scope)
                if not user:
                    if scope["type"] == "websocket":
                        return await send({"type": "websocket.close", "code": 1008})
                    headers = dict(scope.get("headers", []))
                    if scope.get("method") == "GET" and ("text/html" in headers.get(b"accept", b"").decode() or path == "/" or path.endswith(".html")):
                        target = path + (("?" + scope["query_string"].decode("latin-1")) if scope.get("query_string") else "")
                        response = RedirectResponse("/login?next=" + quote(target, safe=""), status_code=303)
                    else:
                        response = JSONResponse({"detail": "登录已过期，请重新登录。", "code": "authentication_required"}, 401)
                    response.headers["Cache-Control"] = "no-store"
                    return await response(scope, receive, send)
                scope["auth_user"] = user
        await self.app(scope, receive, send)


class ActivationInput(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=12, max_length=256)


class ProfileInput(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    avatar: str = ""


@router.post("/api/auth/activate")
def activate_member(data: ActivationInput):
    if not member_auth_enabled():
        raise HTTPException(404)
    from app.services.members import activate
    return {"member": activate(data.token, data.password)}


@router.get("/api/auth/workspaces")
def member_workspaces(request: Request):
    if not member_auth_enabled():
        raise HTTPException(404)
    from app.services.members import list_workspaces
    return {"workspaces": list_workspaces(request.scope.get("member_principal"))}


@router.patch("/api/auth/profile")
def member_profile(request: Request, data: ProfileInput):
    if not member_auth_enabled():
        raise HTTPException(404)
    from app.services.members import update_profile
    return {"member": update_profile(request.scope.get("member_principal"), data.display_name, data.avatar)}


@router.get("/api/workspace/storage")
def workspace_storage():
    if not member_auth_enabled():
        raise HTTPException(404)
    from app.services.workspace_storage import usage
    return JSONResponse(usage(), headers={"Cache-Control": "no-store"})


@router.get("/api/management-entry")
def management_entry():
    from app.services.management_entry import management_url
    return JSONResponse({"url": management_url()}, headers={"Cache-Control": "no-store"})
