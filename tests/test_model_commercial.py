import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from app.services.model_commercial import policies, discounts, enforce, public_models, amounts, image_resolution
from app.providers.registry import normalize_model_prices, merge_model_price_history
from app.services.canvas_ledger import historical_price, price_log
from app.services.volcengine_billing import pricing_context, video_accounting


def provider():
    return {'id':'demo','image_models':['m','old'], 'model_prices':normalize_model_prices([
        {'kind':'image','model':'m','billing_type':'per_image','unit_price':p,'resolution':s}
        for s,p in [('', '9'),('1k','1'),('2k','2'),('4k','4')]]),
        'model_discounts':discounts([{'kind':'image','model':'m','rate':'0.8','effective_from':100,'effective_to':200,'label':'八折'}])}


@pytest.mark.parametrize('size,tier',[('1024x1024','1k'),('1536x1024','1k'),('2048x1360','2k'),('4096x4096','4k'),('3840x2160','4k'),('2K','2k')])
def test_tiers_follow_upstream(size,tier):
    assert image_resolution({'size':size,'resolution':'1k'})==tier


def test_price_tier_discount_boundaries_and_frozen_snapshot():
    p=provider();info={'providerId':'demo','kind':'image','model':'m'}
    request={'size':'2048x1360'}
    snapshot=historical_price(info,100,[p],request)
    assert snapshot['unit_price']=='2'
    log={'createdAt':100,'providerId':'demo','billingKind':'image','billingModel':'m','outputs':['a','b'],'request':request}
    cost=price_log(log,[],snapshot)
    assert (cost['base_amount_micros'],cost['discount_rate'],cost['amount_micros'],cost['discount_amount_micros'])==(4000000,'0.8',3200000,800000)
    p['model_discounts'][0]['rate']='0.1'
    p['model_prices'][2]['unit_price']='20'
    assert price_log(log,[],snapshot)==cost
    for at in [99,200]:
        assert 'commercial_discount' not in historical_price(info,at,[p],request)
    assert price_log({**log,'cost':cost},[p])['amount_micros']==3200000


def test_config_validation_and_history():
    with pytest.raises(ValueError): discounts([{'kind':'image','model':'m','rate':'1.2'}])
    with pytest.raises(ValueError): discounts([{'kind':'image','model':'m','rate':'0.8','effective_from':10,'effective_to':20},{'kind':'image','model':'m','rate':'0.5','effective_from':19}])
    with pytest.raises(ValueError): policies({'image:m':{'resolutions':[]}})
    old=merge_model_price_history([],provider()['model_prices'],100)
    assert all(r['effective_from']==100 for r in old)
    desired=deepcopy(old);desired[1]['unit_price']='3'
    updated=merge_model_price_history(old,desired,200)
    p=provider();p['model_prices']=updated
    info={'providerId':'demo','kind':'image','model':'m'}
    assert historical_price(info,199,[p],{'size':'1024x1024'})['unit_price']=='1'
    assert historical_price(info,200,[p],{'size':'1024x1024'})['unit_price']=='3'
    assert historical_price(info,99,[p],{'size':'1024x1024'}) is None


def test_policies_reject_hidden_disabled_and_spoofed_resolution():
    p=provider();p['model_policies']=policies({'image:old':{'visible':False},'image:m':{'resolutions':['1k']}})
    assert public_models(p)['image_models']==['m']
    assert p['image_models']==['m','old']
    with pytest.raises(HTTPException): enforce(p,'image',{'model':'old','size':'1024x1024'})
    with pytest.raises(HTTPException): enforce(p,'image',{'model':'m','size':'4096x4096','resolution':'1k'})
    enforce(p,'image',{'model':'m','size':'1024x1024'})
    p['model_policies']['image:m']['enabled']=False
    with pytest.raises(HTTPException): enforce(p,'image',{'model':'m','size':'1024x1024'})


def test_free_discount_and_micro_rounding():
    assert amounts(Decimal('1'),{'commercial_discount':{'rate':'0.5'}})['amount_micros']==1
    assert amounts(Decimal('1234567'),{'commercial_discount':{'rate':'0'}})['amount_micros']==0
    assert normalize_model_prices([{'kind':'image','model':'m','unit_price':'0','billing_type':'per_image','resolution':'4k'}])[0]['unit_price']=='0'


def test_video_usage_additional_discount_is_frozen_once():
    p={'id':'demo','model_prices':[{'kind':'video','model':'v','resolution':'720p','has_video_input':False,'billing_type':'per_million_tokens','unit_price':'10'}], 'model_discounts':discounts([{'kind':'video','model':'v','rate':'0.8','effective_from':10,'effective_to':20}])}
    context=pricing_context(p,15);p['model_discounts'][0]['rate']='0.2'
    result=video_accounting({'usage':{'completion_tokens':1000},'resolution':'720p'},{'model':'v'},p,context)['cost']
    assert result['base_amount_micros']==10000 and result['amount_micros']==8000


