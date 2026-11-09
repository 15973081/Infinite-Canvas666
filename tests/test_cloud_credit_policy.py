import os
import pytest
from test_cloud_management import platform
from test_cloud_member_gateway import operator

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_policy_roundtrip_conflict_audit_and_no_wallet_mutation(platform):
    from app.storage.database import connection
    c=platform['client']
    response=c.get('/api/credits/policy')
    assert response.status_code==200,response.text
    original=response.json()
    assert len(original['config']['rules'])==78
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
    assert credit_policy.preview(actor,CreditPolicyPreview(kind='topup'))['total']==1190
    with pytest.raises(HTTPException) as exc:
        credit_policy.management(actor,config=data['config'],expected_version=data['version'],reason='denied')
    assert exc.value.status_code==403
    members.assign_roles(platform['operator'],target['id'],[])
    with pytest.raises(HTTPException):
        credit_policy.management(actor)
