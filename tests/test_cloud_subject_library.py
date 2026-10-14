"""Native subject data contracts against authenticated HTTP, real PG and media objects."""
from concurrent.futures import ThreadPoolExecutor
import io
import json
import os
from pathlib import Path
from threading import Barrier

from fastapi import HTTPException
from PIL import Image
from psycopg.types.json import Jsonb
import pytest

from test_cloud_member_gateway import operator, world, headers

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
BASE = '/api/subject-library'


def catalogs(client, space):
    response = client.get(BASE, headers=headers(space))
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    return response.json()['catalogs']


def create(client, space, owner='PERSONAL', name='主体', revision=0):
    response = client.post(BASE + '/' + owner + '/groups', headers=headers(space),
                           json={'name': name, 'description': '描述', 'expected_revision': revision})
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    return response.json()


def item(client, space, group, revision, *, owner='PERSONAL', **content):
    response = client.post(f'{BASE}/{owner}/groups/{group}/items', headers=headers(space),
                           json={'expected_revision': revision, **content})
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    return response.json()


def image(client, space):
    buf = io.BytesIO()
    Image.new('RGB', (96, 64), (42, 80, 112)).save(buf, 'PNG')
    response = client.post('/api/ai/upload', headers=headers(space),
                           files={'files': ('subject.png', buf.getvalue(), 'image/png')})
    assert response.status_code == 200, response.text
    return response.json()['files'][0]


def upgrade_viewer(w):
    from app.services import members
    members.assign_roles(w['operator'], w['people'][1]['id'], [w['a']['roles']['editor']], w['a']['id'])


def test_subject_catalogs_separate_member_workspace_and_team_without_replacing_assets(world):
    from app.services import members
    from app.storage import database, documents
    from app.storage.workspace import workspace_scope
    from fastapi.testclient import TestClient
    from main import app
    w = world
    with TestClient(app) as anonymous:
        assert anonymous.get(BASE, headers=headers(w['a'])).status_code == 401
    assert catalogs(w['editor'], w['a'])['PERSONAL']['revision'] == 0
    assert w['viewer'].post(BASE + '/PERSONAL/groups', headers=headers(w['a']),
                            json={'name': '禁止', 'expected_revision': 0}).status_code == 403
    assert w['outsider'].get(BASE, headers=headers(w['a'])).status_code == 403
    owned = create(w['editor'], w['a'], name='私人角色')
    shared = create(w['editor'], w['a'], 'TEAM', '空间角色')
    other = catalogs(w['viewer'], w['a'])
    assert not other['PERSONAL']['groups'] and not other['PERSONAL']['can_manage']
    assert other['TEAM']['groups'][0]['id'] == shared['target_id']
    detail = w['viewer'].get(f"{BASE}/TEAM/groups/{shared['target_id']}", headers=headers(w['a']))
    assert detail.status_code == 200 and detail.json()['group']['name'] == '空间角色'
    assert detail.headers['cache-control'] == 'private, no-store'
    assert w['viewer'].get(f"{BASE}/PERSONAL/groups/{owned['target_id']}", headers=headers(w['a'])).status_code == 404
    assert catalogs(w['outsider'], w['b'])['TEAM']['groups'] == []
    upgrade_viewer(w)
    theirs = create(w['viewer'], w['a'], name='另一人的私人角色')
    guessed = w['viewer'].patch(f"{BASE}/PERSONAL/groups/{owned['target_id']}", headers=headers(w['a']),
                                json={'name': '越权修改', 'expected_revision': 1})
    assert guessed.status_code == 404
    assert catalogs(w['viewer'], w['a'])['PERSONAL']['groups'][0]['id'] == theirs['target_id']
    changed = w['viewer'].patch(f"{BASE}/TEAM/groups/{shared['target_id']}", headers=headers(w['a']),
                                json={'name': '空间共同编辑', 'expected_revision': 1})
    assert changed.status_code == 200
    members.assign_roles(w['operator'], w['people'][0]['id'], [w['b']['roles']['editor']], w['b']['id'])
    assert catalogs(w['editor'], w['b'])['PERSONAL']['groups'] == []
    create(w['editor'], w['b'], name='另一空间私人角色')
    assert catalogs(w['editor'], w['a'])['PERSONAL']['groups'][0]['name'] == '私人角色'
    # Subject writes never replace the pre-existing shared asset-library document.
    with workspace_scope(w['a']['id']):
        marker = {'libraries': [], 'custom': 'keep-shared-library'}
        documents.put('asset_library', 'default', marker)
    create(w['editor'], w['a'], name='第二主体', revision=1)
    with workspace_scope(w['a']['id']):
        assert documents.get('asset_library') == marker
        with database.connection() as conn:
            audit = conn.execute("SELECT details FROM management_events WHERE action='subject_library.group.create' AND target_id=%s", (owned['target_id'],)).fetchone()
            assert audit['details']['owner_type'] == 'PERSONAL'
            assert '私人角色' not in json.dumps(audit['details'])


