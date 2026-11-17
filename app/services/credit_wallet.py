"""Account credits, separate from provider costs. No payment integration.

record_grant is an internal transaction primitive; credit_gifts adds management
authorization, explicit confirmation, private provenance and atomic audit.
It requires an explicit source, business reference and permanent validity;
it never infers payment success, reward eligibility or converts currency.
"""
import uuid

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az

SOURCES = {'RECHARGE': 'recharge', 'RECHARGE_GIFT': 'gift', 'PLATFORM_GIFT': 'gift'}
MAX_CREDITS = 9223372036854775807


class CreditWalletError(ValueError):
    def __init__(self, code, **details):
        super().__init__(code)
        self.code = code
        self.details = details


def _credits(value, *, allow_zero=False):
    if type(value) is not int or not (0 if allow_zero else 1) <= value <= MAX_CREDITS:
        raise CreditWalletError('invalid_credit_amount')


def freeze_credits(conn, member_id, *, source_type, source_id, credits,
                   quote_version, quote_snapshot, workspace_id=None, model_code=None):
    """Reserve gift-first FIFO credits in the caller's transaction; never submit work."""
    _credits(credits)
    if (source_type not in {'canvas_task', 'chat_call'} or not isinstance(source_id, str)
            or not source_id.strip() or len(source_id) > 240
            or type(quote_version) is not int or not 0 <= quote_version <= MAX_CREDITS
            or not isinstance(quote_snapshot, dict)):
        raise CreditWalletError('invalid_credit_hold')
    with conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock_shared(%s)', (az.AUTH_LOCK,))
        conn.execute('INSERT INTO credit_wallets(member_id) VALUES(%s) ON CONFLICT DO NOTHING', (member_id,))
        wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s FOR UPDATE', (member_id,)).fetchone()
        existing = conn.execute('SELECT * FROM credit_holds WHERE source_type=%s AND source_id=%s',
                                (source_type, source_id)).fetchone()
        if existing:
            if existing['member_id'] != member_id:
                raise CreditWalletError('credit_hold_owner_conflict')
            return existing
        from app.storage.deletion_ledger import member_blocked
        if member_blocked(member_id) or not conn.execute(
                "SELECT 1 FROM members WHERE id=%s AND status='active'", (member_id,)).fetchone():
            raise CreditWalletError('credit_member_unavailable')
        # The source key is global: concurrent requests from different wallets
        # must resolve to the same hold before either can allocate its batches.
        hold = conn.execute('''INSERT INTO credit_holds
            (id,member_id,workspace_id,source_type,source_id,model_code,quote_version,quote_snapshot,frozen_credits)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(source_type,source_id) DO NOTHING RETURNING *''',
            ('crh_' + uuid.uuid4().hex, member_id, workspace_id, source_type, source_id,
             model_code, quote_version, Jsonb(quote_snapshot), credits)).fetchone()
        if not hold:
            existing = conn.execute('SELECT * FROM credit_holds WHERE source_type=%s AND source_id=%s',
                                    (source_type, source_id)).fetchone()
            if existing['member_id'] != member_id:
                raise CreditWalletError('credit_hold_owner_conflict')
            return existing
        available = wallet['recharge_balance'] + wallet['gift_balance'] - wallet['frozen_balance']
        if available < credits:
            raise CreditWalletError('insufficient_credits', available_balance=available, required_credits=credits)
        grants = conn.execute('''SELECT * FROM credit_grants
            WHERE member_id=%s AND remaining_amount>frozen_amount
            ORDER BY CASE category WHEN 'gift' THEN 0 ELSE 1 END,created_at,id FOR UPDATE''', (member_id,)).fetchall()
        remaining = credits
        for grant in grants:
            amount = min(remaining, grant['remaining_amount'] - grant['frozen_amount'])
            conn.execute('UPDATE credit_grants SET frozen_amount=frozen_amount+%s WHERE id=%s', (amount, grant['id']))
            conn.execute('''INSERT INTO credit_hold_allocations(hold_id,grant_id,member_id,category,frozen_amount)
                VALUES(%s,%s,%s,%s,%s)''', (hold['id'], grant['id'], member_id, grant['category'], amount))
            remaining -= amount
            if not remaining:
                break
        if remaining:
            raise CreditWalletError('credit_batch_balance_mismatch')
        conn.execute('UPDATE credit_wallets SET frozen_balance=frozen_balance+%s WHERE member_id=%s', (credits, member_id))
        return hold


