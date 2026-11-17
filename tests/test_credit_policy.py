import pytest
from fastapi import HTTPException
from app.services.credit_policy import defaults, normalize, topup_quote, model_quote


def test_imported_rules_are_complete_and_valid():
    config = normalize(defaults())
    assert len(config['rules']) == 84
    assert len({r['modelCode'] for r in config['rules']}) == 84


@pytest.mark.parametrize('amount,base,gift,total', [
    (69,1035,155,1190), (399,5985,1795,7780),
    (2499,37485,18742,56227), (4999,74985,52489,127474),
    (68,1020,0,1020), (400,6000,1800,7800),
])
def test_tiers_round_down_and_choose_highest_threshold(amount, base, gift, total):
    q = topup_quote(defaults(), amount)
    assert (q['base'],q['gift'],q['total']) == (base,gift,total)


def test_first_recharge_is_explicit_and_conditional():
    c = defaults()
    assert topup_quote(c,69,True)['total'] == 1690
    assert topup_quote(c,68,True)['firstRecharge'] == 0
    c['rewards']['firstRechargeEnabled'] = False
    assert topup_quote(c,69,True)['total'] == 1190


def test_video_input_cost_is_added_once_and_media_extras_are_per_task():
    c=defaults()
    q=model_quote(c,'PIXDANCE_2_5',{'resolution':'720P','duration':5},
                  input_video_count=1,input_video_seconds=3,count=2)
    assert q['credits'] == 390  # 30*5*2 + 30*3
    q=model_quote(c,'QWEN_IMAGE_3_PRO',{'resolution':'1K'},input_image_count=3,count=2)
    assert q['credits'] == 15  # 6*2 + 1*3


def test_audio_ceil_minimum_and_utf16_characters():
    c=defaults()
    assert model_quote(c,'ELEVENLABS_V2',{},prompt='')['credits'] == 1
    assert model_quote(c,'ELEVENLABS_V2',{},prompt='a'*21)['credits'] == 2
    assert model_quote(c,'ELEVENLABS_V2',{},prompt='😀'*11)['credits'] == 2
    assert model_quote(c,'MINIMAX_SPEECH_28_HD',{},prompt='a'*201)['credits'] == 4


def test_discount_boundaries_and_rounding_after_batch():
    c=defaults()
    rule=next(r for r in c['rules'] if r['modelCode']=='DOUBAO_SEEDREAM_5_PRO')
    args=(c,rule['modelCode'],{'resolution':'1K'})
    assert model_quote(*args,now=rule['activityStartTime']-1)['credits']==8
    assert model_quote(*args,now=rule['activityStartTime'])['credits']==5
    assert model_quote(*args,now=rule['activityStartTime'],count=3)['credits']==14
    assert model_quote(*args,now=rule['activityEndTime'])['credits']==8


@pytest.mark.parametrize('discount,now,expected', [
    ('NONE', 15, 3), ('ACTIVITY', 9, 3), ('ACTIVITY', 10, 1),
    ('ACTIVITY', 19, 1), ('ACTIVITY', 20, 3), ('USER', 15, 1),
])
def test_fractional_totals_round_once_with_or_without_discount(discount, now, expected):
    c = defaults()
    rule = next(r for r in c['rules'] if r['modelCode'] == 'BANANA')
    rule.update(basePrice=0.6, discountType=discount, discountRate=0.5,
                returnDiscountedPrice=True, activityStartTime=10, activityEndTime=20)
    rule['pricingConfig']['imageExtraPrice'] = 0.7
    q = model_quote(normalize(c), 'BANANA', {}, count=3, input_image_count=1, now=now)
    assert q['original'] == 3  # 0.6 * 3 + 0.7 = 2.5
    assert q['credits'] == expected  # Discount uses 2.5, not the rounded original 3.
    assert q['extraCredits'] == 1
    assert all(type(q[k]) is int for k in ('original', 'credits', 'extraCredits'))


@pytest.mark.parametrize('code,params,prompt', [
    ('BANANA', {}, ''), ('GPT_IMAGE_2', {'quality': 'low', 'resolution': '1K'}, ''),
    ('ELEVENLABS_V2', {}, 'hello'),
])
def test_every_quote_branch_has_a_minimum_integer_total(code, params, prompt):
    c = defaults()
    rule = next(r for r in c['rules'] if r['modelCode'] == code)
    rule.update(basePrice=0.1, discountType='NONE')
    rule['pricingConfig'].update(minPrice=0.1, imageExtraPrice=0)
    if params:
        rule['pricingConfig']['combinationPrices']['low||1K'] = 0.1
    q = model_quote(normalize(c), code, params, prompt=prompt)
    assert (q['original'], q['credits'], q['extraCredits']) == (1, 1, 0)
    rule.update(discountType='USER', returnDiscountedPrice=True, discountRate=0.01)
    assert model_quote(c, code, params, prompt=prompt)['credits'] == 1


@pytest.mark.parametrize('code,params,kwargs', [
    ('SMART_ERASE',{},{}), ('VIDU_Q2',{},{}), ('UNKNOWN',{},{}),
    ('PIXDANCE_2_5',{'resolution':'8K','duration':5},{}),
    ('PIXDANCE_2_5',{'duration':5},{}),
    ('PIXDANCE_2_5',{'resolution':'720P','duration':5},{'input_video_count':1}),
    ('PIXDANCE_2_5',{'resolution':'720P','duration':5},{'input_video_seconds':2}),
    ('ELEVENLABS_V2',{}, {'count':0}),
])
def test_missing_prices_and_invalid_inputs_never_quote_free(code,params,kwargs):
    with pytest.raises(HTTPException):
        model_quote(defaults(),code,params,**kwargs)


@pytest.mark.parametrize('mutation', [
    lambda c:c.update(creditsPerCNY=True),
    lambda c:c.update(creditsPerCNY=float('nan')),
    lambda c:c.update(validity='AFTER_GRANT_DAYS'),
    lambda c:c['tiers'].append(c['tiers'][0].copy()),
    lambda c:c['rules'].append(c['rules'][0].copy()),
    lambda c:c['rules'][0].update(basePrice=-1),
    lambda c:c['rules'][0]['pricingConfig'].update(combinationPrices={'bad||key':5}),
    lambda c:c['rules'][0].update(activityStartTime=2,activityEndTime=1),
])
def test_invalid_policy_rejected(mutation):
    c=defaults();mutation(c)
    with pytest.raises(HTTPException):normalize(c)
