"""Member-mode HTTP admission. Unclassified legacy routes fail closed.

Admission is followed by transaction-time authorization in database.connection.
This module never trusts browser names, IPs, client IDs, or workspace selectors
as identity. Management and unmigrated machine-global tools have no workbench
permission shortcut.
"""
import asyncio
import re
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, quote

from fastapi import HTTPException
from starlette.responses import JSONResponse, RedirectResponse

from app.services import members, authorization as az
from app.services.member_context import access_scope
from app.storage.workspace import workspace_scope

COOKIE = 'canvas_member_session'
PUBLIC = {'/static/js/infinity-hero.js', '/static/vendor/js/three-0.160.0.module.js', '/login', '/api/auth/login', '/api/auth/status', '/api/auth/activate',
          '/static/login.html', '/static/css/login.css', '/static/js/login.js',
          '/static/js/frontend-version.js', '/api/frontend/version'}
ACCOUNT = {'/api/account/billing', '/api/management-entry', '/api/auth/logout', '/api/auth/workspaces', '/api/auth/profile'}
MANAGEMENT_PREFIXES = ('/api/shared-folders', '/api/comfyui/', '/api/workflows',
                       '/api/providers/', '/api/config/token', '/api/maintenance/start', '/api/maintenance/cancel')


def cookie_token(scope):
    cookie = SimpleCookie()
    try:
        cookie.load(dict(scope.get('headers', [])).get(b'cookie', b'').decode('latin-1'))
        return cookie[COOKIE].value if COOKIE in cookie else ''
    except Exception:
        return ''


def principal(scope):
    return members.resolve_session(cookie_token(scope), 'workbench')


