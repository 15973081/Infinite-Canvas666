"""Actual frontend import client against isolated workspace HTTP APIs."""
import io
import json
import os
import subprocess
from pathlib import Path

import pytest
from test_cloud_member_gateway import operator, world, headers

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('multi', [False, True])
def test_online_results_enter_new_classic_smart_existing_and_library_without_generation(world, tmp_path, monkeypatch, multi):
    from PIL import Image
    monkeypatch.setenv('OBJECT_STORE_ROOT', str(tmp_path / 'objects'))
    client, head = world['editor'], headers(world['a'])
    images = []
    for color in ['red', 'blue']:
        buffer = io.BytesIO()
        Image.new('RGB', (96, 64), color).save(buffer, 'PNG')
        response = client.post('/api/ai/upload', files={'files': (color + '.png', buffer.getvalue(), 'image/png')}, headers=head)
        assert response.status_code == 200, response.text
        images.append(response.json()['files'][0]['url'])
    created = client.post('/api/canvases', headers=head, json={'title': '已有画布'})
    assert created.status_code == 200, created.text
    existing = created.json()['canvas']['id']
    libraries = client.get('/api/asset-library', headers=head).json()['library']['libraries']
    library = libraries[0]
    category = next(cat for cat in library['categories'] if cat['type'] == 'image')
    before = len(category['items'])
    settings = {'existing': existing, 'data': {'timestamp': 123, 'prompt': '保留完整提示词', 'images': images},
                'library': {'library_id': library['id'], 'category_id': category['id']}}
    if multi:
        settings['data'] = [{'timestamp': 123, 'prompt': '保留完整提示词', 'images': [images[0]]},
                            {'timestamp': 456, 'prompt': '第二条作品的提示词', 'images': [images[1]]}]
    root = Path(__file__).resolve().parents[1]
    process = subprocess.Popen(['node', str(root / 'tests/helpers/online-import-http.cjs'), json.dumps(settings)], cwd=root,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8',
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    done, requests = None, []
    try:
        for line in process.stdout:
            message = json.loads(line)
            if message.get('done'):
                done = message
                break
            requests.append(message)
            response = client.request(message['method'], message['path'], headers={**head, **message['headers']}, content=message.get('body'))
            process.stdin.write(json.dumps({'id': message['id'], 'status': response.status_code, 'body': response.json()}) + '\n')
            process.stdin.flush()
        process.wait(timeout=10)
        assert process.returncode == 0, process.stderr.read()
        assert done and done['count'] == 2
        assert [canvas['kind'] for canvas in done['canvases']] == ['classic', 'smart', 'classic']
        for canvas in done['canvases']:
            path = '/api/canvases/' + canvas['id']
            stored = client.get(path, headers=head).json()['canvas']
            assert len(stored['nodes']) == (4 if multi else 3)
            prompts = [node['text'] for node in stored['nodes'] if node['type'].endswith('prompt')]
            assert prompts == (['保留完整提示词', '第二条作品的提示词'] if multi else ['保留完整提示词'])
            assert stored['revision'] > 0
            assert client.get(path + '/edit-lease', headers=head).json()['holder'] is None
        items = client.get('/api/asset-library', headers=head).json()['library']['libraries'][0]['categories'][0]['items']
        assert len(items) == before + 2
        assert all(item['media_asset_id'] for item in items[-2:])
        assert len([r for r in requests if r['path'].endswith('/items/batch')]) == 1
        assert not any('/tasks' in r['path'] or '/upload' in r['path'] for r in requests)
        assert world['viewer'].post('/api/asset-library/items/batch', headers=head, json={**settings['library'], 'items': [{'url': images[0]}]}).status_code == 403
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
