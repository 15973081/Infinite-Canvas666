"""Platform-managed providers, encrypted write-only credentials and space grants."""
import hashlib
import json
import os
from urllib.parse import urlsplit

from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.storage.workspace import current_workspace

SECRET_FIELDS = {'api_key', 'volcengine_access_key_id', 'volcengine_secret_access_key', 'hunyuan_secret_id', 'hunyuan_secret_key'}
CONFIG_FIELDS = {'media_input_modes', 'name', 'base_url', 'protocol', 'image_request_mode', 'image_generation_endpoint',
                 'image_edit_endpoint', 'proxy_url', 'enabled', 'image_models', 'chat_models', 'video_models', 'audio_models', 'model_models', 'hunyuan_region',
                 'model_prices', 'model_policies', 'model_discounts', 'model_protocols', 'chat_context_limits', 'ms_loras', 'ms_defaults_version',
                 'volcengine_project_name', 'volcengine_region'}


def cipher():
    from cryptography.fernet import Fernet
    try:
        return Fernet(os.environ['PROVIDER_SECRET_KEY'].encode('ascii'))
    except (KeyError, ValueError, UnicodeError):
        az.fail('provider_secret_key_unavailable', 503)


def decrypt(row):
    if not row['secret_ciphertext']:
        return {}
    from cryptography.fernet import InvalidToken
    try:
        return json.loads(cipher().decrypt(row['secret_ciphertext'].encode('ascii')))
    except (InvalidToken, ValueError, UnicodeError):
        az.fail('provider_secret_unavailable', 503)


def require_admin(conn, actor):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, 'provider.configure')


def normalized(provider_id, value, previous=None):
    from app.providers.registry import normalize_provider, merge_model_price_history, REMOVED_PROVIDER_IDS
    from app.config import SUPPORTED_PROVIDER_PROTOCOLS
    if not isinstance(value, dict) or set(value) - CONFIG_FIELDS or provider_id in REMOVED_PROVIDER_IDS:
        az.fail('invalid_provider_config', 400)
    if not isinstance(value.get('protocol', 'openai'), str) or value.get('protocol', 'openai') not in SUPPORTED_PROVIDER_PROTOCOLS:
        az.fail('invalid_provider_config', 400)
    if 'enabled' in value and not isinstance(value['enabled'], bool):
        az.fail('invalid_provider_config', 400)
    if value.get('protocol') == 'hunyuan3d':
        import re
        if not isinstance(value.get('hunyuan_region','ap-guangzhou'), str) or not re.fullmatch('[a-z0-9-]{1,64}', value.get('hunyuan_region') or 'ap-guangzhou'):
            az.fail('invalid_provider_region', 400)
        if urlsplit(value.get('base_url') or '').path not in {'','/'}:
            az.fail('invalid_provider_endpoint', 400)
    for field in ('image_models', 'chat_models', 'video_models', 'audio_models', 'model_models'):
        models = value.get(field, [])
        if not isinstance(models, list) or len(models) > 500 or any(not isinstance(m, str) or len(m) > 180 for m in models):
            az.fail('invalid_provider_models', 400)
    for field in ('base_url', 'proxy_url', 'image_generation_endpoint', 'image_edit_endpoint'):
        url = value.get(field, '')
        if not isinstance(url, str) or len(url) > 2000 or any(char.isspace() for char in url):
            az.fail('invalid_provider_endpoint', 400)
        if not url:
            continue
        try:
            parts = urlsplit(url)
            parts.port
            if parts.username or parts.password or parts.query or parts.fragment:
                raise ValueError()
            if field.endswith('_endpoint') and url.startswith('/') and not parts.netloc:
                continue
            if parts.scheme not in {'https', 'http'} or not parts.hostname:
                raise ValueError()
        except ValueError:
            az.fail('invalid_provider_endpoint', 400)
    for field in ('model_prices', 'ms_loras'):
        if field in value and (not isinstance(value[field], list) or len(value[field]) > 1000 or any(not isinstance(item, dict) for item in value[field])):
            az.fail('invalid_provider_config', 400)
    from app.services.model_commercial import policies, discounts
    try:
        policies(value.get('model_policies') or {})
    except ValueError:
        az.fail('invalid_model_policy', 400)
    try:
        discounts(value.get('model_discounts') or [])
    except ValueError:
        az.fail('invalid_model_discount', 400)
    try:
        result = normalize_provider({'id': provider_id, **value})
        if result['id'] != provider_id:
            az.fail('invalid_provider_config', 400)
        result.pop('primary', None)
        if 'model_prices' in value and len(result['model_prices']) != len(value['model_prices']):
            az.fail('invalid_provider_prices', 400)
        # A chat model has exactly one active mode; reject ambiguous config
        # supplied through advanced JSON/import rather than silently choosing.
        chats = [p['model'] for p in result['model_prices'] if p['kind'] == 'chat' and not p['effective_to']]
        if len(chats) != len(set(chats)):
            az.fail('invalid_provider_prices', 400)
        for field in ('model_policies', 'model_discounts', 'media_input_modes', 'chat_context_limits'):
            if field not in value and previous and field in previous: result[field] = previous[field]
        result['model_prices'] = (list((previous or {}).get('model_prices') or []) if 'model_prices' not in value
                                  else merge_model_price_history((previous or {}).get('model_prices'), value['model_prices']))
        return result
    except (ValueError, TypeError, OverflowError):
        az.fail('invalid_provider_config', 400)


