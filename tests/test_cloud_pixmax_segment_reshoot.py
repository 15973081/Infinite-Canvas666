"""Native browser reshoot preparation and real isolated upload/task ownership."""
import json
import os
import re
import io
import zipfile
from pathlib import Path
import subprocess
import uuid
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def test_pixmax_segment_reshoot_actual_browser_crops_uploads_binds_one_edit_task_and_saves_owned_result(world, platform, tmp_path):
    from app.storage import database, tasks, media
    from app.storage.workspace import workspace_scope
    model = 'doubao-seedance-2-5-pro'
    provider_id = 'reshoot-' + uuid.uuid4().hex[:16]
    configured = platform['client'].put('/api/providers/' + provider_id, json={'config': {'name': '重拍隔离验收', 'base_url': 'https://supplier.test/api/v3', 'protocol': 'volcengine', 'enabled': True, 'video_models': [model]}, 'expected_version': 0, 'secrets': {'api_key': 'test-only-reshoot'}, 'reason': '隔离验收'})
    assert configured.status_code == 200, configured.text
    assigned = platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={'expected_version': 1, 'provider_ids': [provider_id], 'primary_provider_id': provider_id, 'reason': '隔离验收'})
    assert assigned.status_code == 200, assigned.text
    provider = next(item for item in world['editor'].get('/api/config', headers=headers(world['a'])).json()['api_providers'] if item['id'] == provider_id)
    video = tmp_path / 'reshoot-source.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=24', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', str(video)], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    uploaded = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': (video.name, video.read_bytes(), 'video/mp4')})
    assert uploaded.status_code == 200, uploaded.text
    source = uploaded.json()['files'][0]
    path, canvas = setup_canvas(world, 'smart')
    root = Path(__file__).resolve().parents[1]
    process = subprocess.Popen(['node', str(root / 'tests/helpers/pixmax-segment-reshoot-http.cjs')], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    done, task_ids, finalized = False, [], set()
    try:
        process.stdin.write(json.dumps({'initial': {'directory': str(tmp_path), 'canvas': canvas, 'source': source, 'provider': provider, 'member': world['people'][0]['id'], 'workspace': world['a']['id']}}) + '\n'); process.stdin.flush()
        for line in process.stdout:
            pointer = json.loads(line)
            if pointer.get('done'): done = True; break
            assert re.fullmatch(r'request-\d+\.json', pointer['file'])
            message = json.loads((tmp_path / pointer['file']).read_text(encoding='utf-8'))
            if message['method'] == 'GET' and message['path'].startswith('/api/canvas-video-tasks/'):
                task_id = message['path'].split('/')[-1].split('?')[0]
                if task_id in task_ids and task_id not in finalized:
                    # Supplier completion is simulated; all browser/media/DB work is real.
                    with workspace_scope(world['a']['id']):
                        claimed = tasks.claim('reshoot-test-worker'); assert claimed['id'] == task_id
                        token = tasks.lease_context.set((task_id, claimed['lease_token']))
                        try:
                            value = tasks.get(task_id); request = tasks.request(task_id)
                            value.update(status='succeeded', result={'videos': request['videos']})
                            tasks.save(value); finalized.add(task_id)
                        finally: tasks.lease_context.reset(token); tasks.release(task_id, claimed['lease_token'])
            if message['bodyFile']: assert re.fullmatch(r'body-\d+\.bin', message['bodyFile'])
            content = (tmp_path / message['bodyFile']).read_bytes() if message['bodyFile'] else None
            response = world['editor'].request(message['method'], message['path'], headers={**message['headers'], **headers(world['a'])}, content=content)
            if message['method'] == 'POST' and message['path'] == '/api/canvas-video-tasks':
                assert response.status_code == 200, response.text
                task_ids.append(response.json()['task_id'])
            answer = {'id': message['id'], 'status': response.status_code}
            try: answer['body'] = response.json()
            except ValueError:
                binary_file = 'binary-' + str(message['id']) + '.bin'
                (tmp_path / binary_file).write_bytes(response.content)
                answer.update(binaryFile=binary_file, contentType=response.headers.get('content-type', 'application/octet-stream'))
            response_file = 'response-' + str(message['id']) + '.json'
            (tmp_path / response_file).write_text(json.dumps(answer), encoding='utf-8')
            process.stdin.write(json.dumps({'file': response_file}) + '\n'); process.stdin.flush()
        process.wait(timeout=5)
        assert process.returncode == 0, process.stderr.read()
        assert done and len(task_ids) == 1 and finalized == set(task_ids)
        saved = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
        node = next(item for item in saved['nodes'] if item.get('segmentReshoot'))
        assert node['segmentReshoot']['prompt'] == '将衣服改为红色' and len(node['images']) == 1
        assert len(node['segmentReshoot']['preparedMedia']) == 3
        with workspace_scope(world['a']['id']):
            request = tasks.request(task_ids[0])
            assert request['task_mode'] == 'edit' and request['provider_id'] == provider_id
            clip_id = media.id_from_ref(request['videos'][0]); assert clip_id != media.id_from_ref(source['url'])
            with database.connection() as conn:
                assert conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s', (task_ids[0],)).fetchone()['input_asset_ids'] == [clip_id]
        for item in node['segmentReshoot']['preparedMedia']:
            assert world['viewer'].get(item['url'], headers=headers(world['a'])).status_code == 200
            assert world['outsider'].get(item['url'], headers=headers(world['b'])).status_code in (403, 404)
        exported = world['editor'].post('/api/canvas-workflows/export', headers=headers(world['a']), json={'nodes': saved['nodes'], 'connections': saved['connections'], 'include_resources': True})
        assert exported.status_code == 200, exported.text
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            workflow = json.loads(archive.read('workflow.json'))
            assert len(workflow['resources']) == 4
        imported = world['editor'].post('/api/canvas-workflows/import', headers=headers(world['a']), files={'file': ('reshoot.zip', exported.content, 'application/zip')})
        assert imported.status_code == 200, imported.text
        copy = next(item for item in imported.json()['nodes'] if item.get('segmentReshoot'))
        assert len(copy['segmentReshoot']['preparedMedia']) == 3
        assert copy['segmentReshoot']['source']['media']['url'] != node['segmentReshoot']['source']['media']['url']
    finally:
        if process.poll() is None: process.kill(); process.wait(timeout=5)
        for handle in (process.stdin, process.stdout, process.stderr):
            try: handle.close()
            except OSError: pass
