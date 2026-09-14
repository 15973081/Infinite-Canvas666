"""Standalone management ASGI application; deliberately never imports main."""
import asyncio
import os
from contextlib import asynccontextmanager
from http.cookies import SimpleCookie
from pathlib import Path
from datetime import datetime
from typing import Literal
from uuid import UUID
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from psycopg import OperationalError
from psycopg_pool import PoolTimeout

from app.services import authorization as az, members
from app.management import queries
from app.storage import database
from app.storage.settings import load_storage_env, postgres_enabled

COOKIE = 'canvas_management_session'
ROOT = Path(__file__).resolve().parents[2]


def management_origin():
    value = os.getenv('MANAGEMENT_BASE_URL', '').rstrip('/')
    url = urlsplit(value)
    if (url.scheme not in {'https', 'http'} or not url.netloc or url.path or url.query or url.fragment
            or url.username or url.password or (url.scheme == 'http' and url.hostname not in {'localhost', '127.0.0.1', '::1'})):
        raise ValueError('MANAGEMENT_BASE_URL must be an HTTPS origin or a local loopback HTTP origin')
    return value


def actor(request: Request):
    return request.scope['management_principal']


def session(scope):
    cookie = SimpleCookie()
    try:
        cookie.load(dict(scope.get('headers', [])).get(b'cookie', b'').decode('latin-1'))
        token = cookie[COOKIE].value if COOKIE in cookie else ''
    except Exception:
        token = ''
    return members.resolve_session(token, 'management')


class Admission:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path = scope['path']

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message.get('headers', [])) + [
                    (b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff'),
                    (b'referrer-policy', b'no-referrer'), (b'x-frame-options', b'DENY'),
                    (b'content-security-policy', b"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")]
            await send(message)

        try:
            # Cookies are host-only; origin checks additionally separate two
            # local ports and sibling subdomains. Unsafe requests need Origin.
            origin = management_origin()
            headers = dict(scope.get('headers', []))
            if scope['method'] not in {'GET', 'HEAD', 'OPTIONS'} and headers.get(b'origin', b'').decode('latin-1') != origin:
                az.fail('origin_forbidden')
            if path.startswith('/api/') and path != '/api/auth/login':
                principal = await asyncio.to_thread(session, scope)
                if not principal:
                    az.fail('authentication_required', 401)
                # Logout remains possible after management grants are revoked.
                if path != '/api/auth/logout':
                    await asyncio.to_thread(queries.snapshot, principal)
                scope['management_principal'] = principal
            await self.app(scope, receive, secure_send)
        except HTTPException as exc:
            await JSONResponse({'detail': exc.detail}, exc.status_code)(scope, receive, secure_send)
        except (OperationalError, PoolTimeout):
            await JSONResponse({'detail': {'code': 'management_dependency_unavailable'}}, 503)(scope, receive, secure_send)


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Login(Input):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)
    remember: bool = False


class NewMember(Input):
    username: str = Field(max_length=64)
    display_name: str = Field(max_length=80)


class MemberStatus(Input):
    status: str


class NewSpace(Input):
    name: str = Field(max_length=80)
    administrator_id: str | None = None
    administrator_username: str | None = Field(default=None, max_length=64)
    description: str = Field(default='', max_length=1000)


class SpaceStatus(Input):
    archived: bool


class Role(Input):
    name: str = Field(max_length=80)
    permissions: list[str] = Field(max_length=100)


class RoleEdit(Role):
    expected_version: int = Field(ge=1)


class Assignment(Input):
    role_ids: list[str] = Field(max_length=100)
    expected_version: int = Field(ge=1)


class Retirement(Input):
    confirmation: str = Field(max_length=64)
    replacement: str | None = None
    revoke: bool = False


class ProviderSave(Input):
    expected_version: int = Field(strict=True, ge=0)
    config: dict = Field(max_length=30)
    secrets: dict[str, str] = Field(default_factory=dict, max_length=3)
    clear_secrets: list[Literal['api_key', 'volcengine_access_key_id', 'volcengine_secret_access_key']] = Field(default_factory=list, max_length=3)
    reason: str = Field(min_length=1, max_length=1000)


class ProviderProbe(Input):
    expected_version: int = Field(strict=True, ge=1)
    reason: str = Field(min_length=1, max_length=1000)


