"""Actual parse toolbar/controller, sampling, paid fence, graph save and undo."""
import os,json,base64,subprocess
from pathlib import Path
from unittest.mock import patch
import httpx,pytest
from test_cloud_member_gateway import operator,world,headers
from test_cloud_canvas_leases import setup_canvas,acquire,proof
from test_cloud_llm_tasks import execute
from test_video_analysis import two_scene_video

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_video_parse_browser_flow_keeps_structured_result_and_undo_across_real_database_reload(world,two_scene_video):
    from app.storage import media,database
    from app.storage.workspace import workspace_scope
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    with workspace_scope(world['a']['id']),media.operation_scope():url=media.stable_url(media.publish(two_scene_video))
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':[{'id':'video','type':'smart-image','x':120,'y':160,'images':[{'url':url,'kind':'video','name':'源视频.mp4'}]}],'connections':[],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];root=Path(__file__).resolve().parents[1]
    parsed={'assets':[{'id':'scene','type':'scene','name':'色彩空间','description':'红色和蓝色','prompt':'纯色空间'}],
        'shots':[{'duration':6,'start_seconds':0,'end_seconds':6,'description':'红色画面','assetIds':['scene']},{'duration':2,'start_seconds':6,'end_seconds':8,'description':'蓝色画面','assetIds':['scene']}]}
    reply=json.dumps(parsed,ensure_ascii=False);calls=[];submitted=[]
    async def supplier(client,url,**kwargs):
        calls.append(kwargs['json']);return httpx.Response(200,request=httpx.Request('POST',url),json={'choices':[{'message':{'content':reply}}],'usage':{'prompt_tokens':40,'completion_tokens':30,'total_tokens':70}})
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    done=None
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':'parse','providerId':'comfly','videoBytes':base64.b64encode(two_scene_video.read_bytes()).decode(),
            'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='GET' and message['path'].startswith('/api/canvas-llm-tasks/'):
                with patch.object(httpx.AsyncClient,'post',supplier):task=execute(world,message['path'].split('/')[-1])
                assert task['status']=='succeeded',task['status']
            if message['method']=='POST' and message['path']=='/api/canvas-llm-tasks':submitted.append(json.loads(message['body'])['client_task_id'])
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'))
            assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==1
        assert len(calls)==1 and len(submitted)==1
        content=calls[0]['messages'][-1]['content'];assert any('时间 7.5 秒' in item.get('text','') for item in content)
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas'];assert len(document['nodes'])==2 and document['nodes'][1]['shots']==[] and not document['nodes'][1]['videoAnalysis'].get('taskId')
        assert document['connections'][0]['from']=='video' and document['connections'][0]['to']==document['nodes'][1]['id']
        with database.connection() as conn:
            assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(submitted[0],)).fetchone()['n']==1
            assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(submitted[0],)).fetchone()['n']==1
        assert world['viewer'].get('/api/canvas-llm-tasks/'+submitted[0],headers=headers(world['a'])).json()['result']['text']==reply
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for pipe in (process.stdin,process.stdout,process.stderr):pipe.close()