def _settlement_parts(allocations, actual_credits):
    """Consume the FIFO prefix; its unused suffix is the reverse-order release."""
    remaining = actual_credits
    parts = []
    for allocation in allocations:
        spent = min(remaining, allocation['frozen_amount'])
        parts.append((allocation, spent, allocation['frozen_amount'] - spent))
        remaining -= spent
    if remaining:
        raise CreditWalletError('credit_allocation_mismatch')
    return parts


def settle_credits(conn, hold_id, actual_credits, *, reason=''):
    """Finalize a hold once, including zero-cost release, even after account disablement."""
    _credits(actual_credits, allow_zero=True)
    if not isinstance(reason, str) or len(reason) > 1000:
        raise CreditWalletError('invalid_credit_settlement_reason')
    with conn.transaction():
        owner = conn.execute('SELECT member_id FROM credit_holds WHERE id=%s', (hold_id,)).fetchone()
        if not owner:
            raise CreditWalletError('credit_hold_not_found')
        member_id = owner['member_id']
        wallet = conn.execute('SELECT * FROM credit_wallets WHERE member_id=%s FOR UPDATE', (member_id,)).fetchone()
        hold = conn.execute('SELECT * FROM credit_holds WHERE id=%s FOR UPDATE', (hold_id,)).fetchone()
        if actual_credits > hold['frozen_credits']:
            raise CreditWalletError('credit_settlement_exceeds_hold')
        if hold['status'] != 'FROZEN':
            if hold['settled_credits'] != actual_credits or hold['settlement_note'] != reason:
                raise CreditWalletError('credit_settlement_conflict', status=hold['status'], settled_credits=hold['settled_credits'])
            return hold
        allocations = conn.execute('''SELECT a.* FROM credit_hold_allocations a
            JOIN credit_grants g ON g.id=a.grant_id AND g.member_id=a.member_id
            WHERE a.hold_id=%s
            ORDER BY CASE g.category WHEN 'gift' THEN 0 ELSE 1 END,g.created_at,g.id
            FOR UPDATE OF a,g''', (hold_id,)).fetchall()
        if sum(a['frozen_amount'] for a in allocations) != hold['frozen_credits']:
            raise CreditWalletError('credit_allocation_mismatch')
        spent_by_category = {'gift': 0, 'recharge': 0}
        for allocation, spent, released in _settlement_parts(allocations, actual_credits):
            conn.execute('''UPDATE credit_grants SET remaining_amount=remaining_amount-%s,
                frozen_amount=frozen_amount-%s WHERE id=%s''', (spent, allocation['frozen_amount'], allocation['grant_id']))
            conn.execute('UPDATE credit_hold_allocations SET settled_amount=%s,released_amount=%s WHERE id=%s',
                         (spent, released, allocation['id']))
            spent_by_category[allocation['category']] += spent
        wallet = conn.execute('''UPDATE credit_wallets SET gift_balance=gift_balance-%s,
            recharge_balance=recharge_balance-%s,frozen_balance=frozen_balance-%s WHERE member_id=%s RETURNING *''',
            (spent_by_category['gift'], spent_by_category['recharge'], hold['frozen_credits'], member_id)).fetchone()
        hold = conn.execute('''UPDATE credit_holds SET status=%s,settled_credits=%s,released_credits=%s,
            settlement_note=%s,settled_at=clock_timestamp() WHERE id=%s RETURNING *''',
            ('SETTLED' if actual_credits else 'RELEASED', actual_credits, hold['frozen_credits'] - actual_credits,
             reason, hold_id)).fetchone()
        if actual_credits:
            conn.execute('''INSERT INTO credit_transactions(member_id,hold_id,type,amount,balance_after)
                VALUES(%s,%s,'SPEND',%s,%s)''',
                (member_id, hold_id, actual_credits, wallet['gift_balance'] + wallet['recharge_balance']))
        return hold


def release_credits(conn, hold_id, *, reason=''):
    return settle_credits(conn, hold_id, 0, reason=reason)


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


def report(actor, *, category='', page=1, page_size=25, transaction_type=''):
    with az.policy_transaction() as conn:
        az.active_member(conn, actor)
        if actor.audience != 'workbench':
            az.fail('workbench_entry_required')
        return _report(conn, actor.member_id, category, page, page_size, transaction_type)


