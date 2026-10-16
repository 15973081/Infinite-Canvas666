"""Administrative gifts: real PostgreSQL transactions and management HTTP."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from test_cloud_management import platform, invite
from test_cloud_member_gateway import operator, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def person(platform):
    from app.services import members
    invited = invite(platform['client'])
    return members.activate(invited['activation_token'], PASSWORD)


def body(target, **changes):
    return dict(request_id=str(uuid.uuid4()), username=target['username'], amount='125',
                reason='人工核准的测试赠送', evidence_ref='APPROVAL-20261016-1', **changes)


def preview(client, data):
    response = client.post('/api/credits/gifts/preview', json=data)
    assert response.status_code == 200, response.text
    return {**data, 'preview_token': response.json()['preview_token']}


def test_credit_gift_preview_apply_and_retry_are_one_atomic_entry(platform):
    from app.storage.database import connection
    c = platform['client']; target = person(platform); data = body(target)
    ready = preview(c, data)
    with connection() as conn:
        assert not conn.execute('SELECT 1 FROM credit_wallets WHERE member_id=%s', (target['id'],)).fetchone()
    result = c.post('/api/credits/gifts/apply', json=ready)
    assert result.status_code == 200, result.text
    receipt = result.json()
    assert receipt['amount'] == '125' and receipt['balance_after'] == '125'
    assert receipt['target']['id'] == target['id'] and receipt['actor']['id'] == platform['operator'].member_id
    assert c.post('/api/credits/gifts/apply', json=ready).json() == receipt
    assert c.post('/api/credits/gifts/preview', json=data).json() == receipt
    with connection() as conn:
        wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s', (target['id'],)).fetchone()
        assert wallet['recharge_balance'] == 0 and wallet['gift_balance'] == 125
        grant = conn.execute('SELECT * FROM credit_grants WHERE id=%s', (receipt['grant_id'],)).fetchone()
        assert (grant['source'], grant['category'], grant['validity'], grant['note']) == ('PLATFORM_GIFT','gift','PERMANENT','管理员赠送积分')
        assert conn.execute('SELECT count(*) AS n FROM credit_transactions WHERE member_id=%s', (target['id'],)).fetchone()['n'] == 1
        events = conn.execute("SELECT * FROM management_events WHERE action='credits.gift' AND target_id=%s", (target['id'],)).fetchall()
        assert len(events) == 1
        assert events[0]['details']['request_id'] == data['request_id']
        assert events[0]['details']['transaction_id'] == receipt['transaction_id']
        assert events[0]['details']['evidence_type'] == 'ADMIN_ATTESTATION'
        assert events[0]['workspace_id'] is None
    assert result.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('changes', [
    {'amount':'0'}, {'amount':'-1'}, {'amount':'1.5'}, {'amount':True}, {'amount':125},
    {'amount':'9223372036854775808'}, {'reason':'  '}, {'evidence_ref':'  '},
    {'source':'RECHARGE'}, {'actor_id':'forged'}, {'validity':'EXPIRING'},
])
def test_credit_gift_rejects_unverified_or_invalid_inputs(platform, changes):
    target = person(platform); data = {**body(target), **changes}
    response = platform['client'].post('/api/credits/gifts/preview', json=data)
    assert response.status_code in (400,422), response.text


def test_credit_gift_preview_and_request_cannot_be_repurposed(platform):
    c = platform['client']; first = person(platform); second = person(platform)
    ready = preview(c, body(first))
    for change in ({'amount':'126'}, {'username':second['username']}, {'evidence_ref':'OTHER'}, {'reason':'OTHER'}):
        assert c.post('/api/credits/gifts/apply', json={**ready, **change}).status_code == 409
    assert c.post('/api/credits/gifts/apply', json=ready).status_code == 200
    assert c.post('/api/credits/gifts/apply', json={**ready, 'username':second['username']}).json()['detail']['code'] == 'credit_gift_request_conflict'


def test_credit_gift_rechecks_recipient_and_current_permissions(platform):
    from app.services import members, credit_gifts
    c = platform['client']; target = person(platform); admin = person(platform)
    ready = preview(c, body(target))
    members.set_member_status(platform['operator'], target['id'], 'disabled')
    assert c.post('/api/credits/gifts/apply', json=ready).json()['detail']['code'] == 'credit_gift_target_unavailable'
    members.set_member_status(platform['operator'], target['id'], 'active')
    assert c.post('/api/credits/gifts/apply', json=ready).json()['detail']['code'] == 'credit_gift_preview_changed'
    role = members.create_role(platform['operator'], 'gift-'+uuid.uuid4().hex, [credit_gifts.PERMISSION])
    members.assign_roles(platform['operator'], admin['id'], [role])
    token = members.login(admin['username'], PASSWORD, audience='management', source=uuid.uuid4().hex)['token']
    actor = members.resolve_session(token, 'management')
    data = body(target); token = credit_gifts.gift(actor, **data)['preview_token']
    members.assign_roles(platform['operator'], admin['id'], [])
    with pytest.raises(HTTPException) as error:
        credit_gifts.gift(actor, **data, preview_token=token)
    assert error.value.status_code == 403


def test_credit_gift_requires_dedicated_permission_and_management_session(platform):
    from app.services import members, credit_gifts
    target = person(platform); admin = person(platform)
    role = members.create_role(platform['operator'], 'ordinary-'+uuid.uuid4().hex, ['member.manage','billing.platform','audit.platform'])
    members.assign_roles(platform['operator'], admin['id'], [role])
    for username, audience in ((admin['username'],'management'), (platform['username'],'workbench')):
        token = members.login(username, PASSWORD, audience=audience, source=uuid.uuid4().hex)['token']
        actor = members.resolve_session(token, audience)
        with pytest.raises(HTTPException) as error:
            credit_gifts.gift(actor, **body(target))
        assert error.value.status_code == 403
    c = platform['client']
    assert c.post('/api/credits/gifts/preview', json=body(target), headers={'X-Member-ID':admin['id']}).status_code == 409
    assert c.post('/api/credits/gifts/preview', json=body(target), headers={'Origin':'https://wrong.test'}).status_code == 403


def test_credit_gift_audit_failure_rolls_back_wallet_proof_and_transaction(platform, monkeypatch):
    from app.services import authorization as az, credit_gifts
    from app.storage.database import connection
    target = person(platform); data = body(target); actor = platform['operator']
    ready = credit_gifts.gift(actor, **data)
    def fail(*args, **kwargs):
        raise RuntimeError('simulated audit outage')
    monkeypatch.setattr(az, 'audit', fail)
    with pytest.raises(RuntimeError, match='simulated audit outage'):
        credit_gifts.gift(actor, **data, preview_token=ready['preview_token'])
    with connection() as conn:
        for table in ('credit_wallets','credit_grants','credit_transactions','admin_credit_gifts'):
            assert not conn.execute('SELECT 1 FROM '+table+' WHERE member_id=%s', (target['id'],)).fetchone()


def test_credit_gift_concurrent_retries_and_distinct_requests_preserve_totals(platform):
    from app.services.credit_gifts import gift
    from app.storage.database import connection
    actor = platform['operator']; target = person(platform); data = body(target)
    ready = {**data, 'preview_token':gift(actor, **data)['preview_token']}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _:gift(actor, **ready), range(4)))
    assert len({r['grant_id'] for r in results}) == 1
    requests = [body(target) for _ in range(4)]
    requests = [{**r, 'preview_token':gift(actor, **r)['preview_token']} for r in requests]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda r:gift(actor, **r), requests))
    with connection() as conn:
        assert conn.execute('SELECT gift_balance FROM credit_wallets WHERE member_id=%s', (target['id'],)).fetchone()['gift_balance'] == 625
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='credits.gift' AND target_id=%s", (target['id'],)).fetchone()['n'] == 5


def test_credit_gift_bigint_precision_and_overflow(platform):
    from app.services.credit_gifts import gift
    from app.storage.database import connection
    actor = platform['operator']; target = person(platform); data = {**body(target), 'amount':'9223372036854775807'}
    result = gift(actor, **data, preview_token=gift(actor, **data)['preview_token'])
    assert result['balance_after'] == data['amount']
    other = body(target)
    with pytest.raises(HTTPException) as error:
        gift(actor, **other, preview_token=gift(actor, **other)['preview_token'])
    assert error.value.detail['code'] == 'credit_balance_overflow'
    with connection() as conn:
        assert not conn.execute('SELECT 1 FROM admin_credit_gifts WHERE request_id=%s', (other['request_id'],)).fetchone()
