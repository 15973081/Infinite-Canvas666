"""Storage-scope integration, separate from membership/API authorization."""
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def spaces():
    from app.storage.database import connection
    values = ['space_' + uuid.uuid4().hex for _ in range(2)]
    with connection() as conn:
        for wid in values:
            conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)', (wid, wid))
    return values


def test_canvas_queries_and_conflict_details_do_not_cross_spaces():
    from app.storage import canvases
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    value = {'id': uuid.uuid4().hex, 'title': 'A private title', 'nodes': [], 'connections': []}
    with workspace_scope(a):
        canvases.save(value)
        assert [r['id'] for r in canvases.list_records()] == [value['id']]
    with workspace_scope(b):
        assert list(canvases.list_records()) == []
        assert list(canvases.all_documents()) == []
        with pytest.raises(HTTPException) as missing:
            canvases.get(value['id'])
        assert missing.value.status_code == 404
        for candidate in [dict(value), {k: v for k, v in value.items() if k != 'revision'}]:
            with pytest.raises(HTTPException) as conflict:
                canvases.save(candidate)
            assert conflict.value.status_code == 409
            assert conflict.value.detail['canvas'] is None
    with workspace_scope(a):
        assert canvases.get(value['id'])['revision'] == 1


def test_document_versions_and_deletion_are_scoped():
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    version_token = documents.read_versions.set({})
    try:
        with workspace_scope(a):
            documents.put('folders', 'same-id', {'space': 'A'})
            documents.put('folders', 'same-id', {'space': 'A2'})
            assert documents.get('folders', 'same-id') == {'space': 'A2'}
        with workspace_scope(b):
            assert documents.get('folders', 'same-id') is None
            assert documents.put('folders', 'same-id', {'space': 'B'}) == 1
            assert [r['value'] for r in documents.list_values('folders')] == [{'space': 'B'}]
        with workspace_scope(a):
            assert documents.put('folders', 'same-id', {'space': 'A3'}) == 3
            documents.delete('folders', 'same-id')
        with workspace_scope(b):
            assert documents.get('folders', 'same-id') == {'space': 'B'}
    finally:
        documents.read_versions.reset(version_token)


def test_history_pages_cursor_and_delete_are_scoped():
    from app.storage import documents, history
    from app.storage.workspace import workspace_scope
    a, b = spaces()
    for wid in (a, b):
        with workspace_scope(wid):
            for n in range(3):
                documents.put('history', str(n), {'timestamp': n, 'images': [{'url': wid}]})
    with workspace_scope(a):
        first = history.page(limit=1)
        assert first['items'][0]['images'][0]['url'] == a
        assert history.page(limit=1, cursor=first['next_cursor'])['items'][0]['timestamp'] == 1
        assert history.delete_timestamp(2)
    with workspace_scope(b):
        with pytest.raises(HTTPException) as wrong_cursor:
            history.page(limit=1, cursor=first['next_cursor'])
        assert wrong_cursor.value.status_code == 400
        assert len(history.legacy_list()) == 3
        assert all(r['images'][0]['url'] == b for r in history.page()['items'])


def test_parallel_storage_scopes_and_exception_unwind():
    from app.storage import documents
    from app.storage.workspace import current_workspace, workspace_scope
    a, b = spaces()
    barrier = threading.Barrier(2)

    def write(wid):
        with workspace_scope(wid):
            barrier.wait(timeout=10)
            documents.put('concurrent', 'same-id', {'workspace': wid})
            barrier.wait(timeout=10)
            return documents.get('concurrent', 'same-id')

    with ThreadPoolExecutor(2) as pool:
        assert list(pool.map(write, [a, b])) == [{'workspace': a}, {'workspace': b}]
    with workspace_scope(a):
        with pytest.raises(ValueError):
            with workspace_scope(b):
                raise ValueError('leave nested context')
        assert current_workspace() == a
    assert current_workspace() == 'default'


def test_member_storage_without_explicit_scope_fails_closed(monkeypatch):
    from app.storage import documents
    from app.storage.workspace import workspace_scope
    monkeypatch.setenv('AUTH_MODE', 'members')
    with pytest.raises(RuntimeError, match='explicit authorized workspace'):
        documents.get('folders')
    with pytest.raises(ValueError):
        with workspace_scope(None):
            pass
