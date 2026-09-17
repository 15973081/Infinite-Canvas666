import asyncio
import copy
import gc
import threading

import pytest
from app.routers import cloud_media
from app.services import assets
from app.storage import media
from app.storage.workspace import workspace_scope

PARENT = 'ast_' + 'a' * 32


@pytest.fixture
def previews(tmp_path, monkeypatch):
    state = {'rows': {}, 'decoded': 0, 'uploaded': 0, 'fail': False}
    lock = threading.Lock()
    original = {'id': PARENT, 'status': 'ready'}
    source = tmp_path / 'source.png'; source.write_bytes(b'preview fixture')
    def get(ref, ready=True):
        if ref == PARENT: return original.copy()
        with lock: return copy.deepcopy(state['rows'].get((media.current_workspace(), ref)))
    def decode(path, width, webp, png):
        with lock: state['decoded'] += 1
        if state['fail']:
            state['fail'] = False
            raise RuntimeError('decode failed')
        return str(source), 'image/webp'
    def publish(path, name, *, asset_id, parent_asset_id, role):
        assert parent_asset_id == PARENT and role == 'preview'
        row = {'id': asset_id, 'status': 'ready', 'workspace': media.current_workspace()}
        with lock:
            state['uploaded'] += 1
            state['rows'][(media.current_workspace(), asset_id)] = row
        return row
    monkeypatch.setattr(media, 'get_asset', get)
    monkeypatch.setattr(media, 'materialize', lambda _: str(source))
    monkeypatch.setattr(media, 'operation', lambda: {'root': tmp_path})
    monkeypatch.setattr(media, 'publish', publish)
    monkeypatch.setattr(media, 'browser_url', lambda row: '/preview/' + row['workspace'] + '/' + row['id'])
    monkeypatch.setattr(assets, 'generate_media_preview_file', decode)
    return state


def test_simultaneous_preview_requests_decode_and_upload_once(previews):
    async def run():
        with workspace_scope('space-a'):
            return await asyncio.gather(*(cloud_media.preview(PARENT, 512) for _ in range(12)))
    results = asyncio.run(run())
    assert previews['decoded'] == previews['uploaded'] == 1
    assert len({r.headers['location'] for r in results}) == 1
    gc.collect()
    assert not cloud_media._preview_locks


def test_different_workspaces_and_sizes_do_not_share_results(previews):
    async def one(workspace, size):
        with workspace_scope(workspace): return await cloud_media.preview(PARENT, size)
    async def run():
        return await asyncio.gather(one('space-a', 256), one('space-a', 512), one('space-b', 512))
    results = asyncio.run(run())
    assert previews['uploaded'] == 3
    assert len({r.headers['location'] for r in results}) == 3


def test_failed_preview_releases_lock_and_waiter_can_retry(previews):
    previews['fail'] = True
    async def run():
        with workspace_scope('space-a'):
            return await asyncio.gather(cloud_media.preview(PARENT, 512), cloud_media.preview(PARENT, 512), return_exceptions=True)
    results = asyncio.run(run())
    assert sum(isinstance(r, RuntimeError) for r in results) == 1
    assert previews['decoded'] == 2 and previews['uploaded'] == 1
    gc.collect()
    # Exceptions retain their traceback/lock until callers release them.
    del results
    gc.collect()
    assert not cloud_media._preview_locks
