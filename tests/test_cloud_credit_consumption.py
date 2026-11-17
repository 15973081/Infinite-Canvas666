import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from psycopg.errors import CheckViolation, UniqueViolation, ForeignKeyViolation

from app.storage.database import connection
from app.services.credit_wallet import (record_grant, freeze_credits, settle_credits,
    release_credits, CreditWalletError, MAX_CREDITS)
from test_cloud_management import platform
from test_cloud_member_gateway import operator, world

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture
def owner():
    mid = 'consume_' + uuid.uuid4().hex
    with connection() as conn:
        assert conn.execute('SELECT current_schema() AS name').fetchone()['name'].startswith('cloud_test_')
        conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,'成员','active','s','d')", (mid, mid))
    return mid


def grant(conn, owner, amount, category, reference):
    return record_grant(conn, owner, amount=amount, source='PLATFORM_GIFT' if category == 'gift' else 'RECHARGE',
                        reference=reference, validity='PERMANENT')


def freeze(conn, owner, credits=100, source=None, **kwargs):
    return freeze_credits(conn, owner, source_type='canvas_task', source_id=source or uuid.uuid4().hex,
                          credits=credits, quote_version=2, quote_snapshot={'count': 5, 'credits': credits}, **kwargs)


def balances(conn, owner):
    wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s', (owner,)).fetchone()
    totals = conn.execute('''SELECT coalesce(sum(remaining_amount) FILTER(WHERE category='gift'),0) gift,
        coalesce(sum(remaining_amount) FILTER(WHERE category='recharge'),0) recharge,
        coalesce(sum(frozen_amount),0) frozen FROM credit_grants WHERE member_id=%s''', (owner,)).fetchone()
    assert (wallet['gift_balance'], wallet['recharge_balance'], wallet['frozen_balance']) == (totals['gift'], totals['recharge'], totals['frozen'])
    assert 0 <= wallet['frozen_balance'] <= wallet['gift_balance'] + wallet['recharge_balance']
    return wallet


def batches(conn, hold_id):
    return conn.execute('''SELECT a.*,g.remaining_amount,g.frozen_amount AS batch_frozen
        FROM credit_hold_allocations a JOIN credit_grants g ON g.id=a.grant_id
        WHERE hold_id=%s ORDER BY a.id''', (hold_id,)).fetchall()


def test_credit_consumption_partial_settlement_fifo_and_conservation(owner):
    with connection() as conn:
        # Older recharge batches must still follow newer gifts.
        r1 = grant(conn, owner, 25, 'recharge', 'r1')
        r2 = grant(conn, owner, 25, 'recharge', 'r2')
        g1 = grant(conn, owner, 20, 'gift', 'g1')
        g2 = grant(conn, owner, 30, 'gift', 'g2')
        hold = freeze(conn, owner)
        assert [a['grant_id'] for a in batches(conn, hold['id'])] == [g1, g2, r1, r2]
        assert balances(conn, owner)['frozen_balance'] == 100
        assert conn.execute('SELECT count(*) n FROM credit_transactions WHERE member_id=%s', (owner,)).fetchone()['n'] == 4
        result = settle_credits(conn, hold['id'], 60, reason='部分完成')
        assert (result['status'], result['settled_credits'], result['released_credits']) == ('SETTLED', 60, 40)
        rows = batches(conn, hold['id'])
        assert [a['settled_amount'] for a in rows] == [20, 30, 10, 0]
        assert [a['released_amount'] for a in rows] == [0, 0, 15, 25]
        assert [a['remaining_amount'] for a in rows] == [0, 0, 15, 25]
        assert [a['batch_frozen'] for a in rows] == [0, 0, 0, 0]
        wallet = balances(conn, owner)
        assert (wallet['gift_balance'], wallet['recharge_balance'], wallet['frozen_balance']) == (0, 40, 0)
        entry = conn.execute('SELECT * FROM credit_transactions WHERE hold_id=%s', (hold['id'],)).fetchone()
        assert (entry['type'], entry['amount'], entry['balance_after'], entry['grant_id']) == ('SPEND', 60, 40, None)


def test_credit_consumption_fifo_timestamp_ties_use_batch_id(owner):
    with connection() as conn:
        ids = [grant(conn, owner, 50, 'gift', str(i)) for i in range(2)]
        conn.execute("UPDATE credit_grants SET created_at='2026-01-01' WHERE member_id=%s", (owner,))
        hold = freeze(conn, owner, 60)
        assert [r['grant_id'] for r in batches(conn, hold['id'])] == sorted(ids)
        assert [r['frozen_amount'] for r in batches(conn, hold['id'])] == [50, 10]


