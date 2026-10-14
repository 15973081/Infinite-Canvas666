"""Actual canvas controls and undo/save/reload against the real task/database API."""
import os,json,socket,subprocess
from pathlib import Path
from unittest.mock import patch
import httpx,pytest
from test_cloud_member_gateway import operator,world,headers
from test_cloud_management import platform
from test_cloud_canvas_leases import proof
from test_cloud_audio_tasks import prepared as audio_prepared,execute,MP3
from test_cloud_model_tasks import prepared as model_prepared,supplier,stream,dns

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('kind',['audio','model'])
def test_pixmax_completed_result_undo_survives_actual_save_reload_and_keeps_paid_task(world,platform,kind):
    from app.storage.database import connection
    path,canvas,lease,body,_=(audio_prepared if kind=='audio' else model_prepared)(world,platform)
    root=Path(__file__).resolve().parents[1];calls=[];submissions=[]
    process=subprocess.Popen(['node',str(root/'tests/helpers/pixmax-task-undo-http.cjs')],cwd=root,
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    async def audio_supplier(client,url,**kwargs):
        calls.append(url)
        return httpx.Response(200,json={'base_resp':{'status_code':0},'data':{'status':2,'audio':MP3.read_bytes().hex()},'extra_info':{'usage_characters':7}},request=httpx.Request('POST',url))
    done=None
    try:
        process.stdin.write(json.dumps({'initial':{'canvas':canvas,'kind':kind,'providerId':body['provider_id'],
            'proof':{key:value for key,value in proof(world,lease).items() if key.startswith('X-Canvas-')}}})+'\n');process.stdin.flush()
        for line in process.stdout:
            message=json.loads(line)
            if message.get('done'):done=message;break
            if message['method']=='GET' and message['path'].startswith('/api/canvas-'+kind+'-tasks/'):
                task_id=message['path'].split('/')[-1]
                with patch.object(httpx.AsyncClient,'post',audio_supplier if kind=='audio' else supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):
                    task=execute(world,task_id)
                assert task['status']=='succeeded',task['status']
            if message['method']=='POST' and message['path']=='/api/canvas-'+kind+'-tasks':submissions.append(json.loads(message['body'])['client_task_id'])
            response=world['editor'].request(message['method'],message['path'],headers={**headers(world['a']),**message['headers']},content=message.get('body'))
            assert response.status_code==200,(message['method'],response.status_code,response.json().get('detail'))
            process.stdin.write(json.dumps({'id':message['id'],'status':response.status_code,'body':response.json()})+'\n');process.stdin.flush()
        process.wait(timeout=5);assert process.returncode==0,process.stderr.read();assert done and done['posts']==1
        assert len(submissions)==1
        document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas']
        assert document['task_result_version']==1 and document['nodes'][0]['images']==[] and document['nodes'][0].get('pendingTasks',[])==[]
        with connection() as conn:
            task=conn.execute('SELECT status,result FROM tasks WHERE id=%s',(submissions[0],)).fetchone();assert task['status']=='succeeded'
            assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(submissions[0],)).fetchone()['n']==1
            assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(submissions[0],)).fetchone()['n']==1
        url=task['result']['audios' if kind=='audio' else 'models'][0]
        assert world['viewer'].get(url,headers=headers(world['a'])).status_code==200
        assert world['viewer'].get(path+'/task-results',headers=headers(world['a'])).json()['results'][0]['state']=='ready'
        assert len(calls)==(1 if kind=='audio' else 2)
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        for stream_handle in (process.stdin,process.stdout,process.stderr):stream_handle.close()
