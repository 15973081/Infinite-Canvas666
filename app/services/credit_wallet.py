"""Account credits, separate from provider costs. No payment integration.

record_grant is an internal transaction primitive; credit_gifts adds management
authorization, explicit confirmation, private provenance and atomic audit.
It requires an explicit source, business reference and permanent validity;
it never infers payment success, reward eligibility or converts currency.
"""
import uuid

from fastapi import HTTPException
from app.services import authorization as az

SOURCES = {'RECHARGE': 'recharge', 'RECHARGE_GIFT': 'gift', 'PLATFORM_GIFT': 'gift'}
MAX_CREDITS = 9223372036854775807


def record_grant(conn, member_id, *, source, amount, reference, validity, note=''):
    if (source not in SOURCES or validity != 'PERMANENT'
            or type(amount) is not int or not 0 < amount <= MAX_CREDITS
            or not isinstance(reference, str) or not reference.strip() or len(reference) > 160
            or not isinstance(note, str) or len(note) > 200):
        raise ValueError('invalid_credit_grant')
    reference = reference.strip()
    with conn.transaction():
        # Serialize with account closure/permission changes, then with other grants.
        conn.execute('SELECT pg_advisory_xact_lock_shared(%s)', (az.AUTH_LOCK,))
        from app.storage.deletion_ledger import member_blocked
        if member_blocked(member_id) or not conn.execute(
                "SELECT 1 FROM members WHERE id=%s AND status='active'", (member_id,)).fetchone():
            raise ValueError('credit_member_unavailable')
        conn.execute('INSERT INTO credit_wallets(member_id) VALUES(%s) ON CONFLICT DO NOTHING', (member_id,))
        wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s FOR UPDATE', (member_id,)).fetchone()
        existing = conn.execute('SELECT * FROM credit_grants WHERE member_id=%s AND reference=%s',
                                (member_id, reference)).fetchone()
        if existing:
            if any(existing[k] != v for k, v in {'source': source, 'amount': amount, 'validity': validity, 'note': note}.items()):
                raise ValueError('credit_reference_conflict')
            return existing['id']
        total = wallet['recharge_balance'] + wallet['gift_balance'] + amount
        if total > MAX_CREDITS:
            raise ValueError('credit_balance_overflow')
        grant_id = 'crg_' + uuid.uuid4().hex
        category = SOURCES[source]
        conn.execute('''INSERT INTO credit_grants(id,member_id,reference,category,source,amount,remaining_amount,validity,note)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (grant_id, member_id, reference, category, source, amount, amount, validity, note))
        conn.execute('''UPDATE credit_wallets SET recharge_balance=recharge_balance+%s,
            gift_balance=gift_balance+%s WHERE member_id=%s''',
            (amount if category == 'recharge' else 0, amount if category == 'gift' else 0, member_id))
        conn.execute('''INSERT INTO credit_transactions(member_id,grant_id,type,amount,balance_after)
            VALUES(%s,%s,'ADD',%s,%s)''', (member_id, grant_id, amount, total))
        return grant_id


def report(actor, *, category='', page=1, page_size=25):
    if category not in ('', 'recharge', 'gift') or page < 1 or not 1 <= page_size <= 100:
        raise HTTPException(400, {'code': 'invalid_credit_query'})
    with az.policy_transaction() as conn:
        az.active_member(conn, actor)
        if actor.audience != 'workbench':
            az.fail('workbench_entry_required')
        owner = actor.member_id
        # One statement gives balance, count and rows from the same MVCC snapshot.
        data = conn.execute('''WITH filtered AS (
            SELECT t.id::text,t.type,t.amount::text,t.balance_after::text,
                (extract(epoch FROM t.created_at)*1000)::bigint AS created_at,
                g.id AS grant_id,g.category,g.source,g.remaining_amount::text,g.validity,g.note
            FROM credit_transactions t JOIN credit_grants g ON g.id=t.grant_id AND g.member_id=t.member_id
            WHERE t.member_id=%s AND (%s='' OR g.category=%s)
        ), counts AS (SELECT count(*) AS records FROM filtered),
        paging AS (SELECT records,greatest(1,(records+%s-1)/%s) AS pages FROM counts),
        chosen AS (SELECT records,pages,least(%s,pages) AS page FROM paging)
        SELECT coalesce(w.recharge_balance,0)::text AS recharge_balance,
            coalesce(w.gift_balance,0)::text AS gift_balance,
            (coalesce(w.recharge_balance,0)+coalesce(w.gift_balance,0))::text AS total_balance,
            c.records,c.pages,c.page,
            coalesce((SELECT jsonb_agg(row_data ORDER BY (row_data->>'id')::bigint DESC) FROM
                (SELECT to_jsonb(f) AS row_data FROM filtered f ORDER BY f.id::bigint DESC
                 LIMIT %s OFFSET (SELECT (page-1)*%s FROM chosen)) rows),'[]'::jsonb) AS entries
        FROM chosen c LEFT JOIN credit_wallets w ON w.member_id=%s''',
        (owner, category, category, page_size, page_size, page, page_size, page_size, owner)).fetchone()
        return {'wallet': {k: data[k] for k in ('total_balance', 'recharge_balance', 'gift_balance')},
                **{k: data[k] for k in ('records', 'pages', 'page', 'entries')}, 'page_size': page_size,
                'category': category}
