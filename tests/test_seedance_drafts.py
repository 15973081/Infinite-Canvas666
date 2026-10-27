"""No paid requests: exercise the real router with a captured transport."""
import asyncio
import time
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models import CanvasVideoRequest
from app.routers import canvas
from app.services import seedance_drafts as drafts
from app.services.volcengine_billing import pricing_context, video_accounting

MODEL = 'doubao-seedance-2-5-260628'
PROVIDER = {'id':'ark-test', 'protocol':'volcengine', 'base_url':'https://ark.cn-beijing.volces.com/api/v3'}


def payload(**values):
    return CanvasVideoRequest(**{'prompt':'饮料广告', 'provider_id':PROVIDER['id'], 'model':MODEL, **values})


@pytest.fixture
def source(monkeypatch):
    now = time.time()
    request = {'draft':True, 'model':MODEL, 'provider_id':PROVIDER['id'], 'duration':10,
               'resolution':'480p', 'videos':['asset://reference-video']}
    info = {'source_task_id':'canvas_vid_source1234', 'task_id':'upstream-draft',
            'model':MODEL, 'provider_id':PROVIDER['id'], 'created_at':now, 'expires_at':now+drafts.DRAFT_TTL}
    task = {'type':'video', 'status':'succeeded', 'provider_id':PROVIDER['id'], 'result':{'seedance_draft':info}}
    monkeypatch.setattr(drafts, 'get_canvas_task', lambda _: task)
    monkeypatch.setattr(drafts, 'get_canvas_task_request', lambda _: request)
    return task, request, info


@pytest.fixture
def transport(monkeypatch):
    class Captured(Exception): pass
    post = AsyncMock(side_effect=Captured)
    monkeypatch.setattr(canvas, 'get_api_provider', lambda _: PROVIDER)
    monkeypatch.setattr(canvas, 'provider_env_key_value', lambda _: 'unit-test-key')
    monkeypatch.setattr(canvas, 'api_headers', lambda **kwargs: {})
    monkeypatch.setattr(canvas, '_volcengine_video_pricing', lambda *args: None)
    monkeypatch.setattr(canvas, 'load_asset_library', lambda: {})
    monkeypatch.setattr(canvas, 'paid_post', post)
    def capture(request):
        with pytest.raises(Captured):
            asyncio.run(canvas.canvas_video_impl(request))
        return post.call_args.kwargs['json']
    return capture, post


def test_draft_request_uses_official_endpoint_and_5s_480p(transport):
    capture, post = transport
    body = capture(payload(draft=True, resolution='480p'))
    assert body == {'model':MODEL, 'content':[{'type':'text','text':'饮料广告'}],
                    'duration':5, 'ratio':'16:9', 'resolution':'480p', 'draft':True}
    assert post.call_args.args[1] == 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'


def test_upgrade_sends_no_inherited_fields_or_media(source, transport, monkeypatch):
    capture, _ = transport
    resolve = AsyncMock(side_effect=AssertionError('Upgrade must not upload references'))
    monkeypatch.setattr(canvas, 'volcengine_video_media_reference_url', resolve)
    body = capture(payload(draft_source_task_id=source[2]['source_task_id'], resolution='1080p',
                           duration=30, images=[{'url':'/missing.png'}], videos=['/missing.mp4'],
                           audios=['/missing.mp3'], seed=42, generate_audio=True, task_mode='edit'))
    assert body == {'model':MODEL, 'content':[{'type':'draft_task','draft_task':{'id':'upstream-draft'}}], 'resolution':'1080p'}
    resolve.assert_not_called()


@pytest.mark.parametrize('changes', [{'resolution':'720p'}, {'model':'doubao-seedance-2-0-260128'}])
def test_invalid_draft_never_submits(changes, transport):
    _, post = transport
    values={'draft':True,'resolution':'480p', **changes}
    with pytest.raises(HTTPException): asyncio.run(canvas.canvas_video_impl(payload(**values)))
    post.assert_not_called()


@pytest.mark.parametrize('base', ['https://aggregator.example', 'https://ark.cn-beijing.volces.com.evil.test',
                                 'http://ark.cn-beijing.volces.com', 'https://ark.cn-beijing.volces.com/proxy'])
def test_model_id_alone_does_not_enable_draft(base):
    with pytest.raises(HTTPException):
        drafts.validate(payload(draft=True,resolution='480p'), {**PROVIDER,'base_url':base})


@pytest.mark.parametrize('problem', ['failed','running','missing','ordinary','expired','provider','model','account'])
def test_invalid_upgrade_source_rejected(source, problem, monkeypatch):
    task, request, info = source
    if problem in {'failed','running'}: task['status']=problem
    if problem == 'missing': task.clear()
    if problem == 'ordinary': request['draft']=False
    if problem == 'expired': info['expires_at']=time.time()-1
    if problem == 'provider': task['provider_id']='another'
    if problem == 'model': request['model']='another'
    if problem == 'account':
        task['provider_account_ref']='old'
        monkeypatch.setattr('app.storage.task_requests.account_ref',lambda _:'new')
    with pytest.raises(HTTPException): drafts.validate(payload(draft_source_task_id='source',resolution='1080p'),PROVIDER)


