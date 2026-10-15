"""Native ordinary image/video editor against real member leases and isolated PG."""
import io
import json
import os
import re
import subprocess
import uuid
import zipfile
import asyncio
from unittest.mock import patch
from pathlib import Path

import pytest
from PIL import Image
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas
from test_cloud_image_receipts import image_space

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def test_native_generation_price_preview_is_scoped_read_only_and_uses_server_prices(world,image_space):
    from app.storage import database
    path,canvas=setup_canvas(world,'smart')
    body={'kind':'image','request':{'provider_id':image_space,'model':'test','prompt':'价格预览','size':'1024x1024','n':4}}
    with database.connection() as conn:
        before=conn.execute('SELECT count(*) AS n FROM tasks').fetchone()['n'];fees=conn.execute('SELECT count(*) AS n FROM ledger_entries').fetchone()['n']
    response=world['editor'].post(path+'/generation-preview',headers=headers(world['a']),json=body)
    assert response.status_code==200,response.text
    assert response.json()['cost']=={'status':'estimated','currency':'CNY','amount_micros':200000,'base_amount_micros':200000}
    for invalid,status in [({**body,'kind':'audio'},422),({**body,'request':{**body['request'],'prompt':''}},422),({**body,'request':{**body['request'],'model':'not-configured'}},403)]:
        denied=world['editor'].post(path+'/generation-preview',headers=headers(world['a']),json=invalid)
        assert denied.status_code==status,denied.text
    assert world['outsider'].post(path+'/generation-preview',headers=headers(world['b']),json=body).status_code in (403,404)
    body['request']['provider_id']='not-assigned'
    assert world['editor'].post(path+'/generation-preview',headers=headers(world['a']),json=body).status_code in (400,403,404)
    with database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks').fetchone()['n']==before
        assert conn.execute('SELECT count(*) AS n FROM ledger_entries').fetchone()['n']==fees


