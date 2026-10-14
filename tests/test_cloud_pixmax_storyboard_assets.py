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
