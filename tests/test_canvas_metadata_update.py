"""Directory edits must not rewrite canvas contents or bypass edit ownership."""
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from app.storage import canvases
from app.storage.workspace import workspace_scope
from app.services.member_context import current_access


def test_metadata_only_updates_directory_fields_and_preserves_timestamp():
    now = datetime.now(timezone.utc)
    row = dict(id='canvas', title='renamed', kind='classic', revision=8,
               created_at=now, updated_at=now, deleted_at=None,
               document={'cover_style': 'sage', 'node_count': 554})
    conn = Mock()
    conn.execute.return_value.fetchone.return_value = row
    value = {'id': 'canvas', 'revision': 7, 'title': 'renamed', 'cover_style': 'sage',
             'nodes': [{'url': '/assets/missing.png'}], 'logs': [{'amount': 123}],
             'updated_at': 123, 'deleted_at': 456}

    @contextmanager
    def connection():
        yield conn

    with patch.object(canvases, 'connection', connection), workspace_scope('isolated'), \
         patch('app.storage.media.normalize_document', side_effect=AssertionError('must not inspect media')):
        canvases.save_metadata(value)
    query, args = conn.execute.call_args_list[0].args
    assert args[1].obj == {'title': 'renamed', 'cover_style': 'sage'}
    assert args[3:] == ('isolated', 'canvas', 7)
    assignment = query.split('WHERE')[0]
    assert 'updated_at=' not in assignment and 'deleted_at=' not in assignment
    assert 'document=document ||' in assignment and 'revision=revision+1' in assignment
    assert value['revision'] == 8
    assert value['nodes'] == [{'url': '/assets/missing.png'}]
    assert value['logs'] == [{'amount': 123}]
    assert 'canvas_asset_groups' in conn.execute.call_args.args[0]
    assert 'items=' not in conn.execute.call_args.args[0]


def test_metadata_conflict_does_not_update_asset_group():
    conn = Mock()
    conn.execute.return_value.fetchone.return_value = None

    @contextmanager
    def connection():
        yield conn

    with patch.object(canvases, 'connection', connection), pytest.raises(HTTPException) as error:
        canvases.save_metadata({'id': 'canvas', 'revision': 4, 'cover_style': 'ink'})
    assert error.value.status_code == 409
    assert conn.execute.call_count == 1


def test_metadata_requires_current_edit_lease_before_update():
    conn = Mock()

    @contextmanager
    def connection():
        yield conn

    token = current_access.set(SimpleNamespace(principal=SimpleNamespace(member_id='member')))
    try:
        with patch.object(canvases, 'connection', connection), \
             patch('app.services.canvas_leases.request_write', side_effect=HTTPException(409, 'lease lost')) as guard, \
             pytest.raises(HTTPException):
            canvases.save_metadata({'id': 'canvas', 'revision': 4, 'cover_style': 'ink'})
        guard.assert_called_once_with(conn, 'canvas')
        conn.execute.assert_not_called()
    finally:
        current_access.reset(token)