def test_credit_consumption_idempotency_release_and_terminal_conflicts(owner):
    with connection() as conn:
        grant(conn, owner, 200, 'gift', 'initial')
        first = freeze(conn, owner, source='retry-' + owner)
        assert freeze(conn, owner, 120, source=first['source_id']) == first
        result = settle_credits(conn, first['id'], 60, reason='partial')
        assert settle_credits(conn, first['id'], 60, reason='partial') == result
        assert freeze(conn, owner, source=first['source_id']) == result
        for amount, reason in [(0, 'partial'), (61, 'partial'), (60, 'different')]:
            with pytest.raises(CreditWalletError, match='credit_settlement_conflict'):
                settle_credits(conn, first['id'], amount, reason=reason)
        second = freeze(conn, owner)
        released = release_credits(conn, second['id'], reason='failed')
        assert (released['status'], released['settled_credits'], released['released_credits']) == ('RELEASED', 0, 100)
        assert release_credits(conn, second['id'], reason='failed') == released
        assert settle_credits(conn, second['id'], 0, reason='failed') == released
        with pytest.raises(CreditWalletError, match='credit_settlement_conflict'):
            settle_credits(conn, second['id'], 1, reason='failed')
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s', (second['id'],)).fetchone()
        assert balances(conn, owner)['gift_balance'] == 140
        assert all(a['released_amount'] == a['frozen_amount'] for a in batches(conn, second['id']))


def test_credit_consumption_multiple_holds_same_batch_and_disabled_completion(owner):
    with connection() as conn:
        grant(conn, owner, 200, 'gift', 'batch')
        a, b = freeze(conn, owner), freeze(conn, owner)
        settle_credits(conn, a['id'], 60)
        wallet = balances(conn, owner)
        assert (wallet['gift_balance'], wallet['frozen_balance']) == (140, 100)
        conn.execute("UPDATE members SET status='disabled' WHERE id=%s", (owner,))
        with pytest.raises(CreditWalletError, match='credit_member_unavailable'):
            freeze(conn, owner, 1)
        release_credits(conn, b['id'])
        assert balances(conn, owner)['frozen_balance'] == 0


def test_credit_consumption_insufficient_invalid_and_outer_rollback(owner):
    with connection() as conn:
        grant(conn, owner, 50, 'gift', 'batch')
        with pytest.raises(CreditWalletError) as error:
            freeze(conn, owner, 100)
        assert error.value.code == 'insufficient_credits'
        assert error.value.details == {'available_balance': 50, 'required_credits': 100}
        assert not conn.execute('SELECT 1 FROM credit_holds WHERE member_id=%s', (owner,)).fetchone()
        for credits in [0, -1, True, 1.5]:
            with pytest.raises(CreditWalletError):
                freeze(conn, owner, credits)
        class Abort(Exception): pass
        with pytest.raises(Abort), conn.transaction():
            held = freeze(conn, owner, 50)
            raise Abort()
        assert balances(conn, owner)['frozen_balance'] == 0
        held = freeze(conn, owner, 50)
        for actual in [-1, True, 1.5, 51]:
            with pytest.raises(CreditWalletError):
                settle_credits(conn, held['id'], actual)
        with pytest.raises(Abort), conn.transaction():
            settle_credits(conn, held['id'], 30)
            raise Abort()
        assert balances(conn, owner)['frozen_balance'] == 50
        assert conn.execute('SELECT status FROM credit_holds WHERE id=%s', (held['id'],)).fetchone()['status'] == 'FROZEN'
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s', (held['id'],)).fetchone()
        with pytest.raises(CreditWalletError, match='credit_hold_not_found'):
            settle_credits(conn, 'missing', 1)


def test_credit_consumption_concurrent_freezes_only_one_can_spend_available_balance(owner):
    with connection() as conn:
        grant(conn, owner, 100, 'gift', 'batch')
    barrier = Barrier(2)
    def run(_):
        with connection() as conn:
            barrier.wait(timeout=10)
            try:
                return freeze(conn, owner)
            except CreditWalletError as error:
                return error
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, range(2)))
    assert sum(isinstance(r, dict) for r in results) == 1
    error = next(r for r in results if isinstance(r, CreditWalletError))
    assert error.code == 'insufficient_credits' and error.details['available_balance'] == 0
    with connection() as conn:
        assert balances(conn, owner)['frozen_balance'] == 100
        assert conn.execute('SELECT count(*) n FROM credit_holds WHERE member_id=%s', (owner,)).fetchone()['n'] == 1


