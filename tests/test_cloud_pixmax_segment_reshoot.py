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


@pytest.mark.parametrize('import_mode', ['create', 'native', 'native-cache', 'references', 'parameters', 'model-switch', 'camera', 'subjects'])
def test_pixmax_segment_reshoot_actual_browser_crops_uploads_binds_one_edit_task_and_saves_owned_result(world, platform, tmp_path, import_mode):
    from app.storage import database, tasks, media
    from app.storage.workspace import workspace_scope
    model = 'doubao-seedance-2-5-pro'
    provider_id = 'reshoot-' + uuid.uuid4().hex[:16]
    configured = platform['client'].put('/api/providers/' + provider_id, json={'config': {'name': '重拍隔离验收', 'base_url': 'https://supplier.test/api/v3', 'protocol': 'volcengine', 'enabled': True, 'video_models': [model]}, 'expected_version': 0, 'secrets': {'api_key': 'test-only-reshoot'}, 'reason': '隔离验收'})
    assert configured.status_code == 200, configured.text
    secondary_id=provider_id+'-second' if import_mode=='model-switch' else None
    if secondary_id:
        configured=platform['client'].put('/api/providers/'+secondary_id,json={'config':{'name':'原生切换目标','base_url':'https://supplier.test/api/v3','protocol':'volcengine','enabled':True,'video_models':[model],'model_policies':{'video:'+model:{'resolutions':['480p']}}},'expected_version':0,'secrets':{'api_key':'test-only-selector'},'reason':'隔离验收'})
        assert configured.status_code==200,configured.text
    assigned = platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={'expected_version': 1, 'provider_ids': [provider_id, *([secondary_id] if secondary_id else [])], 'primary_provider_id': provider_id, 'reason': '隔离验收'})
    assert assigned.status_code == 200, assigned.text
    provider = next(item for item in world['editor'].get('/api/config', headers=headers(world['a'])).json()['api_providers'] if item['id'] == provider_id)
    secondary=next((item for item in world['editor'].get('/api/config',headers=headers(world['a'])).json()['api_providers'] if item['id']==secondary_id),None)
    video = tmp_path / 'reshoot-source.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=24', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', str(video)], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    uploaded = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': (video.name, video.read_bytes(), 'video/mp4')})
    assert uploaded.status_code == 200, uploaded.text
    source = uploaded.json()['files'][0]
    output = None
    if import_mode == 'parameters':
        output_file = tmp_path / 'supplier-result.mov'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=24', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-y', str(output_file)], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        output_info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(output_file)],text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
        assert len(output_info['streams'])==1 and output_info['streams'][0]['pix_fmt']=='yuv444p'
        response = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': (output_file.name, output_file.read_bytes(), 'video/quicktime')})
        assert response.status_code == 200, response.text
        output = response.json()['files'][0]
    references = []
    if import_mode in ('references', 'subjects'):
        for kind, extension, mime, arguments in [
            ('image', '.png', 'image/png', ['-i', str(video), '-frames:v', '1']),
            ('audio', '.wav', 'audio/wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2']),
            ('video', '.mp4', 'video/mp4', ['-ss', '2', '-i', str(video), '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']),
        ]:
            reference_file = tmp_path / ('reference-' + kind + extension)
            subprocess.run(['ffmpeg', '-v', 'error', *arguments, '-y', str(reference_file)], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            response = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': (reference_file.name, reference_file.read_bytes(), mime)})
            assert response.status_code == 200, response.text
            references.append({**response.json()['files'][0], 'kind': kind, 'name': '参考' + kind})
    subject = None
    if import_mode == 'subjects':
        response = world['editor'].post('/api/subject-library/PERSONAL/groups', headers=headers(world['a']),
            json={'expected_revision': 0, 'name': '摄影师主体', 'description': '黄昏的摄影师'})
        assert response.status_code == 200, response.text
        subject = {'id': response.json()['target_id'], 'name': '摄影师主体'}
        response = world['editor'].post('/api/subject-library/PERSONAL/groups/'+subject['id']+'/items', headers=headers(world['a']),
            json={'expected_revision': 1, 'kind': 'text', 'name': '剧情设定', 'text': '黄昏的街头，人物缓慢回头'})
        assert response.status_code == 200, response.text
        for index, item in enumerate(references):
            response = world['editor'].post('/api/subject-library/PERSONAL/groups/'+subject['id']+'/items', headers=headers(world['a']),
                json={'expected_revision': index+2, 'kind': item['kind'], 'name': item['name'], 'url': item['url']})
            assert response.status_code == 200, response.text
    native_document = None
    if import_mode in ('native', 'native-cache'):
        native_asset = {'assetsUuid': 'native-source', 'type': 'VIDEO', 'webUrl': source['url'], 'metaData': {'duration': 8}, 'width': 160, 'height': 90}
        native_data = {'segmentReshoot': True, 'label': '原生重拍'}
        native_params = {'model': 'PIXDANCE_2_5', 'referModel': 'videoEdit', 'duration': '4', 'aspectRatio': 'adaptive', 'reshootSourceAssetUuid': 'native-source', 'reshootStartSec': '1.0', 'reshootEndSec': '6.0', 'prompt': ''}
        native_document = {'nodes': [{'uuid': 'native-source-node', 'type': 'BASE_VIDEO', 'defaultAsset': native_asset}, {'uuid': 'native-target-node', 'type': 'GENERATE_VIDEO', 'defaultAsset': native_asset, 'prevNodeUuids': ['native-source-node'], 'metaData': {'position': {'x': 500, 'y': 100}, 'data': native_data}, 'params': native_params, 'generationTask': {'taskUuid': 'foreign-never-resume', 'status': 'RUNNING'}}]}
        if import_mode == 'native-cache':
            for asset_id, kind, arguments in [
                ('native-clip', 'VIDEO', ['-ss', '1', '-i', str(video), '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']),
                ('native-head', 'IMAGE', ['-ss', '1', '-i', str(video), '-frames:v', '1']),
                ('native-tail', 'IMAGE', ['-ss', '5.95', '-i', str(video), '-frames:v', '1']),
            ]:
                asset_file = tmp_path / (asset_id + ('.mp4' if kind == 'VIDEO' else '.jpg'))
                subprocess.run(['ffmpeg', '-v', 'error', *arguments, '-y', str(asset_file)], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                prepared = world['editor'].post('/api/ai/upload', headers=headers(world['a']), files={'files': (asset_file.name, asset_file.read_bytes(), 'video/mp4' if kind == 'VIDEO' else 'image/jpeg')})
                assert prepared.status_code == 200, prepared.text
                native_document['nodes'].append({'uuid': asset_id + '-node', 'type': 'BASE_VIDEO' if kind == 'VIDEO' else 'BASE_IMAGE', 'defaultAsset': {'assetsUuid': asset_id, 'type': kind, 'webUrl': prepared.json()['files'][0]['url'], 'metaData': {'duration': 5} if kind == 'VIDEO' else {}}})
            native_data['reshootClipCache'] = {'reshootSourceAssetUuid': 'native-source', 'reshootStartSec': '1.0', 'reshootEndSec': '6.0', 'clipAssetUuid': 'native-clip', 'headFrameAssetUuid': 'native-head', 'tailFrameAssetUuid': 'native-tail'}
            native_params.update(reshootClipAssetUuid='native-clip', reshootHeadFrameAssetUuid='native-head', reshootTailFrameAssetUuid='native-tail')
    path, canvas = setup_canvas(world, 'smart')
    root = Path(__file__).resolve().parents[1]
    process = subprocess.Popen(['node', str(root / 'tests/helpers/pixmax-segment-reshoot-http.cjs')], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    done, task_ids, finalized = False, [], set()
    try:
        process.stdin.write(json.dumps({'initial': {'directory': str(tmp_path), 'canvas': canvas, 'source': source, 'subject':subject, 'camera':import_mode=='camera', 'parameters': bool(output), 'references': references, 'nativeDocument': native_document, 'provider': provider, 'secondary':secondary, 'member': world['people'][0]['id'], 'workspace': world['a']['id']}}) + '\n'); process.stdin.flush()
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
                            value.update(status='succeeded', result={'videos': [output['url']] if output else request['videos'][:1]})
                            tasks.save(value); finalized.add(task_id)
                        finally: tasks.lease_context.reset(token); tasks.release(task_id, claimed['lease_token'])
            if message['bodyFile']: assert re.fullmatch(r'body-\d+\.bin', message['bodyFile'])
            content = (tmp_path / message['bodyFile']).read_bytes() if message['bodyFile'] else None
            response = world['editor'].request(message['method'], message['path'], headers={**message['headers'], **headers(world['a'])}, content=content)
            if message['method'] == 'POST' and message['path'] == '/api/canvas-video-tasks':
                assert response.status_code == 200, response.text
                task_ids.append(response.json()['task_id'])
                if output:
                    repeated=world['editor'].request(message['method'],message['path'],headers={**message['headers'],**headers(world['a'])},content=content)
                    assert repeated.status_code==200 and repeated.json()['task_id']==task_ids[-1]
                    changed=json.loads(content);changed['output_format']='mp4'
                    conflict=world['editor'].post(message['path'],headers={**message['headers'],**headers(world['a'])},json=changed)
                    assert conflict.status_code==409,conflict.text
            answer = {'id': message['id'], 'status': response.status_code}
            try: answer['body'] = response.json()
            except ValueError:
                binary_file = 'binary-' + str(message['id']) + '.bin'
                (tmp_path / binary_file).write_bytes(response.content)
                answer.update(binaryFile=binary_file, contentType=response.headers.get('content-type', 'application/octet-stream'), headers={key: response.headers[key] for key in ('content-range', 'accept-ranges', 'content-length') if key in response.headers})
            response_file = 'response-' + str(message['id']) + '.json'
            (tmp_path / response_file).write_text(json.dumps(answer), encoding='utf-8')
            process.stdin.write(json.dumps({'file': response_file}) + '\n'); process.stdin.flush()
        process.wait(timeout=5)
        assert process.returncode == 0, process.stderr.read()
        assert done and len(task_ids) == 1 and finalized == set(task_ids)
        saved = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
        node = next(item for item in saved['nodes'] if item.get('segmentReshoot'))
        assert len(node['images']) == 1
        if references:
            assert '将衣服改为红色' in node['segmentReshoot']['prompt']
            assert node['segmentReshoot']['prompt'].count('%%subject-ref(' if subject else '%%@[') == (1 if subject else 4)
            assert len([item for item in saved['nodes'] if item.get('hidden')]) == (4 if subject else 3)
            if subject:
                assert node['segmentReshoot']['subjects'][0]['groupId'] == subject['id']
                assert node['segmentReshoot']['subjects'][0]['memberId'] == world['people'][0]['id']
        elif import_mode=='camera':
            assert '将衣服改为红色' in node['segmentReshoot']['prompt']
            assert node['segmentReshoot']['prompt'].count('%%#[camera]')==1
        else:
            assert node['segmentReshoot']['prompt'] == '将衣服改为红色'
        assert len(node['segmentReshoot']['preparedMedia']) == 3
        assert node['segmentReshoot']['startSec'] == (1 if native_document else 0)
        assert node['segmentReshoot']['endSec'] == (6 if native_document else 4)
        assert 'foreign-never-resume' not in json.dumps(saved)
        actual_clip = world['editor'].get(node['segmentReshoot']['cache']['clipAssetUuid'], headers=headers(world['a']))
        assert actual_clip.status_code == 200
        clip_file = tmp_path / 'verified-clip.mp4'; clip_file.write_bytes(actual_clip.content)
        clip_info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(clip_file)], text=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)))
        assert abs(float(clip_info['format']['duration']) - (5 if native_document else 4)) < .15
        with workspace_scope(world['a']['id']):
            request = tasks.request(task_ids[0])
            assert request['task_mode'] == 'edit' and request['provider_id'] == (secondary_id or provider_id)
            if import_mode=='camera':
                assert 'Fujifilm GFX100 II' in request['prompt'] and 'ARRI Signature' in request['prompt']
                assert '%%#[' not in request['prompt']
            if secondary:
                assert request['resolution']=='480p'
                assert node['runSettings']['videoProvider']==secondary_id and node['runSettings']['videoResolution']=='480p'
            if output:
                assert request['output_format'] == 'mov' and request['generate_audio'] is False
                assert request['resolution'] == '1080p' and request['aspect_ratio'] == 'adaptive'
                assert node['runSettings']['videoOutputFormat'] == 'mov' and node['runSettings']['videoGenerateAudio'] is False
                assert media.id_from_ref(node['images'][0]['url']) == media.id_from_ref(output['url'])
                output_id=media.id_from_ref(output['url'])
            clip_id = media.id_from_ref(request['videos'][0]); assert clip_id != media.id_from_ref(source['url'])
            expected_ids = {clip_id, *(media.id_from_ref(item['url']) for item in references)}
            if references:
                assert [media.id_from_ref(item['url']) for item in request['images']] == [media.id_from_ref(references[0]['url'])]
                assert [media.id_from_ref(item) for item in request['audios']] == [media.id_from_ref(references[1]['url'])]
                assert [media.id_from_ref(item) for item in request['videos'][1:]] == [media.id_from_ref(references[2]['url'])]
                assert '黄昏的街头' in request['prompt']
                assert all(alias in request['prompt'] for alias in ('图片1', '音频1', '视频2', '文本1'))
                assert '%%@[' not in request['prompt']
                if subject:
                    assert '摄影师主体' in request['prompt'] and '%%subject-ref(' not in request['prompt']
                    assert subject['id'] not in request['prompt']
                assert source['url'] not in request['videos']
            with database.connection() as conn:
                owned_ids = conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s', (task_ids[0],)).fetchone()['input_asset_ids']
                assert len(owned_ids) == len(expected_ids) and set(owned_ids) == expected_ids
        for item in [*node['segmentReshoot']['preparedMedia'], *references, *([output] if output else [])]:
            assert world['viewer'].get(item['url'], headers=headers(world['a'])).status_code == 200
            assert world['outsider'].get(item['url'], headers=headers(world['b'])).status_code in (403, 404)
        if output:
            history=world['viewer'].get('/api/canvas-generation-history/'+output_id,params={'canvas_id':saved['id'],'node_id':node['id']},headers=headers(world['a']))
            assert history.status_code==200,history.text
            assert history.json()['parameters']['output_format']=='mov' and history.json()['parameters']['generate_audio'] is False
            assert 'quicktime' in world['viewer'].get(output['url'],headers=headers(world['a'])).headers['content-type']
        exported = world['editor'].post('/api/canvas-workflows/export', headers=headers(world['a']), json={'nodes': saved['nodes'], 'connections': saved['connections'], 'include_resources': True})
        assert exported.status_code == 200, exported.text
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            workflow = json.loads(archive.read('workflow.json'))
            assert len(workflow['resources']) == 4 + len(references) + bool(output)
        imported = world['editor'].post('/api/canvas-workflows/import', headers=headers(world['a']), files={'file': ('reshoot.zip', exported.content, 'application/zip')})
        assert imported.status_code == 200, imported.text
        copy = next(item for item in imported.json()['nodes'] if item.get('segmentReshoot'))
        assert len(copy['segmentReshoot']['preparedMedia']) == 3
        assert copy['segmentReshoot']['source']['media']['url'] != node['segmentReshoot']['source']['media']['url']
        if import_mode=='camera':
            assert copy['segmentReshoot']['prompt']==node['segmentReshoot']['prompt']
        if references:
            imported_refs = [item for item in imported.json()['nodes'] if item.get('hidden')]
            assert len(imported_refs) == (4 if subject else 3)
            assert all(item['images'][0]['url'] not in {ref['url'] for ref in references} for item in imported_refs if item.get('images'))
            if subject:
                assert copy['segmentReshoot']['subjects'][0]['groupId'] == subject['id']
                assert copy['segmentReshoot']['prompt'].count('%%subject-ref(') == 1
                assert next(item['text'] for item in imported_refs if item.get('text')) == '黄昏的街头，人物缓慢回头'
    finally:
        if process.poll() is None: process.kill(); process.wait(timeout=5)
        for handle in (process.stdin, process.stdout, process.stderr):
            try: handle.close()
            except OSError: pass
