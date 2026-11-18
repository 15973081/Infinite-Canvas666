import os
import pytest
from test_cloud_management import platform
from test_cloud_member_gateway import operator, world

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_policy_roundtrip_conflict_audit_and_no_wallet_mutation(platform):
    from app.storage.database import connection
    c=platform['client']
    response=c.get('/api/credits/policy')
    assert response.status_code==200,response.text
    original=response.json()
    assert len(original['config']['rules'])==84
    with connection() as conn:
        before=conn.execute('SELECT count(*) AS n FROM credit_transactions').fetchone()['n']
    body={'config':original['config'],'expected_version':original['version'],'reason':'验证积分规则'}
    response=c.put('/api/credits/policy',json=body)
    assert response.status_code==200,response.text
    saved=response.json()
    assert saved['version']==original['version']+1
    assert c.get('/api/credits/policy').json()['config']==body['config']
    assert c.put('/api/credits/policy',json=body).status_code==409
    quote=c.post('/api/credits/policy/preview',json={'kind':'topup','amount':69,'first_recharge':True})
    assert quote.status_code==200,quote.text
    assert quote.json()['total']==1690
    bad={**body,'expected_version':saved['version'],'reason':' '}
    assert c.put('/api/credits/policy',json=bad).status_code==400
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM credit_transactions').fetchone()['n']==before
        event=conn.execute("SELECT details FROM management_events WHERE action='credits.policy.configure' ORDER BY id DESC LIMIT 1").fetchone()
        assert event['details']['version']==saved['version']
        assert event['details']['after']==body['config']


def test_policy_auditor_can_read_and_quote_but_not_write(platform):
    import uuid
    from app.services import members,credit_policy
    from app.management.application import CreditPolicyPreview
    from fastapi import HTTPException
    from test_cloud_management import invite
    from test_cloud_member_gateway import PASSWORD
    invited=invite(platform['client'])
    target=members.activate(invited['activation_token'],PASSWORD)
    role=members.create_role(platform['operator'],'auditor-'+uuid.uuid4().hex,['audit.platform'])
    members.assign_roles(platform['operator'],target['id'],[role])
    token=members.login(target['username'],PASSWORD,audience='management',source=uuid.uuid4().hex)['token']
    actor=members.resolve_session(token,'management')
    data=credit_policy.management(actor)
    assert 'model_catalog' in data
    assert credit_policy.preview(actor,CreditPolicyPreview(kind='topup'))['total']==1190
    with pytest.raises(HTTPException) as exc:
        credit_policy.management(actor,config=data['config'],expected_version=data['version'],reason='denied')
    assert exc.value.status_code==403
    members.assign_roles(platform['operator'],target['id'],[])
    with pytest.raises(HTTPException):
        credit_policy.management(actor)


def test_member_credit_policy_public_projection_auth_and_management_updates(platform, world):
    from fastapi.testclient import TestClient
    from main import app
    from app.storage.database import connection
    from app.services.credit_policy import defaults, account_policy
    from fastapi import HTTPException

    path = '/api/account/credit-policy'
    member = world['people'][1]['id']
    client = world['viewer']
    with connection() as conn:
        conn.execute('DELETE FROM credit_policy')
        before = conn.execute('SELECT count(*) AS n FROM credit_transactions').fetchone()['n']
    response = client.get(path, headers={'X-Member-ID': member})
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    initial = response.json()
    public_keys = {'creditsPerCNY', 'tiers', 'rewards', 'validity'}
    assert set(initial) == {'config', 'version', 'mode'}
    assert initial['config'] == {k: defaults()[k] for k in public_keys}
    assert initial['version'] == 0 and initial['mode'] == 'active'
    assert client.get(path, headers={'X-Member-ID': world['people'][0]['id']}).status_code == 409
    assert client.get('/api/credits/policy').status_code == 403
    for method in ('post', 'put', 'delete'):
        assert getattr(client, method)(path).status_code == 405
    with TestClient(app) as anonymous:
        assert anonymous.get(path).status_code == 401
    with pytest.raises(HTTPException) as exc:
        account_policy(platform['operator'])
    assert exc.value.status_code == 403

    config = defaults()
    config.update(creditsPerCNY=23, tiers=[{'minAmount': 10, 'bonusRate': 0.29}])
    config['rewards']['firstRechargeEnabled'] = False
    admin = platform['client']
    try:
        saved = admin.put('/api/credits/policy', json={
            'config': config, 'expected_version': 0, 'reason': '充值配置同步验收'})
        assert saved.status_code == 200, saved.text
        updated = client.get(path).json()
        assert updated['version'] == saved.json()['version']
        assert updated['config'] == {k: config[k] for k in public_keys}
        with connection() as conn:
            assert conn.execute('SELECT count(*) AS n FROM credit_transactions').fetchone()['n'] == before
            conn.execute("UPDATE members SET status='disabled' WHERE id=%s", (member,))
        assert client.get(path).status_code == 401
    finally:
        current = admin.get('/api/credits/policy').json()
        restored = admin.put('/api/credits/policy', json={
            'config': defaults(), 'expected_version': current['version'], 'reason': '恢复测试默认配置'})
        assert restored.status_code == 200


def test_credit_catalog_tracks_live_provider_availability_without_rewriting_rules(platform):
    import uuid
    from app.services import provider_control
    client = platform['client']
    actor = platform['operator']
    pid = 'credit-catalog-' + uuid.uuid4().hex[:12]
    config = {'name': '目录关联验收', 'protocol': 'openai', 'enabled': True,
              'base_url': 'https://private-catalog.example',
              'chat_models': ['gemini-2.5-pro', 'gemini-2.5-pro-preview'],
              'model_policies': {'chat:gemini-2.5-pro': {'enabled': True, 'visible': False}}}
    provider = provider_control.save(actor, pid, config, 0, secrets={'api_key': 'not-for-credit-catalog'}, reason='目录关联验收')
    before = client.get('/api/credits/policy').json()
    binding = next(b for b in before['model_catalog']['bindings'] if b['provider_id'] == pid)
    assert binding['model_code'] == 'GEMINI_25_PRO' and not binding['enabled']
    assert binding['model_id'] == 'gemini-2.5-pro'
    assert any(b['model_id'] == 'gemini-2.5-pro-preview' for b in before['model_catalog']['unmapped_models'])
    assert 'private-catalog.example' not in str(before) and 'not-for-credit-catalog' not in str(before)
    config['model_policies'] = {}
    provider = provider_control.save(actor, pid, config, provider['version'], reason='开放已映射模型')
    after = client.get('/api/credits/policy').json()
    assert next(b for b in after['model_catalog']['bindings'] if b['provider_id'] == pid)['enabled']
    assert after['config'] == before['config'] and after['version'] == before['version']
    saved = client.put('/api/credits/policy', json={'config': after['config'], 'expected_version': after['version'],
                                                 'reason': '验证目录投影与价格保存分离'}).json()
    assert saved['config'] == before['config']
    assert saved['model_catalog'] == after['model_catalog']
    config['enabled'] = False
    provider_control.save(actor, pid, config, provider['version'], reason='停用目录验收供应商')
    disabled = client.get('/api/credits/policy').json()
    assert not next(b for b in disabled['model_catalog']['bindings'] if b['provider_id'] == pid)['enabled']
