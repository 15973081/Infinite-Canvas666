"""Native tree deletion is atomic, lease-bound and recoverable by receipt."""
import os
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import pytest
from test_cloud_member_gateway import operator,world,headers
from test_cloud_canvas_leases import acquire,proof

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def setup(world):
    client=world['editor'];head=headers(world['a'])
    def folder(name,parent=''):
        response=client.post('/api/canvas-folders',headers=head,json={'name':name,'parent_id':parent});assert response.status_code==200,response.text
        return response.json()['folder']['id']
    root=folder('电影项目');child=folder('镜头',root);leaf=folder('声音',child);outside=folder('其他项目')
    canvases=[]
    for target in (root,child,leaf,outside):
        response=client.post('/api/canvases',headers=head,json={'title':'内容-'+target,'kind':'smart','folder_id':target});assert response.status_code==200,response.text
        canvases.append(response.json()['canvas'])
    return root,child,leaf,outside,canvases


def prepare(world,root):
    response=world['editor'].get('/api/canvas-folders/'+root+'/delete-tree',headers=headers(world['a']));assert response.status_code==200,response.text
    return response.json()


def request(world,plan):
    proofs=[]
    for item in plan['canvases']:
        lease=acquire(world,'/api/canvases/'+item['id'])
        proofs.append({'id':item['id'],'token':lease['edit_token'],'generation':lease['generation'],'revision':lease['revision']})
    return {'operation_id':str(uuid.uuid4()),'name':plan['name'],'plan_sha256':plan['plan_sha256'],'canvases':proofs}


def delete(world,root,body):
    return world['editor'].post('/api/canvas-folders/'+root+'/delete-tree',headers=headers(world['a']),json=body)


def test_folder_delete_tree_purges_all_descendants_including_trash_releases_leases_and_retains_unrelated_data(world):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    root,child,leaf,outside,canvases=setup(world)
    item=canvases[2];path='/api/canvases/'+item['id'];lease=acquire(world,path)
    removed=world['editor'].delete(path,headers=proof(world,lease,item['revision']));assert removed.status_code==200,removed.text
    assert world['editor'].post(path+'/edit-lease/release',headers=proof(world,lease,removed.json()['canvas']['revision'])).status_code==200
    plan=prepare(world,root);body=request(world,plan);response=delete(world,root,body);assert response.status_code==200,response.text
    result=response.json();assert set(result['folder_ids'])=={root,child,leaf};assert set(result['canvas_ids'])=={item['id'] for item in canvases[:3]}
    assert [item['id'] for item in world['editor'].get('/api/canvas-folders',headers=headers(world['a'])).json()['folders']]==[outside]
    listed=world['editor'].get('/api/canvases',headers=headers(world['a'])).json()['canvases'];assert [item['id'] for item in listed]==[canvases[3]['id']]
    assert world['editor'].get('/api/canvases/trash',headers=headers(world['a'])).json()['canvases']==[]
    with workspace_scope(world['a']['id']),database.connection() as conn:
        rows=conn.execute('SELECT id,document FROM canvases WHERE id=ANY(%s)',(result['canvas_ids'],)).fetchall();assert len(rows)==3 and all(row['document']['purged_at'] for row in rows)
        assert conn.execute('SELECT count(*) AS n FROM canvas_edit_leases WHERE canvas_id=ANY(%s) AND released_at IS NULL',(result['canvas_ids'],)).fetchone()['n']==0
        stored=conn.execute("SELECT value FROM workspace_documents WHERE kind='canvas_folder_deletion' AND id=%s",(body['operation_id'],)).fetchone()['value']
        assert all(item['token'] not in str(stored) for item in body['canvases'])


def test_folder_delete_tree_rejects_one_bad_proof_without_mutating_any_canvas_or_folder(world):
    root,_,_,_,canvases=setup(world);plan=prepare(world,root);body=request(world,plan);body['canvases'][-1]['token']='invalid'
    response=delete(world,root,body);assert response.status_code==409,response.text
    assert response.json()['detail']['code']=='canvas_lease_lost'
    assert len(world['editor'].get('/api/canvas-folders',headers=headers(world['a'])).json()['folders'])==4
    assert len(world['editor'].get('/api/canvases',headers=headers(world['a'])).json()['canvases'])==4
    assert world['editor'].get('/api/canvas-folders/'+root+'/delete-tree-status/'+body['operation_id'],headers=headers(world['a'])).json()['state']=='not_found'
    assert prepare(world,root)['plan_sha256']==plan['plan_sha256']


