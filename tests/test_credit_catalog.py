from copy import deepcopy

from app.services import chat_credits, credit_catalog, credit_policy, image_credits, media_credits


def providers():
    result = []
    for pid, models in image_credits.bindings().items():
        result.append({'id': pid, 'config': {'name': '图片供应商', 'enabled': True, 'image_models': list(models)}})
    for pid, models in media_credits.bindings().items():
        result.append({'id': pid, 'config': {'name': pid, 'enabled': True, 'protocol': pid,
            'video_models': [m for m in models if m != 'video-understand-router'],
            'chat_models': [m for m in models if m == 'video-understand-router']}})
    return result


def test_eighteen_real_models_have_nineteen_branches_and_seventeen_rules():
    rules = credit_policy.defaults()['rules']
    before = deepcopy(rules)
    catalog = credit_catalog.build(providers(), rules)
    assert catalog['summary'] == {'enabled_models': 18, 'enabled_bindings': 19, 'enabled_rules': 17, 'unbound_rules': 67}
    assert not catalog['unmapped_models'] and rules == before
    drafts = [b for b in catalog['bindings'] if b['model_id'] == 'doubao-seedance-2-5-260628']
    assert [b['conditions'] for b in drafts] == [{'draft': False}, {'draft': True}]
    assert [b['model_code'] for b in drafts] == ['PIXDANCE_2_5', 'PIXDANCE_2_5_DRAFT']
    shared = [b for b in catalog['bindings'] if b['model_code'] == 'GPT_IMAGE_2']
    assert {b['model_id'] for b in shared} == {'gpt-image-2', 'gpt-image-2-vip'}
    assert len({b['id'] for b in catalog['bindings']}) == 19


def test_hidden_disabled_and_unmapped_models_are_distinguished():
    rows = providers()
    rows[0]['config']['model_policies'] = {'image:gpt-image-2': {'visible': False}}
    rows[1]['config']['enabled'] = False
    rows[2]['config']['video_models'].append('unknown-video')
    catalog = credit_catalog.build(rows, credit_policy.defaults()['rules'])
    assert catalog['summary']['enabled_models'] == 9
    assert all(not b['enabled'] for b in catalog['bindings'] if b['provider_id'] == rows[1]['id'])
    assert catalog['unmapped_models'] == [{'provider_id': 'mediakit', 'provider_name': 'mediakit',
        'model_id': 'unknown-video', 'kind': 'video', 'enabled': True}]
    assert not next(b for b in catalog['bindings'] if b['model_id'] == 'gpt-image-2')['enabled']


def test_standard_chat_mapping_requires_a_real_catalog_model_and_honors_scoped_override(monkeypatch):
    monkeypatch.setattr(chat_credits, 'bindings', lambda: {'providers': {'p': {'gemini-2.5-pro': 'GEMINI_25_FLASH'}},
                                                         'models': {'gemini-2.5-pro': 'GEMINI_25_PRO'}})
    rows = [{'id': 'p', 'config': {'chat_models': ['gemini-2.5-pro', 'gemini-2.5-pro-preview'],
                                   'base_url': 'https://private.example', 'api_key': 'do-not-project'}}]
    catalog = credit_catalog.build(rows, credit_policy.defaults()['rules'])
    assert catalog['bindings'][0]['model_code'] == 'GEMINI_25_FLASH'
    assert catalog['summary']['enabled_models'] == 1
    assert catalog['unmapped_models'][0]['model_id'] == 'gemini-2.5-pro-preview'
    assert 'do-not-project' not in str(catalog) and 'private.example' not in str(catalog)


def test_missing_rule_and_disabled_price_remain_visible_for_repair():
    rules = credit_policy.defaults()['rules']
    for rule in rules:
        if rule['modelCode'] == 'GPT_IMAGE_2':
            rule['enabled'] = False
    rules = [r for r in rules if r['modelCode'] != 'BANANA_PRO']
    catalog = credit_catalog.build(providers(), rules)
    assert not next(b for b in catalog['bindings'] if b['model_code'] == 'BANANA_PRO')['rule_available']
    assert next(b for b in catalog['bindings'] if b['model_code'] == 'GPT_IMAGE_2')['enabled']
