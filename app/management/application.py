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


class BillingAssignment(Input):
    canvas_id: str = Field(min_length=1,max_length=200)
    member_id: str = Field(min_length=1,max_length=80)
    reason: str = Field(min_length=1,max_length=1000)
    include_assigned: bool = False


class BillingAssignmentApply(BillingAssignment):
    preview_token: str = Field(min_length=64,max_length=64)


class DatabaseConnectionSave(Input):
    name: str = Field(min_length=1,max_length=100)
    host: str = Field(min_length=1,max_length=253)
    hostaddr: str = Field(default="",max_length=45)
    port: int = Field(default=5432,ge=1,le=65535)
    database: str = Field(min_length=1,max_length=63)
    username: str = Field(min_length=1,max_length=63)
    schema_name: str = Field(default="canvas_cloud",min_length=1,max_length=63)
    password: str = Field(default="",max_length=1024)
    ca_pem: str = Field(min_length=1,max_length=65536)
    expected_version: int = Field(ge=0)


class StorageSave(Input):
    bucket: str = Field(max_length=63)
    region: str = Field(max_length=40)
    internal_endpoint: str = Field(max_length=200)
    public_endpoint: str = Field(max_length=200)
    access_key: str = Field(default="", max_length=256)
    secret_key: str = Field(default="", max_length=256)
    security_token: str = Field(default="", max_length=8192)
    expected_version: int = Field(ge=0)


class StorageProbe(Input):
    expected_version: int = Field(ge=1)


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


class ImageToolsSave(Input):
    config: dict = Field(max_length=2)
    expected_revision: int = Field(strict=True, ge=0)
    reason: str = Field(min_length=1, max_length=1000)


class ProviderProbe(Input):
    mode: Literal['models', 'protocols'] = 'models'
    expected_version: int = Field(strict=True, ge=1)
    reason: str = Field(min_length=1, max_length=1000)


class ProviderImportPreview(Input):
    source: Literal['local_file', 'default_workspace']
    reason: str = Field(min_length=1, max_length=1000)


class ProviderImportConfirm(Input):
    provider_ids: list[str] = Field(min_length=1, max_length=100)
    credential_provider_ids: list[str] = Field(default_factory=list, max_length=100)


class ProviderAssignment(Input):
    expected_version: int = Field(strict=True, ge=0)
    provider_ids: list[str] = Field(max_length=100)
    primary_provider_id: str | None = None
    reason: str = Field(min_length=1, max_length=1000)


class BackupRequest(Input):
    request_id: UUID
    reason: str = Field(min_length=1, max_length=1000)


class TaskReview(Input):
    request_id: UUID
    expected_version: int = Field(strict=True, ge=1)
    action: Literal['retry_finalization', 'resume_polling', 'cancel_unsubmitted', 'confirm_failed']
    note: str = Field(min_length=1, max_length=1000)
    upstream_verified: bool = Field(default=False, strict=True)


