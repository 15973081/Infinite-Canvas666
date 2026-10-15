"""Scoped camera motion catalogs; favorites never grant access to another catalog."""
from contextlib import contextmanager
from copy import deepcopy
import json
import uuid

from fastapi import HTTPException

from app.services import authorization as az
from app.services.member_context import current_access
from app.storage import documents, media
from app.storage.settings import postgres_enabled
from app.storage.workspace import current_workspace
from app.utils import now_ms

KIND = 'camera_motion'
MAX_MOTIONS = 500


@contextmanager
def authorized(*, write=False, manage=False):
    access = current_access.get()
    if (not postgres_enabled() or not access or not isinstance(access.principal, az.Principal)
            or access.principal.audience != 'workbench' or access.workspace != current_workspace()):
        az.fail('authentication_required', 401)
    with az.policy_transaction() as conn:
        az.require(conn, access.principal, 'asset.read', current_workspace())
        if manage:
            az.require(conn, access.principal, 'asset.manage', current_workspace())
        from app.services.maintenance_control import ensure
        ensure(conn, current_workspace(), 'write' if write else 'read')
        yield conn, access.principal


def _load(conn, key, *, lock=False):
    row = conn.execute('''SELECT value,revision FROM workspace_documents
        WHERE workspace_id=%s AND kind=%s AND id=%s''' + (' FOR UPDATE' if lock else ''),
        (current_workspace(), KIND, key)).fetchone()
    return (deepcopy(row['value']), row['revision']) if row else ({'motions': [], 'favorites': []}, 0)


def _find(value, motion_id):
    motion = next((item for item in value['motions'] if item['uuid'] == motion_id), None)
    if motion is None:
        raise HTTPException(404, '运镜不存在或不属于当前目录。')
    return motion


def _visible(conn, personal, motion_id):
    try:
        return _find(personal, motion_id)
    except HTTPException:
        plaza, _ = _load(conn, 'plaza')
        return _find(plaza, motion_id)


def _public(motions, favorites):
    assets = media.get_assets([item['media_asset_id'] for item in motions], ready=False)
    result = []
    for item in motions:
        asset = assets.get(item['media_asset_id'])
        available = bool(asset and asset['status'] == 'ready' and not asset['deleted_at'])
        url = media.stable_url(asset) if available else ''
        result.append({**item, 'assetsUuid': item['media_asset_id'], 'webUrl': url,
                       'previewWebUrl': url, 'thumbnailWebUrl': url if item['fileType'] == 'IMG' else '',
                       'favorited': item['uuid'] in favorites, 'available': available})
    return result


def listing(tab, page, page_size, keyword):
    with authorized() as (conn, actor):
        personal, revision = _load(conn, 'personal:' + actor.member_id)
        plaza, _ = _load(conn, 'plaza')
        favorites = set(personal['favorites'])
        motions = personal['motions'] if tab == 'mine' else plaza['motions'] if tab == 'plaza' else [
            item for item in [*plaza['motions'], *personal['motions']] if item['uuid'] in favorites]
        needle = keyword.strip().casefold()
        motions = [item for item in motions if needle in item['name'].casefold()]
        motions.sort(key=lambda item: (item['updated_at'], item['uuid']), reverse=True)
        start = (page - 1) * page_size
        return {'data': _public(motions[start:start + page_size], favorites), 'totalCount': len(motions),
                'catalog_revision': revision, 'can_manage': 'asset.manage' in az.effective_permissions(conn, actor.member_id, current_workspace())}


def detail(motion_id):
    with authorized() as (conn, actor):
        personal, revision = _load(conn, 'personal:' + actor.member_id)
        motion = _visible(conn, personal, motion_id)
        return {'data': _public([motion], set(personal['favorites']))[0], 'catalog_revision': revision}


def _mutate(action, change, *, manage=True):
    with authorized(write=True, manage=manage) as (conn, actor):
        key = 'personal:' + actor.member_id
        value, revision = _load(conn, key, lock=True)
        target = change(conn, value, revision)
        if len(json.dumps(value, ensure_ascii=False).encode('utf-8')) > 2 * 1024 * 1024:
            raise HTTPException(413, '运镜目录超过容量限制。')
        revision = documents.put(KIND, key, value, expected_revision=revision)
        az.audit(conn, actor, 'camera_motion.' + action, target, current_workspace(), {'revision': revision})
        motion = next((item for item in value['motions'] if item['uuid'] == target), None)
        return {'success': True, 'catalog_revision': revision,
                'data': _public([motion], set(value['favorites']))[0] if motion else None}


def _preview(payload):
    asset = media.get_asset(payload.url)
    kind = 'IMG' if asset and asset['content_type'].startswith('image/') else 'VIDEO' if asset and asset['content_type'].startswith('video/') else None
    if kind is None:
        raise HTTPException(422, '运镜预览必须使用当前空间的图片或视频。')
    return {'media_asset_id': asset['id'], 'fileType': kind, 'url': media.stable_url(asset)}


def create(payload):
    def change(conn, value, revision):
        if revision != payload.expected_revision:
            raise HTTPException(409, {'code': 'camera_motion_catalog_changed', 'revision': revision})
        if len(value['motions']) >= MAX_MOTIONS:
            raise HTTPException(409, '运镜数量已达上限。')
        motion = {'uuid': 'motion_' + uuid.uuid4().hex, 'name': payload.name, 'description': payload.description,
                  'promptFragment': payload.prompt, 'revision': 1, 'created_at': now_ms(), 'updated_at': now_ms(),
                  **_preview(payload)}
        value['motions'].append(motion)
        return motion['uuid']
    return _mutate('create', change)


def update(motion_id, payload):
    def change(conn, value, revision):
        motion = _find(value, motion_id)
        if motion['revision'] != payload.expected_revision:
            raise HTTPException(409, {'code': 'camera_motion_changed', 'revision': motion['revision']})
        motion.update(name=payload.name, description=payload.description, promptFragment=payload.prompt,
                      revision=motion['revision'] + 1, updated_at=now_ms(), **_preview(payload))
        return motion_id
    return _mutate('update', change)


def delete(motion_id, expected_revision):
    def change(conn, value, revision):
        motion = _find(value, motion_id)
        if motion['revision'] != expected_revision:
            raise HTTPException(409, {'code': 'camera_motion_changed', 'revision': motion['revision']})
        value['motions'].remove(motion)
        value['favorites'] = [key for key in value['favorites'] if key != motion_id]
        return motion_id
    return _mutate('delete', change)


def favorite(motion_id, payload):
    def change(conn, value, revision):
        if payload.favorite or motion_id not in value['favorites']:
            _visible(conn, value, motion_id)
        if revision != payload.expected_revision:
            raise HTTPException(409, {'code': 'camera_motion_catalog_changed', 'revision': revision})
        value['favorites'] = [key for key in value['favorites'] if key != motion_id]
        if payload.favorite:
            if len(value['favorites']) >= MAX_MOTIONS:
                raise HTTPException(409, '收藏数量已达上限。')
            value['favorites'].append(motion_id)
        return motion_id
    return _mutate('favorite', change, manage=False)