def test_subject_mixed_materials_crud_cover_type_validation_and_retention(world):
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    from app.services.canvas_asset_purge import check_references
    w = world
    created = create(w['editor'], w['a'])
    group = created['target_id']
    text = item(w['editor'], w['a'], group, 1, kind='text', name='身份', text='年轻摄影师')
    picture = image(w['editor'], w['a'])
    added = item(w['editor'], w['a'], group, 2, kind='image', name='正面', url=picture['url'])
    image_id = added['target_id']
    for revision, kind, filename, content_type in ((3, 'audio', 'pixmax-generated-audio.mp3', 'audio/mpeg'),
                                                  (4, 'video', 'pixmax-audio-source.mp4', 'video/mp4')):
        path = Path(__file__).parent / 'fixtures' / filename
        upload = w['editor'].post('/api/ai/upload', headers=headers(w['a']),
                                  files={'files': (filename, path.read_bytes(), content_type)})
        assert upload.status_code == 200, upload.text
        item(w['editor'], w['a'], group, revision, kind=kind, name=kind, url=upload.json()['files'][0]['url'])
    catalog = catalogs(w['editor'], w['a'])['PERSONAL']
    assert catalog['groups'][0]['resource_counts'] == {'text': 1, 'image': 1, 'audio': 1, 'video': 1}
    assert catalog['groups'][0]['cover_url'] == picture['url']
    path = f'{BASE}/PERSONAL/groups/{group}'
    for payload in ({'kind': 'image', 'name': '错类型', 'url': catalog['groups'][0]['items'][2]['url']},
                    {'kind': 'image', 'name': '外部地址', 'url': 'https://example.invalid/a.png'},
                    {'kind': 'text', 'name': '混合', 'text': '说明', 'url': picture['url']},
                    {'kind': 'image', 'name': '伪造认证', 'url': picture['url'], 'registrations': {'volcengine': {}}}):
        response = w['editor'].post(path + '/items', headers=headers(w['a']), json={'expected_revision': 5, **payload})
        assert response.status_code == 422, response.text
    duplicate = w['editor'].post(path + '/items', headers=headers(w['a']),
                               json={'expected_revision': 5, 'kind': 'image', 'name': '重复', 'url': picture['url']})
    assert duplicate.status_code == 409
    renamed = w['editor'].patch(path, headers=headers(w['a']),
                               json={'expected_revision': 5, 'name': '新名称', 'description': '完整主体', 'cover_item_id': image_id})
    assert renamed.status_code == 200
    assert w['editor'].patch(path, headers=headers(w['a']), json={'expected_revision': 5, 'name': '旧窗口'}).status_code == 409
    assert w['editor'].patch(path, headers=headers(w['a']), json={'expected_revision': 6, 'cover_item_id': text['target_id']}).status_code == 404
    edited = w['editor'].patch(path + '/items/' + text['target_id'], headers=headers(w['a']),
                              json={'expected_revision': 6, 'text': '\n  有经验的摄影师\n'})
    assert edited.status_code == 200
    assert edited.json()['catalog']['groups'][0]['items'][0]['text'] == '\n  有经验的摄影师\n'
    assert w['editor'].patch(path + '/items/' + image_id, headers=headers(w['a']),
                             json={'expected_revision': 7, 'text': '不能把图片改成文字'}).status_code == 422
    with workspace_scope(w['a']['id']):
        asset = media.get_asset(picture['url'])
        with database.connection() as conn, pytest.raises(HTTPException) as failure:
            check_references(conn, {asset['id']}, {})
        assert failure.value.status_code == 409
    removed = w['editor'].delete(path + '/items/' + image_id, headers=headers(w['a']), params={'expected_revision': 7})
    assert removed.status_code == 200
    assert removed.json()['catalog']['groups'][0]['cover_url'] == ''
    with workspace_scope(w['a']['id']):
        with database.connection() as conn:
            check_references(conn, {asset['id']}, {})
        assert media.get_asset(asset['id'])['status'] == 'ready'
        assert media.store().path(asset['object_key'], asset['object_version_id']).exists()
    assert w['editor'].delete(path, headers=headers(w['a']), params={'expected_revision': 8}).status_code == 200
    assert catalogs(w['editor'], w['a'])['PERSONAL']['groups'] == []


