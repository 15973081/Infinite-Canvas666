"""Slow storage must not prevent unrelated ASGI requests from being served."""
import asyncio
import threading
import time
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI

from app.routers import canvas, cloud_media, history, prompt, upload


@pytest.mark.parametrize('endpoint,target,path', [
    (canvas.get_canvas, 'app.routers.canvas.load_canvas', '/probe/c'),
    (canvas.list_canvas_backups, 'app.storage.backups.list_backups', '/probe/c'),
    (history.get_history_page, 'app.storage.history.page', '/probe'),
    (prompt.get_prompt_libraries, 'app.routers.prompt.public_prompt_libraries', '/probe'),
])
def test_slow_storage_does_not_block_ping(endpoint, target, path):
    app = FastAPI()
    app.get('/probe/{canvas_id}' if path.endswith('/c') else '/probe')(endpoint)
    entered, release = threading.Event(), threading.Event()
    def slow(*args, **kwargs):
        entered.set()
        assert release.wait(3)
        return {}
    @app.get('/ping')
    async def ping(): return {'ok': True}
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            task = asyncio.create_task(client.get(path))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                assert (await asyncio.wait_for(client.get('/ping'), .5)).status_code == 200
            finally:
                release.set()
            assert (await task).status_code == 200
    with patch(target, side_effect=slow), patch.object(canvas,'postgres_enabled',return_value=True), \
         patch.object(history,'postgres_enabled',return_value=True):
        asyncio.run(run())


def test_preview_content_entry_point_shares_bounded_workers_and_single_flight():
    app = FastAPI()
    app.include_router(cloud_media.router)
    app.include_router(upload.router)
    guard = threading.Lock()
    state = {'active':0, 'peak':0, 'builds':0}
    cached = {}
    def lookup(ref, ready=True):
        if ready:
            return {'id':ref,'status':'ready','workspace_id':'default'}
        return cached.get(ref)
    def build(asset, media_id, width):
        with guard:
            state['active'] += 1
            state['peak'] = max(state['peak'],state['active'])
            state['builds'] += 1
        time.sleep(.04)
        with guard:
            state['active'] -= 1
            cached[media_id] = {'id':media_id,'status':'ready'}
        return cached[media_id]
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            paths = [f'/api/media/ast_{i:032x}/content?variant=preview' for i in range(12)]
            paths += [f'/api/media-preview?url=ast_{i:032x}' for i in range(12)]
            results = await asyncio.gather(*(client.get(path) for path in paths))
        assert all(r.status_code == 307 for r in results)
    with patch.object(cloud_media,'postgres_enabled',return_value=True), \
         patch.object(upload,'postgres_enabled',return_value=True), \
         patch.object(cloud_media.media,'get_asset',side_effect=lookup), \
         patch.object(cloud_media.media,'browser_url',return_value='https://example.invalid/preview'), \
         patch.object(cloud_media,'_build_preview',side_effect=build):
        asyncio.run(run())
    assert 1 < state['peak'] <= 4
    assert state['builds'] == 12
