"""Server-owned chat pricing, usage and durable call accounting.

Only upstream usage is trusted. Missing usage is never estimated or silently
switched to per-call billing. Configured prices are platform accounting prices.
"""
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import time
import uuid

MAX_AMOUNT = 9007199254740991


def normalize_price(raw):
    mode = raw.get('billing_type')
    if mode not in {'disabled', 'per_call', 'per_million_tokens'}:
        raise ValueError('invalid chat billing mode')
    if any(raw.get(k) not in (None, '') for k in ('resolution', 'has_video_input', 'service_tier')):
        raise ValueError('invalid chat price scope')
    result = {'billing_type': mode}
    fields = ['unit_price'] if mode == 'per_call' else ['input_price', 'output_price'] if mode == 'per_million_tokens' else []
    if mode == 'per_million_tokens' and raw.get('cached_input_price') not in (None, ''):
        fields.append('cached_input_price')
    if mode == 'per_million_tokens':
        if not isinstance(raw.get('stream_usage', True), bool):
            raise ValueError('invalid stream usage switch')
        result['stream_usage'] = raw.get('stream_usage', True)
    for key in fields:
        value = raw.get(key)
        if value is None or isinstance(value, bool) or not str(value).strip():
            raise ValueError('missing chat price')
        try:
            number = Decimal(str(value))
        except InvalidOperation:
            raise ValueError('invalid chat price')
        if not number.is_finite() or number < 0 or number > Decimal(MAX_AMOUNT) / Decimal(1000000) or number.as_tuple().exponent < -6:
            raise ValueError('invalid chat price')
        result[key] = format(number.normalize(), 'f')
    return result


def usage_counts(raw):
    if not isinstance(raw, dict):
        return None
    inp = raw.get('prompt_tokens', raw.get('input_tokens'))
    out = raw.get('completion_tokens', raw.get('output_tokens'))
    details = raw.get('prompt_tokens_details', raw.get('input_tokens_details')) or {}
    if not isinstance(details, dict):
        return None
    cached = details.get('cached_tokens', raw.get('cache_read_input_tokens', 0))
    if any(type(v) is not int or not 0 <= v <= MAX_AMOUNT for v in (inp, out, cached)) or cached > inp:
        return None
    return {'input_tokens': inp, 'output_tokens': out, 'cached_input_tokens': cached,
            'total_tokens': inp + out}