def test_folder_delete_tree_revalidates_membership_name_and_entire_proof_set(world):
    root,child,_,_,_=setup(world);plan=prepare(world,root);body=request(world,plan)
    assert delete(world,root,{**body,'name':'错误名称'}).status_code==409
    assert delete(world,root,{**body,'canvases':body['canvases'][:-1]}).status_code==409
    assert delete(world,root,{**body,'canvases':body['canvases']+[body['canvases'][0]]}).status_code==409
    created=world['editor'].post('/api/canvases',headers=headers(world['a']),json={'title':'新增镜头','folder_id':child});assert created.status_code==200,created.text
    response=delete(world,root,body);assert response.status_code==409 and response.json()['detail']['code']=='folder_deletion_plan_changed',response.text
    assert len(world['editor'].get('/api/canvases',headers=headers(world['a'])).json()['canvases'])==5


def test_folder_delete_tree_receipt_is_idempotent_member_scoped_and_available_after_folder_removal(world):
    root,_,_,_,_=setup(world);plan=prepare(world,root);body=request(world,plan)
    response=delete(world,root,body);assert response.status_code==200,response.text
    assert delete(world,root,body).json()==response.json()
    assert delete(world,root,{**body,'name':'另一个目录'}).status_code==409
    path='/api/canvas-folders/'+root+'/delete-tree-status/'+body['operation_id']
    assert world['editor'].get(path,headers=headers(world['a'])).json()=={'state':'done',**response.json()}
    assert world['viewer'].get(path,headers=headers(world['a'])).status_code==404
    assert world['viewer'].post('/api/canvas-folders/'+root+'/delete-tree',headers=headers(world['a']),json=body).status_code==403


def test_folder_delete_tree_serializes_concurrent_canvas_creation_without_orphaned_membership(world):
    from app.services import canvas_folder_deletion as service
    root,_,_,_,_=setup(world);plan=prepare(world,root);body=request(world,plan);entered=threading.Event();proceed=threading.Event();original=service.validate
    def hold(*args,**kwargs):
        result=original(*args,**kwargs)
        if not entered.is_set():entered.set();assert proceed.wait(10)
        return result
    with patch.object(service,'validate',hold),ThreadPoolExecutor(max_workers=2) as pool:
        deleting=pool.submit(delete,world,root,body);assert entered.wait(10)
        creating=pool.submit(world['editor'].post,'/api/canvases',headers=headers(world['a']),json={'title':'迟到创建','folder_id':root})
        try:assert not creating.done()
        finally:proceed.set()
        result=deleting.result(timeout=10);created=creating.result(timeout=10)
    assert result.status_code==200,result.text
    assert created.status_code==200 and not created.json()['canvas']['folder_id'],created.text


def test_folder_delete_tree_cannot_be_undone_by_a_stale_folder_rename(world):
    from app.routers import canvas as folders
    root,_,_,outside,_=setup(world);plan=prepare(world,root);body=request(world,plan);loaded=threading.Event();proceed=threading.Event();original=folders.canvas_folders_load
    def hold():
        value=original()
        if not loaded.is_set():loaded.set();assert proceed.wait(10)
        return value
    with patch.object(folders,'canvas_folders_load',hold),ThreadPoolExecutor(max_workers=1) as pool:
        renaming=pool.submit(world['editor'].patch,'/api/canvas-folders/'+root,headers=headers(world['a']),json={'name':'迟到改名'})
        assert loaded.wait(10)
        try:response=delete(world,root,body);assert response.status_code==200,response.text
        finally:proceed.set()
        renamed=renaming.result(timeout=10)
    assert renamed.status_code==409,renamed.text
    assert [item['id'] for item in world['editor'].get('/api/canvas-folders',headers=headers(world['a'])).json()['folders']]==[outside]


def test_folder_delete_tree_accepts_an_empty_tree_without_fabricated_canvas_proofs(world):
    response=world['editor'].post('/api/canvas-folders',headers=headers(world['a']),json={'name':'空文件夹'})
    root=response.json()['folder']['id'];plan=prepare(world,root);body=request(world,plan)
    assert body['canvases']==[]
    result=delete(world,root,body);assert result.status_code==200 and result.json()['canvas_ids']==[],result.text
