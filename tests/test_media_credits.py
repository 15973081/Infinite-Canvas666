from copy import deepcopy
import pytest
from fastapi import HTTPException
from app.services import credit_policy, media_credits, video_duration

CASES = [
    ('volcengine','doubao-seedance-2-5-260628',{},210),
    ('volcengine','doubao-seedance-2-5-260628',{'draft':True,'resolution':'480p'},95),
    ('volcengine','doubao-seedance-2-0-260128',{},140),
    ('volcengine','doubao-seedance-2-0-fast-260128',{},110),
    ('volcengine','doubao-seedance-2-0-mini-260615',{},70),
    ('volcengine','doubao-seedance-1-5-pro-251215',{},25),
    ('volcengine','doubao-seedance-1-5-pro-251215',{'generate_audio':True},50),
    ('volcengine','doubao-seedance-1-0-pro-250528',{},50),
    ('volcengine','doubao-seedance-1-0-lite-t2v-250428',{},25),
    ('volcengine','doubao-seedance-1-0-lite-i2v-250428',{},25),
    ('mediakit','enhance-video',{},3),
    ('mediakit','erase-video-subtitle',{},6),
    ('mediakit','erase-video-subtitle-pro',{},12),
    ('mediakit','video-understand-router',{},4),
    ('mediakit','video-understand-router',{'level':'Economy'},2),
    ('mediakit','video-understand-router',{'level':'Quality'},8),
]


@pytest.mark.parametrize('provider,model,options,expected', CASES)
def test_media_credits_explicit_quotes(provider,model,options,expected):
    request={'provider_id':provider,'model':model,'duration':5,**options}
    metadata=[]
    if provider=='mediakit':
        request['videos']=['input'];metadata=[{'ref':'input','seconds':3}]
    quote=media_credits.prepare_quote(credit_policy.defaults(),request,input_metadata=metadata,now=1800000000)
    assert quote['quote']['credits']==expected
    assert quote['input']['count']==1


@pytest.mark.parametrize('version,rates',[('standard',[1,1,2,3,5]),('professional',[2,2,3,5,8])])
def test_media_credits_upscale_matrix(version,rates):
    for resolution,rate in zip(['720p','1080p','2k','4k','8k'],rates):
        q=media_credits.prepare_quote(credit_policy.defaults(),{'provider_id':'mediakit','model':'enhance-video',
            'tool_version':version,'resolution':resolution,'videos':['input']},input_metadata=[{'ref':'input','seconds':7}])
        assert q['quote']['credits']==rate*7


@pytest.mark.parametrize('options',[{'duration':-1},{'duration':5,'task_mode':'edit'}, {'duration':5,'task_mode':'extend_backward'}])
def test_media_credits_auto_duration_and_input_seconds(options):
    request={'provider_id':'volcengine','model':'doubao-seedance-2-5-260628','videos':['input'],**options}
    q=media_credits.prepare_quote(credit_policy.defaults(),request,input_metadata=[{'ref':'input','seconds':3}])
    assert q['quote']['credits']==30*30+30*3
    assert q['basis']=={'duration_seconds':30,'automatic_duration':True,'resolution':'720P','automatic_resolution':True,'draft_source_task_id':None}
    actual=credit_policy.model_quote({'rules':[q['rule']]},**{**q['input'],'params':{**q['input']['params'],'duration':8}},now=q['quoted_at'])
    assert actual['credits']==30*8+30*3


def test_media_credits_missing_input_seconds_or_unpriced_specs_reject():
    request={'provider_id':'volcengine','model':'doubao-seedance-2-5-260628','duration':5,'videos':['external']}
    with pytest.raises(HTTPException) as error:
        media_credits.prepare_quote(credit_policy.defaults(),request)
    assert error.value.detail['code']=='credit_input_video_duration_required'
    with pytest.raises(HTTPException):
        media_credits.prepare_quote(credit_policy.defaults(),{**request,'videos':[],'resolution':'8k'})


@pytest.mark.parametrize('value,expected',[(0,None),(-1,None),(None,None),(True,None),('bad',None),
    (float('nan'),None),(float('inf'),None),(0.1,1),(1,1),(1.01,2),('8.2',9)])
def test_video_seconds_are_positive_ceiling_or_unknown(value,expected):
    assert video_duration.seconds(value)==expected


def test_media_policy_merges_only_missing_new_rules_and_preserves_customizations():
    config=credit_policy.defaults()
    config['creditsPerCNY']=23
    config['rules']=[r for r in config['rules'] if r['modelCode'] not in credit_policy.MEDIA_RULE_CODES]
    original=deepcopy(config)
    class Conn:
        def execute(self,*args):return self
        def fetchone(self):return {'config':config,'version':7}
    merged=credit_policy.read(Conn())
    assert merged['version']==7 and merged['config']['creditsPerCNY']==23
    assert len(merged['config']['rules'])==84 and config==original
    custom=next(r for r in merged['config']['rules'] if r['modelCode']=='MEDIAKIT_SMART_ERASE')
    custom.update(basePrice=13,enabled=False)
    config['rules'].append(custom)
    result=credit_policy.read(Conn())
    assert next(r for r in result['config']['rules'] if r['modelCode']==custom['modelCode'])==custom
