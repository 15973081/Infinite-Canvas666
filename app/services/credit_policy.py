"""Versioned credit policy and deterministic quotes, separate from CNY cost ledgers.

Quotes do not confirm payments, grant rewards or debit wallets. The bundled
reference is a dated snapshot; unknown combinations fail closed.
"""
import json
import math
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from pathlib import Path
import time

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az

PERMISSION = 'credits.configure.platform'
DEFAULTS = Path(__file__).resolve().parents[2] / 'config' / 'credit-policy-defaults.json'
LIMIT = 1_000_000_000


def defaults():
    return json.loads(DEFAULTS.read_text(encoding='utf-8'))


def invalid(message):
    raise HTTPException(400, message)


def number(value, label, *, minimum=0, maximum=LIMIT, integer=False):
    if (type(value) not in (int, float) or not math.isfinite(value)
            or not minimum <= value <= maximum or (integer and value != int(value))):
        invalid(f'{label}必须是 {minimum}–{maximum} 范围内的{"整数" if integer else "数值"}。')
    return Decimal(str(value))


def normalize(value):
    if not isinstance(value, dict) or set(value) != {'creditsPerCNY', 'tiers', 'rewards', 'validity', 'rules'}:
        invalid('积分配置字段不完整。')
    number(value['creditsPerCNY'], '兑换比例', minimum=1, maximum=100000, integer=True)
    if value['validity'] != 'PERMANENT':
        invalid('当前钱包仅支持永久积分。')
    tiers = value['tiers']
    if not isinstance(tiers, list) or not 1 <= len(tiers) <= 20:
        invalid('请配置 1–20 个充值档位。')
    seen = set()
    for tier in tiers:
        if not isinstance(tier, dict) or set(tier) != {'minAmount', 'bonusRate'}:
            invalid('充值档位字段无效。')
        amount = number(tier['minAmount'], '充值门槛', minimum=1, maximum=1000000, integer=True)
        number(tier['bonusRate'], '赠送比例', maximum=10)
        if amount in seen:
            invalid('充值门槛不能重复。')
        seen.add(amount)
    reward_keys = {'firstRechargeEnabled', 'firstRechargeMinimum', 'firstRechargeCredits',
                   'referralEnabled', 'inviterCredits', 'inviteeCredits', 'maxReferralCount',
                   'creationEnabled', 'creationMaxCredits', 'creationMinimumPercent'}
    rewards = value['rewards']
    if not isinstance(rewards, dict) or set(rewards) != reward_keys:
        invalid('奖励配置字段无效。')
    for key, val in rewards.items():
        if key.endswith('Enabled'):
            if type(val) is not bool:
                invalid('奖励开关必须是布尔值。')
        else:
            number(val, key, maximum=100 if key == 'creationMinimumPercent' else LIMIT, integer=True)
    rules = value['rules']
    if not isinstance(rules, list) or not 1 <= len(rules) <= 500:
        invalid('请保留 1–500 条模型规则。')
    codes = set()
    for rule in rules:
        if not isinstance(rule, dict):
            invalid('模型规则必须是对象。')
        required = {'modelCode', 'modelName', 'nodeType', 'billingType', 'basePrice', 'pricingConfig',
                    'discountType', 'discountRate', 'returnDiscountedPrice', 'activityStartTime',
                    'activityEndTime', 'enabled'}
        if set(rule) != required:
            invalid('模型规则字段无效。')
        code = rule['modelCode']
        if not isinstance(code, str) or not 1 <= len(code.strip()) <= 120 or code != code.strip() or code in codes:
            invalid('模型编码为空、重复或过长。')
        codes.add(code)
        if not isinstance(rule['modelName'], str) or not 1 <= len(rule['modelName'].strip()) <= 180:
            invalid('模型名称无效。')
        if rule['nodeType'] not in (None, 'GENERATE_IMAGE', 'GENERATE_VIDEO', 'GENERATE_TEXT', 'GENERATE_AUDIO', 'GENERATE_3D'):
            invalid('模型类型无效。')
        if rule['billingType'] not in ('TASK_PARAMS', 'INPUT_TEXT'):
            invalid('不支持的模型计费类型。')
        if type(rule['enabled']) is not bool or type(rule['returnDiscountedPrice']) is not bool:
            invalid('模型开关必须是布尔值。')
        number(rule['basePrice'], '基础积分')
        if rule['discountType'] not in ('NONE', 'ACTIVITY', 'USER'):
            invalid('折扣类型无效。')
        if rule['discountRate'] is not None:
            number(rule['discountRate'], '折扣比例', minimum=0.000001, maximum=1)
        if rule['discountType'] != 'NONE' and rule['discountRate'] is None:
            invalid('请选择折扣比例。')
        for key in ('activityStartTime', 'activityEndTime'):
            if rule[key] is not None:
                number(rule[key], '活动时间戳', maximum=253402300799, integer=True)
        start, end = rule['activityStartTime'], rule['activityEndTime']
        if (start is None) != (end is None) or (start is not None and start >= end):
            invalid('活动时间须同时填写，且结束晚于开始。')
        config = rule['pricingConfig']
        allowed = {'selectedParams', 'combinationPrices', 'combinationPricesWithVideo', 'videoInputSecondPrices',
                   'isPerSecond', 'isInputVideo', 'isInputVideoPerSecond', 'imageExtraPrice',
                   'videoExtraPrice', 'audioExtraPrice', 'minPrice', 'unitChars'}
        if not isinstance(config, dict) or set(config) - allowed:
            invalid('模型参数配置无效。')
        params = config.get('selectedParams', [])
        if (not isinstance(params, list) or len(params) > 12
                or any(not isinstance(p, str) or not 1 <= len(p) <= 80 for p in params)
                or len(params) != len(set(params))):
            invalid('计价参数名称无效。')
        for key, val in config.items():
            if key == 'selectedParams':
                continue
            if key.startswith('is'):
                if type(val) is not bool:
                    invalid('计费开关必须是布尔值。')
            elif key in ('combinationPrices', 'combinationPricesWithVideo', 'videoInputSecondPrices'):
                if not isinstance(val, dict) or len(val) > 2000:
                    invalid('价格矩阵无效。')
                for combination, price in val.items():
                    if not isinstance(combination, str) or len(combination) > 500 or len(combination.split('||')) != len(params):
                        invalid('价格矩阵键必须与计价参数一一对应。')
                    number(price, '矩阵积分')
            else:
                number(val, key, minimum=1 if key == 'unitChars' else 0, integer=key == 'unitChars')
    # Canonical JSON-compatible values; never retain caller-owned references.
    return json.loads(json.dumps(value, allow_nan=False))


