"""Explicit per-call credit quotes for ordinary chat models."""
from copy import deepcopy
import json
from pathlib import Path
import time

from fastapi import HTTPException
from app.services import credit_policy, credit_wallet

MAPPINGS = Path(__file__).resolve().parents[2] / 'config' / 'credit-chat-models.json'


def bindings():
    return json.loads(MAPPINGS.read_text(encoding='utf-8'))


def model_code(provider, model):
    config = bindings()
    scoped = config['providers'].get(provider, {})
    return scoped[model] if model in scoped else config['models'].get(model)


def quote(config, code, messages, *, now=None):
    rule = next((r for r in config['rules'] if r['modelCode'] == code), None)
    if not rule or not rule['enabled'] or rule['nodeType'] != 'GENERATE_TEXT':
        raise HTTPException(400, {'code': 'credit_chat_rule_unavailable', 'model_code': code})
    pricing = rule['pricingConfig']
    if rule['billingType'] != 'TASK_PARAMS' or pricing.get('selectedParams') or pricing.get('isPerSecond') or pricing.get('isInputVideoPerSecond'):
        raise HTTPException(400, {'code': 'credit_chat_rule_not_per_call'})
    counts = {'image': 0, 'video': 0, 'audio': 0}
    for message in messages:
        content = message.get('content')
        for item in content if isinstance(content, list) else []:
            if isinstance(item, dict):
                kind = {'image_url': 'image', 'video_url': 'video', 'input_audio': 'audio'}.get(item.get('type'))
                if kind:
                    counts[kind] += 1
    inputs = {'model_code': code, 'params': {}, 'count': 1,
              **{'input_' + kind + '_count': value for kind, value in counts.items()}}
    at = time.time() if now is None else now
    return {'input': inputs, 'rule': deepcopy(rule), 'quoted_at': at,
            'quote': credit_policy.model_quote({'rules': [rule]}, **inputs, now=at)}


def reserve(conn, context, member, messages):
    code = model_code(context['provider'], context['model'])
    if not code:
        return
    if not member:
        raise HTTPException(401, {'code': 'chat_member_required'})
    policy = credit_policy.read(conn)
    snapshot = quote(policy['config'], code, messages)
    try:
        credit_wallet.freeze_credits(conn, member, source_type='chat_call', source_id=context['id'],
            credits=snapshot['quote']['credits'], quote_version=policy['version'], quote_snapshot=snapshot,
            workspace_id=context['workspace'], model_code=code)
    except credit_wallet.CreditWalletError as error:
        raise HTTPException(402 if error.code == 'insufficient_credits' else 409,
                            {'code': error.code, **error.details}) from error


def finish(conn, call_id, delivered):
    hold = conn.execute("SELECT id,frozen_credits FROM credit_holds WHERE source_type='chat_call' AND source_id=%s", (call_id,)).fetchone()
    if hold:
        if delivered:
            credit_wallet.settle_credits(conn, hold['id'], hold['frozen_credits'], reason='对话回复已保存')
        else:
            credit_wallet.release_credits(conn, hold['id'], reason='对话未完整交付')
