"""Camera motion ownership, concurrency, media retention and account lifecycle."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import io
import json
import os
from threading import Barrier

from fastapi import HTTPException
from psycopg.types.json import Jsonb
import pytest
from PIL import Image

from test_cloud_member_gateway import operator, world, headers
from test_cloud_subject_library import image, upgrade_viewer

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
BASE = '/api/camera-motions'


def listing(client, space, **params):
    response = client.get(BASE, headers=headers(space), params={'tab': 'mine', **params})
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    return response.json()


def create(world, name='弧形运镜', revision=0, url=None):
    url = url or image(world['editor'], world['a'])['url']
    body = {'name': name, 'description': '运镜说明', 'prompt': '镜头缓慢绕人物弧形移动',
            'url': url, 'expected_revision': revision}
    response = world['editor'].post(BASE, headers=headers(world['a']), json=body)
    assert response.status_code == 200, response.text
    return response.json(), body


def publish_fixture(world, motion):
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    public = {**deepcopy(motion), 'uuid': 'motion_' + 'e' * 32, 'name': '广场镜头'}
    with workspace_scope(world['a']['id']):
        documents.put('camera_motion', 'plaza', {'motions': [public], 'favorites': []}, expected_revision=0)
    return public


def test_camera_motion_crud_search_and_per_member_workspace_ownership(world):
    created, body = create(world)
    motion = created['data']; path = BASE + '/' + motion['uuid']
    assert motion['revision'] == 1 and motion['fileType'] == 'IMG'
    assert listing(world['editor'], world['a'], keyword='弧形')['totalCount'] == 1
    assert listing(world['editor'], world['a'], keyword='不存在')['data'] == []
    assert listing(world['viewer'], world['a'])['data'] == []
    assert world['viewer'].get(path, headers=headers(world['a'])).status_code == 404
    assert world['outsider'].get(path, headers=headers(world['b'])).status_code == 404
    updated = world['editor'].put(path, headers=headers(world['a']), json={**body, 'name': '低位推镜', 'expected_revision': 1})
    assert updated.status_code == 200, updated.text
    assert updated.json()['data']['revision'] == 2
    assert world['editor'].put(path, headers=headers(world['a']), json=body).status_code == 409
    assert world['editor'].delete(path, headers=headers(world['a']), params={'expected_revision': 1}).status_code == 409
    assert world['editor'].delete(path, headers=headers(world['a']), params={'expected_revision': 2}).status_code == 200
    assert listing(world['editor'], world['a'])['data'] == []


def test_camera_motion_favorites_do_not_disclose_other_personal_catalogs(world):
    created, _ = create(world); motion = created['data']; public = publish_fixture(world, motion)
    view = listing(world['viewer'], world['a'], tab='plaza')
    assert not view['can_manage'] and view['data'][0]['uuid'] == public['uuid']
    favorite = BASE + '/' + public['uuid'] + '/favorite'
    response = world['viewer'].put(favorite, headers=headers(world['a']), json={'favorite': True, 'expected_revision': 0})
    assert response.status_code == 200, response.text
    assert listing(world['viewer'], world['a'], tab='favorite')['data'][0]['uuid'] == public['uuid']
    assert not listing(world['editor'], world['a'], tab='plaza')['data'][0]['favorited']
    denied = world['viewer'].put(BASE + '/' + motion['uuid'] + '/favorite', headers=headers(world['a']), json={'favorite': True, 'expected_revision': 1})
    assert denied.status_code == 404
    assert world['viewer'].put(favorite, headers=headers(world['a']), json={'favorite': False, 'expected_revision': 0}).status_code == 409
    assert world['viewer'].put(favorite, headers=headers(world['a']), json={'favorite': False, 'expected_revision': 1}).status_code == 200
    assert listing(world['viewer'], world['a'], tab='favorite')['data'] == []


def test_camera_motion_validation_private_preview_and_media_retention(world):
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    from app.services.canvas_asset_purge import check_references
    created, body = create(world); motion = created['data']
    for invalid in [{**body, 'name': ' '}, {**body, 'prompt': ' '}, {**body, 'owner': 'someone'}]:
        assert world['editor'].post(BASE, headers=headers(world['a']), json=invalid).status_code == 422
    foreign = image(world['outsider'], world['b'])['url']
    assert world['editor'].post(BASE, headers=headers(world['a']), json={**body, 'url': foreign, 'expected_revision': 1}).status_code == 404
    assert world['viewer'].post(BASE, headers=headers(world['a']), json=body).status_code == 403
    with workspace_scope(world['a']['id']), database.connection() as conn:
        asset = media.get_asset(body['url'])
        with pytest.raises(HTTPException):
            check_references(conn, {asset['id']}, set())
        conn.execute("UPDATE assets SET status='deleting' WHERE id=%s", (asset['id'],))
    shown = listing(world['editor'], world['a'])['data'][0]
    assert not shown['available'] and not shown['webUrl']
    path = BASE + '/' + motion['uuid']
    assert world['editor'].put(path, headers=headers(world['a']), json={**body, 'expected_revision': 1}).status_code == 404
    # A missing preview must not prevent removing the final catalog reference.
    assert world['editor'].delete(path, headers=headers(world['a']), params={'expected_revision': 1}).status_code == 200


def test_camera_motion_concurrent_edits_keep_one_winner_and_preserve_other_records(world):
    first, body = create(world); second, _ = create(world, '另一镜头', 1)
    gate = Barrier(2); path = BASE + '/' + first['data']['uuid']
    def save(name):
        gate.wait(timeout=10)
        return world['editor'].put(path, headers=headers(world['a']), json={**body, 'name': name, 'expected_revision': 1})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ['编辑甲', '编辑乙']))
    assert sorted(response.status_code for response in results) == [200, 409]
    motions = listing(world['editor'], world['a'])['data']
    assert len(motions) == 2
    assert next(item for item in motions if item['uuid'] == second['data']['uuid'])['name'] == '另一镜头'


def test_camera_motion_export_closure_and_restored_private_catalog_are_scoped(world):
    from app.services import account_closure
    from app.storage import database, documents, deletion_ledger, media
    from app.storage.workspace import workspace_scope
    from test_cloud_account_data import unpack, closure
    created, body = create(world); publish_fixture(world, created['data'])
    owner = world['people'][0]['id']; key = 'personal:' + owner
    upgrade_viewer(world)
    response = world['viewer'].post(BASE, headers=headers(world['a']), json={**body, 'name': '他人运镜'})
    assert response.status_code == 200, response.text
    from app.services import members
    members.assign_roles(world['operator'], owner, [world['b']['roles']['editor']], world['b']['id'])
    second_preview = image(world['editor'], world['b'])
    second = world['editor'].post(BASE, headers=headers(world['b']), json={**body, 'name': '退出空间的本人运镜', 'url': second_preview['url']})
    assert second.status_code == 200, second.text
    members.assign_roles(world['operator'], owner, [], world['b']['id'])
    summary = world['editor'].get('/api/account/data').json()
    assert summary['camera_motion_catalogs'] == 2
    assert {space['id'] for space in summary['workspaces']} == {world['a']['id'], world['b']['id']}
    exported = unpack(world['editor'].post('/api/account/data/export'))
    payload = exported['camera-motion-libraries.json'].decode('utf-8')
    assert '弧形运镜' in payload and '退出空间的本人运镜' in payload and '他人运镜' not in payload and '广场镜头' not in payload
    with workspace_scope(world['a']['id']):
        saved = documents.get('camera_motion', key)
    result = closure(world['editor'])
    assert result.status_code == 200, result.text
    assert deletion_ledger.member_blocked(owner)
    assert len(listing(world['viewer'], world['a'], tab='plaza')['data']) == 1
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert media.get_asset(body['url'])['status'] == 'ready'
        conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'camera_motion',%s,%s)", (world['a']['id'], key, Jsonb(saved)))
    with workspace_scope(world['a']['id']):
        assert documents.get('camera_motion', key) is None
        with pytest.raises(HTTPException): documents.put('camera_motion', key, saved)
        assert account_closure.reconcile() == 1
        assert documents.get('camera_motion', key) is None


def test_camera_motion_rejects_private_preview_and_allows_removing_a_retired_favorite(world):
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    created, body = create(world); public = publish_fixture(world, created['data'])
    content = io.BytesIO(); Image.new('RGB', (96, 64), 'blue').save(content, 'PNG')
    uploaded = world['editor'].post('/api/chat/attachments', headers=headers(world['a']), files={'files': ('private.png', content.getvalue(), 'image/png')})
    assert uploaded.status_code == 200, uploaded.text
    denied = world['editor'].post(BASE, headers=headers(world['a']), json={**body, 'url': uploaded.json()['files'][0]['url'], 'expected_revision': 1})
    assert denied.status_code == 409
    assert len(listing(world['editor'], world['a'])['data']) == 1
    path = BASE + '/' + public['uuid'] + '/favorite'
    assert world['viewer'].put(path, headers=headers(world['a']), json={'favorite': True, 'expected_revision': 0}).status_code == 200
    with workspace_scope(world['a']['id']):
        documents.put('camera_motion', 'plaza', {'motions': [], 'favorites': []}, expected_revision=1)
    assert listing(world['viewer'], world['a'], tab='favorite')['data'] == []
    assert world['viewer'].put(path, headers=headers(world['a']), json={'favorite': False, 'expected_revision': 1}).status_code == 200


@pytest.mark.parametrize('change', ['update', 'delete', 'new_catalog'])
def test_camera_motion_export_rechecks_private_catalogs_before_publishing(world, monkeypatch, change):
    from app.storage import database, media
    from test_cloud_account_data import upload
    create(world); upload(world['editor'], world['a'], '导出期间变更')
    owner = world['people'][0]['id']; original = media.FilesystemStore.download
    def download(store, asset, path):
        result = original(store, asset, path)
        with database.connection() as conn:
            if change == 'update':
                conn.execute("UPDATE workspace_documents SET revision=revision+1 WHERE kind='camera_motion' AND id=%s", ('personal:' + owner,))
            elif change == 'delete':
                conn.execute("DELETE FROM workspace_documents WHERE kind='camera_motion' AND id=%s", ('personal:' + owner,))
            else:
                conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'camera_motion',%s,%s)", (world['b']['id'], 'personal:' + owner, Jsonb({'motions': [], 'favorites': []})))
        return result
    monkeypatch.setattr(media.FilesystemStore, 'download', download)
    response = world['editor'].post('/api/account/data/export')
    assert response.status_code == 409, response.text


def test_camera_motion_shared_export_excludes_personal_prompts_and_favorites(world, tmp_path):
    from app.storage import workspace_export
    created, _ = create(world, '个人运镜正文'); publish_fixture(world, created['data'])
    directory = tmp_path / 'shared'
    manifest = workspace_export.export(directory, world['a']['id'])
    rows = [json.loads(line) for line in (directory / 'workspace_documents.jsonl').read_text(encoding='utf-8').splitlines()]
    motion_rows = [row for row in rows if row['kind'] == 'camera_motion']
    assert len(motion_rows) == 1 and motion_rows[0]['id'] == 'plaza'
    assert {'kind': 'camera_motion', 'id': 'plaza'} in manifest['document_selectors']
