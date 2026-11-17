from copy import deepcopy

import pytest
from fastapi import HTTPException
from app.services import image_credits, credit_policy

PRICES = {
    'gpt-image-2.5': ([8, 10, 12], 0),
    'gpt-image-2.5-sunburst': ([8, 10, 12], 0),
    'gpt-image-2': ([9, 13, 20], 3),
    'gpt-image-2-vip': ([9, 13, 20], 3),
    'nano-banana-pro': ([14, 14, 26], 0),
    'nano-banana-2.1': ([8, 12, 18], 0),
}


@pytest.mark.parametrize('model', PRICES)
@pytest.mark.parametrize('count', [1, 4])
@pytest.mark.parametrize('size,index', [('auto', 0), ('', 0), ('1024x1024', 0), ('1536x1024', 0),
    ('1K', 0), ('2K', 1), ('2048x2048', 1), ('4K', 2), ('4096x4096', 2)])
def test_bound_image_quote_exact_prices_and_reference_filter(model, count, size, index):
    request = {'provider_id': 'api-dfe9075f', 'model': model, 'size': size, 'quality': 'auto', 'n': count,
        'reference_images': [{'url':'https://example.test/a.png'}, {'url':'https://example.test/b', 'kind':'image'},
            {'url':'', 'kind':'image'}, {'url':'https://example.test/c.mp4','kind':'video'},
            {'url':'https://example.test/d.png','selection':{'kind':'docx'}}]}
    code = image_credits.bindings()['api-dfe9075f'][model]
    snapshot = image_credits.prepare_quote(credit_policy.defaults(), code, request)
    base, extra = PRICES[model]
    assert snapshot['quote']['credits'] == base[index] * count + extra * 2
    assert snapshot['input']['input_image_count'] == 2
    assert snapshot['input']['params']['resolution'] == ['1K','2K','4K'][index]
    assert snapshot['input']['params'].get('quality', 'medium') == 'medium'


def test_image_quote_snapshot_keeps_rule_and_activity_time_for_partial_success():
    config = credit_policy.defaults()
    rule = next(r for r in config['rules'] if r['modelCode'] == 'GPT_IMAGE_2')
    rule.update(discountType='ACTIVITY', discountRate=0.6, activityStartTime=10, activityEndTime=20)
    snapshot = image_credits.prepare_quote(config, 'GPT_IMAGE_2', {
        'provider_id':'api-dfe9075f','model':'gpt-image-2','n':4,
        'reference_images':[{'url':'https://example.test/a.png'}]}, now=10)
    assert snapshot['quote']['credits'] == 23  # (9*4+3)*0.6
    rule['pricingConfig']['combinationPrices']['medium||1K'] = 100
    actual = credit_policy.model_quote({'rules':[snapshot['rule']]},
        **{**snapshot['input'], 'count':2}, now=snapshot['quoted_at'])
    assert actual['credits'] == 13  # (9*2+3)*0.6; extra is not multiplied by count.


def test_image_mapping_is_explicit_and_invalid_rules_or_specs_reject():
    mapping = image_credits.bindings()
    assert set(mapping['api-dfe9075f']) == set(PRICES)
    assert 'api-dfe9075f-copy' not in mapping and 'nano-banana-2' not in mapping['api-dfe9075f']
    request = {'provider_id':'api-dfe9075f','model':'gpt-image-2'}
    for changes in [{'size':'unsupported'}, {'quality':'unsupported'}]:
        with pytest.raises(HTTPException):
            image_credits.prepare_quote(credit_policy.defaults(), 'GPT_IMAGE_2', {**request, **changes})
    for code in ['missing', 'ELEVENLABS_V2']:
        with pytest.raises(HTTPException):
            image_credits.prepare_quote(credit_policy.defaults(), code, request)
    config = credit_policy.defaults()
    next(r for r in config['rules'] if r['modelCode']=='GPT_IMAGE_2')['enabled'] = False
    with pytest.raises(HTTPException):
        image_credits.prepare_quote(config, 'GPT_IMAGE_2', request)
