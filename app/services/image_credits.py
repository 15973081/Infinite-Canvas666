"""Explicit image product pricing and task-bound credit settlement."""
from copy import deepcopy
import json
from pathlib import Path
import time

from fastapi import HTTPException

from app.services import credit_policy, credit_wallet
from app.services.model_commercial import image_resolution

MAPPINGS = Path(__file__).resolve().parents[2] / 'config' / 'credit-image-models.json'


def bindings():
    return json.loads(MAPPINGS.read_text(encoding='utf-8'))


def quote_input(request, rule):
    from app.services.media import image_references
    resolution = image_resolution({'size': request.get('size') or 'auto'})
    if not resolution:
        raise HTTPException(400, {'code': 'credit_image_resolution_invalid'})
    params = {'resolution': resolution.upper()}
    if 'quality' in rule['pricingConfig'].get('selectedParams', []):
        quality = str(request.get('quality') or 'auto').lower().strip()
        params['quality'] = 'medium' if quality in ('', 'auto') else quality
    refs = [ref for ref in request.get('reference_images', []) if isinstance(ref, dict) and ref.get('url')]
    return {'model_code': rule['modelCode'], 'params': params,
            'count': max(1, min(8, int(request.get('n') or 1))),
            'prompt': request.get('prompt') or '', 'input_image_count': len(image_references(refs))}


def prepare_quote(config, model_code, request, *, now=None):
    rule = next((r for r in config['rules'] if r['modelCode'] == model_code), None)
    if not rule or not rule['enabled'] or rule['nodeType'] != 'GENERATE_IMAGE':
        raise HTTPException(400, {'code': 'credit_image_rule_unavailable', 'model_code': model_code})
    inputs = quote_input(request, rule)
    at = time.time() if now is None else now
    quote = credit_policy.model_quote({'rules': [rule]}, **inputs, now=at)
    return {'input': inputs, 'rule': deepcopy(rule), 'quoted_at': at, 'quote': quote,
            'provider_id': request['provider_id'], 'model_id': request['model']}


def reserve(conn, row):
    if row['kind'] != 'online-image':
        return
    model_code = bindings().get(row['provider_id'], {}).get(row['model'])
    if not model_code:
        return
    if not row['requested_by']:
        raise HTTPException(401, {'code': 'task_requester_required'})
    policy = credit_policy.read(conn)
    snapshot = prepare_quote(policy['config'], model_code, row['request'])
    try:
        credit_wallet.freeze_credits(conn, row['requested_by'], source_type='canvas_task', source_id=row['id'],
            credits=snapshot['quote']['credits'], quote_version=policy['version'], quote_snapshot=snapshot,
            workspace_id=row['workspace_id'], model_code=model_code)
    except credit_wallet.CreditWalletError as error:
        raise HTTPException(402 if error.code == 'insufficient_credits' else 409,
                            {'code': error.code, **error.details}) from error


def settle(conn, row):
    if row['kind'] != 'online-image' or row['status'] not in {'succeeded', 'failed', 'cancelled'}:
        return
    hold = conn.execute("SELECT * FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s", (row['id'],)).fetchone()
    if not hold:
        return
    snapshot = hold['quote_snapshot']
    count = len((row['result'] or {}).get('images') or []) if row['status'] == 'succeeded' else 0
    if count == 0:
        credit_wallet.release_credits(conn, hold['id'], reason='图片任务未交付图片')
        return
    requested = snapshot['input']['count']
    if count > requested:
        raise HTTPException(409, {'code': 'credit_image_output_count_invalid'})
    actual = hold['frozen_credits'] if count == requested else credit_policy.model_quote(
        {'rules': [snapshot['rule']]}, **{**snapshot['input'], 'count': count}, now=snapshot['quoted_at'])['credits']
    if not 0 < actual <= hold['frozen_credits']:
        raise HTTPException(409, {'code': 'credit_image_settlement_invalid'})
    credit_wallet.settle_credits(conn, hold['id'], actual,
                                reason='图片任务全部交付' if count == requested else '图片任务部分交付')


def require_recoverable(conn, task_id):
    hold = conn.execute("SELECT status FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s", (task_id,)).fetchone()
    if hold and hold['status'] != 'FROZEN':
        raise HTTPException(409, {'code': 'credit_task_finalized',
                                  'message': '该任务积分已完成结算或退回，请新建任务。'})
