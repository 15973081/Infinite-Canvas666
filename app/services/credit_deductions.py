"""Administrator corrections with confirmed batch allocation and an audit receipt."""
import re
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az, credit_wallet
from app.services.credit_gifts import authorize, make_preview_token, target_account


def _receipt(row):
    data = row['input']
    return dict(applied=True, request_id=str(row['request_id']),
                target=row['target_snapshot'], actor=row['actor_snapshot'],
                category=data['category'], amount=data['amount'], reason=data['reason'],
                transaction_id=str(row['transaction_id']), balance_after=row['balance_after'],
                allocations=row['allocations'], created_at=row['created_at'].isoformat())


def _allocations(plan):
    return [{**row, 'amount': str(row['amount']),
             **({'transaction_id': str(row['transaction_id'])} if 'transaction_id' in row else {})}
            for row in plan['allocations']]


def deduct(actor, *, request_id, username, amount, reason, category=None, preview_token=None):
    request_id = str(UUID(str(request_id)))
    if (not 1 <= len(username.strip()) <= 64 or not re.fullmatch(r'[1-9][0-9]{0,18}', amount)
            or int(amount) > credit_wallet.MAX_CREDITS or not 1 <= len(reason.strip()) <= 1000
            or category not in (None, 'gift', 'recharge')):
        az.fail('invalid_credit_deduction', 400)
    data = dict(username=username.strip().lower(), amount=amount, reason=reason.strip(), category=category)
    with az.policy_transaction() as conn:
        authorize(conn, actor)
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('admin-credit-deduct:' + request_id,))
        existing = conn.execute('''SELECT d.*,t.balance_after::text FROM admin_credit_deductions d
            JOIN credit_transactions t ON t.id=d.transaction_id WHERE d.request_id=%s''', (request_id,)).fetchone()
        if existing:
            if existing['actor_id'] != actor.member_id or existing['input'] != data:
                az.fail('credit_deduction_request_conflict', 409)
            if preview_token is not None and preview_token != existing['preview_token']:
                az.fail('credit_deduction_preview_changed', 409)
            return _receipt(existing)
        target = target_account(conn, data['username'], 'credit_deduction_target_unavailable')

        def token(plan):
            return make_preview_token(actor.member_id, request_id, data, target, plan)

        def confirm(plan):
            if token(plan) != preview_token:
                az.fail('credit_deduction_preview_changed', 409)

        try:
            if preview_token is None:
                plan = credit_wallet.deduction_plan(conn, target['id'], amount=int(amount), category=category)
                return dict(applied=False, request_id=request_id, target=target, amount=amount,
                            reason=data['reason'], category=category, allocations=_allocations(plan),
                            available_before=str(plan['available_before']), available_after=str(plan['available_after']),
                            preview_token=token(plan))
            plan = credit_wallet.deduct_credits(conn, target['id'], amount=int(amount), category=category, confirm=confirm)
        except credit_wallet.CreditWalletError as error:
            raise HTTPException(409 if error.code == 'insufficient_credits' else 400,
                                {'code': error.code, **{key: str(value) for key, value in error.details.items()}}) from error

        operator = az.active_member(conn, actor)
        snapshot = {key: operator[key] for key in ('id', 'username', 'display_name')}
        row = conn.execute('''WITH receipt AS (
            INSERT INTO admin_credit_deductions
                (request_id,actor_id,member_id,transaction_id,input,actor_snapshot,target_snapshot,allocations,preview_token)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        ) SELECT r.*,t.balance_after::text FROM receipt r JOIN credit_transactions t ON t.id=r.transaction_id''',
            (request_id, actor.member_id, target['id'], plan['allocations'][-1]['transaction_id'],
             Jsonb(data), Jsonb(snapshot), Jsonb(target), Jsonb(_allocations(plan)), preview_token)).fetchone()
        receipt = _receipt(row)
        az.audit(conn, actor, 'credits.deduct', target['id'], details=receipt)
        return receipt


def history(actor, *, username='', request_id=None, before=None, limit=50):
    with az.policy_transaction() as conn:
        authorize(conn, actor, read=True)
        rows = conn.execute('''SELECT d.*,t.balance_after::text FROM admin_credit_deductions d
            JOIN credit_transactions t ON t.id=d.transaction_id
            WHERE (%s='' OR lower(d.target_snapshot->>'username')=%s)
              AND (%s::uuid IS NULL OR d.request_id=%s::uuid)
              AND (%s::bigint IS NULL OR d.transaction_id<%s)
            ORDER BY d.transaction_id DESC LIMIT %s''',
            (username.strip().lower(), username.strip().lower(), request_id, request_id, before, before, limit+1)).fetchall()
        return {'entries': [_receipt(row) for row in rows[:limit]],
                'next': str(rows[limit-1]['transaction_id']) if len(rows)>limit else None}