def management_report(actor, member_id, *, category='', page=1, page_size=25, transaction_type=''):
    with az.policy_transaction() as conn:
        az.active_member(conn, actor)
        if actor.audience != 'management':
            az.fail('management_entry_required')
        permission = 'credits.gift.platform' if 'credits.gift.platform' in az.effective_permissions(conn, actor.member_id) else 'audit.platform'
        az.require(conn, actor, permission)
        if not conn.execute('SELECT 1 FROM members WHERE id=%s', (member_id,)).fetchone():
            az.fail('member_not_found', 404)
        return _report(conn, member_id, category, page, page_size, transaction_type)


def _report(conn, owner, category, page, page_size, transaction_type):
    if category not in ('', 'recharge', 'gift') or transaction_type not in ('', 'ADD', 'SPEND') or page < 1 or not 1 <= page_size <= 100:
        raise HTTPException(400, {'code': 'invalid_credit_query'})
    # Balance, count, allocations and page share one statement snapshot.
    data = conn.execute('''WITH allocations AS (
            SELECT hold_id,
                bool_or(category='gift' AND settled_amount>0) AS gift_spent,
                bool_or(category='recharge' AND settled_amount>0) AS recharge_spent,
                jsonb_agg(jsonb_build_object('grant_id',grant_id,'category',category,
                    'frozen_amount',frozen_amount::text,'settled_amount',settled_amount::text,
                    'released_amount',released_amount::text) ORDER BY id) AS entries
            FROM credit_hold_allocations WHERE member_id=%s GROUP BY hold_id
        ), filtered AS (
            SELECT t.id::text,t.type,t.amount::text,t.balance_after::text,
                (extract(epoch FROM t.created_at)*1000)::bigint AS created_at,
                g.id AS grant_id,
                CASE WHEN t.type='ADD' THEN g.category
                     WHEN a.gift_spent AND a.recharge_spent THEN 'mixed'
                     WHEN a.gift_spent THEN 'gift' ELSE 'recharge' END AS category,
                coalesce(g.source,h.source_type) AS source,g.remaining_amount::text,g.validity,
                coalesce(g.note,h.settlement_note) AS note,t.hold_id,h.source_id,h.model_code,h.workspace_id,
                coalesce(a.entries,'[]'::jsonb) AS allocations
            FROM credit_transactions t
            LEFT JOIN credit_grants g ON g.id=t.grant_id AND g.member_id=t.member_id
            LEFT JOIN credit_holds h ON h.id=t.hold_id AND h.member_id=t.member_id
            LEFT JOIN allocations a ON a.hold_id=t.hold_id
            WHERE t.member_id=%s AND (%s='' OR g.category=%s
                OR (%s='gift' AND a.gift_spent) OR (%s='recharge' AND a.recharge_spent))
                AND (%s='' OR t.type=%s)
        ), counts AS (SELECT count(*) AS records FROM filtered),
        paging AS (SELECT records,greatest(1,(records+%s-1)/%s) AS pages FROM counts),
        chosen AS (SELECT records,pages,least(%s,pages) AS page FROM paging)
        SELECT coalesce(w.recharge_balance,0)::text AS recharge_balance,
            coalesce(w.gift_balance,0)::text AS gift_balance,
            (coalesce(w.recharge_balance,0)+coalesce(w.gift_balance,0))::text AS total_balance,
            coalesce(w.frozen_balance,0)::text AS "frozenBalance",
            (coalesce(w.recharge_balance,0)+coalesce(w.gift_balance,0)-coalesce(w.frozen_balance,0))::text AS "availableBalance",
            c.records,c.pages,c.page,
            coalesce((SELECT jsonb_agg(row_data ORDER BY (row_data->>'id')::bigint DESC) FROM
                (SELECT to_jsonb(f) AS row_data FROM filtered f ORDER BY f.id::bigint DESC
                 LIMIT %s OFFSET (SELECT (page-1)*%s FROM chosen)) rows),'[]'::jsonb) AS entries
        FROM chosen c LEFT JOIN credit_wallets w ON w.member_id=%s''',
        (owner, owner, category, category, category, category, transaction_type, transaction_type, page_size, page_size, page, page_size, page_size, owner)).fetchone()
    return {'wallet': {k: data[k] for k in ('total_balance', 'recharge_balance', 'gift_balance', 'frozenBalance', 'availableBalance')},
                **{k: data[k] for k in ('records', 'pages', 'page', 'entries')}, 'page_size': page_size,
                'category': category}