def test_subject_material_rejects_foreign_private_deleting_and_stale_library_sources(world):
    from app.storage import database, documents, media
    from app.storage.workspace import workspace_scope
    w = world
    group = create(w['editor'], w['a'])['target_id']
    foreign = image(w['outsider'], w['b'])
    picture = image(w['editor'], w['a'])
    path = f'{BASE}/PERSONAL/groups/{group}/items'
    def add(url, **extra):
        return w['editor'].post(path, headers=headers(w['a']),
            json={'expected_revision': 1, 'kind': 'image', 'name': '引用', 'url': url, **extra})
    assert add(foreign['url']).status_code == 404
    buf = io.BytesIO()
    Image.new('RGB', (96, 64), 'blue').save(buf, 'PNG')
    private = w['editor'].post('/api/chat/attachments', headers=headers(w['a']),
                               files={'files': ('private.png', buf.getvalue(), 'image/png')})
    assert private.status_code == 200
    assert add(private.json()['files'][0]['url']).status_code == 409
    assert add(picture['url'], library_id='default', asset_item_id='unknown').status_code == 404
    with workspace_scope(w['a']['id']):
        asset = media.get_asset(picture['url'])
        library = {'libraries': [{'id': 'default', 'categories': [{'items': [{'id': 'approved',
                    'media_asset_id': asset['id'], 'registrations': {'volcengine': {'status': 'Active',
                    'asset_uri': 'asset://registered', 'provider_id': 'approved-provider', 'project_name': 'project',
                    'api_key': 'must-not-export'}}}]}]}]}
        documents.put('asset_library', 'default', library)
    accepted = add(picture['url'], library_id='default', asset_item_id='approved')
    assert accepted.status_code == 200, accepted.text
    registration = accepted.json()['catalog']['groups'][0]['items'][0]['registrations']['volcengine']
    assert registration['asset_uri'] == 'asset://registered' and 'api_key' not in registration
    with workspace_scope(w['a']['id']):
        library['libraries'][0]['categories'][0]['items'][0]['registrations']['volcengine']['status'] = 'Failed'
        documents.put('asset_library', 'default', library)
        stored = documents.get('subject_library', 'personal:' + w['people'][0]['id'])
        assert 'registrations' not in stored['groups'][0]['items'][0]
    assert catalogs(w['editor'], w['a'])['PERSONAL']['groups'][0]['items'][0]['registrations']['volcengine']['status'] == 'Failed'
    with database.connection() as conn:
        conn.execute("UPDATE assets SET status='deleting' WHERE id=%s", (asset['id'],))
    assert not catalogs(w['editor'], w['a'])['PERSONAL']['groups'][0]['items'][0]['available']
    assert add(picture['url']).status_code == 409  # stale catalog revision is rejected first
    rejected = w['editor'].post(path, headers=headers(w['a']),
        json={'expected_revision': 2, 'kind': 'image', 'name': '删除中的素材', 'url': picture['url']})
    assert rejected.status_code == 404
    # Removing the final reference to an unavailable asset remains possible.
    assert w['editor'].delete(f'{BASE}/PERSONAL/groups/{group}', headers=headers(w['a']), params={'expected_revision': 2}).status_code == 200


