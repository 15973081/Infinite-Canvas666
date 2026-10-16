import os
import uuid
import pytest
from test_cloud_member_gateway import operator, world

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_account_tasks_are_private_paged_and_do_not_return_task_payloads(world):
    from app.storage.database import connection
    from fastapi.testclient import TestClient
    from main import app
    owner=world['people'][0]['id'];other=world['people'][1]['id']
    with connection() as conn:
        workspace=conn.execute('SELECT workspace_id FROM workspace_members WHERE member_id=%s LIMIT 1',(owner,)).fetchone()['workspace_id']
        for index,member in enumerate([owner,owner,other,None]):
            tid='acct-task-'+uuid.uuid4().hex
            conn.execute('''INSERT INTO tasks(id,workspace_id,kind,model,status,requested_by,idempotency_key,request_sha256,request,created_at)
                VALUES(%s,%s,'image','test-model',%s,%s,%s,%s,'{"prompt":"private prompt","api_key":"test-secret"}',now()+(%s * interval '1 second'))''',
                (tid,workspace,'failed' if index==1 else 'succeeded',member,tid,'0'*64,index))
    c=world['editor'];path='/api/account/tasks'
    first=c.get(path,params={'page_size':1,'member_id':other,'workspace':'forged'})
    assert first.status_code==200,first.text
    assert first.headers['cache-control']=='private, no-store'
    data=first.json();assert data['records']==2 and data['pages']==2 and len(data['entries'])==1
    second=c.get(path,params={'page_size':1,'page':2}).json()
    assert second['entries'][0]['id']!=data['entries'][0]['id']
    assert 'private prompt' not in first.text and 'api_key' not in first.text
    assert set(data['entries'][0])=={'id','kind','model','status','canvas_id','created_at'}
    assert c.get(path,params={'status':'failed'}).json()['records']==1
    assert c.get(path,params={'page':999}).json()['page']==1
    assert world['viewer'].get(path,params={'member_id':owner}).json()['records']==1
    assert c.get(path,headers={'X-Member-ID':other}).status_code==409
    assert c.get(path,params={'status':'unknown'}).status_code==400
    assert c.get(path,params={'page_size':101}).status_code==422
    assert c.post(path,json={'status':'succeeded'}).status_code==405
    with TestClient(app) as anon:assert anon.get(path).status_code==401
    with connection() as conn:conn.execute("UPDATE members SET status='disabled' WHERE id=%s",(owner,))
    assert c.get(path).status_code==401
