"""Real publisher + filesystem objects; transactional DB adapter stays isolated."""
import copy
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from app.storage import media
from app.services import canvas_asset_purge

ASSET = 'ast_' + '1' * 32
PARENT = 'ast_' + '2' * 32


class Result:
    def __init__(self, rows): self.rows = copy.deepcopy(rows)
    def fetchone(self): return self.rows[0] if self.rows else None
    def fetchall(self): return self.rows
    def __iter__(self): return iter(self.rows)


@pytest.fixture
def publishing(tmp_path, monkeypatch):
    state = SimpleNamespace(rows={}, uploads=[], lock=threading.RLock(), gate=None,
                            fail_update=False, lost_ack=False, lookup_failure=False)
    storage = media.FilesystemStore(tmp_path / 'objects')
    real_put = storage.put

    def put(key, path, mime):
        version = real_put(key, path, mime)
        with state.lock: state.uploads.append((key, version))
        if state.gate: state.gate.wait(timeout=10)
        return version

    def execute(sql, args=()):
        if sql.startswith('SELECT legacy_ref,asset_id'): return Result([])
        if sql.startswith('SELECT id,status FROM assets'):
            return Result([r for r in state.rows.values() if r['id'] in args[1]])
        if sql.startswith('INSERT INTO assets'):
            workspace, aid, kind, name, bucket, region, key, parent, role = args
            state.rows.setdefault(aid, dict(id=aid, workspace_id=workspace, kind=kind,
                display_name=name, bucket=bucket, region=region, object_key=key,
                object_version_id=None, parent_asset_id=parent, role=role, status='uploading'))
            return Result([])
        if sql.startswith('SELECT 1 FROM assets'):
            return Result([{'exists': 1}] if args[1] in state.rows else [])
        if sql.startswith('SELECT * FROM assets'):
            return Result([state.rows[args[1]]])
        if sql.startswith('SELECT object_key,object_version_id'):
            if state.lookup_failure: raise RuntimeError('database unavailable')
            return Result([state.rows[args[1]]] if args[1] in state.rows else [])
        if sql.startswith("UPDATE assets SET status='ready'"):
            if state.fail_update: raise RuntimeError('finalization failed')
            key, version, size, digest, mime, workspace, aid = args
            state.rows[aid].update(status='ready', object_key=key, object_version_id=version,
                                  size_bytes=size, sha256=digest, content_type=mime)
            return Result([state.rows[aid]])
        raise AssertionError(sql)

    @contextmanager
    def connection():
        with state.lock:
            before = copy.deepcopy(state.rows)
            try:
                yield SimpleNamespace(execute=execute)
            except Exception:
                state.rows = before
                raise
            if state.lost_ack and any(r['status'] == 'ready' for r in state.rows.values()):
                state.lost_ack = False
                raise RuntimeError('commit acknowledgement lost')

    def get_asset(aid, ready=True):
        with state.lock: return copy.deepcopy(state.rows.get(aid))

    monkeypatch.setattr(storage, 'put', put)
    monkeypatch.setattr(media, 'store', lambda: storage)
    monkeypatch.setattr(media, 'connection', connection)
    monkeypatch.setattr(media, 'get_asset', get_asset)
    monkeypatch.setattr(media, 'current_workspace', lambda: 'isolated')
    monkeypatch.setattr(media, 'media_backend', lambda: 'filesystem')
    state.path = tmp_path / 'preview.webp'
    state.path.write_bytes(b'identical thumbnail')
    state.storage = storage
    state.run = lambda path=None: media.publish(path or state.path, asset_id=ASSET,
                                               parent_asset_id=PARENT, role='preview')
    state.files = lambda: [p for p in storage.root.rglob('*') if p.is_file()]
    return state


def test_concurrent_publish_discards_loser_and_purge_leaves_no_objects(publishing):
    f = publishing
    f.gate = threading.Barrier(2)
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: f.run(), range(2)))
    assert len(f.uploads) == 2
    assert len(f.files()) == 1
    assert results[0]['object_key'] == results[1]['object_key']
    assert f.files()[0].read_bytes() == f.path.read_bytes()
    assert f.run()['object_key'] == results[0]['object_key']
    assert len(f.uploads) == 2  # Subsequent requests do not upload.
    canvas_asset_purge.delete_object(results[0])
    assert not f.files()


def test_conflicting_concurrent_bytes_preserve_winner_only(publishing, tmp_path):
    f = publishing
    other = tmp_path / 'other.webp'; other.write_bytes(b'different thumbnail')
    f.gate = threading.Barrier(2)
    with ThreadPoolExecutor(2) as pool:
        futures = [pool.submit(f.run, path) for path in [f.path, other]]
        outcomes = []
        for future in futures:
            try: outcomes.append(future.result())
            except HTTPException as exc: outcomes.append(exc)
    assert sum(isinstance(o, HTTPException) for o in outcomes) == 1
    assert len(f.files()) == 1
    winner = next(o for o in outcomes if isinstance(o, dict))
    assert media.file_digest(f.files()[0])[1] == winner['sha256']


def test_finalization_failure_removes_exact_upload_and_can_retry(publishing):
    f = publishing; f.fail_update = True
    with pytest.raises(RuntimeError, match='finalization failed'): f.run()
    assert not f.files()
    f.fail_update = False
    assert f.run()['status'] == 'ready'
    assert len(f.files()) == 1


def test_lost_commit_acknowledgement_never_deletes_adopted_object(publishing):
    f = publishing; f.lost_ack = True
    with pytest.raises(RuntimeError, match='acknowledgement lost'): f.run()
    assert f.rows[ASSET]['status'] == 'ready'
    assert len(f.files()) == 1
    assert f.run()['object_key'] == f.rows[ASSET]['object_key']
    assert len(f.uploads) == 1


def test_unavailable_database_preserves_unknown_object_and_logs(publishing, caplog):
    f = publishing; f.fail_update = True; f.lookup_failure = True
    with pytest.raises(RuntimeError, match='finalization failed'): f.run()
    assert len(f.files()) == 1
    assert 'Unpublished media cleanup incomplete' in caplog.text


def test_tos_cleanup_uses_exact_version_and_retains_adopted_object(publishing):
    f = publishing; row = f.run()
    store = media.TosStore.__new__(media.TosStore)
    store.bucket = 'mock-bucket'; store.client = Mock()
    media._discard_unpublished_object(store, 'isolated', ASSET, row['object_key'], row['object_version_id'])
    store.client.delete_object.assert_not_called()
    media._discard_unpublished_object(store, 'isolated', ASSET, 'unused/key', 'unused-version')
    store.client.delete_object.assert_called_once_with('mock-bucket', 'unused/key', version_id='unused-version')


def test_cleanup_permission_error_does_not_hide_successful_publication(publishing, monkeypatch, caplog):
    f = publishing
    # The losing publication succeeds by reusing the winner even if its cleanup fails.
    real_discard = media._discard_unpublished_object
    def discard(storage, *args):
        broken = media.TosStore.__new__(media.TosStore)
        broken.bucket = 'mock-bucket'; broken.client = Mock()
        broken.client.delete_object.side_effect = RuntimeError('delete permission denied')
        real_discard(broken, *args)
    monkeypatch.setattr(media, '_discard_unpublished_object', discard)
    f.gate = threading.Barrier(2)
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: f.run(), range(2)))
    assert results[0]['object_key'] == results[1]['object_key']
    assert 'Unpublished media cleanup incomplete' in caplog.text
