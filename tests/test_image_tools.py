from contextlib import contextmanager
from copy import deepcopy
import pytest
from fastapi import HTTPException
from app.models import OnlineImageRequest
from app.services import image_tools as tools


def config():
    value = tools.defaults()
    value['depth'].update(enabled=True, provider_id='managed', model='image-model', ratio='16:9', resolution='4k')
    return value


def test_defaults_disabled_and_resolution_tiers():
    from app.services.model_commercial import image_resolution
    assert all(not c['enabled'] for c in tools.defaults().values())
    for ratio in tools.RATIOS:
        for tier in tools.RESOLUTIONS:
            assert image_resolution({'size': tools.size({'ratio': ratio, 'resolution': tier})}) == tier
    assert tools.size({'ratio':'2:1','resolution':'2k'}) == '2048x1024'


@pytest.mark.parametrize('field,value', [('resolution','8k'),('ratio','0:1'),('quality','invalid'),('enabled','yes'),('prompt',''),('model','')])
def test_invalid_configuration_is_rejected(field, value):
    data = config(); data['depth'][field] = value
    with pytest.raises(HTTPException): tools.normalize(data)


@pytest.fixture
def configured(monkeypatch):
    from app.storage import settings, media
    @contextmanager
    def tx(**kwargs): yield object()
    data = {'config': config(), 'revision': 7}
    checks = []
    monkeypatch.setattr(tools.az,'policy_transaction',tx)
    monkeypatch.setattr(tools,'current_workspace',lambda:'space-a')
    monkeypatch.setattr(tools,'read',lambda conn,workspace: deepcopy(data) if workspace=='space-a' else pytest.fail('wrong workspace'))
    monkeypatch.setattr(tools,'available_provider',lambda conn,workspace,item: checks.append((workspace,item['provider_id'])))
    monkeypatch.setattr(settings,'postgres_enabled',lambda:True)
    monkeypatch.setattr(media,'get_asset',lambda url: {'kind':'image'} if url=='/assets/reference.png' else None)
    return data,checks


def request(**kwargs):
    return OnlineImageRequest(canvas_id='canvas-a', prompt='client override', image_tool='depth',image_tool_revision=7,
                              reference_images=[{'url':'/assets/reference.png'}], **kwargs)


def test_managed_parameters_override_client_before_enqueue(configured):
    payload = request(provider_id='other',model='cheaper-model',size='1024x1024',quality='low',n=8)
    tools.apply(payload)
    assert (payload.provider_id,payload.model,payload.size,payload.quality,payload.n)==('managed','image-model','4096x2304','auto',1)
    assert payload.prompt==tools.PROMPTS['depth']
    assert configured[1]==[('space-a','managed')]
    assert payload.reference_images[0].url=='/assets/reference.png'


@pytest.mark.parametrize('case',['changed','disabled','foreign_asset','no_reference','two_references','no_canvas'])
def test_submission_rejects_stale_disabled_or_invalid_inputs(configured, case):
    payload=request()
    if case=='changed':payload.image_tool_revision=6
    if case=='disabled':configured[0]['config']['depth']['enabled']=False
    if case=='foreign_asset':payload.reference_images[0].url='/assets/foreign.png'
    if case=='no_reference':payload.reference_images=[]
    if case=='two_references':payload.reference_images*=2
    if case=='no_canvas':payload.canvas_id=''
    with pytest.raises(HTTPException):tools.apply(payload)


def test_unavailable_models_and_specifications_are_not_accepted():
    class Row:
        def __init__(self,row):self.row=row
        def fetchone(self):return self.row
    class Conn:
        def __init__(self,row):self.row=row
        def execute(self,query,args):
            assert args==('space-a','managed')
            assert 'g.workspace_id=%s' in query
            return Row(self.row)
    item=config()['depth']
    for row in [None,{'config':{'image_models':[]}}, {'config':{'image_models':['image-model'],'model_policies':{'image:image-model':{'resolutions':['1k']}}}}]:
        with pytest.raises(HTTPException):tools.available_provider(Conn(row),'space-a',item)


def test_configuration_revision_conflict_prevents_write(monkeypatch):
    class Conn:
        def execute(self,query,args):
            assert query.startswith('SELECT 1 FROM workspaces')
            return self
        def fetchone(self):return {'ok':1}
    @contextmanager
    def tx(**kwargs):yield Conn()
    monkeypatch.setattr(tools.az,'policy_transaction',tx)
    monkeypatch.setattr(tools.provider_control,'require_admin',lambda *a:None)
    monkeypatch.setattr(tools.az,'require',lambda *a:None)
    monkeypatch.setattr(tools,'read',lambda *a:{'config':config(),'revision':8})
    with pytest.raises(HTTPException) as error:
        tools.management(object(),'space-a',config=config(),expected_revision=7,reason='test')
    assert error.value.status_code==409


def test_management_rejects_non_admin_before_reading_configuration(monkeypatch):
    @contextmanager
    def tx(**kwargs):yield object()
    monkeypatch.setattr(tools.az,'policy_transaction',tx)
    def forbidden(*args):raise HTTPException(403,'denied')
    monkeypatch.setattr(tools.provider_control,'require_admin',forbidden)
    monkeypatch.setattr(tools,'read',lambda *a:pytest.fail('must not read'))
    with pytest.raises(HTTPException):tools.management(object(),'space-a')


def test_standard_request_serialization_remains_compatible():
    from app.routers.canvas import _canvas_video_payload_dict
    assert 'image_tool' not in _canvas_video_payload_dict(OnlineImageRequest(prompt='normal'))
    assert _canvas_video_payload_dict(request())['image_tool']=='depth'


def test_real_prepare_prices_the_authoritative_tool_parameters(configured, monkeypatch):
    from app.routers import canvas
    monkeypatch.setattr(canvas,'postgres_enabled',lambda:True)
    monkeypatch.setattr(canvas,'get_api_provider',lambda pid:{'id':pid})
    monkeypatch.setattr(canvas,'load_canvas',lambda cid:None)
    class ReachedBilling(Exception):pass
    def bill(payload,kind):
        assert kind=='image'
        assert payload.provider_id=='managed' and payload.size=='4096x2304' and payload.n==1
        assert payload.prompt==tools.PROMPTS['depth']
        raise ReachedBilling()
    monkeypatch.setattr(canvas,'task_billing_fields',bill)
    with pytest.raises(ReachedBilling):canvas._prepare_canvas_image_task(request(provider_id='client-override',n=8))
