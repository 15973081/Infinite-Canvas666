"""Administrative gifts: real PostgreSQL transactions and management HTTP."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from test_cloud_management import platform, invite
from test_cloud_member_gateway import operator, PASSWORD

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def person(platform):
    from app.services import members
    invited = invite(platform['client'])
    return members.activate(invited['activation_token'], PASSWORD)


def test_management_username_balance_matches_gift_preview(platform):
    target = person(platform)
    client = platform['client']
    query = {'username': target['username'].upper()}
    path = '/api/credits/wallets'
    assert client.get(path, params=query).json()['wallet']['availableBalance'] == '0'
    data = body(target, category='recharge')
    ready = preview(client, data)
    assert client.post('/api/credits/gifts/apply', json=ready).status_code == 200
    result = client.get(path, params=query).json()
    assert result['target']['id'] == target['id']
    assert result['wallet'] == dict(total_balance='125', recharge_balance='125', gift_balance='0',
                                    frozenBalance='0', availableBalance='125')
    assert client.post('/api/credits/gifts/preview', json=body(target)).json()['wallet'] == result['wallet']
    assert client.get(path, params={'username':'absent-account'}).status_code == 409


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


@pytest.mark.parametrize('category, relative', [('recharge', True), ('gift', False)])
def test_credit_gift_category_expiry_preview_and_original_add_receipt(platform, category, relative):
    from app.services.credit_wallet import settle_expired_grants
    from app.storage.database import connection
    client = platform['client']
    target = person(platform)
    now = datetime.now(timezone.utc)
    expiry = {'valid_days': 7} if relative else {'expires_at': (now + timedelta(days=7)).isoformat()}
    data = body(target, category=category, **expiry)
    planned = client.post('/api/credits/gifts/preview', json=data).json()
    assert (planned['category'], planned['validity'], planned['valid_days'], planned['expires_at']) == (
        category, 'FIXED_EXPIRY', expiry.get('valid_days'), expiry.get('expires_at'))
    ready = {**data, 'preview_token': planned['preview_token']}
    for change in ({'category': 'gift' if category == 'recharge' else 'recharge'},
                   {'valid_days': 8} if relative else {'expires_at': (now + timedelta(days=8)).isoformat()}):
        assert client.post('/api/credits/gifts/apply', json={**ready, **change}).status_code == 409
    response = client.post('/api/credits/gifts/apply', json=ready)
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert (receipt['source'], receipt['category'], receipt['validity']) == ('PLATFORM_GIFT', category, 'FIXED_EXPIRY')
    actual_expiry = datetime.fromisoformat(receipt['expires_at'])
    if relative:
        assert now <= actual_expiry - timedelta(days=expiry['valid_days']) <= datetime.now(timezone.utc)
    else:
        assert actual_expiry == datetime.fromisoformat(expiry['expires_at'])
    with connection() as conn:
        wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s FOR UPDATE', (target['id'],)).fetchone()
        assert (wallet['recharge_balance'], wallet['gift_balance']) == ((125, 0) if category == 'recharge' else (0, 125))
        conn.execute("UPDATE credit_grants SET expires_at=clock_timestamp()-interval '1 day' WHERE id=%s",
                     (receipt['grant_id'],))
        settle_expired_grants(conn, target['id'])
    replay = client.post('/api/credits/gifts/apply', json=ready).json()
    assert (replay['transaction_id'], replay['balance_after']) == (receipt['transaction_id'], '125')
    history = client.get('/api/credits/gifts', params={'request_id': receipt['request_id']}).json()['entries']
    assert len(history) == 1
    assert (history[0]['transaction_id'], history[0]['category']) == (receipt['transaction_id'], category)


@pytest.mark.parametrize('changes', [
    {'amount':'0'}, {'amount':'-1'}, {'amount':'1.5'}, {'amount':True}, {'amount':125},
    {'amount':'9223372036854775808'}, {'reason':'  '}, {'evidence_ref':'  '},
    {'source':'RECHARGE'}, {'actor_id':'forged'}, {'validity':'EXPIRING'},
    {'category':'restricted'}, {'valid_days':0}, {'valid_days':True},
    {'expires_at':'2099-01-01'}, {'expires_at':'2000-01-01T00:00:00Z'},
    {'expires_at':'2099-01-01T00:00:00Z','valid_days':7},
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


def test_credit_gift_provenance_paging_filter_and_historical_identity(platform):
    from app.services.credit_gifts import gift
    from app.storage.database import connection
    actor = platform['operator']; target = person(platform); c = platform['client']
    receipts = []
    for _ in range(3):
        data = body(target)
        receipts.append(gift(actor, **data, preview_token=gift(actor, **data)['preview_token']))
    with connection() as conn:
        conn.execute("UPDATE members SET display_name='改名之后' WHERE id=%s", (target['id'],))
    first = c.get('/api/credits/gifts', params={'username':target['username'].upper(), 'limit':2}).json()
    assert [e['grant_id'] for e in first['entries']] == [r['grant_id'] for r in reversed(receipts[1:])]
    second = c.get('/api/credits/gifts', params={'username':target['username'], 'limit':2, 'before':first['next']}).json()
    assert [e['grant_id'] for e in second['entries']] == [receipts[0]['grant_id']]
    assert second['next'] is None
    row = second['entries'][0]
    assert row['target']['display_name'] == target['display_name']
    assert row['evidence_ref'] == 'APPROVAL-20261016-1' and row['evidence_type'] == 'ADMIN_ATTESTATION'
    found = c.get('/api/credits/gifts', params={'request_id':receipts[0]['request_id']})
    assert found.headers['cache-control'] == 'no-store'
    assert len(found.json()['entries']) == 1
    assert c.get('/api/credits/gifts', params={'request_id':'invalid'}).status_code == 422
    assert not c.get('/api/credits/gifts', params={'username':'no-such-account'}).json()['entries']
    audit = c.get('/api/audit').json()['events']
    assert any(e['action']=='credits.gift' and e['details']['grant_id']==row['grant_id'] for e in audit)


def test_credit_gift_proof_requires_platform_permission_and_is_private_from_wallet(platform):
    from app.services import credit_gifts, credit_wallet, members
    target = person(platform); auditor = person(platform); actor = platform['operator']
    data = body(target)
    receipt = credit_gifts.gift(actor, **data, preview_token=credit_gifts.gift(actor, **data)['preview_token'])
    role = members.create_role(actor, 'auditor-'+uuid.uuid4().hex, ['audit.platform'])
    members.assign_roles(actor, auditor['id'], [role])
    def principal(user, audience):
        token = members.login(user['username'], PASSWORD, audience=audience, source=uuid.uuid4().hex)['token']
        return members.resolve_session(token, audience)
    auditor_actor = principal(auditor, 'management')
    assert credit_gifts.history(auditor_actor, request_id=receipt['request_id'])['entries'][0]['grant_id'] == receipt['grant_id']
    with pytest.raises(HTTPException) as error:
        credit_gifts.gift(auditor_actor, **body(target))
    assert error.value.status_code == 403
    workspace = members.create_workspace(actor, 'proof-scope-'+uuid.uuid4().hex, actor.member_id)
    space_role = members.create_role(actor, 'space-audit', ['audit.read'], workspace['id'])
    members.assign_roles(actor, target['id'], [space_role], workspace['id'])
    with pytest.raises(HTTPException) as error:
        credit_gifts.history(principal(target, 'management'), request_id=receipt['request_id'])
    assert error.value.status_code == 403
    owner = principal(target, 'workbench')
    with pytest.raises(HTTPException):
        credit_gifts.history(owner)
    wallet = credit_wallet.report(owner)
    entry = wallet['entries'][0]
    assert wallet['wallet']['gift_balance'] == '125' and entry['grant_id'] == receipt['grant_id']
    assert 'evidence_ref' not in entry and 'reason' not in entry and 'actor' not in entry


def test_credit_gift_upgrade_only_grants_the_new_permission_to_builtin_superadmin(platform):
    from pathlib import Path
    from psycopg import Rollback
    from app.storage.database import connection
    migration = Path('app/storage/migrations/039_admin_credit_gifts.sql').read_text(encoding='utf-8')
    permissions = 'INSERT INTO canvas_cloud.permissions' + migration.split('INSERT INTO canvas_cloud.permissions', 1)[1]
    with connection() as conn:
        with conn.transaction():
            # Exercise the populated-database upgrade branch; then restore this fixture.
            conn.execute("DELETE FROM role_permissions WHERE permission_id='credits.gift.platform'")
            conn.execute("DELETE FROM permissions WHERE id='credits.gift.platform'")
            conn.execute(permissions.replace('canvas_cloud.', ''))
            rows = conn.execute("""SELECT r.builtin_key FROM roles r JOIN role_permissions p ON p.role_id=r.id
                                    WHERE p.permission_id='credits.gift.platform'""").fetchall()
            assert rows and all(r['builtin_key']=='superadmin' for r in rows)
            raise Rollback()


def test_credit_gift_delegated_operator_needs_no_member_management_permission(platform):
    from app.services import credit_gifts, members
    target = person(platform); delegated = person(platform); c = platform['client']; actor = platform['operator']
    data = body(target)
    receipt = credit_gifts.gift(actor, **data, preview_token=credit_gifts.gift(actor, **data)['preview_token'])
    role = members.create_role(actor, 'gift-only-'+uuid.uuid4().hex, [credit_gifts.PERMISSION])
    members.assign_roles(actor, delegated['id'], [role])
    assert c.post('/api/auth/login', json={'username':delegated['username'], 'password':PASSWORD}).status_code == 200
    assert c.get('/api/me').json()['permissions'] == [credit_gifts.PERMISSION]
    # A second operator cannot reuse or learn another operator's request receipt.
    assert c.post('/api/credits/gifts/preview', json=data).json()['detail']['code'] == 'credit_gift_request_conflict'
    ready = preview(c, body(target))
    applied = c.post('/api/credits/gifts/apply', json=ready)
    assert applied.status_code == 200 and applied.json()['actor']['id'] == delegated['id']
    assert len(c.get('/api/credits/gifts', params={'username':target['username']}).json()['entries']) == 2
    assert c.get('/api/members').status_code == 403
    assert c.get('/api/audit').status_code == 403
