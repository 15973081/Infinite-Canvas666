"""Explicit, create-only legacy provider import; never exposes or rewrites source keys."""
import hashlib
import json
import os
import re
import uuid
from collections import Counter
from pathlib import Path

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import authorization as az, provider_control as control

MAX_BYTES = 2 * 1024 * 1024
SOURCES = {'local_file', 'default_workspace'}


def read_file(variable, *, optional=False):
    path = os.getenv(variable, '')
    if not path:
        if optional:
            return '', b''
        az.fail('provider_import_source_unconfigured', 503)
    try:
        with Path(path).open('rb') as stream:
            data = stream.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            az.fail('provider_import_source_too_large', 400)
        return str(Path(path).resolve()), data
    except OSError:
        az.fail('provider_import_source_unavailable', 503)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON field')
        result[key] = value
    return result


def source_snapshot(conn, source):
    if source not in SOURCES:
        az.fail('invalid_provider_import', 400)
    if source == 'local_file':
        config_path, data = read_file('LEGACY_PROVIDER_CONFIG_FILE')
        try:
            raw = json.loads(data.decode('utf-8-sig'), object_pairs_hook=unique_object,
                             parse_constant=lambda value: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeError, RecursionError):
            az.fail('provider_import_source_invalid', 400)
    else:
        # Explicit migration source, never the caller's currently selected space.
        row = conn.execute("""SELECT value FROM workspace_documents WHERE workspace_id='default'
            AND kind='api_providers' AND id='default' FOR SHARE""").fetchone()
        raw = row['value'] if row else []
        config_path = 'default_workspace'
        data = json.dumps(raw, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
        if len(data) > MAX_BYTES:
            az.fail('provider_import_source_too_large', 400)
    if not isinstance(raw, list) or len(raw) > 100:
        az.fail('provider_import_source_invalid', 400)
    env_path, env_data = read_file('LEGACY_PROVIDER_ENV_FILE', optional=True)
    env = {}
    try:
        for line in env_data.decode('utf-8-sig').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                # Match the old API .env reader's first-value and quote rules.
                env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except UnicodeError:
        az.fail('provider_import_source_invalid', 400)
    from app.providers.registry import provider_key_env, normalize_model_prices
    counts = Counter(item.get('id') for item in raw if isinstance(item, dict) and isinstance(item.get('id'), str))
    existing = {row['id'] for row in conn.execute('SELECT id FROM managed_providers')}
    items = []
    for index, item in enumerate(raw):
        entry = {'index': index, 'id': None, 'status': 'invalid', 'configured_secrets': []}
        items.append(entry)
        if not isinstance(item, dict):
            continue
        pid = item.get('id')
        if not isinstance(pid, str) or not re.fullmatch(r'[a-z0-9_-]{2,40}', pid):
            continue
        entry['id'] = pid
        if control.retired(pid):
            entry['status'] = 'retired'
            continue
        if counts[pid] > 1:
            entry['status'] = 'duplicate'
            continue
        if set(item) - (control.CONFIG_FIELDS | control.SECRET_FIELDS | {'id', 'primary'}):
            continue
        try:
            config = control.normalized(pid, {k: v for k, v in item.items() if k in control.CONFIG_FIELDS})
            prices = normalize_model_prices(item.get('model_prices', []))
            if len(prices) != len(item.get('model_prices', [])) or any(p.get('currency', 'CNY') != 'CNY' for p in item.get('model_prices', [])):
                continue
            config['model_prices'] = prices
        except (HTTPException, ValueError, TypeError, OverflowError):
            continue
        secret_names = {'api_key': provider_key_env(pid)}
        if pid == 'volcengine':
            secret_names.update(volcengine_access_key_id='VOLCENGINE_ACCESS_KEY_ID',
                                volcengine_secret_access_key='VOLCENGINE_SECRET_ACCESS_KEY')
        values = {}
        invalid = False
        for field in control.SECRET_FIELDS:
            inline, external = item.get(field, ''), env.get(secret_names.get(field), '')
            if not isinstance(inline, str) or len(inline) > 8192 or len(external) > 8192:
                invalid = True
                break
            inline, external = inline.strip(), external.strip()
            if inline and external and inline != external:
                invalid = True
                break
            if inline or external:
                values[field] = inline or external
        if invalid:
            entry['status'] = 'credential_conflict'
            continue
        entry.update(status='existing' if pid in existing else 'available', config=config,
                     configured_secrets=sorted(values), secrets=values,
                     was_primary=bool(item.get('primary')), normalized=config != {k: v for k, v in item.items() if k in control.CONFIG_FIELDS | {'id'}})
    # Digest is stored only in PostgreSQL. Neither raw bytes nor secrets are persisted in a preview.
    digest = hashlib.sha256(json.dumps([config_path, hashlib.sha256(data).hexdigest(),
        env_path, hashlib.sha256(env_data).hexdigest()], separators=(',', ':')).encode()).hexdigest()
    return items, digest


def public_items(items):
    return [{k: v for k, v in item.items() if k != 'secrets'} for item in items]


def preview(actor, source, reason):
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        az.fail('provider_reason_required', 400)
    with az.policy_transaction(change=True) as conn:
        control.require_admin(conn, actor)
        items, digest = source_snapshot(conn, source)
        report = public_items(items)
        preview_id = uuid.uuid4()
        row = conn.execute("""INSERT INTO provider_import_previews
            (id,member_id,session_id,source,source_digest,report,reason) VALUES(%s,%s,%s,%s,%s,%s,%s)
            RETURNING expires_at""", (preview_id, actor.member_id, actor.session_id, source, digest, Jsonb(report), reason.strip())).fetchone()
        az.audit(conn, actor, 'provider.import.preview', str(preview_id), details={
            'source': source, 'counts': dict(Counter(item['status'] for item in items)), 'reason': reason.strip()})
        return {'id': str(preview_id), 'source': source, 'items': report, 'expires_at': row['expires_at']}


def confirm(actor, preview_id, provider_ids, credential_provider_ids):
    if (not isinstance(provider_ids, list) or not 1 <= len(provider_ids) <= 100
            or any(not isinstance(pid, str) for pid in provider_ids)
            or len(set(provider_ids)) != len(provider_ids)
            or not isinstance(credential_provider_ids, list)
            or any(not isinstance(pid, str) for pid in credential_provider_ids)
            or len(set(credential_provider_ids)) != len(credential_provider_ids)
            or set(credential_provider_ids) - set(provider_ids)):
        az.fail('invalid_provider_import', 400)
    selection = {'provider_ids': sorted(provider_ids), 'credential_provider_ids': sorted(credential_provider_ids)}
    with az.policy_transaction(change=True) as conn:
        control.require_admin(conn, actor)
        row = conn.execute("""SELECT *, expires_at>clock_timestamp() AS fresh FROM provider_import_previews
            WHERE id=%s AND member_id=%s AND session_id=%s FOR UPDATE""",
            (preview_id, actor.member_id, actor.session_id)).fetchone()
        if not row:
            az.fail('provider_import_not_found', 404)
        if row['completed_at']:
            if row['selection'] != selection:
                az.fail('provider_import_selection_changed', 409)
            return row['result']
        if not row['fresh']:
            az.fail('provider_import_expired', 409)
        items, digest = source_snapshot(conn, row['source'])
        if digest != row['source_digest']:
            az.fail('provider_import_source_changed', 409)
        eligible = {item['id']: item for item in items if item['status'] == 'available'}
        previous = {item['id'] for item in row['report'] if item['status'] == 'available'}
        if any(pid not in eligible or pid not in previous for pid in provider_ids):
            az.fail('provider_import_target_changed', 409)
        imported = []
        for pid in sorted(provider_ids):
            item = eligible[pid]
            config = {k: v for k, v in item['config'].items() if k != 'id'}
            saved = control.save(actor, pid, config, 0,
                secrets=item['secrets'] if pid in credential_provider_ids else {},
                reason=row['reason'], preserve_price_history=True)
            imported.append({'id': pid, 'version': saved['version'],
                             'configured_secrets': saved['configured_secrets']})
        result = {'id': str(preview_id), 'source': row['source'], 'imported': imported,
                  'space_assignments_changed': False}
        conn.execute("""UPDATE provider_import_previews SET completed_at=clock_timestamp(),
            selection=%s,result=%s WHERE id=%s""", (Jsonb(selection), Jsonb(result), preview_id))
        az.audit(conn, actor, 'provider.import.complete', str(preview_id), details={
            'source': row['source'], 'imported': imported, 'reason': row['reason']})
        return result