class ProviderAssignment(Input):
    expected_version: int = Field(strict=True, ge=0)
    provider_ids: list[str] = Field(max_length=100)
    primary_provider_id: str | None = None
    reason: str = Field(min_length=1, max_length=1000)


class PageReview(Input):
    expected_sequence: int = Field(strict=True, ge=1, le=9007199254740991)
    outcome: Literal['member_confirmed_saved', 'draft_exported', 'member_discarded']
    note: str = Field(min_length=1, max_length=1000)


class MaintenanceChange(Input):
    mode: str
    expected_version: int = Field(ge=0)
    message: str = Field(default='', max_length=1000)
    reason: str = Field(min_length=1, max_length=1000)
    planned_at: datetime | None = None
    grace_seconds: int = Field(default=300, ge=0, le=3600)
    confirm_recovery: bool = False


def create_app(static_dir=None):
    load_storage_env()
    directory = Path(static_dir or os.getenv('MANAGEMENT_STATIC_DIR', ROOT / '.local/management-dist'))

    @asynccontextmanager
    async def lifespan(app):
        load_storage_env()
        if not postgres_enabled() or not os.getenv('DATABASE_URL'):
            raise ValueError('Management requires configured PostgreSQL; no local identity fallback')
        management_origin()
        await asyncio.to_thread(database.check)
        if not (directory / 'index.html').is_file():
            raise ValueError('Run python tools/build_management.py before management startup')
        # Reconcile persisted schedules, without starting generation consumers.
        from app.services.maintenance_control import scheduler
        async with scheduler():
            yield

    app = FastAPI(title='Canvas Management', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(Admission)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, error):
        # Pydantic normally includes the submitted value, which may contain keys.
        return JSONResponse({'detail': {'code': 'invalid_request'}}, 422)

    @app.get('/')
    def index():
        return FileResponse(directory / 'index.html')

    @app.get('/health')
    def health():
        return {'service': 'management', 'status': 'running'}

    @app.post('/api/auth/login')
    def login(request: Request, data: Login):
        result = members.login(data.username, data.password, audience='management',
                               source=request.client.host if request.client else 'unknown', remember=data.remember)
        principal = members.resolve_session(result['token'], 'management')
        try:
            body = queries.snapshot(principal)
        except HTTPException:
            members.logout(principal)
            raise
        response = JSONResponse(jsonable_encoder(body))
        response.set_cookie(COOKIE, result['token'], httponly=True, samesite='strict', path='/',
                            secure=management_origin().startswith('https://'),
                            max_age=result['ttl'] if data.remember else None)
        return response

    @app.post('/api/auth/logout')
    def logout(request: Request):
        members.logout(actor(request))
        response = JSONResponse({'ok': True})
        response.delete_cookie(COOKIE, path='/')
        return response

    @app.get('/api/me')
    def me(request: Request):
        return queries.snapshot(actor(request))

    @app.get('/api/members')
    def directory_members(request: Request, workspace: str | None = None, search: str = Query('', max_length=80),
                          after: str = Query('', max_length=80), limit: int = Query(50, ge=1, le=100)):
        return queries.directory(actor(request), workspace=workspace, search=search, after=after, limit=limit)

    @app.get('/api/member-lookup')
    def member_lookup(request: Request, username: str = Query(min_length=1, max_length=64), workspace: str | None = None):
        return queries.lookup(actor(request), username, workspace)

    @app.post('/api/members', status_code=201)
    def create_member(request: Request, data: NewMember):
        return members.create_member(actor(request), data.username, data.display_name)

    @app.patch('/api/members/{member_id}')
    def member_status(request: Request, member_id: str, data: MemberStatus):
        members.set_member_status(actor(request), member_id, data.status)
        return {'ok': True}

    @app.post('/api/members/{member_id}/reset')
    def reset_member(request: Request, member_id: str):
        return members.reset_member(actor(request), member_id)

    @app.post('/api/members/{member_id}/revoke-sessions')
    def revoke_sessions(request: Request, member_id: str):
        queries.revoke_sessions(actor(request), member_id)
        return {'ok': True}

    @app.post('/api/workspaces', status_code=201)
    def new_space(request: Request, data: NewSpace):
        return queries.create_workspace(actor(request), data.name, data.administrator_id, data.administrator_username, data.description)

    @app.patch('/api/workspaces/{workspace}')
    def space_status(request: Request, workspace: str, data: SpaceStatus):
        members.archive_workspace(actor(request), workspace, archived=data.archived)
        return {'ok': True}

    @app.put('/api/members/{member_id}/roles')
    def assignment(request: Request, member_id: str, data: Assignment, workspace: str | None = None):
        queries.assign(actor(request), member_id, data.role_ids, workspace, data.expected_version)
        return {'ok': True}

    @app.delete('/api/workspaces/{workspace}/members/{member_id}')
    def remove_member(request: Request, workspace: str, member_id: str, expected_version: int = Query(ge=1)):
        queries.remove(actor(request), member_id, workspace, expected_version)
        return {'ok': True}

    @app.get('/api/roles')
    def role_list(request: Request, workspace: str | None = None):
        return queries.roles(actor(request), workspace)

    @app.post('/api/roles', status_code=201)
    def new_role(request: Request, data: Role, workspace: str | None = None):
        return {'id': members.create_role(actor(request), data.name, data.permissions, workspace)}

    @app.patch('/api/roles/{role_id}')
    def edit_role(request: Request, role_id: str, data: RoleEdit, workspace: str | None = None):
        return {'version': members.update_role(actor(request), role_id, data.name, data.permissions, data.expected_version, workspace)}

    @app.get('/api/roles/{role_id}/impact')
    def impact(request: Request, role_id: str, workspace: str | None = None):
        return queries.role_impact(actor(request), role_id, workspace)

    @app.post('/api/roles/{role_id}/retire')
    def retire(request: Request, role_id: str, data: Retirement, workspace: str | None = None):
        members.retire_role(actor(request), role_id, data.confirmation, workspace=workspace, replacement=data.replacement, revoke=data.revoke)
        return {'ok': True}

    @app.get('/api/audit')
    def audit(request: Request, workspace: str | None = None, before: int | None = Query(None, ge=1), limit: int = Query(50, ge=1, le=100)):
        return queries.events(actor(request), workspace, before, limit)

    @app.get('/api/maintenance')
    def maintenance_snapshot(request: Request, workspace: str | None = None):
        from app.services.maintenance_control import snapshot
        return snapshot(actor(request), workspace)

    @app.patch('/api/maintenance')
    def maintenance_change(request: Request, data: MaintenanceChange, workspace: str | None = None):
        from app.services.maintenance_control import change
        payload = data.model_dump()
        return change(actor(request), workspace, **payload)

    @app.get('/api/maintenance/page-reports')
    def page_reports(request: Request, workspace: str | None = None, reviewed: bool = False,
                     after: UUID | None = None, limit: int = Query(50, ge=1, le=100)):
        from app.services.canvas_page_reports import review_list
        return review_list(actor(request), workspace, reviewed=reviewed, after=after, limit=limit)

    @app.post('/api/maintenance/page-reports/{report_id}/review')
    def review_page_report(report_id: UUID, request: Request, data: PageReview, workspace: str | None = None):
        from app.services.canvas_page_reports import review
        return review(actor(request), report_id, data.expected_sequence, data.outcome, data.note, workspace)

    @app.get('/api/providers')
    def provider_catalog(request: Request):
        from app.services.provider_control import catalog
        return catalog(actor(request))

    @app.put('/api/providers/{provider_id}')
    def provider_save(provider_id: str, request: Request, data: ProviderSave):
        from app.services.provider_control import save
        return save(actor(request), provider_id, **data.model_dump())

    @app.post('/api/providers/{provider_id}/probe')
    async def provider_probe(provider_id: str, request: Request, data: ProviderProbe):
        from app.services.provider_probes import probe
        return await probe(actor(request), provider_id, **data.model_dump())

    @app.get('/api/provider-assignments')
    def provider_assignments(request: Request, workspace: str):
        from app.services.provider_control import assignments
        return assignments(actor(request), workspace)

    @app.put('/api/provider-assignments')
    def provider_assign(request: Request, workspace: str, data: ProviderAssignment):
        from app.services.provider_control import assign
        return assign(actor(request), workspace, **data.model_dump())

    # Only the management artifact is mounted, never workbench static or data.
    app.mount('/static', StaticFiles(directory=directory, check_dir=False), name='management-static')
    return app
