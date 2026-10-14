"""Real database-backed 3D admission, signed submission, polling and immutable GLB."""
import os,json,socket,uuid
from pathlib import Path
from contextlib import asynccontextmanager
from unittest.mock import patch
import httpx,pytest
from test_cloud_member_gateway import operator,world,headers
from test_cloud_management import platform
from test_cloud_canvas_leases import setup_canvas,acquire,proof
from test_cloud_audio_tasks import execute

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
GLB=Path(__file__).parent/'fixtures'/'pixmax-generated-model.glb'


def prepared(world,platform):
    pid='model-'+uuid.uuid4().hex[:16]
    config={'name':'混元3D验收','protocol':'hunyuan3d','base_url':'https://api-model.test','model_models':['3.0','3.1'],'enabled':True,
        'model_prices':[{'kind':'model','model':'3.0','billing_type':'per_call','unit_price':'12','currency':'CNY'}]}
    saved=platform['client'].put('/api/providers/'+pid,json={'config':config,'expected_version':0,'reason':'3D隔离验收','secrets':{'hunyuan_secret_id':'test-secret-id','hunyuan_secret_key':'test-secret-key'}})
    assert saved.status_code==200,saved.text
    assigned=platform['client'].put('/api/provider-assignments',params={'workspace':world['a']['id']},json={'expected_version':1,'provider_ids':[pid],'primary_provider_id':pid,'reason':'3D测试分配'})
    assert assigned.status_code==200,assigned.text
    path,canvas=setup_canvas(world,'smart');lease=acquire(world,path)
    node={'id':'source','type':'smart-model','images':[],'modelGeneration':{'model':'3.0','prompt':'一只陶瓷小猫','mode':'text'}}
    saved=world['editor'].put(path,headers=proof(world,lease),json={'nodes':[node],'connections':[],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    canvas=saved.json()['canvas'];body={'canvas_id':canvas['id'],'client_task_id':'canvas_model_'+uuid.uuid4().hex,'provider_id':pid,'model':'3.0','prompt':'一只陶瓷小猫',
        'canvas_target':{'source_node_id':'source','target_node_id':'source','base_revision':canvas['revision']},'mode':'text','generate_type':'Normal','enable_pbr':True,'face_count':300000}
    return path,canvas,lease,body,config


def submit(world,body,lease):return world['editor'].post('/api/canvas-model-tasks',headers=proof(world,lease,body['canvas_target']['base_revision']),json=body)


def supplier(calls,states):
    async def response(client,url,**kwargs):
        action=kwargs['headers']['X-TC-Action'];payload=json.loads(kwargs['content']);calls.append({'action':action,'body':payload,'headers':kwargs['headers']})
        value={'JobId':'original-hunyuan-job'} if action=='SubmitHunyuanTo3DProJob' else {'Status':states.pop(0),'ResultFile3Ds':[{'Type':'GLB','Url':'https://public-model.test/cube.glb'}],'ResultCreditConsumed':20}
        return httpx.Response(200,request=httpx.Request('POST',url),json={'Response':value})
    return response


@asynccontextmanager
async def stream(client,method,url,**kwargs):
    assert method=='GET' and url=='https://public-model.test/cube.glb'
    yield httpx.Response(200,content=GLB.read_bytes(),headers={'Content-Type':'model/gltf-binary'},request=httpx.Request('GET',url))


def dns(host,*args,**kwargs):
    assert host=='public-model.test'
    return [(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]


def test_model_task_polls_original_job_and_saves_real_glb_on_existing_node(world,platform):
    from app.storage.database import connection
    path,canvas,lease,body,_=prepared(world,platform)
    assert submit(world,body,lease).status_code==200
    config=world['editor'].get('/api/config',headers=headers(world['a'])).json()
    assert config['api_providers'][0]['has_key'] and config['api_providers'][0]['model_models']==['3.0','3.1']
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['WAIT','DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):
        waiting=execute(world,body['client_task_id']);assert waiting['status']=='polling' and waiting['upstream_task_id']=='original-hunyuan-job'
        task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded',task
    assert [call['action'] for call in calls]==['SubmitHunyuanTo3DProJob','QueryHunyuanTo3DProJob','QueryHunyuanTo3DProJob']
    assert calls[0]['body']=={'Model':'3.0','GenerateType':'Normal','EnablePBR':True,'FaceCount':300000,'Prompt':'一只陶瓷小猫'}
    assert calls[0]['headers']['Authorization'].startswith('TC3-HMAC-SHA256 Credential=test-secret-id/')
    result=task['result']['models'][0];assert world['viewer'].get(result,headers=headers(world['a'])).content==GLB.read_bytes()
    document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas']
    assert document['nodes'][0]['type']=='smart-model' and document['nodes'][0]['images'][0]['kind']=='model'
    with connection() as conn:
        assert conn.execute('SELECT media_kind FROM generation_outputs WHERE task_id=%s',(task['id'],)).fetchone()['media_kind']=='model'
        assert conn.execute("SELECT cost_json FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(task['id'],)).fetchone()['cost_json']['amount_micros']==12000000
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(task['id'],)).fetchone()['n']==1
    assert 'test-secret-key' not in str(task)


def test_model_unknown_paid_submission_keeps_review_and_unknown_cost(world,platform):
    from app.storage.database import connection
    _,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    with patch.object(httpx.AsyncClient,'post',side_effect=httpx.ReadTimeout('response lost')) as post:task=execute(world,body['client_task_id'])
    assert task['status']=='needs_review' and post.call_count==1
    with connection() as conn:
        cost=conn.execute("SELECT cost_json FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(task['id'],)).fetchone()['cost_json']
        assert cost['status']=='unknown' and not cost.get('amount_micros')


@pytest.mark.parametrize('remove_before_completion',[True,False])
def test_model_deleted_target_delivers_or_joins_a_previewable_asset_once(world,platform,remove_before_completion):
    from app.storage.database import connection
    path,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    def remove():
        document=world['editor'].get(path,headers=headers(world['a'])).json()['canvas']
        response=world['editor'].put(path,headers=proof(world,lease,document['revision']),json={
            'nodes':[],'connections':[],'base_revision':document['revision'],'task_result_version':document.get('task_result_version',0)})
        assert response.status_code==200,response.text
        assert response.json()['canvas']['nodes']==[]
        return response.json()['canvas']
    if remove_before_completion:remove()
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):
        task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded',task
    if not remove_before_completion:
        document=remove()
        response=world['editor'].post(path+'/task-results/'+task['id']+'/join',headers=proof(world,lease,document['revision']))
        assert response.status_code==200,response.text
    document=world['viewer'].get(path,headers=headers(world['a'])).json()['canvas']
    assert len(document['nodes'])==1
    result=document['nodes'][0]
    assert result['type']=='smart-model' and result['pixmaxSourceType']=='BASE_3D'
    assert result['images'][0]['kind']=='model'
    assert world['viewer'].get(result['images'][0]['url'],headers=headers(world['a'])).content==GLB.read_bytes()
    repeated=world['editor'].post(path+'/task-results/'+task['id']+'/join',headers=proof(world,lease,document['revision']))
    assert repeated.status_code==200 and repeated.json()['already_in_canvas']
    assert len(repeated.json()['canvas']['nodes'])==1
    assert sum(call['action']=='SubmitHunyuanTo3DProJob' for call in calls)==1
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(task['id'],)).fetchone()['n']==1


def test_model_readonly_bad_version_and_missing_reference_are_rejected_before_supplier(world,platform):
    _,_,lease,body,_=prepared(world,platform)
    assert world['viewer'].post('/api/canvas-model-tasks',headers=headers(world['a']),json=body).status_code==403
    assert submit(world,{**body,'model':'3.1','generate_type':'LowPoly'},lease).status_code==422
    assert submit(world,{**body,'mode':'image','images':['/assets/cloud/ast_'+'a'*32+'/missing.png'],'prompt':''},lease).status_code in {400,404}


def test_model_workflow_zip_keeps_glb_bytes_parameters_and_image_view_identity(world,platform,tmp_path):
    import io,zipfile
    from PIL import Image
    from app.storage import media
    from app.storage.workspace import workspace_scope
    path,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):
        assert execute(world,body['client_task_id'])['status']=='succeeded'
    document=world['editor'].get(path,headers=headers(world['a'])).json()['canvas']
    with workspace_scope(world['a']['id']),media.operation_scope():
        file=tmp_path/'front.png';Image.new('RGB',(256,256),(120,100,180)).save(file);url=media.stable_url(media.publish(file))
    document['nodes'].append({'id':'front','type':'smart-image','images':[{'url':url,'kind':'image'}]})
    document['nodes'][0]['modelViews']=[{'url':url,'view':'front'}]
    exported=world['editor'].post('/api/canvas-workflows/export',headers=headers(world['a']),json={
        'nodes':document['nodes'],'connections':[{'from':'front','to':'source','kind':'input'}],'include_resources':True})
    assert exported.status_code==200,exported.text
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        assert any(archive.read(name)==GLB.read_bytes() for name in archive.namelist() if name!='workflow.json')
    imported=world['editor'].post('/api/canvas-workflows/import',headers=headers(world['a']),files={'file':('model.zip',exported.content,'application/zip')})
    assert imported.status_code==200,imported.text
    nodes=imported.json()['nodes'];generator=next(node for node in nodes if node['id']=='source');image=next(node for node in nodes if node['id']=='front')
    assert generator['modelGeneration']==document['nodes'][0]['modelGeneration']
    assert generator['modelViews']==[{'url':image['images'][0]['url'],'view':'front'}]
    assert world['viewer'].get(generator['images'][0]['url'],headers=headers(world['a'])).content==GLB.read_bytes()


def test_model_publication_failure_recovers_without_querying_or_resubmitting(world,platform):
    from app.storage import media
    _,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    original=media.publish
    def failed(*args,**kwargs):
        if kwargs.get('role')=='generated':raise RuntimeError('output publication failure')
        return original(*args,**kwargs)
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns),patch.object(media,'publish',failed):
        task=execute(world,body['client_task_id'])
    assert task['status']=='finalizing',task
    with patch.object(httpx.AsyncClient,'post',side_effect=AssertionError('new API call')),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):
        task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded' and len(calls)==2


