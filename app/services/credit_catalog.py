"""Management projection of live supplier models onto immutable credit rule IDs."""
import json

from app.services import chat_credits, image_credits, media_credits
from app.services.provider_control import retired


def build(providers, rules):
    images, media, chats = image_credits.bindings(), media_credits.bindings(), chat_credits.bindings()
    codes = {rule['modelCode'] for rule in rules}
    bindings, unmapped = [], []
    for provider in providers:
        pid = provider['id']
        if retired(pid):
            continue
        config = provider['config']
        for kind in ('image', 'video', 'chat', 'audio', 'model'):
            for model in dict.fromkeys(config.get(kind + '_models', [])):
                policy = config.get('model_policies', {}).get(kind + ':' + model, {})
                enabled = bool(config.get('enabled', True) and policy.get('enabled', True) and policy.get('visible', True))
                row = {'provider_id': pid, 'provider_name': config.get('name') or pid,
                       'model_id': model, 'kind': kind, 'enabled': enabled}
                mapping = None
                if kind == 'image':
                    mapping = images.get(pid, {}).get(model)
                elif kind in {'video', 'chat'}:
                    if (kind == 'chat') == (model == 'video-understand-router'):
                        mapping = media.get(pid, {}).get(model)
                    if kind == 'chat' and not mapping and pid != 'mediakit' and config.get('protocol') != 'mediakit' and model != 'video-understand-router':
                        scoped = chats['providers'].get(pid, {})
                        mapping = scoped[model] if model in scoped else chats['models'].get(model)
                if not mapping:
                    if enabled:
                        unmapped.append(row)
                    continue
                variants = mapping if isinstance(mapping, dict) else {'default': mapping}
                for variant, code in variants.items():
                    conditions = {'draft': variant == 'draft'} if isinstance(mapping, dict) else {}
                    bindings.append({**row, 'id': json.dumps([pid, kind, model, variant], separators=(',', ':')),
                        'model_code': code, 'conditions': conditions,
                        'variant_label': 'Draft · draft=true' if variant == 'draft' else
                            '常规 / 样片升级 · draft=false' if conditions else '',
                        'rule_available': code in codes})
    bindings.sort(key=lambda row: (row['provider_id'], row['kind'], row['model_id'], row['conditions'].get('draft', False)))
    active = [row for row in bindings if row['enabled'] and row['rule_available']]
    linked = {row['model_code'] for row in bindings}
    return {'bindings': bindings, 'unmapped_models': unmapped,
            'summary': {'enabled_models': len({(r['provider_id'], r['model_id']) for r in active}),
                        'enabled_bindings': len(active), 'enabled_rules': len({r['model_code'] for r in active}),
                        'unbound_rules': len(codes - linked)}}


def read(conn, rules):
    return build(conn.execute('SELECT id,config FROM managed_providers ORDER BY id').fetchall(), rules)