def authorize(conn, actor, *, write=False):
    if actor.audience != 'management':
        az.fail('management_entry_required')
    if write:
        az.require(conn, actor, PERMISSION)
    else:
        try:
            az.require(conn, actor, PERMISSION)
        except HTTPException as exc:
            if exc.status_code != 403:
                raise
            az.require(conn, actor, 'audit.platform')


def read(conn):
    row = conn.execute('SELECT config,version FROM credit_policy WHERE id=1').fetchone()
    return dict(row) if row else {'config': defaults(), 'version': 0}


def management(actor, *, config=None, expected_version=None, reason=''):
    with az.policy_transaction(change=config is not None) as conn:
        authorize(conn, actor, write=config is not None)
        current = read(conn)
        if config is not None:
            if not reason.strip() or len(reason.strip()) > 1000:
                invalid('请填写修改原因（最多 1000 字）。')
            if current['version'] != expected_version:
                az.fail('credit_policy_changed', 409)
            clean = normalize(config)
            conn.execute('''INSERT INTO credit_policy(id,config,version) VALUES(1,%s,1)
                ON CONFLICT(id) DO UPDATE SET config=excluded.config,
                version=credit_policy.version+1,updated_at=clock_timestamp()''', (Jsonb(clean),))
            az.audit(conn, actor, 'credits.policy.configure', 'credit-policy',
                     details={'version': current['version'] + 1, 'reason': reason.strip(),
                              'before': current['config'], 'after': clean})
            current = read(conn)
        return {**current, 'reference': 'Pixmax 2026-10-16',
                'mode': 'configuration_only'}


def topup_quote(config, amount, first_recharge=False):
    amount = number(amount, '充值金额', minimum=1, maximum=1000000, integer=True)
    rate = max((t for t in config['tiers'] if amount >= t['minAmount']),
               key=lambda t: t['minAmount'], default={'bonusRate': 0})['bonusRate']
    base = int((amount * Decimal(str(config['creditsPerCNY']))).to_integral_value(rounding=ROUND_FLOOR))
    gift = int((base * Decimal(str(rate))).to_integral_value(rounding=ROUND_FLOOR))
    reward = config['rewards']
    first = (reward['firstRechargeCredits'] if first_recharge and reward['firstRechargeEnabled']
             and amount >= reward['firstRechargeMinimum'] else 0)
    return {'base': base, 'gift': gift, 'firstRecharge': first, 'total': base + gift + first,
            'bonusRate': rate, 'validity': config['validity']}