@pytest.mark.parametrize('changes', [{'draft':True}, {'resolution':'720p'}])
def test_upgrade_mode_and_resolution_are_fixed(source, changes):
    with pytest.raises(HTTPException):
        drafts.validate(payload(**{'draft_source_task_id':'source','resolution':'1080p',**changes}),PROVIDER)


def test_metadata_uses_upstream_creation_and_survives_serialization(monkeypatch):
    import json
    created=12345
    draft=payload(draft=True,resolution='480p',client_task_id='canvas_vid_source1234')
    result=drafts.result_metadata(draft,{'created_at':created},'upstream-draft',PROVIDER)
    saved=json.loads(json.dumps(result))['seedance_draft']
    assert saved['expires_at']==created+drafts.DRAFT_TTL
    assert saved['source_task_id']==draft.client_task_id
    monkeypatch.setattr(drafts,'get_canvas_task',lambda _:{'created_at':created-10})
    assert drafts.result_metadata(draft,{},'upstream-draft',PROVIDER)['seedance_draft']['created_at']==created-10


def test_upgrade_billing_uses_original_video_input(source):
    req=drafts.accounting_request(payload(draft_source_task_id='source',resolution='1080p'))
    assert req['videos']==['asset://reference-video'] and req['duration']==10
    result=video_accounting({'model':MODEL,'resolution':'1080p','usage':{'completion_tokens':100000}},req,PROVIDER,pricing_context(PROVIDER))
    assert result['video_info']['has_video_input'] is True
    assert result['cost']['unit_price']=='46'


def test_finish_and_resume_preserve_draft_metadata(monkeypatch):
    monkeypatch.setattr(canvas,'postgres_enabled',lambda:False)
    monkeypatch.setattr(canvas,'save_remote_video_to_output',AsyncMock(return_value='/output/draft.mp4'))
    result=asyncio.run(canvas._finish_canvas_video(payload(draft=True,resolution='480p',client_task_id='local-task'),
        PROVIDER, {'created_at':12345,'content':{'video_url':'https://example.invalid/draft.mp4'}},'upstream-draft'))
    assert result['seedance_draft']['task_id']=='upstream-draft'
    assert result['seedance_draft']['source_task_id']=='local-task'
    assert result['videos']==['/output/draft.mp4']


def test_ordinary_request_serialization_stays_compatible():
    request=canvas._canvas_video_payload_dict(payload())
    assert 'draft' not in request and 'draft_source_task_id' not in request


def test_member_capability_does_not_expose_endpoint_or_credentials(monkeypatch):
    from app.services.member_gateway import public_provider_config
    monkeypatch.setattr('app.providers.registry.load_api_providers',lambda:[{**PROVIDER,'secret':'hidden'}])
    provider=public_provider_config()['providers'][0]
    assert provider['seedance_draft'] is True
    assert 'base_url' not in provider and 'secret' not in provider


def test_server_result_delivery_preserves_draft_identity(source, monkeypatch):
    from app.services import canvas_task_results
    from unittest.mock import Mock
    task, _, info=source
    aid='ast_'+'1'*32
    monkeypatch.setattr(canvas_task_results.media,'id_from_ref',lambda _:aid)
    monkeypatch.setattr(canvas_task_results.media,'stable_url',lambda _:'/api/media/'+aid+'/content')
    conn=Mock()
    conn.execute.return_value=[{'id':aid,'display_name':'sample.mp4','kind':'video'}]
    items=canvas_task_results.outputs(conn,{'kind':'video','result':{**task['result'],'videos':['sample']}})
    assert items[0]['seedance_draft']==info
    items[0]['seedance_draft']['task_id']='changed'
    assert info['task_id']=='upstream-draft'
    final=canvas_task_results.outputs(conn,{'kind':'video','result':{'videos':['final'],'draft_source_task_id':info['source_task_id']}})
    assert final[0]['draft_source_task_id']==info['source_task_id']
    assert 'seedance_draft' not in final[0]


def test_upgrade_admission_inherits_duration_and_keeps_idempotency(source,monkeypatch):
    from unittest.mock import Mock
    task, request, info=source
    monkeypatch.setattr(canvas,'postgres_enabled',lambda:False)
    monkeypatch.setattr(canvas,'get_api_provider',lambda _:PROVIDER)
    monkeypatch.setattr(canvas,'get_canvas_task_request',lambda _:request)
    monkeypatch.setattr(canvas,'task_billing_fields',lambda payload,kind:{'canvas_id':''})
    monkeypatch.setattr(canvas,'load_durable_canvas_task',lambda _:None)
    saved=[]
    monkeypatch.setattr(canvas,'save_durable_canvas_task',lambda task,payload:saved.append(payload) or task)
    monkeypatch.setattr(canvas,'CANVAS_TASKS',{})
    monkeypatch.setattr(canvas,'CANVAS_TASK_MAINTENANCE',{})
    original=payload(draft_source_task_id=info['source_task_id'],resolution='1080p',client_task_id='canvas_vid_upgrade1234')
    first,created=canvas._prepare_canvas_video_task(original)
    assert created and saved[0]['duration']==10
    retry=payload(draft_source_task_id=info['source_task_id'],resolution='1080p',client_task_id=first['task_id'])
    assert canvas._prepare_canvas_video_task(retry)[1] is False
    assert len(saved)==1
