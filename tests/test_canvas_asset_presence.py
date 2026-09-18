"""Opening a cloud canvas must not download its originals or block other requests."""
import asyncio
from contextlib import contextmanager
import threading
from unittest.mock import Mock, patch

import httpx
from fastapi import FastAPI

from app.models import CanvasAssetCheckRequest
from app.routers import canvas
from app.storage import media_presence
from app.storage.workspace import workspace_scope


def test_metadata_lookup_batches_aliases_and_scopes_ready_assets():
    asset_id = 'ast_' + 'a' * 32
    direct = '/assets/cloud/' + asset_id + '/image.png'
    alias = '/assets/input/old%20image.png?workspace=elsewhere'
    missing = '/assets/input/missing.png'
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [{'legacy_ref': '/assets/input/old image.png', 'asset_id': asset_id}]),
        Mock(fetchall=lambda: [{'id': asset_id}]),
    ]

    @contextmanager
    def connection():
        yield conn

    with patch.object(media_presence, 'connection', connection), workspace_scope('isolated'):
        assert media_presence.existing_references([direct, alias, missing]) == {
            direct: True, alias: True, missing: False,
        }
    assert conn.execute.call_count == 2
    assert all(call.args[1][0] == 'isolated' for call in conn.execute.call_args_list)
    query, params = conn.execute.call_args.args
    assert params == ('isolated', [asset_id])
    assert "status='ready'" in query and 'deleted_at IS NULL' in query
    assert "role<>'task-result-source'" in query


def test_cloud_check_does_not_download_or_block_event_loop():
    app = FastAPI()
    app.post('/check')(canvas.check_canvas_assets)
    entered, release = threading.Event(), threading.Event()

    @app.get('/ping')
    async def ping():
        return {'ok': True}

    def slow_metadata(refs):
        entered.set()
        assert release.wait(3)
        return {ref: True for ref in refs}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            check = asyncio.create_task(client.post('/check', json={'urls': ['/assets/a.png']}))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                assert (await asyncio.wait_for(client.get('/ping'), 0.5)).json() == {'ok': True}
            finally:
                release.set()
            assert (await check).json() == {'exists': {'/assets/a.png': True}}

    with patch.object(canvas, 'postgres_enabled', return_value=True), \
         patch.object(media_presence, 'existing_references', side_effect=slow_metadata), \
         patch.object(canvas, 'output_file_from_url', side_effect=AssertionError('must not download')):
        asyncio.run(run())


def test_local_checks_keep_filesystem_behavior():
    with patch.object(canvas, 'postgres_enabled', return_value=False), \
         patch.object(canvas, 'output_file_from_url', side_effect=lambda url: url.endswith('yes.png')):
        result = canvas.check_canvas_assets(CanvasAssetCheckRequest(
            urls=['/assets/yes.png', '/output/no.png', 'https://example.org/image.png', '']))
    assert result == {'exists': {'/assets/yes.png': True, '/output/no.png': False,
                                 'https://example.org/image.png': True}}