def test_credit_consumption_concurrent_retries_and_settle_release_conflict(owner):
    with connection() as conn:
        grant(conn, owner, 100, 'recharge', 'batch')
    def hold(_):
        with connection() as conn:
            return freeze(conn, owner, source=owner)
    with ThreadPoolExecutor(max_workers=4) as pool:
        holds = list(pool.map(hold, range(4)))
    assert len({h['id'] for h in holds}) == 1
    barrier = Barrier(2)
    def finish(amount):
        with connection() as conn:
            barrier.wait(timeout=10)
            try:
                return settle_credits(conn, holds[0]['id'], amount)
            except CreditWalletError as error:
                return error
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(finish, [0, 60]))
    assert sum(isinstance(r, dict) for r in results) == 1
    assert next(r for r in results if isinstance(r, CreditWalletError)).code == 'credit_settlement_conflict'
    winner = next(r for r in results if isinstance(r, dict))
    with connection() as conn:
        wallet = balances(conn, owner)
        assert wallet['frozen_balance'] == 0
        assert wallet['recharge_balance'] == 100 - winner['settled_credits']


def test_credit_consumption_bigint_and_grant_after_freeze(owner):
    with connection() as conn:
        grant(conn, owner, MAX_CREDITS - 1, 'recharge', 'big')
        held = freeze(conn, owner, MAX_CREDITS - 1)
        grant(conn, owner, 1, 'gift', 'new')
        settle_credits(conn, held['id'], MAX_CREDITS - 2)
        wallet = balances(conn, owner)
        assert (wallet['gift_balance'], wallet['recharge_balance'], wallet['frozen_balance']) == (1, 1, 0)


def test_credit_consumption_cross_member_source_race_is_rejected(owner):
    other = 'consume_' + uuid.uuid4().hex
    with connection() as conn:
        conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,'成员','active','s','d')", (other, other))
        for mid in (owner, other):
            grant(conn, mid, 100, 'gift', mid)
    barrier = Barrier(2)
    source = uuid.uuid4().hex
    def run(mid):
        with connection() as conn:
            barrier.wait(timeout=10)
            try:
                return freeze(conn, mid, source=source)
            except CreditWalletError as error:
                return error
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [owner, other]))
    assert sum(isinstance(r, dict) for r in results) == 1
    assert next(r for r in results if isinstance(r, CreditWalletError)).code == 'credit_hold_owner_conflict'
    with connection() as conn:
        assert sum(balances(conn, mid)['frozen_balance'] for mid in (owner, other)) == 100


def test_credit_consumption_schema_constraints_reject_inconsistent_rows(owner):
    with connection() as conn:
        gid = grant(conn, owner, 100, 'gift', 'batch')
        hold = freeze(conn, owner)
        invalid = [
            (CheckViolation, 'UPDATE credit_wallets SET frozen_balance=101 WHERE member_id=%s', (owner,)),
            (CheckViolation, 'UPDATE credit_grants SET frozen_amount=101 WHERE id=%s', (gid,)),
            (CheckViolation, 'UPDATE credit_holds SET settled_credits=1 WHERE id=%s', (hold['id'],)),
            (CheckViolation, "UPDATE credit_holds SET status='SETTLED',settled_at=now() WHERE id=%s", (hold['id'],)),
            (CheckViolation, "UPDATE credit_holds SET status='SETTLED',settled_credits=60,released_credits=39,settled_at=now() WHERE id=%s", (hold['id'],)),
            (CheckViolation, 'UPDATE credit_hold_allocations SET settled_amount=60,released_amount=41 WHERE hold_id=%s', (hold['id'],)),
            (UniqueViolation, "INSERT INTO credit_transactions(member_id,grant_id,type,amount,balance_after) VALUES(%s,%s,'ADD',1,100)", (owner, gid)),
            (CheckViolation, "INSERT INTO credit_transactions(member_id,type,amount,balance_after) VALUES(%s,'ADD',1,100)", (owner,)),
            (CheckViolation, "INSERT INTO credit_transactions(member_id,type,amount,balance_after) VALUES(%s,'SPEND',1,99)", (owner,)),
            (ForeignKeyViolation, "UPDATE credit_hold_allocations SET category='recharge' WHERE hold_id=%s", (hold['id'],)),
        ]
        for error, sql, args in invalid:
            with pytest.raises(error), conn.transaction():
                conn.execute(sql, args)
        settle_credits(conn, hold['id'], 100)
        with pytest.raises(UniqueViolation), conn.transaction():
            conn.execute("INSERT INTO credit_transactions(member_id,hold_id,type,amount,balance_after) VALUES(%s,%s,'SPEND',1,0)", (owner, hold['id']))


def test_credit_consumption_settlement_write_failure_rolls_back_all_batches(owner):
    with connection() as conn:
        grant(conn, owner, 100, 'gift', 'batch')
        hold = freeze(conn, owner)
        class FailingConnection:
            def transaction(self):
                return conn.transaction()
            def execute(self, sql, args=()):
                if 'INSERT INTO credit_transactions' in sql:
                    raise RuntimeError('spend write failed')
                return conn.execute(sql, args)
        with pytest.raises(RuntimeError, match='spend write failed'):
            settle_credits(FailingConnection(), hold['id'], 60)
        wallet = balances(conn, owner)
        assert wallet['gift_balance'] == 100 and wallet['frozen_balance'] == 100
        assert conn.execute('SELECT status FROM credit_holds WHERE id=%s', (hold['id'],)).fetchone()['status'] == 'FROZEN'
        assert batches(conn, hold['id'])[0]['settled_amount'] == 0


