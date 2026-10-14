"""Member-owned and workspace-owned subject groups backed by versioned documents."""
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

KIND = 'subject_library'
MAX_GROUPS = 200
MAX_ITEMS = 100
MAX_CATALOG_BYTES = 2 * 1024 * 1024


def personal_key(member_id):
    return 'personal:' + member_id


@contextmanager
def authorized(write=False):
    access = current_access.get()
    workspace = current_workspace()
    if (not postgres_enabled() or not access or not isinstance(access.principal, az.Principal)
            or access.principal.audience != 'workbench' or access.workspace != workspace):
        az.fail('authentication_required', 401)
    with az.policy_transaction() as conn:
        az.require(conn, access.principal, 'asset.read', workspace)
        if write:
            az.require(conn, access.principal, 'asset.manage', workspace)
        from app.services.maintenance_control import ensure
        ensure(conn, workspace, 'write' if write else 'read')
        yield conn, access.principal


def _load(conn, actor, owner_type, *, write=False):
    if owner_type not in {'PERSONAL', 'TEAM'}:
        raise HTTPException(422, '无效的主体归属。')
    key = personal_key(actor.member_id) if owner_type == 'PERSONAL' else 'team'
    row = conn.execute('''SELECT value,revision FROM workspace_documents
        WHERE workspace_id=%s AND kind=%s AND id=%s''' + (' FOR UPDATE' if write else ''),
        (current_workspace(), KIND, key)).fetchone()
    value = deepcopy(row['value']) if row else {'owner_type': owner_type, 'groups': []}
    return key, value, row['revision'] if row else 0


def _registration_sources(conn):
    row = conn.execute('''SELECT value FROM workspace_documents
        WHERE workspace_id=%s AND kind='asset_library' AND id='default' ''', (current_workspace(),)).fetchone()
    if not row:
        return {}
    value = row['value']
    libraries = value.get('libraries') or [{'id': 'default', 'categories': value.get('categories', [])}]
    return {(library['id'], item['id']): item
            for library in libraries for category in library.get('categories', [])
            for item in category.get('items', []) if item.get('id')}


def _public(conn, actor, value, revision):
    catalog = deepcopy(value)
    items = [item for group in catalog['groups'] for item in group['items']]
    assets = media.get_assets([item['media_asset_id'] for item in items if item.get('media_asset_id')], ready=False)
    sources = _registration_sources(conn) if any(item.get('asset_item_id') for item in items) else {}
    for group in catalog['groups']:
        counts = dict.fromkeys(('text', 'image', 'audio', 'video'), 0)
        for item in group['items']:
            counts[item['kind']] += 1
            item['available'] = True
            if item['kind'] == 'text':
                continue
            asset = assets.get(item['media_asset_id'])
            item['available'] = bool(asset and asset['status'] == 'ready' and not asset['deleted_at'])
            if asset:
                item['url'] = media.stable_url(asset)
            source = sources.get((item.get('library_id'), item.get('asset_item_id')))
            if source and source.get('media_asset_id') == item['media_asset_id']:
                # Read live registration state; the subject never stores supplier credentials
                # or a stale copy of a source item's provider/project binding.
                from app.services.assets import migrate_asset_item_registrations
                source = deepcopy(source)
                migrate_asset_item_registrations(source)
                fields = {'provider_id', 'project_name', 'task_id', 'status', 'detail',
                          'asset_uri', 'asset_id', 'registered_at'}
                item['registrations'] = {platform: {key: value for key, value in registration.items() if key in fields}
                    for platform, registration in source['registrations'].items() if isinstance(registration, dict)}
        group['resource_counts'] = counts
        cover = next((item for item in group['items'] if item['kind'] == 'image'
                      and item['available'] and item['id'] == group.get('cover_item_id')), None)
        cover = cover or next((item for item in group['items'] if item['kind'] == 'image' and item['available']), None)
        group['cover_url'] = cover['url'] if cover else ''
    catalog.update(revision=revision, workspace_id=current_workspace(),
                   can_manage='asset.manage' in az.effective_permissions(conn, actor.member_id, current_workspace()))
    return catalog


def catalogs():
    with authorized() as (conn, actor):
        result = {}
        for owner_type in ('PERSONAL', 'TEAM'):
            _, value, revision = _load(conn, actor, owner_type)
            result[owner_type] = _public(conn, actor, value, revision)
        return {'catalogs': result}


def group_details(owner_type, group_id):
    """Resolve only the referenced group, with the same ownership/revision as the list."""
    with authorized() as (conn, actor):
        _, value, revision = _load(conn, actor, owner_type)
        group = _group(value, group_id)
        scoped = _public(conn, actor, {'owner_type': owner_type, 'groups': [group]}, revision)
        return {'owner_type': owner_type, 'workspace_id': scoped['workspace_id'],
                'revision': revision, 'can_manage': scoped['can_manage'], 'group': scoped['groups'][0]}