class CanvasOccupancyRevoke(Input):
    expected_generation: int = Field(strict=True, ge=1, le=9007199254740991)
    expected_revision: int = Field(strict=True, ge=1, le=9007199254740991)
    confirm: bool = Field(strict=True)
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

    @app.get('/api/overview')
    def overview(request: Request, workspace: str | None = Query(None, min_length=1, max_length=80, pattern=r'^[A-Za-z0-9_-]+$')):
        from app.management.resources import overview
        return overview(actor(request), workspace)

    @app.get('/api/members')
    def directory_members(request: Request, workspace: str | None = None, search: str = Query('', max_length=80),
                          after: str = Query('', max_length=80), limit: int = Query(50, ge=1, le=100),
                          status: str = Query('', pattern=r'^(active|invited|disabled)?$')):
        return queries.directory(actor(request), workspace=workspace, search=search, after=after, limit=limit, status=status)

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

    @app.get('/api/billing/assignment/choices')
    def billing_choices(request: Request, workspace: str = Query(min_length=1,max_length=80), query: str = Query('',max_length=100)):
        from app.services.billing_assignment import choices
        return choices(actor(request),workspace,query)

    @app.post('/api/billing/assignment/preview')
    def billing_assignment_preview(request: Request,data: BillingAssignment,workspace: str = Query(min_length=1,max_length=80)):
        from app.services.billing_assignment import assign
        return assign(actor(request),workspace,**data.model_dump())

    @app.post('/api/billing/assignment/apply')
    def billing_assignment_apply(request: Request,data: BillingAssignmentApply,workspace: str = Query(min_length=1,max_length=80)):
        from app.services.billing_assignment import assign
        return assign(actor(request),workspace,**data.model_dump())

    @app.get('/api/billing')
    def billing(request: Request, workspace: str | None = Query(None,max_length=80),
                member_id: str = Query('',max_length=80), account_query: str = Query('',max_length=80),
                canvas_query: str = Query('',max_length=100), from_ms: int = Query(0,ge=0,le=8640000000000000),
                to_ms: int = Query(0,ge=0,le=8640000000000000), page: int = Query(1,ge=1), page_size: int = Query(50,ge=1,le=100)):
        from app.services.account_billing import report
        return report(actor(request),workspace=workspace,member_id=member_id,account_query=account_query,
                      canvas_query=canvas_query,from_ms=from_ms,to_ms=to_ms,page=page,page_size=page_size)

    @app.get('/api/audit')
    def audit(request: Request, workspace: str | None = None, before: int | None = Query(None, ge=1), limit: int = Query(50, ge=1, le=100)):
        return queries.events(actor(request), workspace, before, limit)

    @app.get('/api/image-tools')
    def image_tools_read(request: Request, workspace: str = Query(min_length=1, max_length=80)):
        from app.services.image_tools import management
        return management(actor(request), workspace)

    @app.put('/api/image-tools')
    def image_tools_save(request: Request, data: ImageToolsSave, workspace: str = Query(min_length=1, max_length=80)):
        from app.services.image_tools import management
        return management(actor(request), workspace, **data.model_dump())

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

    @app.get('/api/backups')
    def backup_list(request: Request, workspace: str | None = None, after: UUID | None = None,
                    limit: int = Query(50, ge=1, le=100)):
        from app.services.backup_control import listing
        return listing(actor(request), workspace, after, limit)

    @app.post('/api/backups')
    def backup_request(request: Request, data: BackupRequest, workspace: str | None = None):
        from app.services.backup_control import request as create_request
        return create_request(actor(request), data.request_id, data.reason, workspace)

    @app.get('/api/canvas-occupancy')
    def canvas_occupancy(request: Request, workspace: str, after: str = Query('', max_length=200),
                         limit: int = Query(50, ge=1, le=100)):
        from app.services.canvas_occupancy import listing
        return listing(actor(request), workspace, after, limit)

    @app.post('/api/canvas-occupancy/{canvas_id}/revoke')
    def revoke_canvas_occupancy(canvas_id: str, request: Request, data: CanvasOccupancyRevoke, workspace: str):
        from app.services.canvas_occupancy import revoke
        return revoke(actor(request), workspace, canvas_id, **data.model_dump())

    @app.get('/api/tasks')
    def task_list(request: Request, workspace: str, status: str = 'needs_review',
                  after: str = Query('', max_length=200), limit: int = Query(50, ge=1, le=100)):
        from app.services.task_reviews import listing
        return listing(actor(request), workspace, status, after, limit)

    @app.get('/api/tasks/{task_id}')
    def task_detail(task_id: str, request: Request, workspace: str):
        from app.services.task_reviews import detail
        return detail(actor(request), workspace, task_id)

    @app.post('/api/tasks/{task_id}/review')
    def task_review(task_id: str, request: Request, data: TaskReview, workspace: str):
        from app.services.task_reviews import review
        return review(actor(request), workspace, task_id, **data.model_dump())

    @app.get('/api/database-connections')
    def database_connections(request: Request):
        from app.services.database_control import catalog
        return catalog(actor(request))

    @app.post('/api/database-connections')
    def database_connection_create(request: Request, data: DatabaseConnectionSave):
        from app.services.database_control import save
        return save(actor(request),data.model_dump())

    @app.put('/api/database-connections/{profile_id}')
    def database_connection_save(profile_id: str,request: Request,data: DatabaseConnectionSave):
        from app.services.database_control import save
        return save(actor(request),data.model_dump(),profile_id)

    @app.delete('/api/database-connections/{profile_id}')
    def database_connection_delete(profile_id: str,request: Request,data: StorageProbe):
        from app.services.database_control import remove
        return remove(actor(request),profile_id,data.expected_version)

    @app.post('/api/database-connections/{profile_id}/probe')
    def database_connection_probe(profile_id: str,request: Request,data: StorageProbe):
        from app.services.database_control import probe
        return probe(actor(request),profile_id,data.expected_version)

    @app.get('/api/storage/tos')
    def storage_read(request: Request):
        from app.services.storage_control import read
        return read(actor(request))

    @app.put('/api/storage/tos')
    def storage_save(request: Request, data: StorageSave):
        from app.services.storage_control import save
        return save(actor(request), data.model_dump())

    @app.post('/api/storage/tos/probe')
    def storage_probe(request: Request, data: StorageProbe):
        from app.services.storage_control import probe
        return probe(actor(request), data.expected_version)

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

    @app.post('/api/provider-imports/preview')
    def provider_import_preview(request: Request, data: ProviderImportPreview):
        from app.services.provider_imports import preview
        return preview(actor(request), **data.model_dump())

    @app.post('/api/provider-imports/{preview_id}/confirm')
    def provider_import_confirm(preview_id: UUID, request: Request, data: ProviderImportConfirm):
        from app.services.provider_imports import confirm
        return confirm(actor(request), preview_id, **data.model_dump())

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