@pytest.mark.parametrize('initial', [0, 1])
def test_subject_concurrent_catalog_writes_have_one_winner_and_no_lost_update(world, initial):
    w = world
    if initial:
        create(w['editor'], w['a'], 'TEAM', '初始主体')
    barrier = Barrier(2)
    def write(index):
        barrier.wait(timeout=10)
        return w['editor'].post(BASE + '/TEAM/groups', headers=headers(w['a']),
                               json={'expected_revision': initial, 'name': '并发主体' + str(index)})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(write, (1, 2)))
    assert sorted(result.status_code for result in results) == [200, 409]
    after = catalogs(w['editor'], w['a'])['TEAM']
    assert after['revision'] == initial + 1 and len(after['groups']) == initial + 1
    winner = next(result for result in results if result.status_code == 200)
    assert any(group['id'] == winner.json()['target_id'] for group in after['groups'])


def test_subject_export_and_closure_include_only_personal_catalogs_keep_team_media_and_block_restore(world):
    from app.services import account_closure, members
    from app.storage import database, documents, media, deletion_ledger
    from app.storage.workspace import workspace_scope
    from test_cloud_account_data import unpack, closure
    w = world
    owner = w['people'][0]['id']
    owned = create(w['editor'], w['a'], name='导出本人主体')
    picture = image(w['editor'], w['a'])
    item(w['editor'], w['a'], owned['target_id'], 1, kind='image', name='保留空间素材', url=picture['url'])
    create(w['editor'], w['a'], 'TEAM', '继续共享主体')
    upgrade_viewer(w)
    create(w['viewer'], w['a'], name='不能导出他人主体')
    members.assign_roles(w['operator'], owner, [w['b']['roles']['editor']], w['b']['id'])
    create(w['editor'], w['b'], name='退出空间本人主体')
    members.assign_roles(w['operator'], owner, [], w['b']['id'])
    summary = w['editor'].get('/api/account/data').json()
    assert summary['subject_catalogs'] == 2
    assert {space['id'] for space in summary['workspaces']} == {w['a']['id'], w['b']['id']}
    archive = unpack(w['editor'].post('/api/account/data/export'))
    exported = json.loads(archive['subject-libraries.json'])
    assert len(exported) == 2
    exported_text = archive['subject-libraries.json'].decode('utf-8')
    assert '导出本人主体' in exported_text and '退出空间本人主体' in exported_text
    assert '继续共享主体' not in exported_text and '不能导出他人主体' not in exported_text
    assert json.loads(archive['manifest.json'])['subject_catalogs'] == 2
    with workspace_scope(w['a']['id']):
        saved = documents.get('subject_library', 'personal:' + owner)
        asset = media.get_asset(picture['url'])
    result = closure(w['editor'])
    assert result.status_code == 200, result.text
    assert deletion_ledger.member_blocked(owner)
    with database.connection() as conn:
        assert not conn.execute("SELECT 1 FROM workspace_documents WHERE kind='subject_library' AND id=%s", ('personal:' + owner,)).fetchone()
        assert conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE workspace_id=%s AND kind='subject_library'", (w['a']['id'],)).fetchone()['n'] == 2
    assert catalogs(w['viewer'], w['a'])['TEAM']['groups'][0]['name'] == '继续共享主体'
    assert catalogs(w['viewer'], w['a'])['PERSONAL']['groups'][0]['name'] == '不能导出他人主体'
    with workspace_scope(w['a']['id']):
        assert media.get_asset(asset['id'])['status'] == 'ready'
        assert media.store().path(asset['object_key'], asset['object_version_id']).exists()
        with database.connection() as conn:
            conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'subject_library',%s,%s)",
                         (w['a']['id'], 'personal:' + owner, Jsonb(saved)))
        assert documents.get('subject_library', 'personal:' + owner) is None
        with pytest.raises(HTTPException) as failure:
            documents.put('subject_library', 'personal:' + owner, saved)
        assert failure.value.status_code == 409
        assert account_closure.reconcile() == 1
        assert account_closure.reconcile() == 0
        with database.connection() as conn:
            assert not conn.execute("SELECT 1 FROM workspace_documents WHERE kind='subject_library' AND id=%s", ('personal:' + owner,)).fetchone()


