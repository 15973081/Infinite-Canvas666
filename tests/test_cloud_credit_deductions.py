"""Manual deductions against real wallet batches and management sessions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import uuid

import pytest
from fastapi import HTTPException
from app.services import authorization as az, credit_deductions, credit_wallet, members
from app.storage.database import connection
from test_cloud_credit_consumption import balances, freeze
from test_cloud_credit_gifts import person
from test_cloud_management import platform
from test_cloud_member_gateway import PASSWORD, operator

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
BASE = '/api/credits/deductions'


def request(target, amount='65', category=None):
    return dict(request_id=str(uuid.uuid4()), username=target['username'], amount=amount,
                category=category, reason='更正误发额度')


def preview(client, data):
    response = client.post(BASE + '/preview', json=data)
    assert response.status_code == 200, response.text
    return response.json()


def fund(conn, owner, amount, reference, category='gift', *, days=None):
    expiry = datetime.now(timezone.utc) + timedelta(days=days) if days is not None else None
    return credit_wallet.record_grant(conn, owner, source='PLATFORM_GIFT', amount=amount,
                                      reference=reference, category=category, expires_at=expiry)


@pytest.mark.parametrize('category, amount, order', [
    (None, '65', ['early', 'late', 'permanent', 'recharge-early']),
    ('gift', '50', ['early', 'late', 'permanent']),
    ('recharge', '30', ['recharge-early', 'recharge-permanent']),
])
def test_credit_deduction_order_and_private_receipt(platform, category, amount, order):
    target = person(platform)
    owner = target['id']
    client = platform['client']
    with connection() as conn:
        ids = {'permanent': fund(conn, owner, 20, 'permanent'),
               'recharge-permanent': fund(conn, owner, 20, 'recharge-permanent', 'recharge'),
               'late': fund(conn, owner, 20, 'late', days=5),
               'early': fund(conn, owner, 20, 'early', days=3),
               'recharge-early': fund(conn, owner, 20, 'recharge-early', 'recharge', days=1)}
    data = request(target, amount, category)
    plan = preview(client, data)
    assert [row['grant_id'] for row in plan['allocations']] == [ids[key] for key in order]
    ready = {**data, 'preview_token': plan['preview_token']}
    response = client.post(BASE + '/apply', json=ready)
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert receipt['amount'] == amount and receipt['balance_after'] == str(100 - int(amount))
    assert receipt['target']['id'] == owner and receipt['actor']['id'] == platform['operator'].member_id
    assert receipt['reason'] == data['reason']
    assert client.post(BASE + '/apply', json=ready).json() == receipt
    assert client.post(BASE + '/preview', json=data).json() == receipt
    assert client.post(BASE + '/apply', json={**ready, 'reason': '不同备注'}).status_code == 409
    history = client.get(BASE, params={'request_id': data['request_id']}).json()
    assert history == {'entries': [receipt], 'next': None}
    wallet = client.get('/api/credits/wallets/' + owner, params={'transaction_type':'DEDUCT'}).json()
    assert wallet['records'] == len(order)
    assert sum(int(row['amount']) for row in wallet['entries']) == int(amount)
    assert all(row['note'] != receipt['reason'] for row in wallet['entries'])
    with connection() as conn:
        balances(conn, owner)
        rows = conn.execute("SELECT grant_id,amount,balance_after FROM credit_transactions WHERE member_id=%s AND type='DEDUCT' ORDER BY id",
                            (owner,)).fetchall()
        assert [r['grant_id'] for r in rows] == [ids[key] for key in order]
        total = 100
        for row in rows:
            total -= row['amount']
            assert row['balance_after'] == total
        events = conn.execute("SELECT details FROM management_events WHERE action='credits.deduct' AND target_id=%s", (owner,)).fetchall()
        assert events == [{'details': receipt}]


def test_credit_deduction_expiry_and_frozen_balance(platform):
    client = platform['client']
    target = person(platform)
    owner = target['id']
    with connection() as conn:
        ended = fund(conn, owner, 100, 'limited', days=1)
        hold = freeze(conn, owner, 40)
        permanent = fund(conn, owner, 50, 'permanent')
        conn.execute("UPDATE credit_grants SET expires_at=clock_timestamp()-interval '1 day' WHERE id=%s", (ended,))
    insufficient = client.post(BASE + '/preview', json=request(target, '51'))
    assert insufficient.status_code == 409
    assert insufficient.json()['detail'] == {'code': 'insufficient_credits', 'available_balance': '50', 'required_credits': '51'}
    data = request(target, '50')
    planned = preview(client, data)
    with connection() as conn:
        assert balances(conn, owner)['gift_balance'] == 150  # Preview is read only.
    assert [row['grant_id'] for row in planned['allocations']] == [permanent]
    response = client.post(BASE + '/apply', json={**data, 'preview_token': planned['preview_token']})
    assert response.status_code == 200, response.text
    with connection() as conn:
        batch = conn.execute('SELECT remaining_amount,frozen_amount FROM credit_grants WHERE id=%s', (ended,)).fetchone()
        assert batch == {'remaining_amount': 40, 'frozen_amount': 40}
        wallet = balances(conn, owner)
        assert wallet['gift_balance'] == wallet['frozen_balance'] == 40
        rows = conn.execute("SELECT type,amount,balance_after FROM credit_transactions WHERE member_id=%s AND type IN ('EXPIRE','DEDUCT') ORDER BY id", (owner,)).fetchall()
        assert rows == [{'type': 'EXPIRE', 'amount': 60, 'balance_after': 90},
                        {'type': 'DEDUCT', 'amount': 50, 'balance_after': 40}]
        credit_wallet.release_credits(conn, hold['id'])
        assert balances(conn, owner)['gift_balance'] == 0


def test_credit_deduction_requires_reason_and_rechecks_after_preview(platform):
    client = platform['client']
    target = person(platform)
    with connection() as conn:
        fund(conn, target['id'], 100, 'gift')
    data = request(target, '60')
    assert client.post(BASE + '/preview', json={**data, 'reason': '   '}).status_code == 400
    assert client.post(BASE + '/apply', json=data).status_code == 422
    ready = {**data, 'preview_token': preview(client, data)['preview_token']}
    with connection() as conn:
        hold = freeze(conn, target['id'], 30)
    assert client.post(BASE + '/apply', json=ready).json()['detail']['code'] == 'credit_deduction_preview_changed'
    with connection() as conn:
        freeze(conn, target['id'], 20)
    assert client.post(BASE + '/apply', json=ready).json()['detail']['code'] == 'insufficient_credits'
    with connection() as conn:
        assert balances(conn, target['id'])['gift_balance'] == 100
        assert not conn.execute('SELECT 1 FROM admin_credit_deductions WHERE member_id=%s', (target['id'],)).fetchone()
        assert credit_wallet.release_credits(conn, hold['id'])['status'] == 'RELEASED'


def test_credit_deduction_concurrent_retry_and_other_operator(platform):
    client = platform['client']
    actor = platform['operator']
    target = person(platform)
    other = person(platform)
    role = members.create_role(actor, 'credits-' + uuid.uuid4().hex, ['credits.gift.platform'])
    members.assign_roles(actor, other['id'], [role])
    login = members.login(other['username'], PASSWORD, audience='management', source=uuid.uuid4().hex)
    another = members.resolve_session(login['token'], 'management')
    with connection() as conn:
        fund(conn, target['id'], 150, 'owed')
    data = request(target)
    first = {**data, 'preview_token': preview(client, data)['preview_token']}
    second = request(target)
    second = {**second, 'preview_token': credit_deductions.deduct(another, **second)['preview_token']}
    with ThreadPoolExecutor(max_workers=3) as pool:
        receipts = list(pool.map(lambda _: credit_deductions.deduct(actor, **first), range(3)))
    assert receipts[0] == receipts[1] == receipts[2]
    for payload, code in [(first,'credit_deduction_request_conflict'), (second,'credit_deduction_preview_changed')]:
        with pytest.raises(HTTPException) as error:
            credit_deductions.deduct(another, **payload)
        assert error.value.detail['code'] == code
    with connection() as conn:
        assert balances(conn, target['id'])['gift_balance'] == 85


def test_credit_deduction_auditor_can_read_but_cannot_apply(platform):
    actor = platform['operator']
    auditor = person(platform)
    role = members.create_role(actor, 'auditor-' + uuid.uuid4().hex, ['audit.platform'])
    members.assign_roles(actor, auditor['id'], [role])
    login = members.login(auditor['username'], PASSWORD, audience='management', source=uuid.uuid4().hex)
    principal = members.resolve_session(login['token'], 'management')
    with connection() as conn:
        fund(conn, auditor['id'], 100, 'gift')
    data = request(auditor)
    ready = {**data, 'preview_token': credit_deductions.deduct(actor, **data)['preview_token']}
    with pytest.raises(HTTPException) as error:
        credit_deductions.deduct(principal, **ready)
    assert error.value.status_code == 403
    receipt = credit_deductions.deduct(actor, **ready)
    assert credit_deductions.history(principal, request_id=data['request_id'])['entries'] == [receipt]


def test_credit_deduction_audit_failure_rolls_back(platform, monkeypatch):
    client = platform['client']
    target = person(platform)
    with connection() as conn:
        fund(conn, target['id'], 100, 'gift')
    data = request(target)
    ready = {**data, 'preview_token': preview(client, data)['preview_token']}

    def fail(*args, **kwargs):
        raise RuntimeError('audit unavailable')

    monkeypatch.setattr(az, 'audit', fail)
    with pytest.raises(RuntimeError, match='audit unavailable'):
        credit_deductions.deduct(platform['operator'], **ready)
    with connection() as conn:
        assert balances(conn, target['id'])['gift_balance'] == 100
        assert not conn.execute("SELECT 1 FROM credit_transactions WHERE member_id=%s AND type='DEDUCT'", (target['id'],)).fetchone()
    assert client.get(BASE, params={'request_id': data['request_id']}).json()['entries'] == []
