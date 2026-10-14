"""Owned full-video frames enter one durable LLM request and its saved reply."""
import os,base64,io,json,uuid
from unittest.mock import patch
import httpx,pytest
from PIL import Image
from test_cloud_member_gateway import operator,world,headers
from test_cloud_canvas_leases import proof
from test_cloud_llm_tasks import prepared,submit,execute
from test_video_analysis import two_scene_video

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('sampling',['uniform','head'])
def test_owned_video_sampling_reaches_the_model_and_preserves_one_paid_submission(world,two_scene_video,sampling):
    from app.storage import media,database
    from app.storage.workspace import workspace_scope
    path,canvas,lease,body=prepared(world,'smart')
    with workspace_scope(world['a']['id']),media.operation_scope():
        url=media.stable_url(media.publish(two_scene_video))
        from app.services.media import is_image_reference_value,is_video_reference_value
        canonical='/api/media/'+media.id_from_ref(url)+'/content'
        assert is_video_reference_value(canonical) and not is_image_reference_value(canonical)
    nodes=canvas['nodes']+[{'id':'video','type':'smart-image','images':[{'url':url,'kind':'video'}]}]
    saved=world['editor'].put(path,headers=proof(world,lease,canvas['revision']),json={'nodes':nodes,'connections':[{'from':'video','to':'source','kind':'input'}],'base_revision':canvas['revision']})
    assert saved.status_code==200,saved.text
    body.update(videos=[url],video_sampling=sampling,video_frames=12 if sampling=='uniform' else 6,canvas_target={**body['canvas_target'],'base_revision':saved.json()['canvas']['revision']})
    assert submit(world,body,lease).status_code==200
    calls=[];reply=json.dumps({'shots':[{'duration':6,'description':'红色画面'},{'duration':2,'description':'蓝色画面'}]},ensure_ascii=False)
    async def supplier(client,url,**kwargs):
        calls.append(kwargs['json']);return httpx.Response(200,request=httpx.Request('POST',url),json={'choices':[{'message':{'content':reply}}],'usage':{'prompt_tokens':30,'completion_tokens':20,'total_tokens':50}})
    with patch.object(httpx.AsyncClient,'post',supplier):task=execute(world,body['client_task_id'])
    assert task['status']=='succeeded',task
    assert len(calls)==1 and task['result']['text']==reply
    content=calls[0]['messages'][-1]['content'];text='\n'.join(item.get('text','') for item in content)
    frames=[item['image_url']['url'] for item in content if item['type']=='image_url'];assert len(frames)==(8 if sampling=='uniform' else 6)
    if sampling=='uniform':assert '总时长 8.0 秒' in text and '时间 7.5 秒' in text and '不包含音频' in text
    with Image.open(io.BytesIO(base64.b64decode(frames[-1].split(',')[1]))) as image:
        pixel=image.convert('RGB').getpixel((32,24));assert pixel[2 if sampling=='uniform' else 0]>200
    with database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(task['id'],)).fetchone()['n']==1
        assert conn.execute("SELECT count(*) AS n FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s",(task['id'],)).fetchone()['n']==1
    assert world['viewer'].get('/api/canvas-llm-tasks/'+task['id'],headers=headers(world['a'])).json()['result']['text']==reply


def test_invalid_video_fails_before_paid_post_and_external_video_is_not_downloaded(world,tmp_path):
    from app.storage import media
    from app.storage.workspace import workspace_scope
    _,_,lease,body=prepared(world,'smart')
    body.update(videos=['https://external-video.test/video.mp4'],video_sampling='uniform')
    accepted=submit(world,body,lease)
    assert accepted.status_code in {400,404},accepted.text
    body['client_task_id']='canvas_llm_'+uuid.uuid4().hex;body['videos']=[]
    missing=submit(world,body,lease);assert missing.status_code==422
    assert '全片取帧' in missing.json()['detail'] and isinstance(missing.json()['errors'][0]['ctx']['error'],str)
    with workspace_scope(world['a']['id']),media.operation_scope():
        file=tmp_path/'broken.mp4';file.write_bytes(b'not a video');body['videos']=[media.stable_url(media.publish(file))]
    accepted=submit(world,body,lease);assert accepted.status_code==200,accepted.text
    with patch.object(httpx.AsyncClient,'post') as post:task=execute(world,body['client_task_id'])
    assert task['status']=='failed' and post.call_count==0
    from app.storage.database import connection
    with connection() as conn:assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s',(task['id'],)).fetchone()['n']==0
