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
        assert document['task_result_version']==2 and [len(node['images']) for node in document['nodes']]==[0,1,0]
        assert all(not node.get('pendingTasks') for node in document['nodes'])
        assert [asset['imageNodeId'] for asset in document['nodes'][0]['storyboardAssets']]==[node['id'] for node in document['nodes'][1:]]
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
