"""MediaKit REST contract through real workspace admission and result delivery."""
import copy
import os
import socket
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_management import platform
from test_cloud_audio_tasks import execute

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
VIDEO = Path(__file__).parent / 'fixtures' / 'pixmax-audio-source.mp4'
KEY = 'mediakit-test-only-secret'


def prepare(world, platform, model):
    pid = 'mediakit-' + uuid.uuid4().hex[:16]
    response = platform['client'].put('/api/providers/' + pid, json={
        'config': {'name': 'MediaKit 验收', 'protocol': 'mediakit', 'enabled': True,
                   'base_url': 'https://mediakit.test', 'video_models': ['enhance-video', 'erase-video-subtitle'],
                   'chat_models': ['video-understand-router']},
        'expected_version': 0, 'secrets': {'api_key': KEY}, 'reason': '隔离验收'})
    assert response.status_code == 200, response.text
    response = platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={
        'expected_version': 1, 'provider_ids': [pid], 'primary_provider_id': pid, 'reason': '隔离验收'})
    assert response.status_code == 200, response.text
    uploaded = world['editor'].post('/api/ai/upload', headers=headers(world['a']),
                                    files={'files': ('input.mp4', VIDEO.read_bytes(), 'video/mp4')})
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()['files'][0]['url']
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    node = {'id': 'source', 'x': 0, 'y': 0, 'w': 320, 'images': [{'url': url, 'kind': 'video', 'name': 'input.mp4'}]}
    target = {'id': 'target', 'x': 400, 'y': 0, 'w': 320, 'images': [], 'outputKind': 'video'}
    saved = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': [node, target], 'connections': [{'from': 'source', 'to': 'target'}], 'base_revision': canvas['revision']})
    assert saved.status_code == 200, saved.text
    canvas = saved.json()['canvas']
    body = {'mediakit': True, 'canvas_id': canvas['id'], 'client_task_id': 'canvas_mediakit_' + uuid.uuid4().hex,
            'provider_id': pid, 'model': model, 'videos': [url],
            'canvas_target': {'source_node_id': 'source', 'target_node_id': 'source' if model == 'video-understand-router' else 'target',
                              'base_revision': canvas['revision']}}
    if model == 'video-understand-router':
        body.update(prompt='描述视频中的动作', level='Balanced')
    if model == 'enhance-video':
        body.update(resolution='4k', tool_version='professional')
    return path, lease, body


def submit(world, lease, body):
    return world['editor'].post('/api/canvas-mediakit-tasks', headers=proof(world, lease, body['canvas_target']['base_revision']), json=body)


