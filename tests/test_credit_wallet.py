import os
import uuid

import pytest
from fastapi import HTTPException
from app.services import authorization as az
from app.services.credit_wallet import record_grant, report, MAX_CREDITS
from app.storage.database import connection

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture
def world():
    class Rollback(Exception): pass
    try:
        with connection() as conn:
            assert conn.execute('SELECT current_schema() AS name').fetchone()['name'].startswith('cloud_test_')
            actors = []
            for _ in range(2):
                mid = 'credits_' + uuid.uuid4().hex
                conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,'成员','active','s','d')", (mid, mid))
                conn.execute("INSERT INTO member_sessions(id,token_hash,member_id,audience,expires_at) VALUES(%s,%s,%s,'workbench',now()+interval '1 hour')", (mid, uuid.uuid4().hex*2, mid))
                actors.append(az.Principal(mid, mid, 'workbench'))
            yield conn, actors
            raise Rollback()
    except Rollback: pass


def grant(conn, actor, amount=10, source='PLATFORM_GIFT', reference='test', **kwargs):
    return record_grant(conn, actor.member_id, amount=amount, source=source, reference=reference, validity='PERMANENT', **kwargs)


def test_credit_wallet_zero_and_classified_idempotent_grants(world):
    conn, (a, b) = world
    assert report(a)['wallet'] == {'total_balance':'0','recharge_balance':'0','gift_balance':'0'}
    first = grant(conn, a, 1035, 'RECHARGE', 'verified-order:base')
    assert grant(conn, a, 1035, 'RECHARGE', 'verified-order:base') == first
    grant(conn, a, 155, 'RECHARGE_GIFT', 'verified-order:bonus')
    grant(conn, a, 500, reference='explicit-gift')
    data = report(a)
    assert data['wallet'] == {'total_balance':'1690','recharge_balance':'1035','gift_balance':'655'}
    assert data['records'] == 3
    assert [e['balance_after'] for e in data['entries']] == ['1690','1190','1035']
    assert report(b)['records'] == 0
    for args in ({'amount':12}, {'source':'RECHARGE'}, {'note':'changed'}):
        with pytest.raises(ValueError, match='credit_reference_conflict'):
            grant(conn, a, reference='explicit-gift', **args)
    assert report(a)['wallet'] == data['wallet']


@pytest.mark.parametrize('amount', [0,-1,True,1.5,'10',MAX_CREDITS+1])
def test_credit_wallet_reject_invalid_amount(world, amount):
    conn, (a, _) = world
    with pytest.raises(ValueError): grant(conn, a, amount)
    assert report(a)['records'] == 0


def test_credit_wallet_unknown_rules_overflow_and_atomic_rollback(world):
    conn, (a, _) = world
    for source, validity in [('SUBSCRIPTION','PERMANENT'),('RECHARGE','AFTER_GRANT_DAYS')]:
        with pytest.raises(ValueError):
            record_grant(conn,a.member_id,source=source,validity=validity,reference='unsupported',amount=1)
    class Abort(Exception): pass
    with pytest.raises(Abort), conn.transaction():
        grant(conn,a,20)
        raise Abort()
    assert report(a)['records'] == 0
    grant(conn,a,MAX_CREDITS)
    with pytest.raises(ValueError,match='overflow'): grant(conn,a,1,reference='overflow')
    assert report(a)['wallet']['total_balance'] == str(MAX_CREDITS)
    assert report(a)['records'] == 1


def test_credit_wallet_filter_pagination_and_session_revocation(world):
    conn, (a, b) = world
    for i in range(4): grant(conn,a,i+1,'RECHARGE' if i%2 else 'PLATFORM_GIFT',str(i))
    data=report(a,category='gift',page_size=1,page=999)
    assert (data['page'],data['pages'],data['records']) == (2,2,2)
    assert data['wallet']['total_balance']=='10'
    assert data['entries'][0]['amount']=='1'
    for kwargs in ({'category':'subscription'},{'page':0},{'page_size':101}):
        with pytest.raises(HTTPException): report(a,**kwargs)
    conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE id=%s',(a.session_id,))
    with pytest.raises(HTTPException) as error: report(a)
    assert error.value.status_code==401
    conn.execute("UPDATE members SET status='disabled' WHERE id=%s",(b.member_id,))
    with pytest.raises(ValueError,match='unavailable'): grant(conn,b)


def test_credit_wallet_concurrent_duplicate_and_distinct_grants():
    from concurrent.futures import ThreadPoolExecutor
    mid='credits_concurrent_'+uuid.uuid4().hex
    with connection() as conn:
        assert conn.execute('SELECT current_schema() AS name').fetchone()['name'].startswith('cloud_test_')
        conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,'成员','active','s','d')",(mid,mid))
    def write(reference):
        with connection() as conn:
            return record_grant(conn,mid,source='PLATFORM_GIFT',amount=7,reference=reference,validity='PERMANENT')
    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            ids=list(executor.map(write,['duplicate']*4+['a','b','c']))
        assert len(set(ids[:4]))==1
        with connection() as conn:
            wallet=conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s',(mid,)).fetchone()
            rows=conn.execute('SELECT balance_after FROM credit_transactions WHERE member_id=%s ORDER BY id',(mid,)).fetchall()
        assert wallet['gift_balance']==28 and wallet['recharge_balance']==0
        assert [r['balance_after'] for r in rows]==[7,14,21,28]
    finally:
        with connection() as conn:
            conn.execute('DELETE FROM credit_transactions WHERE member_id=%s',(mid,))
            conn.execute('DELETE FROM credit_grants WHERE member_id=%s',(mid,))
            conn.execute('DELETE FROM credit_wallets WHERE member_id=%s',(mid,))
            conn.execute('DELETE FROM members WHERE id=%s',(mid,))
