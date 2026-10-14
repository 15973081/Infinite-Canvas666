"""Real browser image controls, input receipts, PNG delivery and independent undo."""
import os,json,base64,io,subprocess
from pathlib import Path
from unittest.mock import patch
import httpx,pytest
from PIL import Image
from test_cloud_member_gateway import operator,world,headers
from test_cloud_management import platform
from test_cloud_image_receipts import image_space
from test_cloud_canvas_leases import setup_canvas,acquire,proof
from test_cloud_audio_tasks import execute

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')

def test_batch_preview_uses_server_prices_and_creates_no_tasks_or_ledger_entries(world,image_space):
    from app.storage.database import connection
    from app.storage.task_canvas_bindings import graph_fingerprint
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    nodes=[{'id':'frame','type':'smart-frame','images':[]},{'id':'image-a','type':'smart-image','generationKind':'image','frameId':'frame','images':[]},{'id':'image-b','type':'smart-image','generationKind':'image','frameId':'frame','images':[]}]
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':nodes,'connections':[],'base_revision':canvas['revision']});assert saved.status_code==200
    canvas=saved.json()['canvas'];body={'frame_id':'frame','base_revision':canvas['revision'],'items':[{'node_id':node['id'],'kind':'image','input_sha256':graph_fingerprint(canvas,node['id'],node['id']),'request':{'provider_id':image_space,'model':'test','prompt':'rain','n':2,'size':'1024x1024'}} for node in nodes[1:]]}
    request_headers=proof(world,lease,canvas['revision'])
    assert world['editor'].post(path+'/batch-preview',headers=headers(world['a']),json=body).status_code==428
    response=world['editor'].post(path+'/batch-preview',headers=request_headers,json=body);assert response.status_code==200,response.text
    data=response.json();assert len(data['prepared'])==2 and data['unknownCount']==0 and data['costs']=={'CNY':{'amount_micros':200000,'base_amount_micros':200000}}
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE canvas_id=%s',(canvas['id'],)).fetchone()['n']==0
        assert conn.execute('SELECT count(*) AS n FROM ledger_entries WHERE canvas_id=%s',(canvas['id'],)).fetchone()['n']==0
    assert world['viewer'].post(path+'/batch-preview',headers=request_headers,json=body).status_code==403
    assert world['outsider'].post(path+'/batch-preview',headers=request_headers,json=body).status_code==403
    body['base_revision']-=1;assert world['editor'].post(path+'/batch-preview',headers=request_headers,json=body).status_code==409
    body['base_revision']+=1;body['items'][0]['input_sha256']='0'*64;assert world['editor'].post(path+'/batch-preview',headers=request_headers,json=body).status_code==409
    # A queued server task remains busy even if a browser lost its local receipt.
    import uuid
    item=body['items'][0];item['input_sha256']=graph_fingerprint(canvas,item['node_id'],item['node_id'])
    admitted=world['editor'].post('/api/canvas-image-tasks',headers=request_headers,json={**item['request'],'canvas_id':canvas['id'],'client_task_id':'canvas_img_'+uuid.uuid4().hex,
        'canvas_target':{'source_node_id':item['node_id'],'target_node_id':item['node_id'],'base_revision':canvas['revision'],'input_sha256':item['input_sha256']}})
    assert admitted.status_code==200,admitted.text
    refreshed=world['editor'].post(path+'/batch-preview',headers=request_headers,json=body);assert refreshed.status_code==200,refreshed.text
    assert [entry['nodeId'] for entry in refreshed.json()['prepared']]==['image-b']
    assert refreshed.json()['skipped']==[{'nodeId':'image-a','reason':'busy'}]
    assert refreshed.json()['costs']['CNY']['amount_micros']==100000


def test_native_frame_batch_real_preview_receipts_png_results_and_independent_undo(world,image_space):
    from app.storage.database import connection
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path);root=Path(__file__).resolve().parents[1]
    nodes=[{'id':'image-'+str(i),'type':'smart-image','generationKind':'image','promptDraftText':'rain '+str(i),'x':260+i*300,'y':250,'images':[]} for i in range(2)]
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':nodes,'connections':[],'base_revision':canvas['revision']});assert saved.status_code==200
    canvas=saved.json()['canvas'];calls=[];submitted=[];done=None
    async def supplier(client,url,**kwargs):
        calls.append(kwargs['json']);stream=io.BytesIO();Image.new('RGB',(16,16),'blue' if len(calls)==1 else 'red').save(stream,format='PNG')
        return httpx.Response(200,request=httpx.Request('POST',url),json={'data':[{'b64_json':base64.b64encode(stream.getvalue()).decode()}],'usage':{'count':1}})
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':'batch','providerId':image_space,'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='GET' and message['path'].startswith('/api/canvas-image-tasks/'):
                with patch.object(httpx.AsyncClient,'post',supplier):task=execute(world,message['path'].split('/')[-1])
                assert task['status']=='succeeded',task['status']
            if message['method']=='POST' and message['path']=='/api/canvas-image-tasks':submitted.append(json.loads(message['body'])['client_task_id'])
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'))
            assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==2 and len(submitted)==len(calls)==2
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas'];assert document['task_result_version']==2
        assert sum(len(node['images']) for node in document['nodes'])==1 and all(not node.get('pendingTasks') for node in document['nodes'])
        with connection() as conn:
            for tid in submitted:
                task=conn.execute('SELECT status,result FROM tasks WHERE id=%s',(tid,)).fetchone();assert task['status']=='succeeded'
                assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(tid,)).fetchone()['n']==1
                assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(tid,)).fetchone()['n']==1
                media=world['viewer'].get(task['result']['images'][0],headers=headers(world['a']));assert media.status_code==200
                with Image.open(io.BytesIO(media.content)) as image:assert image.size==(16,16)
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for pipe in (process.stdin,process.stdout,process.stderr):pipe.close()