def public(row):
    return {'id': row['id'], 'config': row['config'], 'version': row['version'],
            'configured_secrets': row['secret_fields'], 'updated_at': row['updated_at']}


def retired(provider_id):
    from app.providers.registry import REMOVED_PROVIDER_IDS
    return str(provider_id or '').strip().lower() in REMOVED_PROVIDER_IDS


def catalog(actor):
    with az.policy_transaction() as conn:
        require_admin(conn, actor)
        from app.services.provider_presets import catalog as presets
        return {'providers': [public(row) for row in conn.execute('SELECT * FROM managed_providers ORDER BY id') if not retired(row['id'])],
                'presets': presets()}


def save(actor, provider_id, config, expected_version, *, secrets=None, clear_secrets=None, reason, preserve_price_history=False):
    secrets, clear_secrets = secrets or {}, set(clear_secrets or [])
    if not isinstance(secrets, dict) or set(secrets) - SECRET_FIELDS or clear_secrets - SECRET_FIELDS or set(secrets) & clear_secrets:
        az.fail('invalid_provider_secrets', 400)
    if any(not isinstance(v, str) or not v.strip() or len(v) > 8192 for v in secrets.values()):
        az.fail('invalid_provider_secrets', 400)
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        az.fail('provider_reason_required', 400)
    with az.policy_transaction(change=True) as conn:
        require_admin(conn, actor)
        old = conn.execute('SELECT * FROM managed_providers WHERE id=%s FOR UPDATE', (provider_id,)).fetchone()
        if expected_version != (old['version'] if old else 0):
            az.fail('provider_version_conflict', 409)
        if preserve_price_history and old:
            az.fail('provider_version_conflict', 409)
        initial_prices = config.get('model_prices', []) if isinstance(config, dict) else []
        config = normalized(provider_id, config, old['config'] if old else None)
        if preserve_price_history:
            # Internal create-only migration mode. The ordinary editor merges
            # desired current prices; import must retain every original interval.
            from app.providers.registry import normalize_model_prices
            prices = normalize_model_prices(initial_prices)
            if len(prices) != len(initial_prices) or any(p.get('currency', 'CNY') != 'CNY' for p in initial_prices):
                az.fail('invalid_provider_config', 400)
            config['model_prices'] = prices
        values = decrypt(old) if old else {}
        values.update({k: v.strip() for k, v in secrets.items()})
        for field in clear_secrets:
            values.pop(field, None)
        encrypted = cipher().encrypt(json.dumps(values).encode()).decode('ascii') if values else None
        row = conn.execute('''INSERT INTO managed_providers(id,config,version,secret_ciphertext,secret_fields,updated_by)
            VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET config=excluded.config,version=excluded.version,
            secret_ciphertext=excluded.secret_ciphertext,secret_fields=excluded.secret_fields,
            updated_by=excluded.updated_by,updated_at=clock_timestamp() RETURNING *''',
            (provider_id, Jsonb(config), expected_version + 1, encrypted, sorted(values), actor.member_id)).fetchone()
        commercial_changes = {field: {'before': (old['config'] if old else {}).get(field), 'after': config.get(field)}
                              for field in ('model_prices', 'model_discounts', 'model_policies')
                              if (old['config'] if old else {}).get(field) != config.get(field)}
        az.audit(conn, actor, 'provider.save', provider_id, details={'version': row['version'],
                 'commercial_changes': commercial_changes,
                 'secret_fields_changed': sorted(set(secrets) | clear_secrets), 'reason': reason.strip()})
        return public(row)