def calculate(price, raw_usage, outcome='succeeded'):
    base = {'kind': 'chat', 'currency': 'CNY', 'source': 'actual',
            'price_snapshot': deepcopy(price or {}), 'price_effective_from': (price or {}).get('effective_from', 0)}
    unknown = {**base, 'status': 'unknown', 'reason': 'missing_price'}
    if not price:
        return unknown
    try:
        normalized = normalize_price(price)
    except ValueError:
        return {**unknown, 'reason': 'invalid_price'}
    mode = normalized['billing_type']
    base['billing_type'] = mode
    counts = usage_counts(raw_usage)
    if counts is not None:
        base['usage'] = counts
    if mode == 'disabled':
        return {**base, 'status': 'excluded', 'reason': 'billing_disabled', 'amount_micros': 0}
    if outcome == 'rejected' and (mode == 'per_call' or counts is None):
        return {**base, 'status': 'excluded', 'reason': 'upstream_rejected', 'amount_micros': 0}
    if mode == 'per_call':
        if outcome != 'succeeded':
            return {**base, 'status': 'unknown', 'reason': 'uncertain_call'}
        amount = Decimal(normalized['unit_price']) * 1000000
        base.update(quantity=1, unit_price=normalized['unit_price'])
    else:
        if counts is None:
            return {**base, 'status': 'unknown', 'reason': 'missing_usage'}
        # Cached tokens are a subset of input. Reasoning tokens are already
        # included in provider output totals and must not be added again.
        inp = Decimal(normalized['input_price'])
        cache = Decimal(normalized.get('cached_input_price', normalized['input_price']))
        out = Decimal(normalized['output_price'])
        amount = ((counts['input_tokens'] - counts['cached_input_tokens']) * inp
                  + counts['cached_input_tokens'] * cache + counts['output_tokens'] * out)
        base.update(input_price=str(inp), output_price=str(out), cached_input_price=str(cache))
    micros = int(amount.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if not 0 <= micros <= MAX_AMOUNT:
        return {**base, 'status': 'unknown', 'reason': 'invalid_amount'}
    return {**base, 'status': 'priced', 'amount_micros': micros, 'base_amount_micros': micros,
            'discount_amount_micros': 0, 'discount_rate': '1'}


def begin(provider, model, conversation, user_id):
    from app.services.canvas_ledger import historical_price
    from app.storage.settings import postgres_enabled
    from app.storage.workspace import current_workspace
    at = int(time.time() * 1000)
    info = {'kind': 'chat', 'providerId': provider['id'], 'model': model}
    context = {'id': uuid.uuid4().hex, 'workspace': current_workspace(), 'at': at,
               'price': historical_price(info, at, [provider]), 'provider': provider['id'],
               'model': model, 'conversation': conversation['id'], 'title': conversation['title']}
    if not postgres_enabled():
        return context
    from app.storage.database import connection
    from app.services.member_context import current_access
    from psycopg.types.json import Jsonb
    access = current_access.get()
    member = access.principal.member_id if access else None
    with connection() as conn:
        person = conn.execute('SELECT username,display_name FROM members WHERE id=%s', (member,)).fetchone() or {}
        cost = calculate(context['price'], None, 'uncertain')
        log = {'id': 'chat:' + context['id'], 'createdAt': at, 'billingKind': 'chat',
               'providerId': provider['id'], 'billingModel': model, 'conversation_id': conversation['id'],
               'conversation_title': conversation['title'], 'status': 'pending'}
        conn.execute('''INSERT INTO ledger_entries(id,workspace_id,canvas_id,created_at,log_json,cost_json,
            source,cost_status,amount_micros,currency,kind,estimated,status,updated_at)
            VALUES(%s,%s,'__account_chats__',%s,%s,%s,'chat',%s,0,'CNY','chat',0,'pending',%s)''',
            (context['id'], context['workspace'], at, Jsonb(log), Jsonb(cost), cost['status'], at))
        conn.execute('''INSERT INTO ai_chat_calls(id,workspace_id,member_id,conversation_id,provider_id,model,
            started_at,price_snapshot,entry_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (context['id'], context['workspace'], member, conversation['id'], provider['id'], model,
             at, Jsonb(context['price'] or {}), context['id']))
        conn.execute('''INSERT INTO ledger_owners(entry_id,workspace_id,chat_call_id,member_id,username,display_name,attribution)
            VALUES(%s,%s,%s,%s,%s,%s,'server_chat')''',
            (context['id'], context['workspace'], context['id'], member, person.get('username', ''), person.get('display_name', '')))
    return context


def finish(context, raw_usage=None, outcome='uncertain'):
    from app.storage.settings import postgres_enabled
    if outcome not in {'succeeded', 'rejected', 'uncertain'}:
        raise ValueError('invalid chat outcome')
    if not postgres_enabled():
        from app.services.canvas_ledger import append_logs
        cost = calculate(context['price'], raw_usage, outcome)
        append_logs('__account_chats__', [{'id': 'chat:' + context['id'], 'createdAt': context['at'],
            'billingKind': 'chat', 'providerId': context['provider'], 'billingModel': context['model'],
            'status': 'success' if outcome == 'succeeded' else outcome, 'cost': cost}], 'chat', providers=[])
        return cost
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    from app.services.member_context import current_access
    from psycopg.types.json import Jsonb
    # Finalize only this already admitted server call, even if permissions were
    # revoked while upstream was running. No new supplier call is made here.
    token = current_access.set(None)
    try:
        with workspace_scope(context['workspace']), connection() as conn:
            row = conn.execute('SELECT * FROM ai_chat_calls WHERE workspace_id=%s AND id=%s FOR UPDATE',
                               (context['workspace'], context['id'])).fetchone()
            if not row:
                raise RuntimeError('Chat call record missing')
            if row['status'] != 'pending':
                return conn.execute('SELECT cost_json FROM ledger_entries WHERE id=%s', (row['entry_id'],)).fetchone()['cost_json']
            cost = calculate(row['price_snapshot'], raw_usage, outcome)
            now = int(time.time() * 1000)
            status = 'success' if outcome == 'succeeded' else 'failed' if outcome == 'rejected' else 'uncertain'
            conn.execute('UPDATE ai_chat_calls SET status=%s,raw_usage=%s,completed_at=%s WHERE id=%s',
                         (outcome, Jsonb(raw_usage) if isinstance(raw_usage, dict) else None, now, row['id']))
            conn.execute('''UPDATE ledger_entries SET status=%s,cost_json=%s,cost_status=%s,amount_micros=%s,
                log_json=log_json || %s,updated_at=%s WHERE workspace_id=%s AND id=%s''',
                (status, Jsonb(cost), cost['status'], cost.get('amount_micros', 0),
                 Jsonb({'status': status, 'raw_usage': raw_usage if isinstance(raw_usage, dict) else None}),
                 now, row['workspace_id'], row['entry_id']))
            return cost
    finally:
        current_access.reset(token)