@pytest.mark.parametrize('change', ['update', 'delete', 'new_catalog'])
def test_subject_export_rechecks_catalog_changes_before_returning_zip(world, monkeypatch, change):
    from app.storage import database, media
    from test_cloud_account_data import upload
    w = world
    owner = w['people'][0]['id']
    create(w['editor'], w['a'])
    upload(w['editor'], w['a'], '导出期间变更')
    original = media.FilesystemStore.download
    def changed(store, asset, path):
        result = original(store, asset, path)
        with database.connection() as conn:
            if change == 'update':
                conn.execute("UPDATE workspace_documents SET revision=revision+1 WHERE kind='subject_library' AND id=%s", ('personal:' + owner,))
            elif change == 'delete':
                conn.execute("DELETE FROM workspace_documents WHERE kind='subject_library' AND id=%s", ('personal:' + owner,))
            else:
                conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'subject_library',%s,%s)",
                             (w['b']['id'], 'personal:' + owner, Jsonb({'owner_type': 'PERSONAL', 'groups': []})))
        return result
    monkeypatch.setattr(media.FilesystemStore, 'download', changed)
    response = w['editor'].post('/api/account/data/export')
    assert response.status_code == 409, response.text
    assert response.headers['content-type'].startswith('application/json')


def test_subject_validation_capacity_revoked_permissions_and_maintenance(world, monkeypatch):
    from app.services import members, subject_library, maintenance_control
    w = world
    path = BASE + '/PERSONAL/groups'
    for payload in ({'name': '  ', 'expected_revision': 0}, {'name': 'x', 'expected_revision': True},
                    {'name': 'x', 'expected_revision': 0, 'member_id': w['people'][1]['id']},
                    {'name': 'x', 'expected_revision': -1}):
        assert w['editor'].post(path, headers=headers(w['a']), json=payload).status_code == 422
    created = create(w['editor'], w['a'])
    group_path = path + '/' + created['target_id']
    for payload in ({'expected_revision': 1}, {'expected_revision': 1, 'name': None}):
        assert w['editor'].patch(group_path, headers=headers(w['a']), json=payload).status_code == 422
    monkeypatch.setattr(subject_library, 'MAX_CATALOG_BYTES', 1)
    assert w['editor'].patch(group_path, headers=headers(w['a']), json={'expected_revision': 1, 'name': '修改'}).status_code == 413
    assert catalogs(w['editor'], w['a'])['PERSONAL']['revision'] == 1
    monkeypatch.setattr(subject_library, 'MAX_CATALOG_BYTES', 2 * 1024 * 1024)
    monkeypatch.setattr(subject_library, 'MAX_GROUPS', 1)
    assert w['editor'].post(path, headers=headers(w['a']), json={'expected_revision': 1, 'name': '太多'}).status_code == 409
    monkeypatch.setattr(subject_library, 'MAX_ITEMS', 1)
    item(w['editor'], w['a'], created['target_id'], 1, kind='text', name='第一项', text='正文')
    assert w['editor'].post(group_path + '/items', headers=headers(w['a']),
        json={'expected_revision': 2, 'kind': 'text', 'name': '第二项', 'text': '正文'}).status_code == 409
    members.assign_roles(w['operator'], w['people'][0]['id'], [w['a']['roles']['viewer']], w['a']['id'])
    assert not catalogs(w['editor'], w['a'])['PERSONAL']['can_manage']
    assert w['editor'].delete(group_path, headers=headers(w['a']), params={'expected_revision': 2}).status_code == 403
    members.assign_roles(w['operator'], w['people'][0]['id'], [w['a']['roles']['editor']], w['a']['id'])
    def read_only(conn, workspace, operation, *args, **kwargs):
        if operation == 'write':
            raise HTTPException(503, '空间维护只读')
    monkeypatch.setattr(maintenance_control, 'ensure', read_only)
    assert w['editor'].delete(group_path, headers=headers(w['a']), params={'expected_revision': 2}).status_code == 503
    assert catalogs(w['editor'], w['a'])['PERSONAL']['revision'] == 2