@pytest.mark.parametrize('mode,model,views',[('image','3.0',[]),('multi','3.0',['front','left','back']),('multi','3.1',['front','top','bottom','left_front'])])
def test_model_owned_image_modes_keep_explicit_view_assignment(world,platform,tmp_path,mode,model,views):
    from PIL import Image
    from app.storage import media
    from app.storage.workspace import workspace_scope
    path,canvas,lease,body,_=prepared(world,platform);urls=[];sources=[]
    with workspace_scope(world['a']['id']),media.operation_scope():
        for index in range(len(views) or 1):
            file=tmp_path/(str(index)+'.png');Image.new('RGB',(256,256),(index*50,100,180)).save(file)
            url=media.stable_url(media.publish(file));urls.append(url);sources.append({'id':'image'+str(index),'type':'smart-image','images':[{'url':url,'kind':'image'}]})
    saved=world['editor'].put(path,headers=proof(world,lease,canvas['revision']),json={'nodes':canvas['nodes']+sources,'connections':[{'from':source['id'],'to':'source','kind':'input'} for source in sources],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    body.update(mode=mode,model=model,images=urls,view_types=views,prompt='',canvas_target={**body['canvas_target'],'base_revision':saved.json()['canvas']['revision']})
    assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['WAIT'])):task=execute(world,body['client_task_id'])
    assert task['status']=='polling',task
    wire=calls[0]['body'];assert 'ImageBase64' in wire and 'Prompt' not in wire
    assert [item['ViewType'] for item in wire.get('MultiViewImages',[])]==views[1:]
    assert wire['Model']==model and all(len(item['ViewImageBase64'])>100 for item in wire.get('MultiViewImages',[]))