def _mutate(owner_type, expected_revision, action, mutate):
    with authorized(write=True) as (conn, actor):
        key, value, revision = _load(conn, actor, owner_type, write=True)
        if revision != expected_revision:
            raise HTTPException(409, {'code': 'subject_library_changed', 'revision': revision})
        target = mutate(conn, value)
        value['updated_at'] = now_ms()
        if len(json.dumps(value, ensure_ascii=False).encode('utf-8')) > MAX_CATALOG_BYTES:
            raise HTTPException(413, '主体目录超过容量限制，请精简文字或主体组。')
        revision = documents.put(KIND, key, value, expected_revision=revision)
        az.audit(conn, actor, 'subject_library.' + action, target, current_workspace(),
                 {'owner_type': owner_type, 'revision': revision, 'groups': len(value['groups'])})
        return {'catalog': _public(conn, actor, value, revision), 'target_id': target}


def _group(value, group_id):
    group = next((group for group in value['groups'] if group['id'] == group_id), None)
    if not group:
        raise HTTPException(404, '主体组不存在。')
    return group


def create_group(owner_type, payload):
    def mutate(conn, value):
        if len(value['groups']) >= MAX_GROUPS:
            raise HTTPException(409, '主体组数量已达上限。')
        group = {'id': 'sub_' + uuid.uuid4().hex, 'name': payload.name,
                 'description': payload.description, 'items': [], 'created_at': now_ms(), 'updated_at': now_ms()}
        value['groups'].append(group)
        return group['id']
    return _mutate(owner_type, payload.expected_revision, 'group.create', mutate)


def update_group(owner_type, group_id, payload):
    def mutate(conn, value):
        group = _group(value, group_id)
        for field in ('name', 'description', 'cover_item_id'):
            if field in payload.model_fields_set:
                if field == 'cover_item_id' and payload.cover_item_id and not any(
                        item['id'] == payload.cover_item_id and item['kind'] == 'image' for item in group['items']):
                    raise HTTPException(404, '封面图片不属于此主体组。')
                group[field] = getattr(payload, field)
        group['updated_at'] = now_ms()
        return group_id
    return _mutate(owner_type, payload.expected_revision, 'group.update', mutate)


def delete_group(owner_type, group_id, expected_revision):
    def mutate(conn, value):
        group = _group(value, group_id)
        value['groups'].remove(group)
        return group_id
    return _mutate(owner_type, expected_revision, 'group.delete', mutate)


def add_item(owner_type, group_id, payload):
    def mutate(conn, value):
        group = _group(value, group_id)
        if len(group['items']) >= MAX_ITEMS:
            raise HTTPException(409, '单个主体组最多保存 100 份素材。')
        item = {'id': 'sbi_' + uuid.uuid4().hex, 'kind': payload.kind, 'name': payload.name, 'created_at': now_ms()}
        if payload.kind == 'text':
            item['text'] = payload.text
        else:
            asset = media.get_asset(payload.url)
            if not asset or not asset['content_type'].startswith(payload.kind + '/'):
                raise HTTPException(422, '请选择当前空间中已就绪且类型匹配的素材。')
            if any(source.get('media_asset_id') == asset['id'] for source in group['items']):
                raise HTTPException(409, '此素材已在主体组中。')
            item.update(url=media.stable_url(asset), media_asset_id=asset['id'])
            if payload.asset_item_id:
                source = _registration_sources(conn).get((payload.library_id, payload.asset_item_id))
                if not source or source.get('media_asset_id') != asset['id']:
                    raise HTTPException(404, '素材库来源已变化，请重新选择。')
                item.update(library_id=payload.library_id, asset_item_id=payload.asset_item_id)
        group['items'].append(item)
        group['updated_at'] = now_ms()
        return item['id']
    return _mutate(owner_type, payload.expected_revision, 'item.create', mutate)


def update_item(owner_type, group_id, item_id, payload):
    def mutate(conn, value):
        group = _group(value, group_id)
        item = next((item for item in group['items'] if item['id'] == item_id), None)
        if not item:
            raise HTTPException(404, '主体素材不存在。')
        if 'text' in payload.model_fields_set:
            if item['kind'] != 'text':
                raise HTTPException(422, '仅文字素材可以修改正文。')
            item['text'] = payload.text
        if 'name' in payload.model_fields_set:
            item['name'] = payload.name
        group['updated_at'] = now_ms()
        return item_id
    return _mutate(owner_type, payload.expected_revision, 'item.update', mutate)


def delete_item(owner_type, group_id, item_id, expected_revision):
    def mutate(conn, value):
        group = _group(value, group_id)
        item = next((item for item in group['items'] if item['id'] == item_id), None)
        if not item:
            raise HTTPException(404, '主体素材不存在。')
        group['items'].remove(item)
        if group.get('cover_item_id') == item_id:
            group.pop('cover_item_id')
        group['updated_at'] = now_ms()
        return item_id
    return _mutate(owner_type, expected_revision, 'item.delete', mutate)