def test_subject_save_moves_generated_asset_from_inbox_to_saved(world):
    from app.storage import media
    from test_cloud_online_inbox import generated, listing
    w = world
    _, assets, *_ = generated(w)
    assert len(listing(w)) == 1
    group = create(w['editor'], w['a'])['target_id']
    item(w['editor'], w['a'], group, 1, kind='image', name='生成的主体', url=media.stable_url(assets[0]))
    assert listing(w) == []
    saved = listing(w, 'saved')
    assert len(saved) == 1 and saved[0]['asset_id'] == assets[0]['id']


@pytest.mark.parametrize('failure', ['ledger', 'commit'])
def test_subject_account_closure_failure_rolls_back_catalog_or_replays_accepted_intent(world, monkeypatch, failure):
    from app.services import account_closure
    from app.storage import database, deletion_ledger
    from test_cloud_account_data import closure
    w = world
    owner = w['people'][0]['id']
    create(w['editor'], w['a'], name='中断后的私人主体')
    if failure == 'ledger':
        original = deletion_ledger.write_record
        monkeypatch.setattr(deletion_ledger, 'write_record', lambda *args: (_ for _ in ()).throw(HTTPException(503, '账本写入失败')))
    else:
        original = account_closure.apply_record
        monkeypatch.setattr(account_closure, 'apply_record', lambda *args: (_ for _ in ()).throw(HTTPException(503, '提交中断')))
    assert closure(w['editor']).status_code == 503
    with database.connection() as conn:
        assert conn.execute("SELECT 1 FROM workspace_documents WHERE kind='subject_library' AND id=%s", ('personal:' + owner,)).fetchone()
        assert conn.execute('SELECT status FROM members WHERE id=%s', (owner,)).fetchone()['status'] == 'active'
    assert deletion_ledger.member_blocked(owner) == (failure == 'commit')
    if failure == 'ledger':
        assert catalogs(w['editor'], w['a'])['PERSONAL']['groups'][0]['name'] == '中断后的私人主体'
        monkeypatch.setattr(deletion_ledger, 'write_record', original)
    else:
        assert w['editor'].get(BASE, headers=headers(w['a'])).status_code == 401
        monkeypatch.setattr(account_closure, 'apply_record', original)
        assert account_closure.reconcile() == 1
        with database.connection() as conn:
            assert not conn.execute("SELECT 1 FROM workspace_documents WHERE kind='subject_library' AND id=%s", ('personal:' + owner,)).fetchone()
