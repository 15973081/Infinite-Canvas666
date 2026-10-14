"""Persist and transfer annotation media and its graph through the real member API."""
import io
import json
import os
from pathlib import Path
import zipfile

from PIL import Image, ImageDraw
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def annotation_graph(world):
    image = Image.new('RGB', (160, 90), 'green')
    ImageDraw.Draw(image).line([(30, 30), (100, 60)], fill='white', width=4)
    png = io.BytesIO()
    image.save(png, format='PNG')
    video = (Path(__file__).parent / 'fixtures' / 'pixmax-audio-source.mp4').read_bytes()
    uploaded = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files=[
        ('files', ('source.mp4', video, 'video/mp4')),
        ('files', ('00:00-mark.png', png.getvalue(), 'image/png'))])
    assert uploaded.status_code == 200, uploaded.text
    source, marked = uploaded.json()['files']
    nodes = [
        {'id': 'source', 'type': 'smart-image', 'images': [{**source, 'kind': 'video'}]},
        {'id': 'marked', 'type': 'smart-image', 'images': [{**marked, 'kind': 'image', 'processingTool': 'video-annotation', 'sourceMediaUrl': source['url']}]},
        {'id': 'edit', 'type': 'smart-image', 'generationKind': 'video', 'images': [], 'annotationSourceNodeId': 'source',
         'annotationImageNodeIds': ['marked'], 'promptDraftText': '@图片1',
         'promptDraftHtml': f'<span class="mention-image-token" data-node-id="marked" data-url="{marked["url"]}">@图片1</span>',
         'pixmaxAnnotationPrompt': '%%@[mark][image][0](marked)%%', 'runSettings': {'engine': 'api', 'apiKind': 'video', 'videoTaskMode': 'edit'}}]
    connections = [{'from': value, 'to': 'edit', 'kind': 'input'} for value in ('source', 'marked')]
    return nodes, connections


def test_pixmax_annotation_graph_save_reload_and_member_access(world):
    nodes, connections = annotation_graph(world)
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    saved = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': nodes, 'connections': connections, 'base_revision': canvas['revision']})
    assert saved.status_code == 200, saved.text
    document = world['viewer'].get(path, headers=headers(world['a'])).json()['canvas']
    assert document['nodes'][2]['annotationImageNodeIds'] == ['marked']
    assert document['nodes'][2]['annotationSourceNodeId'] == 'source'
    assert document['connections'] == connections
    assert world['viewer'].get(nodes[1]['images'][0]['url'], headers=headers(world['a'])).content.startswith(b'\x89PNG')
    denied = world['viewer'].put(path, headers=headers(world['a']), json={
        'nodes': [], 'connections': [], 'base_revision': document['revision']})
    assert denied.status_code == 403


def test_pixmax_annotation_zip_preserves_owned_media_and_generation_graph(world):
    nodes, connections = annotation_graph(world)
    exported = world['editor'].post('/api/canvas-workflows/export', headers=headers(world['a']), json={
        'nodes': nodes, 'connections': connections, 'include_resources': True})
    assert exported.status_code == 200, exported.text
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        workflow = json.loads(archive.read('workflow.json'))
        assert len(workflow['resources']) == 2
        assert any(archive.read(name).startswith(b'\x89PNG') for name in archive.namelist() if name.startswith('resources/'))
    result = world['editor'].post('/api/canvas-workflows/import', headers=headers(world['a']),
        files={'file': ('annotation.zip', exported.content, 'application/zip')})
    assert result.status_code == 200, result.text
    imported = result.json()
    assert imported['connections'] == connections
    assert imported['nodes'][2]['annotationImageNodeIds'] == ['marked']
    assert imported['nodes'][2]['pixmaxAnnotationPrompt'] == nodes[2]['pixmaxAnnotationPrompt']
    assert imported['nodes'][1]['images'][0]['processingTool'] == 'video-annotation'
    assert world['editor'].get(imported['nodes'][1]['images'][0]['url'], headers=headers(world['a'])).content.startswith(b'\x89PNG')
