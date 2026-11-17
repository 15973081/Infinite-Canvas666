from copy import deepcopy
import pytest
from fastapi import HTTPException
from app.services import chat_credits, credit_policy


@pytest.mark.parametrize('model,code', list(chat_credits.bindings()['models'].items()))
def test_standard_models_have_exact_per_call_quotes(model, code):
    config = credit_policy.defaults()
    rule = next(r for r in config['rules'] if r['modelCode'] == code)
    assert chat_credits.model_code('any-provider', model) == code
    snapshot = chat_credits.quote(config, code, [], now=1800000000)
    assert snapshot['quote']['credits'] == rule['basePrice']
    assert snapshot['input']['count'] == 1


def test_provider_binding_overrides_standard_name_without_fuzzy_matching(monkeypatch):
    monkeypatch.setattr(chat_credits, 'bindings', lambda: {'providers': {'specific': {'gemini-2.5-pro': 'GEMINI_25_FLASH'}},
                                                         'models': {'gemini-2.5-pro': 'GEMINI_25_PRO'}})
    assert chat_credits.model_code('specific', 'gemini-2.5-pro') == 'GEMINI_25_FLASH'
    assert chat_credits.model_code('other', 'gemini-2.5-pro') == 'GEMINI_25_PRO'
    assert chat_credits.model_code('other', 'gemini-2.5-pro-preview') is None


def test_chat_quote_counts_materials_actually_sent_and_keeps_snapshot():
    config = deepcopy(credit_policy.defaults())
    rule = next(r for r in config['rules'] if r['modelCode'] == 'GEMINI_25_PRO')
    rule['pricingConfig'].update(imageExtraPrice=2, videoExtraPrice=3, audioExtraPrice=4)
    messages = [{'role': 'user', 'content': [{'type': 'image_url'}, {'type': 'video_url'}, {'type': 'input_audio'}]},
                {'role': 'user', 'content': [{'type': 'image_url'}]}]
    snapshot = chat_credits.quote(config, 'GEMINI_25_PRO', messages)
    assert snapshot['quote']['credits'] == 14
    rule['basePrice'] = 100
    assert snapshot['rule']['basePrice'] == 3
    assert snapshot['input']['input_image_count'] == 2


def test_disabled_or_non_per_call_rule_is_rejected():
    config = credit_policy.defaults()
    with pytest.raises(HTTPException):
        chat_credits.quote(config, 'MEDIAKIT_VIDEO_UNDERSTAND', [])
    rule = next(r for r in config['rules'] if r['modelCode'] == 'GEMINI_25_PRO')
    rule['enabled'] = False
    with pytest.raises(HTTPException):
        chat_credits.quote(config, 'GEMINI_25_PRO', [])