@pytest.mark.parametrize('kind', ['image', 'video', 'image-parameters', 'video-parameters','video-text','video-first-frame','video-first-last','video-first-last-same','video-reference','video-edit','video-extend-backward','video-extend-forward'])
def test_native_general_prompt_browser_admits_scoped_task_restores_chips_and_exports_owned_media(world, platform, tmp_path, kind):
    from app.storage import database, tasks, media
    from app.storage.workspace import workspace_scope
    root=Path(__file__).resolve().parents[1]
    mode={'video-text':'文生视频','video-first-frame':'图生视频','video-first-last':'首尾帧','video-first-last-same':'首尾帧','video-reference':'多模态参考','video-edit':'视频编辑','video-extend-backward':'向后延长','video-extend-forward':'向前延长'}.get(kind)
    same=kind=='video-first-last-same';parameters=kind.endswith('-parameters');kind=kind.split('-')[0]
    provider_id='native-prompt-'+uuid.uuid4().hex[:16]
    configured=platform['client'].put('/api/providers/'+provider_id,json={
        'config':{'name':'原生提示词隔离验收','base_url':'https://supplier.test/api/v3','protocol':'volcengine' if kind=='video' else 'openai','enabled':True,'image_models':['gpt-image-2'] if kind=='image' else [],'video_models':['doubao-seedance-2-5-pro'] if kind=='video' else []},
        'expected_version':0,'secrets':{'api_key':'test-only-native-prompt'},'reason':'隔离验收'})
    assert configured.status_code==200,configured.text
    assigned=platform['client'].put('/api/provider-assignments',params={'workspace':world['a']['id']},json={'expected_version':1,'provider_ids':[provider_id],'primary_provider_id':provider_id,'reason':'隔离验收'})
    assert assigned.status_code==200,assigned.text
    provider=next(item for item in world['editor'].get('/api/config',headers=headers(world['a'])).json()['api_providers'] if item['id']==provider_id)
    assert provider['video_capabilities']['native_roles'] is (kind=='video')
    assert not {'base_url','protocol','proxy_url','key_preview'} & provider.keys()
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
    references=[]
    if mode=='图生视频':references=assets[:1]
    elif mode=='首尾帧':
        references=assets[:1]
        if same:references=references*2
        else:
            tail=io.BytesIO();Image.new('RGB',(160,90),'blue').save(tail,format='PNG')
            response=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':('tail.png',tail.getvalue(),'image/png')})
            assert response.status_code==200,response.text
            references.append({**response.json()['files'][0],'kind':'image'})
    elif mode=='多模态参考':references=assets
    elif mode in {'视频编辑','向后延长','向前延长'}:references=[assets[0],assets[-1]]
    if parameters and kind=='video':
        filename=tmp_path/'native-output.mov'
        subprocess.run(['ffmpeg','-v','error','-i',str(root/'tests/fixtures/pixmax-audio-source.mp4'),'-c','copy','-y',str(filename)],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        response=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':(filename.name,filename.read_bytes(),'video/quicktime')})
        assert response.status_code==200,response.text
        output={**response.json()['files'][0],'kind':'video'}
    subject=None
    if kind=='video' and not mode:
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
        process.stdin.write(json.dumps({'initial':{'directory':str(tmp_path),'canvas':canvas,'kind':kind,'parameters':parameters,'provider':provider,'member':world['people'][0]['id'],'workspace':world['a']['id'],'subject':subject,'mode':mode,'references':references}})+'\n');process.stdin.flush()
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
                            if mode:
                                from app.routers import canvas as canvas_router
                                from app.models import CanvasVideoRequest
                                captured=[]
                                class CapturedSupplier(Exception):pass
                                async def capture(client,url,**kwargs):captured.append(kwargs['json']);raise CapturedSupplier()
                                async def reference_url(value,*args,**kwargs):return 'http://testserver'+value if value.startswith('/') else value
                                with patch.object(canvas_router,'paid_post',capture),patch.object(canvas_router,'volcengine_video_media_reference_url',reference_url),patch.object(canvas_router,'load_asset_library',lambda:{'categories':[],'libraries':[]}):
                                    with pytest.raises(CapturedSupplier):asyncio.run(canvas_router.canvas_video_impl(CanvasVideoRequest(**tasks.request(task_id))))
                                assert len(captured)==1
                                roles=[item['role'] for item in captured[0]['content'] if item['type']=='image_url']
                                assert roles==([] if mode=='文生视频' else ['first_frame'] if mode=='图生视频' else ['first_frame','last_frame'] if mode=='首尾帧' else ['reference_image'])
                                if mode in {'图生视频','首尾帧'}:assert captured[0]['ratio']=='adaptive'
                                if mode in {'视频编辑','向后延长','向前延长'}:
                                    assert captured[0]['ratio']=='adaptive'
                                    assert captured[0]['duration']==(-1 if mode=='视频编辑' else 5)
                                    assert captured[0]['content'][0]['text'].startswith({'视频编辑':'编辑视频@video1：','向后延长':'向后延长@video1：','向前延长':'向前延长@video1：'}[mode])
                                    assert len([item for item in captured[0]['content'] if item['type']=='video_url'])==1
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
            if parameters:
                if kind=='image':
                    assert request['size']=='2048x2048' and request['quality']=='high'
                    assert node['runSettings']['resolution']=='2k' and node['runSettings']['quality']=='high'
                else:
                    assert request['resolution']=='1080p' and request['generate_audio'] is True and request['output_format']=='mov'
                    assert node['runSettings']['videoOutputFormat']=='mov' and node['runSettings']['videoGenerateAudio'] is True
                    assert 'quicktime' in world['viewer'].get(output['url'],headers=headers(world['a'])).headers['content-type']
            if subject:
                assert '摄影师主体（文本1、图片1、音频1、视频1）' in request['prompt']
                assert '年轻摄影师，穿着蓝色外套' in request['prompt'] and subject['id'] not in request['prompt']
                assert node['nativePrompt']['subjects'][0]['groupId']==subject['id']
                assert len([item for item in saved['nodes'] if item.get('hidden')])==4
                expected={media.id_from_ref(item['url']) for item in assets}
                with database.connection() as conn:
                    actual=conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s',(task_ids[0],)).fetchone()['input_asset_ids']
                assert len(actual)==len(expected) and set(actual)==expected
            elif kind=='image':
                assert 'Canon EOS R5 Mark II' in request['prompt'] and '%%#[camera]' in node['nativePrompt']['prompt']
            if mode:
                assert node['runSettings']['videoReferenceMode']=={'文生视频':'textToVideo','图生视频':'imageToVideo','首尾帧':'firstAndLastFrame','多模态参考':'referToVideo','视频编辑':'videoEdit','向后延长':'extend_backward','向前延长':'extend_forward'}[mode]
                expected_roles=[] if mode=='文生视频' else ['first_frame'] if mode=='图生视频' else ['first_frame','last_frame'] if mode=='首尾帧' else ['reference_image']
                assert [item['role'] for item in request['images']]==expected_roles
                with database.connection() as conn:actual=conn.execute('SELECT input_asset_ids FROM tasks WHERE id=%s',(task_ids[0],)).fetchone()['input_asset_ids']
                assert set(actual)=={media.id_from_ref(item['url']) for item in references}
        assert world['viewer'].get(output['url'],headers=headers(world['a'])).status_code==200
        assert world['outsider'].get(output['url'],headers=headers(world['b'])).status_code in (403,404)
        exported=world['editor'].post('/api/canvas-workflows/export',headers=headers(world['a']),json={'nodes':saved['nodes'],'connections':saved['connections'],'include_resources':True})
        assert exported.status_code==200,exported.text
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            workflow=json.loads(archive.read('workflow.json'));assert len(workflow['resources'])==len({item['url'] for item in [*(references if mode else assets),output]})
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


def test_native_video_frame_admission_rejects_mixed_roles_and_wrong_owned_media_without_queueing(world,platform,tmp_path):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    from test_cloud_task_canvas_bindings import setup_bound_canvas,payload,submit
    provider_id='frame-rejection-'+uuid.uuid4().hex[:16]
    response=platform['client'].put('/api/providers/'+provider_id,json={'config':{'name':'首尾帧拒绝验收','base_url':'https://supplier.test/api/v3','protocol':'volcengine','enabled':True,'video_models':['doubao-seedance-2-5-pro']},'expected_version':0,'secrets':{'api_key':'test-only-frame-rejection'},'reason':'隔离验收'})
    assert response.status_code==200,response.text
    response=platform['client'].put('/api/provider-assignments',params={'workspace':world['a']['id']},json={'expected_version':1,'provider_ids':[provider_id],'primary_provider_id':provider_id,'reason':'隔离验收'})
    assert response.status_code==200,response.text
    content=io.BytesIO();Image.new('RGB',(160,90),'blue').save(content,format='PNG')
    uploaded=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':('head.png',content.getvalue(),'image/png')});assert uploaded.status_code==200,uploaded.text
    image=uploaded.json()['files'][0]['url']
    root=Path(__file__).resolve().parents[1]
    uploaded=world['editor'].post('/api/ai/upload',headers=headers(world['a']),files={'files':('wrong.mp4',(root/'tests/fixtures/pixmax-audio-source.mp4').read_bytes(),'video/mp4')});assert uploaded.status_code==200,uploaded.text
    video=uploaded.json()['files'][0]['url']
    path,canvas,lease=setup_bound_canvas(world,'smart')
    base={**payload(canvas,'video'),'provider_id':provider_id,'model':'doubao-seedance-2-5-pro','aspect_ratio':'adaptive','duration':5}
    for change in [
        {'images':[{'url':image,'role':'last_frame'}]},
        {'images':[{'url':image,'role':'first_frame'},{'url':image,'role':'reference_image'}]},
        {'images':[{'url':image,'role':'first_frame'}],'videos':[video]},
        {'images':[{'url':image,'role':'first_frame'}],'aspect_ratio':'16:9'},
        {'images':[{'url':video,'role':'first_frame'}]},
        {'images':[{'url':image,'role':'first_frame'}],'task_mode':'edit'},
    ]:
        response=submit(world,{**base,**change,'client_task_id':'canvas_vid_'+uuid.uuid4().hex},lease,'video')
        assert response.status_code==400,response.text
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE canvas_id=%s',(canvas['id'],)).fetchone()['n']==0
    changed=platform['client'].put('/api/providers/'+provider_id,json={'config':{'name':'代理首尾帧拒绝验收','base_url':'https://supplier.test/proxy/generate','protocol':'volcengine','enabled':True,'video_models':['doubao-seedance-2-5-pro']},'expected_version':1,'reason':'隔离验收'})
    assert changed.status_code==200,changed.text
    provider=next(item for item in world['editor'].get('/api/config',headers=headers(world['a'])).json()['api_providers'] if item['id']==provider_id)
    assert provider['video_capabilities']['native_roles'] is False
    assert not {'base_url','protocol','proxy_url','key_preview'} & provider.keys()
    response=submit(world,{**base,'images':[{'url':image,'role':'first_frame'}],'client_task_id':'canvas_vid_'+uuid.uuid4().hex},lease,'video')
    assert response.status_code==400 and '代理' in response.text,response.text
    changed=platform['client'].put('/api/providers/'+provider_id,json={'config':{'name':'恢复原生接口验收','base_url':'https://supplier.test/api/v3','protocol':'volcengine','enabled':True,'video_models':['doubao-seedance-2-5-pro']},'expected_version':2,'reason':'隔离验收'})
    assert changed.status_code==200,changed.text
    # Batch review uses the same role validator before it can offer a paid submit.
    from test_cloud_canvas_leases import proof
    from app.storage.task_canvas_bindings import graph_fingerprint
    saved_nodes=[*canvas['nodes'],{'id':'frame','type':'smart-frame','images':[]}]
    source=next(node for node in saved_nodes if node['id']=='source');source.update(frameId='frame',generationKind='video')
    response=world['editor'].put(path,headers=proof(world,lease,canvas['revision']),json={'nodes':saved_nodes,'connections':canvas['connections'],'base_revision':canvas['revision']})
    assert response.status_code==200,response.text
    canvas=response.json()['canvas']
    item={'node_id':'source','kind':'video','input_sha256':graph_fingerprint(canvas,'source','source'),'request':{**base,'images':[{'url':image,'role':'first_frame'},{'url':image,'role':'last_frame'}]}}
    batch={'frame_id':'frame','base_revision':canvas['revision'],'items':[item]}
    response=world['editor'].post(path+'/batch-preview',headers=proof(world,lease,canvas['revision']),json=batch)
    assert response.status_code==200 and len(response.json()['prepared'])==1,response.text
    item['request']['images']=[{'url':image,'role':'last_frame'}]
    response=world['editor'].post(path+'/batch-preview',headers=proof(world,lease,canvas['revision']),json=batch)
    assert response.status_code==200,response.text
    assert response.json()['prepared']==[] and response.json()['skipped'][0]['reason']=='invalid'
    with workspace_scope(world['a']['id']),database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE canvas_id=%s',(canvas['id'],)).fetchone()['n']==0
