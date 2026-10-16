"""Explicit administrative gifts with private provenance and atomic audit.

Evidence references are administrator attestations; we do not verify external
documents or treat them as payment receipts. No subscription/debit/refund path.
"""
import hashlib
import json
import re
from uuid import UUID

from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.credit_wallet import MAX_CREDITS, record_grant

PERMISSION = 'credits.gift.platform'


def _authorize(conn, actor):
    az.require(conn, actor, PERMISSION)
    if actor.audience != 'management':
        az.fail('management_entry_required')


def _input(username, amount, reason, evidence_ref):
    if (not isinstance(username, str) or not 1 <= len(username.strip()) <= 64
            or not isinstance(amount, str) or not re.fullmatch(r'[1-9][0-9]{0,18}', amount)
            or int(amount) > MAX_CREDITS
            or not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 1000
            or not isinstance(evidence_ref, str) or not 1 <= len(evidence_ref.strip()) <= 500):
        az.fail('invalid_credit_gift', 400)
    return dict(username=username.strip().lower(), amount=amount,
                reason=reason.strip(), evidence_ref=evidence_ref.strip())


def _receipt(conn, row):
    entry = conn.execute('''SELECT id::text,amount::text,balance_after::text FROM credit_transactions
                            WHERE grant_id=%s''', (row['grant_id'],)).fetchone()
    return dict(applied=True, request_id=str(row['request_id']), grant_id=row['grant_id'],
                transaction_id=entry['id'], amount=entry['amount'], balance_after=entry['balance_after'],
                target=row['target_snapshot'], actor=row['actor_snapshot'],
                source='PLATFORM_GIFT', category='gift', validity='PERMANENT',
                reason=row['input']['reason'], evidence_ref=row['input']['evidence_ref'])


def gift(actor, *, request_id, username, amount, reason, evidence_ref, preview_token=None):
    try:
        request_id = str(UUID(str(request_id)))
    except (ValueError, TypeError, AttributeError):
        az.fail('invalid_credit_gift', 400)
    data = _input(username, amount, reason, evidence_ref)
    with az.policy_transaction() as conn:
        _authorize(conn, actor)
        # Serialize retries globally, including retries with another recipient.
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('admin-credit-gift:' + request_id,))
        existing = conn.execute('SELECT * FROM admin_credit_gifts WHERE request_id=%s', (request_id,)).fetchone()
        if existing:
            if existing['actor_id'] != actor.member_id or existing['input'] != data:
                az.fail('credit_gift_request_conflict', 409)
            if preview_token is not None and preview_token != existing['preview_token']:
                az.fail('credit_gift_preview_changed', 409)
            return _receipt(conn, existing)
        target = conn.execute('''SELECT id,username,display_name,auth_version FROM members
                                  WHERE lower(username)=%s AND status='active' ''', (data['username'],)).fetchone()
        from app.storage.deletion_ledger import member_blocked
        if not target or member_blocked(target['id']):
            az.fail('credit_gift_target_unavailable', 409)
        token = hashlib.sha256(json.dumps([actor.member_id, request_id, data, target],
                                         sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        preview = dict(applied=False, request_id=request_id, target=target, amount=amount,
                       source='PLATFORM_GIFT', category='gift', validity='PERMANENT',
                       reason=data['reason'], evidence_ref=data['evidence_ref'], preview_token=token)
        if preview_token is None:
            return preview
        if preview_token != token:
            az.fail('credit_gift_preview_changed', 409)
        administrator = az.active_member(conn, actor)
        snapshot = {key: administrator[key] for key in ('id', 'username', 'display_name')}
        try:
            grant_id = record_grant(conn, target['id'], source='PLATFORM_GIFT', amount=int(amount),
                                    reference='admin-gift:' + request_id, validity='PERMANENT', note='管理员赠送积分')
        except ValueError as error:
            if str(error) in ('credit_balance_overflow', 'credit_member_unavailable'):
                az.fail(str(error), 409)
            raise
        row = conn.execute('''INSERT INTO admin_credit_gifts
            (request_id,actor_id,member_id,grant_id,input,actor_snapshot,target_snapshot,preview_token)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
            (request_id, actor.member_id, target['id'], grant_id, Jsonb(data), Jsonb(snapshot), Jsonb(target), token)).fetchone()
        receipt = _receipt(conn, row)
        az.audit(conn, actor, 'credits.gift', target['id'], details={
            **receipt, 'evidence_type': 'ADMIN_ATTESTATION'})
        return receipt