def test_credit_consumption_migration_preserves_existing_grants_and_admin_receipts():
    from psycopg import sql
    from app.storage.database import migrations
    schema = 'credit_upgrade_' + uuid.uuid4().hex
    with connection() as conn:
        assert conn.execute('SELECT current_schema() AS name').fetchone()['name'].startswith('cloud_test_')
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        conn.execute(sql.SQL('SET LOCAL search_path TO {}, public').format(sql.Identifier(schema)))
        for version, source in migrations():
            if version < 46:
                conn.execute(source.replace('canvas_cloud.', schema + '.'), prepare=False)
        mid = 'upgrade-member'
        conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,'成员','active','s','d')", (mid, mid))
        gift = grant(conn, mid, 70, 'gift', 'old-gift')
        grant(conn, mid, 30, 'recharge', 'old-recharge')
        request_id = str(uuid.uuid4())
        conn.execute('''INSERT INTO admin_credit_gifts(request_id,actor_id,member_id,grant_id,input,actor_snapshot,target_snapshot,preview_token)
            VALUES(%s,%s,%s,%s,'{}','{}','{}',%s)''', (request_id, mid, mid, gift, 'a' * 64))
        before = conn.execute('SELECT * FROM credit_transactions ORDER BY id').fetchall()
        migration = next(source for version, source in migrations() if version == 46)
        conn.execute(migration.replace('canvas_cloud.', schema + '.'), prepare=False)
        after = conn.execute('SELECT * FROM credit_transactions ORDER BY id').fetchall()
        assert [{k:v for k,v in row.items() if k != 'hold_id'} for row in after] == before
        assert conn.execute('SELECT grant_id FROM admin_credit_gifts WHERE request_id=%s', (request_id,)).fetchone()['grant_id'] == gift
        assert balances(conn, mid)['frozen_balance'] == 0
        held = freeze(conn, mid)
        settle_credits(conn, held['id'], 60)
        assert grant(conn, mid, 70, 'gift', 'old-gift') == gift
        assert balances(conn, mid)['gift_balance'] == 10
        conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_credit_consumption_account_and_management_reads(world, platform):
    from fastapi.testclient import TestClient
    from main import app
    from app.services import members
    from test_cloud_member_gateway import PASSWORD
    owner = world['people'][0]['id']
    with connection() as conn:
        grant(conn, owner, 50, 'gift', 'gift')
        grant(conn, owner, 100, 'recharge', 'recharge')
        hold = freeze(conn, owner)
    path = '/api/account/credits'
    response = world['editor'].get(path)
    assert response.status_code == 200, response.text
    assert response.json()['wallet'] == {'total_balance':'150','gift_balance':'50','recharge_balance':'100',
                                       'frozenBalance':'100','availableBalance':'50'}
    with connection() as conn:
        settle_credits(conn, hold['id'], 60, reason='partial')
    data = world['editor'].get(path).json()
    entry = data['entries'][0]
    assert (entry['type'], entry['amount'], entry['balance_after'], entry['category']) == ('SPEND','60','90','mixed')
    assert entry['grant_id'] is None and entry['remaining_amount'] is None and entry['hold_id'] == hold['id']
    assert [a['settled_amount'] for a in entry['allocations']] == ['50','10']
    for category in ('gift', 'recharge'):
        filtered = world['editor'].get(path, params={'category':category,'page_size':1}).json()
        assert filtered['records'] == 2 and filtered['entries'][0]['amount'] == '60'
    assert world['viewer'].get(path, params={'member_id': owner}).json()['records'] == 0
    managed = '/api/credits/wallets/' + owner
    assert platform['client'].get(managed).json() == data
    assert world['editor'].get(managed).status_code == 403
    with TestClient(app) as anonymous:
        assert anonymous.get(path).status_code == 401
    # A member who can enter management but has no gift/audit grant cannot read wallets.
    target = world['people'][1]
    role = members.create_role(platform['operator'], 'wallet-denied-' + uuid.uuid4().hex, ['member.manage'])
    members.assign_roles(platform['operator'], target['id'], [role])
    token = members.login(target['username'], PASSWORD, audience='management', source=uuid.uuid4().hex)['token']
    from app.services.credit_wallet import management_report
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        management_report(members.resolve_session(token, 'management'), owner)
    assert error.value.status_code == 403