def assignments(actor, workspace):
    with az.policy_transaction() as conn:
        require_admin(conn, actor)
        if not conn.execute('SELECT 1 FROM workspaces WHERE id=%s', (workspace,)).fetchone():
            az.fail('workspace_not_found', 404)
        row = conn.execute('SELECT version,primary_provider_id FROM workspace_provider_sets WHERE workspace_id=%s', (workspace,)).fetchone()
        providers = [r['provider_id'] for r in conn.execute('SELECT provider_id FROM workspace_provider_grants WHERE workspace_id=%s ORDER BY provider_id', (workspace,))]
        providers = [pid for pid in providers if not retired(pid)]
        result = {**(row or {'version': 0, 'primary_provider_id': None}), 'provider_ids': providers}
        if retired(result['primary_provider_id']):
            result['primary_provider_id'] = None
        return result


def assign(actor, workspace, provider_ids, primary_provider_id, expected_version, *, reason):
    if any(retired(pid) for pid in provider_ids):
        az.fail('provider_integration_removed', 410)
    if len(provider_ids) > 100 or len(set(provider_ids)) != len(provider_ids) or (primary_provider_id and primary_provider_id not in provider_ids):
        az.fail('invalid_provider_assignment', 400)
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        az.fail('provider_reason_required', 400)
    with az.policy_transaction(change=True) as conn:
        require_admin(conn, actor)
        az.require(conn, actor, 'space.assign')
        if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND status='active'", (workspace,)).fetchone():
            az.fail('workspace_unavailable')
        old = conn.execute('SELECT version FROM workspace_provider_sets WHERE workspace_id=%s FOR UPDATE', (workspace,)).fetchone()
        if expected_version != (old['version'] if old else 0):
            az.fail('provider_version_conflict', 409)
        if len(conn.execute('SELECT id FROM managed_providers WHERE id=ANY(%s)', (provider_ids,)).fetchall()) != len(provider_ids):
            az.fail('provider_not_found', 404)
        conn.execute('''INSERT INTO workspace_provider_sets(workspace_id,version,primary_provider_id) VALUES(%s,%s,%s)
            ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,primary_provider_id=excluded.primary_provider_id''',
            (workspace, expected_version + 1, primary_provider_id))
        conn.execute('DELETE FROM workspace_provider_grants WHERE workspace_id=%s', (workspace,))
        for provider_id in provider_ids:
            conn.execute('INSERT INTO workspace_provider_grants(workspace_id,provider_id) VALUES(%s,%s)', (workspace, provider_id))
        az.audit(conn, actor, 'provider.assign', workspace, workspace,
                 {'version': expected_version + 1, 'provider_ids': sorted(provider_ids), 'primary_provider_id': primary_provider_id, 'reason': reason.strip()})
        return assignments(actor, workspace)