def test_browser_frame_membership_drag_preserves_submitted_task_binding(world,image_space,tmp_path):
    from test_cloud_task_canvas_bindings import setup_bound_canvas,finish
    from app.storage.database import connection
    from app.storage.task_canvas_bindings import graph_fingerprint
    path,canvas,lease=setup_bound_canvas(world,'smart')
    positions={'prompt':(260,250,240,240),'source':(580,250,200,240),'target':(950,290,180,100)}
    for node in canvas['nodes']:
        x,y,w,h=positions[node['id']];node.update(x=x,y=y,w=w,h=h)
        if node['id']=='prompt':node['type']='smart-prompt'
    saved=world['editor'].put(path,headers=proof(world,lease,canvas['revision']),json={**canvas,'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];root=Path(__file__).resolve().parents[1];submitted=[];done=None
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':'frame-drag','providerId':image_space,'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='POST' and message['path']=='/api/canvas-image-tasks':submitted.append(json.loads(message['body'])['client_task_id'])
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'))
            assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==1 and submitted==[done['taskId']]
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas'];frame=next(node for node in document['nodes'] if node['type']=='smart-frame')
        assert all(node.get('frameId')==frame['id'] for node in document['nodes'] if node['type']!='smart-frame')
        assert next(node for node in document['nodes'] if node['id']=='target')['x']==510
        assert len(document['connections'])==2
        with connection() as conn:
            task=conn.execute('SELECT status,request FROM tasks WHERE id=%s',(done['taskId'],)).fetchone();assert task['status']=='queued'
            assert task['request']['_canvas_binding']['graph_sha256']==graph_fingerprint(document,'source','target')
            assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(done['taskId'],)).fetchone()['n']==0
        # Complete through the isolated storage fixture, without a supplier call.
        finish(world,done['taskId'],tmp_path)
        results=world['viewer'].get(path+'/task-results',headers=headers(world['a'])).json()['results'];assert results[0]['binding']['state']=='unchanged'
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for pipe in (process.stdin,process.stdout,process.stderr):pipe.close()


def test_storyboard_asset_batch_keeps_paid_receipts_associations_and_one_result_undo(world,image_space):
    from app.storage.database import connection
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    node={'id':'board','type':'smart-storyboard','x':120,'y':160,'images':[],
          'storyboardAssets':[{'id':'person','type':'character','name':'旅人','prompt':'灰衣旅人'},{'id':'street','type':'scene','name':'街道','prompt':'雨夜街道'}],
          'shots':[{'duration':3,'prompt':'走进街道','assetIds':['person','street']}]}
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':[node],'connections':[],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];root=Path(__file__).resolve().parents[1];calls=[];submitted=[]
    async def supplier(client,url,**kwargs):
        calls.append(kwargs['json']);stream=io.BytesIO();Image.new('RGB',(16,16),'blue' if len(calls)==1 else 'red').save(stream,format='PNG')
        return httpx.Response(200,request=httpx.Request('POST',url),json={'data':[{'b64_json':base64.b64encode(stream.getvalue()).decode()}],'usage':{'count':1}})
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    done=None
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':'assets','providerId':image_space,
            'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='GET' and message['path'].startswith('/api/canvas-image-tasks/'):
                with patch.object(httpx.AsyncClient,'post',supplier):task=execute(world,message['path'].split('/')[-1])
                assert task['status']=='succeeded',task['status']
            if message['method']=='POST' and message['path']=='/api/canvas-image-tasks':submitted.append(json.loads(message['body'])['client_task_id'])
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'))
            assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==2
        assert len(submitted)==2 and len(calls)==2
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas']
        assert document['task_result_version']==2 and [len(node['images']) for node in document['nodes'] if node.get('storyboardAssetBinding')]==[1,0]
        assert all(not node.get('pendingTasks') for node in document['nodes'])
        asset_nodes=[node for node in document['nodes'] if node.get('storyboardAssetBinding')];frame=next(node for node in document['nodes'] if node['type']=='smart-frame')
        assert [asset['imageNodeId'] for asset in document['nodes'][0]['storyboardAssets']]==[node['id'] for node in asset_nodes]
        assert all(node['frameId']==frame['id'] for node in asset_nodes)
        with connection() as conn:
            for tid in submitted:
                task=conn.execute('SELECT status,result FROM tasks WHERE id=%s',(tid,)).fetchone();assert task['status']=='succeeded'
                assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(tid,)).fetchone()['n']==1
                assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(tid,)).fetchone()['n']==1
                media=world['viewer'].get(task['result']['images'][0],headers=headers(world['a']));assert media.status_code==200
                with Image.open(io.BytesIO(media.content)) as image:assert image.size==(16,16)
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for pipe in (process.stdin,process.stdout,process.stderr):pipe.close()

