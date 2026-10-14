"""Native ordinary image/video editor against real member leases and isolated PG."""
import io
import json
import os
import re
import subprocess
import uuid
import zipfile
from pathlib import Path

import pytest
from PIL import Image
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('kind', ['image', 'video'])
def test_native_general_prompt_browser_admits_scoped_task_restores_chips_and_exports_owned_media(world, platform, tmp_path, kind):
    from app.storage import database, tasks, media
    from app.storage.workspace import workspace_scope
    root=Path(__file__).resolve().parents[1]
    provider_id='native-prompt-'+uuid.uuid4().hex[:16]
    configured=platform['client'].put('/api/providers/'+provider_id,json={
        'config':{'name':'原生提示词隔离验收','base_url':'https://supplier.test/api/v3','protocol':'volcengine' if kind=='video' else 'openai','enabled':True,'image_models':['gpt-image-2'] if kind=='image' else [],'video_models':['doubao-seedance-2-5-pro'] if kind=='video' else []},
        'expected_version':0,'secrets':{'api_key':'test-only-native-prompt'},'reason':'隔离验收'})
    assert configured.status_code==200,configured.text
    assigned=platform['client'].put('/api/provider-assignments',params={'workspace':world['a']['id']},json={'expected_version':1,'provider_ids':[provider_id],'primary_provider_id':provider_id,'reason':'隔离验收'})
    assert assigned.status_code==200,assigned.text
    provider=next(item for item in world['editor'].get('/api/config',headers=headers(world['a'])).json()['api_providers'] if item['id']==provider_id)
    content=io.BytesIO();Image.new('RGB',(160,90),'orange').save(content,format='PNG')
    files=[('image','native.png',content.getvalue(),'image/png')]
    if kind=='video':
        files.extend([('audio','native.mp3',(root/'tests/fixtures/pixmax-generated-audio.mp3').read_bytes(),'audio/mpeg'),('video','native.mp4',(root/'tests/fixtures/pixmax-audio-source.mp4').read_bytes(),'video/mp4')])
    assets=[]
    for media_kind,name,body,mime in files:
        response=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':(name,body,mime)})
        assert response.status_code==200,response.text
        assets.append({**response.json()['files'][0],'kind':media_kind})
    output=assets[-1]
    subject=None
    if kind=='video':
        response=world['editor'].post('/api/subject-library/PERSONAL/groups',headers=headers(world['a']),json={'expected_revision':0,'name':'摄影师主体','description':'黄昏的摄影师'})
        assert response.status_code==200,response.text
        subject={'id':response.json()['target_id'],'name':'摄影师主体'}
        response=world['editor'].post('/api/subject-library/PERSONAL/groups/'+subject['id']+'/items',headers=headers(world['a']),json={'expected_revision':1,'kind':'text','name':'剧情设定','text':'年轻摄影师，穿着蓝色外套'})
        assert response.status_code==200,response.text
        for index,item in enumerate(assets):
            response=world['editor'].post('/api/subject-library/PERSONAL/groups/'+subject['id']+'/items',headers=headers(world['a']),json={'expected_revision':index+2,'kind':item['kind'],'name':item['kind'],'url':item['url']})
            assert response.status_code==200,response.text
    path,canvas=setup_canvas(world,'smart')
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-native-prompt-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    done,task_ids,finalized=False,[],set()
    endpoint='/api/canvas-'+kind+'-tasks'
    try:
        process.stdin.write(json.dumps({'initial':{'directory':str(tmp_path),'canvas':canvas,'kind':kind,'provider':provider,'member':world['people'][0]['id'],'workspace':world['a']['id'],'subject':subject}})+'\n');process.stdin.flush()
        for line in process.stdout:
            pointer=json.loads(line)
            if pointer.get('done'):done=pointer;break
            assert re.fullmatch(r'request-\d+\.json',pointer['file'])
            message=json.loads((tmp_path/pointer['file']).read_text(encoding='utf-8'))
            if message['method']=='GET' and message['path'].startswith(endpoint+'/'):
                task_id=message['path'].split('/')[-1].split('?')[0]
                if task_id in task_ids and task_id not in finalized:
                    with workspace_scope(world['a']['id']):
                        claimed=tasks.claim('native-prompt-test-worker');assert claimed['id']==task_id
                        token=tasks.lease_context.set((task_id,claimed['lease_token']))
                        try:
                            value=tasks.get(task_id);value.update(status='succeeded',result={('images' if kind=='image' else 'videos'):[output['url']]});tasks.save(value);finalized.add(task_id)
                        finally:tasks.lease_context.reset(token);tasks.release(task_id,claimed['lease_token'])
            if message['bodyFile']:assert re.fullmatch(r'body-\d+\.bin',message['bodyFile'])
            body=(tmp_path/message['bodyFile']).read_bytes() if message['bodyFile'] else None
            response=world['editor'].request(message['method'],message['path'],headers={**message['headers'],**headers(world['a'])},content=body)
            if message['method']=='POST' and message['path']==endpoint:
                assert response.status_code==200,response.text
                task_ids.append(response.json()['task_id'])
            answer={'id':message['id'],'status':response.status_code}
            try:answer['body']=response.json()
            except ValueError:
                name='binary-'+str(message['id'])+'.bin';(tmp_path/name).write_bytes(response.content)
                answer.update(binaryFile=name,contentType=response.headers.get('content-type','application/octet-stream'),headers={key:response.headers[key] for key in ('content-range','accept-ranges','content-length') if key in response.headers})
            name='response-'+str(message['id'])+'.json';(tmp_path/name).write_text(json.dumps(answer),encoding='utf-8')
            process.stdin.write(json.dumps({'file':name})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read()
        assert done and len(task_ids)==1 and finalized==set(task_ids)
        saved=world['editor'].get(path,headers=headers(world['a'])).json()['canvas']
        node=next(item for item in saved['nodes'] if item['id']==done['targetId'])
        assert node['nativePrompt']['schemaVersion']==1 and len(node['images'])==1
        assert '黄昏的摄影师' in node['nativePrompt']['prompt']
        with workspace_scope(world['a']['id']):
            request=tasks.request(task_ids[0]);assert request['provider_id']==provider_id
            assert '黄昏的摄影师' in request['prompt'] and '%%' not in request['prompt']
            if subject:
                assert '摄影师主体（文本1、图片1、音频1、视频1）' in request['prompt']
                assert '年轻摄影师，穿着蓝色外套' in request['prompt'] and subject['id'] not in request['prompt']
                assert node['nativePrompt']['subjects'][0]['groupId']==subject['id']
                assert len([item for item in saved['nodes'] if item.get('hidden')])==4
                expected={media.id_from_ref(item['url']) for item in assets}
                with database.connection() as conn:
                    actual=conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s',(task_ids[0],)).fetchone()['input_asset_ids']
                assert len(actual)==len(expected) and set(actual)==expected
            else:
                assert 'Canon EOS R5 Mark II' in request['prompt'] and '%%#[camera]' in node['nativePrompt']['prompt']
        assert world['viewer'].get(output['url'],headers=headers(world['a'])).status_code==200
        assert world['outsider'].get(output['url'],headers=headers(world['b'])).status_code in (403,404)
        exported=world['editor'].post('/api/canvas-workflows/export',headers=headers(world['a']),json={'nodes':saved['nodes'],'connections':saved['connections'],'include_resources':True})
        assert exported.status_code==200,exported.text
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            workflow=json.loads(archive.read('workflow.json'));assert len(workflow['resources'])==len(assets)
        imported=world['editor'].post('/api/canvas-workflows/import',headers=headers(world['a']),files={'file':('native-prompt.zip',exported.content,'application/zip')})
        assert imported.status_code==200,imported.text
        copy=next(item for item in imported.json()['nodes'] if item.get('nativePrompt'))
        assert copy['nativePrompt']['prompt']==node['nativePrompt']['prompt']
        assert copy['images'][0]['url']!=node['images'][0]['url']
        if subject:
            imported_sources=[item for item in imported.json()['nodes'] if item.get('hidden') and item.get('images')]
            assert len(imported_sources)==3
            assert all(item['images'][0]['url'] not in {asset['url'] for asset in assets} for item in imported_sources)
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for handle in (process.stdin,process.stdout,process.stderr):
            try:handle.close()
            except OSError:pass