def workspace_providers():
    from app.services.media import avatar_platform_for_provider, provider_supports_avatar

    def project(row, primary=False):
        config = row['config']
        fields = set(row['secret_fields'] or [])
        platform = avatar_platform_for_provider(config)
        supported = provider_supports_avatar(config)
        required = {'volcengine_access_key_id', 'volcengine_secret_access_key'} if platform == 'volcengine' else {'api_key'}
        return {**config, 'primary': primary, 'has_key': {'hunyuan_secret_id','hunyuan_secret_key'} <= fields if config.get('protocol')=='hunyuan3d' else 'api_key' in fields,
                'avatar_registration': {'platform': platform, 'supported': supported,
                                        'credentials_configured': supported and required <= fields}}

    with az.policy_transaction() as conn:
        rows = conn.execute('''SELECT p.config,p.secret_fields,(s.primary_provider_id=p.id) AS primary FROM managed_providers p
            JOIN workspace_provider_grants g ON g.provider_id=p.id JOIN workspace_provider_sets s ON s.workspace_id=g.workspace_id
            WHERE g.workspace_id=%s AND p.config->>'enabled'='true' ORDER BY p.id''', (current_workspace(),))
        result = [project(row, bool(row['primary'])) for row in rows if not retired(row['config'].get('id'))]
        recovery = recovery_provider(conn)
        if recovery:
            result = [p for p in result if p['id'] != recovery['id']]
            result.append({**project(recovery), 'enabled': True})
        return result


def binding(row):
    # A label/price change does not change the upstream account identity.
    endpoints = {k: row['config'].get(k) for k in ('base_url', 'proxy_url', 'protocol', 'image_generation_endpoint', 'image_edit_endpoint', 'volcengine_project_name', 'volcengine_region')}
    if row['config'].get('protocol') == 'hunyuan3d':
        endpoints['hunyuan_region'] = row['config'].get('hunyuan_region')
    digest = hashlib.sha256(json.dumps({'endpoints': endpoints, 'secrets': decrypt(row)}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return 'managed:' + row['id'] + ':' + digest


def recovery_provider(conn):
    from app.storage.tasks import lease_context
    lease = lease_context.get()
    if not lease:
        return None
    task = conn.execute('''SELECT id,workspace_id,kind,request,status,upstream_task_id,provider_id,provider_account_ref FROM tasks WHERE workspace_id=%s
        AND id=%s AND lease_token=%s AND lease_until>clock_timestamp()
        AND status IN ('polling','finalizing')''', (current_workspace(), *lease)).fetchone()
    if not task:
        return None
    if not task['upstream_task_id']:
        from app.storage.finalization import has_source
        from app.storage.image_receipts import recoverable
        if not (task['status'] == 'finalizing' and has_source(task['id'])) and not recoverable(task):
            return None
    if retired(task['provider_id']):
        az.fail('provider_integration_removed', 410)
    row = conn.execute('SELECT * FROM managed_providers WHERE id=%s', (task['provider_id'],)).fetchone()
    if not row or task['provider_account_ref'] != binding(row):
        az.fail('provider_account_changed', 409)
    return row


def configured(conn, provider_id):
    if retired(provider_id):
        az.fail('provider_integration_removed', 410)
    recovery = recovery_provider(conn)
    if recovery and recovery['id'] == provider_id:
        return recovery
    row = conn.execute('''SELECT p.* FROM managed_providers p JOIN workspace_provider_grants g ON g.provider_id=p.id
        WHERE g.workspace_id=%s AND p.id=%s AND p.config->>'enabled'='true' ''', (current_workspace(), provider_id)).fetchone()
    if not row:
        az.fail('provider_not_assigned', 403)
    return row


def credential(provider_id, field='api_key'):
    with az.policy_transaction() as conn:
        return decrypt(configured(conn, provider_id)).get(field, '')


def account_ref(provider_id):
    with az.policy_transaction() as conn:
        return binding(configured(conn, provider_id))
