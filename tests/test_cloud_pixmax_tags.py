"""Canvas-owned tag metadata, workflow round-trip and read-only pin exports."""
import io
import json
import os
import zipfile

import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
TAGS = [{'id': 'blue', 'color': '#4285F4', 'name': '剧情素材'}]


def test_pixmax_tag_metadata_saves_with_canvas_and_survives_older_clients(world):
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    node = {'id': 'story', 'type': 'smart-prompt', 'text': '剧本', 'tags': ['blue'], 'pinned': True}
    response = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': [node], 'connections': [], 'node_tags': TAGS, 'base_revision': canvas['revision']})
    assert response.status_code == 200, response.text
    saved = response.json()['canvas']
    assert saved['node_tags'] == TAGS
    legacy = world['editor'].put(path, headers=proof(world, lease, saved['revision']), json={
        'nodes': [node], 'connections': [], 'base_revision': saved['revision']})
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()['canvas']['node_tags'] == TAGS
    assert world['viewer'].get(path, headers=headers(world['a'])).json()['canvas']['node_tags'] == TAGS
    denied = world['viewer'].put(path, headers=headers(world['a']), json={
        'nodes': [node], 'node_tags': [], 'base_revision': legacy.json()['canvas']['revision']})
    assert denied.status_code == 403
    assert world['editor'].get(path, headers=headers(world['a'])).json()['canvas']['node_tags'] == TAGS


def test_pixmax_tag_validation_and_workflow_zip_round_trip(world):
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    invalid = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': [], 'node_tags': TAGS + TAGS, 'base_revision': canvas['revision']})
    assert invalid.status_code == 422
    invalid = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': [], 'node_tags': [{'id': 'blue', 'color': 'red;display:none'}], 'base_revision': canvas['revision']})
    assert invalid.status_code == 422
    nodes = [{'id': 'story', 'type': 'smart-prompt', 'text': '剧情', 'tags': ['blue']}]
    exported = world['editor'].post('/api/canvas-workflows/export', headers=headers(world['a']), json={
        'nodes': nodes, 'connections': [], 'node_tags': TAGS, 'include_resources': False})
    assert exported.status_code == 200, exported.text
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        payload = json.loads(archive.read('workflow.json'))
    assert payload['node_tags'] == TAGS
    imported = world['editor'].post('/api/canvas-workflows/import', headers=headers(world['a']),
        files={'file': ('tags.zip', exported.content, 'application/zip')})
    assert imported.status_code == 200, imported.text
    assert imported.json()['node_tags'] == TAGS
    assert imported.json()['workflow']['node_tags'] == TAGS
    assert imported.json()['nodes'][0]['tags'] == ['blue']


def test_pixmax_pin_text_download_is_available_to_readonly_members(world):
    result = world['viewer'].post('/api/canvas-assets/download', headers=headers(world['a']), json={
        'items': [{'kind': 'text', 'name': '雨夜剧本.txt', 'text': '雨夜的街景'}], 'filename': 'pin.zip'})
    assert result.status_code == 200, result.text
    with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
        assert archive.read('雨夜剧本.txt').decode('utf-8') == '雨夜的街景'