def selected_workspace(scope):
    headers = dict(scope.get('headers', []))
    header = headers.get(b'x-workspace-id', b'').decode('latin-1')
    values = parse_qs(scope.get('query_string', b'').decode('latin-1')).get('workspace', [])
    if len(values) > 1 or (header and values and header != values[0]):
        az.fail('workspace_selector_conflict', 400)
    value = header or (values[0] if values else '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value):
        az.fail('workspace_required', 400)
    return value


def permissions(path, method):
    """Explicit classification; rules are intentionally ordered most specific first."""
    if path.startswith(MANAGEMENT_PREFIXES) or (path == '/api/providers' and method != 'GET'):
        az.fail('management_entry_required')
    if path.startswith('/api/local-assets'):
        # These handlers still scan/mutate LOCAL_UPLOAD_DIR. They must be
        # migrated to a workspace catalog before enabling member access.
        az.fail('local_asset_catalog_pending', 503)
    if path in {'/api/config', '/api/models', '/api/providers'} and method == 'GET':
        return ('provider.use',)
    if path == '/ws/stats' or re.fullmatch(r'/ws/canvases/[^/]+', path):
        return ('canvas.read',)
    if path == '/api/maintenance/status' and method == 'GET':
        return ('canvas.read',)
    if path.startswith('/api/conversations') and method in {'GET', 'POST', 'DELETE'}:
        return ('canvas.read',)  # Private member conversation, not shared canvas write.
    if path == '/api/queue_status' and method == 'GET':
        return ('task.read',)
    if path == '/api/canvas-draft-copies' and method == 'POST':
        from app.services.canvas_draft_copies import PERMISSIONS
        return PERMISSIONS
    if re.fullmatch(r'/api/canvas-(?:image|video|llm)-tasks(?:/[^/]+)?', path):
        return ('task.read',) if method == 'GET' else ('generation.submit', 'provider.use') if method == 'POST' else None
    if path in {'/api/canvases', '/api/canvases/trash'}:
        return ('canvas.read',) if method == 'GET' else ('canvas.create',) if method == 'POST' and path == '/api/canvases' else None
    if path.startswith('/api/canvas-folders'):
        return ('canvas.read',) if method == 'GET' else ('canvas.edit',) if method in {'POST', 'PATCH', 'DELETE'} else None
    if re.fullmatch(r'/api/canvases/[^/]+/lock(?:/release)?', path):
        az.fail('collaboration_protocol_pending', 503)  # Replaced by C2 lease routes.
    if re.fullmatch(r'/api/canvases/[^/]+/task-results(?:/[^/]+/join)?', path):
        from app.services.canvas_task_results import PERMISSIONS
        return PERMISSIONS if method == 'GET' and path.endswith('/task-results') else (*PERMISSIONS, 'canvas.edit') if method == 'POST' and path.endswith('/join') else None
    if re.fullmatch(r'/api/canvases/[^/]+/page-state', path):
        return ('canvas.read',) if method == 'POST' else None
    if re.fullmatch(r'/api/canvases/[^/]+/touch', path):
        return ('canvas.read',) if method == 'POST' else None
    if re.fullmatch(r'/api/canvases/[^/]+/edit-lease(?:/(?:acquire|renew|release|transfers(?:/[^/]+)?))?', path):
        return ('canvas.read',) if method == 'GET' else ('canvas.edit',) if method == 'POST' else None
    if re.fullmatch(r'/api/canvases/[^/]+/ledger(?:/.*)?', path):
        return ('canvas.read',) if method == 'GET' else ('canvas.edit',)
    if re.fullmatch(r'/api/canvases/[^/]+(?:/(?:meta|touch|folder|restore|purge|backup|backups)(?:/[^/]+(?:/restore)?)?)?', path):
        if method == 'GET':
            return ('canvas.read',)
        if method == 'DELETE':
            return ('canvas.delete',)
        if path.endswith('/restore'):
            return ('canvas.restore',)
        return ('canvas.edit',) if method in {'PUT', 'POST', 'PATCH'} else None
    if path in {'/api/history', '/api/history/page'} and method == 'GET':
        return ('asset.read',)
    if path == '/api/history/delete' and method == 'POST':
        return ('asset.manage',)
    if path.startswith('/api/prompt-libraries'):
        return ('canvas.read',) if method == 'GET' else ('prompt.manage',) if method in {'POST', 'PATCH', 'DELETE'} else None
    if path == '/api/canvas-assets/references' and method == 'POST':
        return ('asset.read', 'canvas.read')
    if path == '/api/canvas-assets/catalog' and method == 'POST':
        return ('asset.manage', 'asset.read', 'canvas.read')
    if path.startswith('/api/canvas-assets/references/') and method == 'GET':
        return ('asset.read', 'canvas.read')
    if path == '/api/canvas-assets' and method == 'GET':
        return ('asset.read', 'canvas.read')
    if path == '/api/smart-canvas/prompt-templates' and method == 'GET':
        return ('asset.read',)
    if path == '/api/image-tools' and method == 'GET':
        return ('canvas.read', 'provider.use')
    if path == '/api/media/uploads/capabilities' and method == 'GET':
        return ('asset.upload',)
    if path.startswith('/api/media/uploads'):
        return ('asset.upload',) if method in {'GET', 'POST', 'DELETE'} else None
    if path.startswith(('/api/media/', '/assets/', '/output/')) and method in {'GET', 'HEAD'}:
        return ('asset.read',)
    if path == '/api/media-preview' and method == 'GET':
        return ('asset.read',)
    if path in {'/api/ai/upload', '/api/asset-library/workflows/upload'} and method == 'POST':
        return ('asset.upload',)
    if path == '/api/asset-library/items/crop' and method == 'POST':
        return ('asset.read', 'asset.upload', 'asset.manage')
    if (re.fullmatch(r'/api/asset-library/items/[^/]+/(?:register-avatar|cancel-avatar|avatar-status)', path)
            or path == '/api/asset-library/items/batch-register-avatar'):
        return ('asset.read', 'asset.manage', 'provider.use', 'generation.submit') if method == 'POST' else None
    if path.startswith(('/api/asset-library', '/api/local-assets')):
        if path.endswith(('/register-avatar', '/batch-register-avatar', '/cancel-avatar', '/avatar-status', '/caption')):
            # Registration/caption can call paid services; migrate explicitly.
            return None
        return ('asset.read',) if method == 'GET' else ('asset.manage',) if method in {'POST', 'PATCH', 'DELETE'} else None
    if path in {'/api/canvas-assets/check', '/api/canvas-assets/download'} and method == 'POST':
        return ('asset.read',)
    if path in {'/api/canvas-workflows/export', '/api/smart-canvas/group-export'} and method == 'POST':
        return ('canvas.export', 'asset.read')
    if path in {'/api/canvas-workflows/import', '/api/canvas-workflows/export-to-library', '/api/smart-canvas/video-trim'} and method == 'POST':
        return ('canvas.create', 'asset.upload', 'asset.read')
    return None


def operation(path, method):
    if re.fullmatch(r'/api/canvases/[^/]+/touch', path) and method == 'POST':
        return 'read', None  # This endpoint only returns the existing canvas record.
    if re.fullmatch(r'/api/canvases/[^/]+/page-state', path):
        return 'observe', None
    if re.fullmatch(r'/api/canvases/[^/]+/edit-lease(?:/(?:acquire|renew|release|transfers(?:/[^/]+)?))?', path):
        return 'observe', None  # Lease handlers enforce maintenance inside their transaction.
    if path in {'/api/maintenance/status', '/ws/stats'} or re.fullmatch(r'/ws/canvases/[^/]+', path):
        return 'observe', None
    if method in {'GET', 'HEAD'} or path in {'/api/canvas-assets/references', '/api/canvas-assets/check', '/api/canvas-assets/download', '/api/canvas-workflows/export', '/api/smart-canvas/group-export'}:
        return 'read', None
    upload = re.fullmatch(r'/api/media/uploads/(ast_[a-f0-9]{32})(?:/parts/[0-9]+(?:/complete)?|/complete)?', path)
    if upload:
        return 'upload.finish', upload[1]
    canvas = re.fullmatch(r'/api/canvases/([^/]+)(?:/.*)?', path)
    if canvas and path != '/api/canvases/trash':
        return ('canvas.finish' if method == 'PUT' and path == '/api/canvases/' + canvas[1] else 'canvas.write'), canvas[1]
    return 'write', None


def preflight(actor, workspace, actions, operation='read', resource_id=None):
    with az.policy_transaction() as conn:
        for action in actions:
            az.require(conn, actor, action, workspace)
        from app.services.maintenance_control import ensure
        ensure(conn, workspace, operation, resource_id)


def public_provider_config():
    from app.providers.registry import load_api_providers
    keys = {'id', 'name', 'primary', 'enabled', 'has_key', 'chat_models', 'image_models', 'video_models', 'model_prices', 'model_policies', 'avatar_registration'}
    from app.services.model_commercial import public_models
    providers = [{k: v for k, v in public_models(p).items() if k in keys} for p in load_api_providers()]
    for provider in providers: provider['billing_authority'] = 'server'
    return {'api_providers': providers, 'providers': providers,
            'chat_models': list(dict.fromkeys(m for p in providers for m in p.get('chat_models', []))),
            'image_models': list(dict.fromkeys(m for p in providers for m in p.get('image_models', []))),
            'video_models': list(dict.fromkeys(m for p in providers for m in p.get('video_models', [])))}


async def dispatch(app, scope, receive, send):
    from app.services.auth import origin_allowed
    path, method = scope.get('path', ''), scope.get('method', 'GET')
    if (scope['type'] == 'websocket' or method not in {'GET', 'HEAD', 'OPTIONS'}) and not origin_allowed(scope):
        return await reject(scope, receive, send, HTTPException(403, {'code': 'origin_forbidden'}))
    if path in PUBLIC:
        return await app(scope, receive, send)
    actor = await asyncio.to_thread(principal, scope)
    if actor is None:
        if scope['type'] == 'http' and method == 'GET' and (path == '/' or path.endswith('.html')):
            return await RedirectResponse('/login?next=' + quote(path, safe=''), 303)(scope, receive, send)
        return await reject(scope, receive, send, HTTPException(401, {'code': 'authentication_required'}))
    scope['member_principal'] = actor
    scope['auth_user'] = actor.member_id
    try:
        claimed_member = dict(scope.get('headers', [])).get(b'x-member-id', b'').decode('latin-1')
        if scope['type'] == 'websocket' or (method in {'GET', 'HEAD'} and (path.startswith(('/assets/', '/output/', '/api/media/')) or path == '/api/media-preview')):
            identities = parse_qs(scope.get('query_string', b'').decode('latin-1')).get('member', [])
            if len(identities) > 1 or (claimed_member and identities and claimed_member != identities[0]):
                az.fail('member_identity_changed', 409)
            claimed_member = claimed_member or (identities[0] if identities else '')
        if claimed_member and claimed_member != actor.member_id:
            az.fail('member_identity_changed', 409)
        if path in ACCOUNT:
            return await app(scope, receive, send)
        if path == '/' or path.startswith('/static/'):
            if path.startswith('/static/runninghub/') or path in {'/static/api-settings.html', '/static/comfyui-settings.html'}:
                az.fail('management_entry_required')
            if path != '/' and not path.endswith(('.html', '.js', '.css', '.svg', '.png', '.jpg', '.webp', '.ico', '.woff', '.woff2', '.ttf')):
                az.fail('static_resource_forbidden')
            return await app(scope, receive, send)
        actions = permissions(path, method)
        if not actions:
            az.fail('route_not_migrated')
        workspace = selected_workspace(scope)
        action_kind, resource_id = operation(path, method)
        from app.services.canvas_leases import proof_from_headers
        edit_proof = proof_from_headers(dict(scope.get('headers', [])))
        await asyncio.to_thread(preflight, actor, workspace, actions, action_kind, resource_id)
        with workspace_scope(workspace), access_scope(actor, workspace, actions, action_kind, resource_id, edit_proof):
            scope['workspace_id'] = workspace
            if path in {'/api/config', '/api/providers', '/api/models'}:
                config = await asyncio.to_thread(public_provider_config)
                return await JSONResponse(config, headers={'Cache-Control': 'no-store'})(scope, receive, send)
            if path in {'/api/maintenance/status', '/api/queue_status'}:
                from app.services.member_presence import status, queue
                value = await asyncio.to_thread(status if path.endswith('/status') else queue, actor)
                return await JSONResponse(value, headers={'Cache-Control': 'no-store'})(scope, receive, send)
            await app(scope, receive, send)
    except HTTPException as exc:
        return await reject(scope, receive, send, exc)


async def reject(scope, receive, send, exc):
    if scope['type'] == 'websocket':
        return await send({'type': 'websocket.close', 'code': 1008})
    return await JSONResponse({'detail': exc.detail}, exc.status_code, headers={**(exc.headers or {}), 'Cache-Control': 'no-store'})(scope, receive, send)