class Supplier:
    def __init__(self, model):
        self.model, self.calls, self.uploads, self.polls = model, [], [], []
        self.pending = False
        self.ambiguous = False

    async def post(self, client, url, **kwargs):
        assert kwargs['headers']['Authorization'] == 'Bearer ' + KEY
        self.calls.append((url, copy.deepcopy(kwargs['json'])))
        if url.endswith('request-media-upload-url'):
            value = {'result': {'file_id': 'mediakit://video-1', 'method': 'PUT', 'upload_url': 'https://upload.test/video',
                                'upload_headers': [{'key': 'x-upload-token', 'value': 'upload-only'}]}}
        else:
            if self.ambiguous:
                raise httpx.ReadTimeout('Simulated lost response')
            value = {'task_id': 'mk-job-1'}
        return httpx.Response(200, request=httpx.Request('POST', url), json=value)

    async def put(self, client, url, **kwargs):
        assert 'Authorization' not in kwargs['headers']
        assert kwargs['headers']['x-upload-token'] == 'upload-only'
        self.uploads.append(b''.join([chunk async for chunk in kwargs['content']]))
        return httpx.Response(200, request=httpx.Request('PUT', url))

    async def get(self, client, url, **kwargs):
        self.polls.append(url)
        result = {'contents': ['视频中人物沿街行走。'], 'token_usage': {'input_tokens': 21, 'output_tokens': 9, 'total_tokens': 30}} if self.model == 'video-understand-router' else {'video_url': 'https://result.test/video.mp4', 'duration': 1}
        return httpx.Response(200, request=httpx.Request('GET', url), json={'status': 'running' if self.pending else 'completed', 'result': result})

    @asynccontextmanager
    async def stream(self, client, method, url, **kwargs):
        assert url == 'https://result.test/video.mp4'
        assert not any(key.lower() == 'authorization' for key in kwargs.get('headers', {}))
        yield httpx.Response(200, request=httpx.Request(method, url), content=VIDEO.read_bytes(), headers={'Content-Type': 'video/mp4'})

    def context(self):
        from contextlib import ExitStack
        stack = ExitStack()
        for name in ['post', 'put', 'get', 'stream']:
            handler = getattr(self, name)
            # Patch descriptors so the Httpx client is passed as the first argument.
            stack.enter_context(patch.object(httpx.AsyncClient, name, lambda client, *args, _handler=handler, **kwargs: _handler(client, *args, **kwargs)))
        stack.enter_context(patch.object(socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', 443))]))
        return stack


@pytest.mark.parametrize('model', ['enhance-video', 'erase-video-subtitle', 'video-understand-router'])
def test_mediakit_contract_owned_results_and_polling_recovery(world, platform, model):
    path, lease, body = prepare(world, platform, model)
    public = world['editor'].get('/api/config', headers=headers(world['a'])).json()
    provider = next(item for item in public['api_providers'] if item['id'] == body['provider_id'])
    assert set(provider['mediakit_tools']) == {'enhance-video', 'erase-video-subtitle', 'video-understand-router'}
    assert provider['video_models'] == provider['chat_models'] == [] and KEY not in str(public)
    receipt = submit(world, lease, body)
    assert receipt.status_code == 200, receipt.text
    assert submit(world, lease, body).json()['task_id'] == body['client_task_id']
    supplier = Supplier(model)
    supplier.pending = True
    with supplier.context():
        pending = execute(world, body['client_task_id'])
        assert pending['status'] == 'polling', pending
        # Simulate a process dying after persisting its upstream ID, including
        # understanding tasks whose ordinary kind is llm rather than video.
        from app.storage import tasks, database
        from app.storage.workspace import workspace_scope
        with workspace_scope(world['a']['id']), database.connection() as conn:
            conn.execute("UPDATE tasks SET status='submitting',lease_owner='crashed-worker',lease_token=gen_random_uuid(),lease_until='2000-01-01' WHERE id=%s", (body['client_task_id'],))
            tasks.recover_expired()
            assert tasks.get(body['client_task_id'])['status'] == 'polling'
        supplier.pending = False
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded', task
    assert supplier.uploads == [VIDEO.read_bytes()]
    assert len(supplier.calls) == 2 and len(supplier.polls) == 2
    assert supplier.calls[0][1] == {'tool_name': model}
    wire = supplier.calls[1][1]
    assert supplier.calls[1][0] == 'https://mediakit.test/api/v1/tools/' + model
    if model == 'video-understand-router':
        assert wire == {'video_urls': ['mediakit://video-1'], 'prompt': body['prompt'], 'level': 'Balanced'}
        assert task['result']['text'] == '视频中人物沿街行走。'
        assert task['result']['usage']['total_tokens'] == 30
    else:
        expected = {'video_url': 'mediakit://video-1'}
        if model == 'enhance-video':
            expected.update(resolution='4k', tool_version='professional')
        assert wire == expected
        output = task['result']['videos'][0]
        assert world['viewer'].get(output, headers=headers(world['a'])).content == VIDEO.read_bytes()
    document = world['viewer'].get(path, headers=headers(world['a'])).json()['canvas']
    assert next(node for node in document['nodes'] if node['id'] == 'source')['images'][0]['url'] == body['videos'][0]
    assert ('视频中人物沿街行走。' if model == 'video-understand-router' else task['result']['videos'][0]) in str(document)
    assert KEY not in str(task) and 'upload-only' not in str(task)


def test_mediakit_authorization_and_unknown_submission_never_repeat(world, platform):
    _, lease, body = prepare(world, platform, 'enhance-video')
    assert world['viewer'].post('/api/canvas-mediakit-tasks', headers=headers(world['a']), json=body).status_code == 403
    assert submit(world, lease, {**body, 'provider_id': 'unassigned'}).status_code in {400, 403}
    assert submit(world, lease, {**body, 'model': 'unknown'}).status_code == 422
    assert submit(world, lease, {**body, 'api_key': 'must-not-accept'}).status_code == 422
    assert submit(world, lease, {**body, 'videos': ['https://outside.test/video.mp4']}).status_code == 400
    assert submit(world, lease, body).status_code == 200
    supplier = Supplier('enhance-video')
    supplier.ambiguous = True
    with supplier.context():
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'needs_review', task
    assert len(supplier.calls) == 2
    assert submit(world, lease, body).json()['task_id'] == body['client_task_id']
    queried = world['editor'].get('/api/canvas-mediakit-tasks/' + body['client_task_id'], headers=headers(world['a']))
    assert queried.status_code == 200 and queried.json()['status'] == 'needs_review'
    assert world['editor'].get('/api/canvas-mediakit-tasks/' + body['client_task_id'], headers=headers(world['b'])).status_code in {403, 404}
