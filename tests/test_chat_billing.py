import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from copy import deepcopy
import pytest
from app.services.chat_billing import calculate, usage_counts
from app.providers.registry import normalize_model_prices, merge_model_price_history
from app.services.canvas_ledger import price_log, historical_price

TOKEN = {'kind':'chat','model':'m','billing_type':'per_million_tokens','input_price':'2',
         'output_price':'8','cached_input_price':'0.5'}
USAGE = {'prompt_tokens':1000,'completion_tokens':500,'prompt_tokens_details':{'cached_tokens':200},
         'completion_tokens_details':{'reasoning_tokens':100}}


def test_token_price_counts_cache_once_and_reasoning_is_not_added_again():
    assert calculate(TOKEN, USAGE)['amount_micros'] == 5700
    no_cache_price = {k:v for k,v in TOKEN.items() if k!='cached_input_price'}
    assert calculate(no_cache_price, USAGE)['amount_micros'] == 6000
    assert usage_counts({'input_tokens':10,'output_tokens':5,'input_tokens_details':{'cached_tokens':3}})['total_tokens'] == 15


@pytest.mark.parametrize('usage',[None,{}, {'total_tokens':9}, {'prompt_tokens':True,'completion_tokens':1},
    {'prompt_tokens':1,'completion_tokens':-1}, {'prompt_tokens':1,'completion_tokens':1.5},
    {'prompt_tokens':2,'completion_tokens':1,'prompt_tokens_details':{'cached_tokens':3}}])
def test_missing_or_invalid_usage_never_becomes_free_or_per_call(usage):
    cost=calculate(TOKEN,usage)
    assert cost['status']=='unknown' and cost['reason']=='missing_usage' and 'amount_micros' not in cost


def test_modes_zero_prices_and_failure_rules():
    call={'billing_type':'per_call','unit_price':'0.125'}
    assert calculate(call,None)['amount_micros']==125000
    assert calculate(call,USAGE,'uncertain')['status']=='unknown'
    assert calculate(call,None,'rejected')['status']=='excluded'
    assert calculate({'billing_type':'disabled'},USAGE)['reason']=='billing_disabled'
    assert calculate({**TOKEN,'input_price':'0','output_price':'0','cached_input_price':'0'},USAGE)['amount_micros']==0
    assert calculate(None,USAGE)['reason']=='missing_price'
    assert calculate(TOKEN,USAGE,'uncertain')['amount_micros']==5700


@pytest.mark.parametrize('price',[{**TOKEN,'input_price':'NaN'}, {**TOKEN,'output_price':True},
    {**TOKEN,'cached_input_price':'-1'}, {**TOKEN,'stream_usage':'false'},
    {'kind':'chat','model':'m','billing_type':'per_image','unit_price':'1'},
    {**TOKEN,'resolution':'1k'}, {'kind':'chat','model':'m','billing_type':'per_call','unit_price':'-1'}])
def test_invalid_chat_prices_are_rejected(price):
    assert normalize_model_prices([price])==[]


def test_history_and_mode_switch_keep_frozen_costs():
    old=merge_model_price_history([], [TOKEN],100)
    call={'kind':'chat','model':'m','billing_type':'per_call','unit_price':'0.2'}
    history=merge_model_price_history(old,[call],200)
    provider={'id':'p','model_prices':history}
    info={'kind':'chat','model':'m','providerId':'p'}
    first=historical_price(info,150,[provider]);second=historical_price(info,250,[provider])
    assert calculate(first,USAGE)['amount_micros']==5700
    assert calculate(second,USAGE)['amount_micros']==200000
    changed=deepcopy(TOKEN);changed['cached_input_price']='0.8'
    assert len(merge_model_price_history(old,[changed],300))==2
    log={'createdAt':150,'billingKind':'chat','providerId':'p','billingModel':'m','raw_usage':USAGE,'status':'success'}
    cost=price_log(log,[],first)
    assert cost['amount_micros']==5700 and cost['source']=='actual'
    assert price_log({**log,'cost':cost},[{'id':'p','model_prices':[call]}])==cost


def test_pending_canvas_bill_preserves_snapshot_and_reason_when_read_again():
    call={'kind':'chat','model':'m','billing_type':'per_call','unit_price':'0.2'}
    log={'createdAt':150,'billingKind':'chat','providerId':'p','billingModel':'m','status':'uncertain'}
    cost=price_log(log,[],call)
    assert cost['reason']=='uncertain_call'
    assert price_log({**log,'cost':cost},[])==cost
    assert price_log({**log,'cost':cost},[{'id':'p','model_prices':[TOKEN]}])==cost
