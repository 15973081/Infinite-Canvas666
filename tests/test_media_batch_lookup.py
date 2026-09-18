from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from app.storage import media
from app.storage.workspace import workspace_scope
from app.services.member_context import current_access


def test_thousands_of_repeated_media_references_use_two_queries():
    aid = 'ast_' + 'a' * 32
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [{'legacy_ref': '/assets/input/old.png', 'asset_id': aid}]),
        Mock(fetchall=lambda: [{'id': aid, 'status': 'ready', 'deleted_at': None,
                               'role': 'original', 'display_name': 'image.png'}]),
    ]
    @contextmanager
    def connection():
        yield conn
    source = {'nodes': [{'url': '/assets/input/old.png', 'prompt': '/assets/input/old.png'}]*2000,
              'logs': [{'url': '/assets/input/historical.png', 'amount': 123.45}]}
    with workspace_scope('isolated'), patch.object(media, 'connection', connection):
        value = media.normalize_document(source)
    assert conn.execute.call_count == 2
    assert all(call.args[1][0] == 'isolated' for call in conn.execute.call_args_list)
    assert value['nodes'][0]['url'] == '/assets/cloud/' + aid + '/image.png'
    assert value['nodes'][0]['media_asset_id'] == aid
    assert value['nodes'][0]['prompt'] == source['nodes'][0]['prompt']
    assert value['logs'] == source['logs']
    assert source['nodes'][0]['url'] == '/assets/input/old.png'


@pytest.mark.parametrize('row', [None, {'status':'deleted','deleted_at':None,'role':'original'},
                                 {'status':'pending','deleted_at':None,'role':'original'},
                                 {'status':'ready','deleted_at':'yesterday','role':'original'},
                                 {'status':'ready','deleted_at':None,'role':'task-result-source'}])
def test_bulk_lookup_rejects_missing_unready_deleted_and_internal_assets(row):
    aid = 'ast_' + 'b' * 32
    conn = Mock()
    conn.execute.return_value.fetchall.return_value = [] if row is None else [dict(row,id=aid)]
    @contextmanager
    def connection(): yield conn
    token = current_access.set(object())
    try:
        with patch.object(media, 'connection', connection), pytest.raises(HTTPException) as error:
            media.get_assets([aid])
        assert error.value.status_code == 404
    finally:
        current_access.reset(token)