def model_quote(config, model_code, params, *, count=1, prompt='', input_image_count=0,
                input_video_count=0, input_audio_count=0, input_video_seconds=0, now=None):
    rule = next((r for r in config['rules'] if r['modelCode'] == model_code), None)
    if not rule or not rule['enabled']:
        invalid('模型未配置或已停用。')
    if not isinstance(params, dict) or not isinstance(prompt, str) or len(prompt) > 100000:
        invalid('试算参数无效。')
    count = number(count, '生成数量', minimum=1, maximum=1000, integer=True)
    counts = [number(n, '输入素材数量', maximum=1000, integer=True)
              for n in (input_image_count, input_video_count, input_audio_count)]
    seconds = number(input_video_seconds, '输入视频时长', maximum=86400)
    if seconds > 0 and not input_video_count:
        invalid('填写输入视频时长时，输入视频数量必须大于零。')
    p = rule['pricingConfig']
    extra = sum(n * Decimal(str(p.get(k, 0))) for n, k in zip(
        counts, ('imageExtraPrice', 'videoExtraPrice', 'audioExtraPrice')))
    if rule['billingType'] == 'INPUT_TEXT':
        # Match JS String.length (UTF-16 code units), including emoji.
        chars = len(prompt.encode('utf-16-le')) // 2
        units = math.ceil(Decimal(chars) / Decimal(str(p.get('unitChars', 100))))
        raw = max(Decimal(str(p.get('minPrice', 0))), units * Decimal(str(rule['basePrice']))) * count + extra
    elif not p.get('selectedParams'):
        raw = Decimal(str(rule['basePrice'])) * count + extra
    else:
        def parameter(key):
            if key not in params or not isinstance(params[key], (str, int, float, bool)):
                invalid(f'请填写参数 {key}。')
            value = params[key]
            return str(value).lower() if isinstance(value, bool) else str(value)
        key = '||'.join(parameter(k) for k in p['selectedParams'])
        matrix = p.get('combinationPricesWithVideo' if p.get('isInputVideo') and input_video_count else 'combinationPrices', {})
        if key not in matrix:
            invalid('该参数组合未配置价格，无法报价。')
        unit = Decimal(str(matrix[key]))
        if p.get('isPerSecond'):
            unit *= number(params.get('duration'), '输出时长', minimum=1, maximum=86400)
        input_cost = Decimal(0)
        if p.get('isPerSecond') and p.get('isInputVideoPerSecond') and input_video_count:
            if seconds <= 0 or key not in p.get('videoInputSecondPrices', {}):
                invalid('请填写输入视频时长并配置对应的输入视频秒价。')
            input_cost = Decimal(str(p['videoInputSecondPrices'][key])) * seconds
        raw = unit * count + extra + input_cost
    if raw <= 0:
        invalid('该模型价格配置不足，不能判定为免费。')
    timestamp = time.time() if now is None else now
    active = rule['discountType'] == 'USER' and rule['returnDiscountedPrice']
    if rule['discountType'] == 'ACTIVITY':
        active = rule['activityStartTime'] is None or rule['activityStartTime'] <= timestamp < rule['activityEndTime']
    result = max(Decimal(1), (raw * Decimal(str(rule['discountRate']))).quantize(Decimal(1), rounding=ROUND_HALF_UP)) if active else raw
    return {'modelCode': model_code, 'original': float(raw), 'credits': float(result),
            'discountApplied': bool(active), 'extraCredits': float(extra), 'estimated': True}


def preview(actor, data):
    with az.policy_transaction() as conn:
        authorize(conn, actor)
        config = normalize(data.config) if data.config is not None else read(conn)['config']
    if data.kind == 'topup':
        return topup_quote(config, data.amount, data.first_recharge)
    return model_quote(config, data.model_code, data.params, count=data.count, prompt=data.prompt,
                       input_image_count=data.input_image_count, input_video_count=data.input_video_count,
                       input_audio_count=data.input_audio_count, input_video_seconds=data.input_video_seconds)