@pytest.mark.parametrize('at,expected',[
    (99, (10000000,10000000,10000000)),
    (100,(8000000,10000000,10000000)),
    (150,(8000000,5000000,10000000)),
    (200,(10000000,5000000,10000000)),
    (250,(10000000,10000000,10000000)),
])
def test_each_model_has_its_own_discount_window_and_rate(at,expected):
    p={'id':'demo','model_prices':normalize_model_prices([
        {'kind':'image','model':m,'billing_type':'per_image','unit_price':'10'}
        for m in ('a','b','c')]),'model_discounts':discounts([
        {'kind':'image','model':'a','rate':'0.8','effective_from':100,'effective_to':200},
        {'kind':'image','model':'b','rate':'0.5','effective_from':150,'effective_to':250},
    ])}
    # Another provider exposes the same IDs but has independent commercial terms.
    other={**deepcopy(p),'id':'other','model_discounts':[]}
    for model,amount in zip(('a','b','c'),expected):
        log={'createdAt':at,'providerId':'demo','billingKind':'image',
             'billingModel':model,'outputs':['one'],'request':{}}
        snapshot=historical_price({'providerId':'demo','kind':'image','model':model},at,[p,other],{})
        assert price_log(log,[],snapshot)['amount_micros']==amount
        other_price=historical_price({'providerId':'other','kind':'image','model':model},at,[p,other],{})
        assert price_log({**log,'providerId':'other'},[],other_price)['amount_micros']==10000000


from app.services.model_commercial import attach_discount


def scoped_rule(**extra):
    return dict(kind='video', model='v', rate='0.9', effective_from=100, effective_to=200, **extra)


@pytest.mark.parametrize('resolution,video,expected',[
    ('480p',False,'0.9'),('720p',False,'0.8'),('720p',True,'0.6'),('1080p',True,'0.9')])
def test_specific_discount_overrides_without_multiplication(resolution,video,expected):
    rules=[scoped_rule(),{**scoped_rule(resolution='720p'),'rate':'0.8'},
           {**scoped_rule(resolution='720p',has_video_input=True),'rate':'0.6'}]
    for ordered in (rules,list(reversed(rules))):
        p={'model_discounts':discounts(ordered)}
        price=attach_discount({'unit_price':'10'},p,'video','v',100,
                              {'resolution':resolution,'has_video_input':video})
        assert price['commercial_discount']['rate']==expected
        assert amounts(1000000,price)['amount_micros']==int(Decimal(expected)*1000000)
        assert 'commercial_discount' not in attach_discount({'unit_price':'10'},p,'video','v',200)


@pytest.mark.parametrize('second',[
    scoped_rule(resolution='720p'), scoped_rule(has_video_input=True)])
def test_ambiguous_scope_overlap_is_rejected(second):
    with pytest.raises(ValueError): discounts([scoped_rule(resolution='720p'),second])


def test_disjoint_specs_and_adjacent_times_are_allowed():
    discounts([scoped_rule(resolution='720p'),scoped_rule(resolution='1080p')])
    discounts([scoped_rule(has_video_input=False),scoped_rule(has_video_input=True)])
    discounts([scoped_rule(),{**scoped_rule(),'effective_from':200,'effective_to':300}])


@pytest.mark.parametrize('extra',[{'resolution':'8k'},{'has_video_input':'false'},
                                  {'kind':'image','has_video_input':False}])
def test_discount_specs_are_validated(extra):
    with pytest.raises(ValueError): discounts([{**scoped_rule(),**extra}])


def test_volcengine_uses_actual_resolution_and_frozen_rules():
    p={'id':'demo','model_prices':[dict(kind='video',model='v',resolution=r,
       has_video_input=True,billing_type='per_million_tokens',unit_price='10') for r in ['720p','1080p']],
       'model_discounts':discounts([scoped_rule(),
           {**scoped_rule(resolution='1080p',has_video_input=True),'rate':'0.6'}])}
    context=pricing_context(p,150)
    p['model_discounts']=[]
    result=video_accounting({'usage':{'completion_tokens':1000},'resolution':'1080p'},
        {'model':'v','resolution':'720p','videos':['reference']},p,context)['cost']
    assert result['amount_micros']==6000
    assert result['discount_snapshot']['resolution']=='1080p'
    assert result['discount_snapshot']['has_video_input'] is True


def test_resolution_discount_matches_request_even_with_generic_base_price():
    p={'id':'demo','model_prices':normalize_model_prices([dict(kind='image',model='m',
        billing_type='per_image',unit_price='10')]),'model_discounts':discounts([
        dict(kind='image',model='m',resolution='2k',rate='0.5',effective_from=100,effective_to=200)])}
    snapshot=historical_price(dict(providerId='demo',kind='image',model='m'),150,[p],{'size':'2048x2048'})
    assert snapshot['commercial_discount']['rate']=='0.5'