def test_storyboard_shot_drafts_run_with_real_owned_asset_inputs_and_persist_video_editor(world,image_space,tmp_path):
    from app.storage import media,database
    from app.storage.workspace import workspace_scope
    from test_cloud_audio_tasks import MP3
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path);root=Path(__file__).resolve().parents[1]
    # Publish actual, owned PNG inputs; image materialization and task receipts use real storage.
    input_urls=[]
    with workspace_scope(world['a']['id']),media.operation_scope():
        for color in ['blue','red']:
            source=tmp_path/(color+'.png');Image.new('RGB',(16,16),color).save(source,format='PNG');input_urls.append(media.stable_url(media.publish(source)))
        voice=media.stable_url(media.publish(MP3))
    nodes=[{'id':'person-image','type':'smart-image','images':[{'url':input_urls[0],'kind':'image'}]},{'id':'street-image','type':'smart-image','images':[{'url':input_urls[1],'kind':'image'}]},{'id':'voice','type':'smart-audio','images':[{'url':voice,'kind':'audio'}]},
           {'id':'board','type':'smart-storyboard','x':200,'y':200,'images':[],'storyboardAssets':[{'id':'person','type':'character','name':'旅人','imageNodeId':'person-image'},{'id':'street','type':'scene','name':'街道','imageNodeId':'street-image'}],
            'storyboardAudioAssets':[{'id':'voice-person','name':'旅人声音','nodeId':'voice'}],
            'shots':[{'duration':3,'description':'旅人走入街道','prompt':'<旅人@person>走入<街道@street>','videoPrompt':'<旅人@person@voice-person>缓步向前','promptStatus':'completed','assetIds':['person','street']}]}]
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':nodes,'connections':[],'base_revision':canvas['revision']});assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];calls=[];submitted=[]
    async def supplier(client,url,**kwargs):
        calls.append(url);stream=io.BytesIO();Image.new('RGB',(16,16),'green').save(stream,format='PNG')
        return httpx.Response(200,request=httpx.Request('POST',url),json={'data':[{'b64_json':base64.b64encode(stream.getvalue()).decode()}],'usage':{'count':1}})
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));done=None
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':'shots','providerId':image_space,'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='GET' and message['path'].startswith('/api/canvas-image-tasks/'):
                with patch.object(httpx.AsyncClient,'post',supplier):task=execute(world,message['path'].split('/')[-1])
                assert task['status']=='succeeded',task['status']
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'));assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            if message['method']=='POST' and message['path']=='/api/canvas-image-tasks':submitted.append(response.json()['task_id'])
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==1;assert len(calls)==1
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas'];assert len(document['nodes'])==7
        image=next(node for node in document['nodes'] if node.get('storyboardShotBinding',{}).get('mediaType')=='image');video=next(node for node in document['nodes'] if node.get('storyboardShotBinding',{}).get('mediaType')=='video');editor=next(node for node in document['nodes'] if node['type']=='smart-editor')
        assert video['runSettings']['videoDuration']==3 and video['storyboardShotBinding']['audioNodeIds']==['voice'];assert editor['inputNodeIds']==[video['id']]
        with database.connection() as conn:
            task=conn.execute('SELECT request,result,status FROM tasks WHERE id=%s',(submitted[0],)).fetchone();assert task['status']=='succeeded'
            assert [media.get_asset(item['url'])['id'] for item in task['request']['reference_images']]==[media.get_asset(url)['id'] for url in input_urls]
            assert task['request']['_canvas_binding']['source_node_id']==image['id'];assert len(image['images'])==1
            assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(submitted[0],)).fetchone()['n']==1
            assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(submitted[0],)).fetchone()['n']==1
        result=world['viewer'].get(task['result']['images'][0],headers=headers(world['a']));assert result.status_code==200
        with Image.open(io.BytesIO(result.content)) as actual:assert actual.size==(16,16)
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for pipe in (process.stdin,process.stdout,process.stderr):pipe.close()