def test_model_readonly_poll_failure_keeps_original_job_available_for_retry(world,platform):
    _,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['WAIT'])):task=execute(world,body['client_task_id'])
    assert task['status']=='polling'
    with patch.object(httpx.AsyncClient,'post',side_effect=httpx.ReadTimeout('query unavailable')) as post:task=execute(world,body['client_task_id'])
    assert task['status']=='polling' and task['upstream_task_id']=='original-hunyuan-job' and post.call_count==1
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded' and sum(call['action']=='SubmitHunyuanTo3DProJob' for call in calls)==1


def test_model_expired_execution_recovers_known_job_and_offers_original_polling_review(world,platform):
    from app.storage import tasks,database
    from app.storage.workspace import workspace_scope
    from app.services.task_reviews import capabilities
    _,_,lease,body,_=prepared(world,platform);assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['WAIT'])):task=execute(world,body['client_task_id'])
    with workspace_scope(world['a']['id']),database.connection() as conn:
        conn.execute("UPDATE tasks SET status='running',lease_owner='expired-model-worker',lease_token=gen_random_uuid(),lease_until='2000-01-01' WHERE id=%s",(task['id'],))
        tasks.recover_expired()
        row=conn.execute('SELECT * FROM tasks WHERE id=%s',(task['id'],)).fetchone()
        assert row['status']=='polling'
        review={**row,'status':'needs_review','legacy_metadata':{},'leased':False}
        assert 'resume_polling' in capabilities(review,False,1,'matched')
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded' and sum(call['action']=='SubmitHunyuanTo3DProJob' for call in calls)==1


def test_model_hidden_after_submission_can_finish_original_job_with_original_price(world,platform):
    from app.storage.database import connection
    _,_,lease,body,config=prepared(world,platform);assert submit(world,body,lease).status_code==200
    calls=[]
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['WAIT'])):assert execute(world,body['client_task_id'])['status']=='polling'
    config['model_policies']={'model:3.0':{'visible':False,'enabled':False}};config['model_prices'][0]['unit_price']='99'
    assert platform['client'].put('/api/providers/'+body['provider_id'],json={'config':config,'expected_version':1,'reason':'停止新调用并调整新价格'}).status_code==200
    with patch.object(httpx.AsyncClient,'post',supplier(calls,['DONE'])),patch.object(httpx.AsyncClient,'stream',stream),patch.object(socket,'getaddrinfo',dns):task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded',task
    with connection() as conn:assert conn.execute("SELECT cost_json FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(task['id'],)).fetchone()['cost_json']['amount_micros']==12000000
