"""Read-only upstream model discovery for the independent management service."""
import asyncio
import json
import time
import uuid

import httpx

from app.services import authorization as az, provider_control
from app.providers.registry import upstream_models_url, upstream_model_headers, parse_upstream_models

MAX_BYTES = 1024 * 1024
MAX_MODELS = 1500
TOTAL_TIMEOUT = 20


def begin(actor, provider_id, expected_version, reason, mode='models'):
    if mode not in {'models', 'protocols'}:
        az.fail('invalid_provider_probe', 400)
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        az.fail('provider_reason_required', 400)
    with az.policy_transaction() as conn:
        provider_control.require_admin(conn, actor)
        row = conn.execute('SELECT * FROM managed_providers WHERE id=%s', (provider_id,)).fetchone()
        if not row:
            az.fail('provider_not_found', 404)
        if row['version'] != expected_version:
            az.fail('provider_version_conflict', 409)
        if not row['config'].get('base_url'):
            az.fail('provider_endpoint_required', 400)
        key = provider_control.decrypt(row).get('api_key', '')
        if not key:
            az.fail('provider_key_required', 400)
        probe_id = uuid.uuid4().hex
        az.audit(conn, actor, 'provider.probe.started', provider_id,
                 details={'probe_id': probe_id, 'version': expected_version, 'reason': reason.strip(), 'mode': mode})
        return {'id': provider_id, 'version': expected_version, 'config': row['config'], 'key': key, 'probe_id': probe_id, 'mode': mode}


def failure(code, status=0):
    return {'ok': False, 'code': code, 'status': status, 'model_count': 0}


def models_payload(raw, protocol, key):
    if not isinstance(raw, dict):
        return failure('upstream_invalid_response')
    items = next((raw[name] for name in ('data', 'models', 'list') if name in raw and isinstance(raw[name], list)), None)
    if items is None:
        return failure('upstream_invalid_response')
    clean, seen = [], set()
    # Never forward an upstream reflection of credentials in a model identifier.
    parts = key.split(None, 1)
    secrets = {key, parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else key}
    filtered = False
    for item in items:
        value = item if isinstance(item, str) else (item.get('id') or item.get('name') or item.get('model')) if isinstance(item, dict) else None
        if not isinstance(value, str):
            filtered = True
            continue
        value = value.strip()
        if not value or len(value) > 180 or any(char.isspace() or ord(char) < 32 for char in value) or any(secret and secret in value for secret in secrets):
            filtered = True
            continue
        if value not in seen:
            seen.add(value)
            clean.append(value)
    truncated = len(clean) > MAX_MODELS or bool(raw.get('nextPageToken') or raw.get('has_more'))
    grouped, ids = parse_upstream_models({'data': clean[:MAX_MODELS]}, protocol)
    return {'ok': True, 'code': 'models_available' if ids else 'models_empty', 'model_count': len(ids),
            'image_models': grouped['image'], 'video_models': grouped['video'], 'chat_models': grouped['chat'],
            'truncated': truncated, 'filtered': filtered}


async def fetch_models(snapshot):
    config, key = snapshot['config'], snapshot['key']
    protocol = config['protocol']
    url = upstream_models_url(config['base_url'], protocol)
    options = {'timeout': httpx.Timeout(10, connect=5), 'follow_redirects': False, 'trust_env': False}
    if config.get('proxy_url'):
        options['proxy'] = config['proxy_url']
    async with httpx.AsyncClient(**options) as client:
        async with client.stream('GET', url, headers=upstream_model_headers(key, protocol)) as response:
            status = response.status_code
            if 300 <= status < 400:
                return failure('upstream_redirect', status)
            if status in (401, 403):
                return failure('upstream_auth_rejected', status)
            if status in (404, 405):
                return failure('upstream_models_unavailable', status)
            if status == 429:
                return failure('upstream_rate_limited', status)
            if not 200 <= status < 300:
                return failure('upstream_error', status)
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > MAX_BYTES:
                    return failure('upstream_response_too_large', status)
                body.extend(chunk)
            try:
                raw = json.loads(body)
            except (ValueError, UnicodeError, RecursionError):
                return failure('upstream_invalid_response', status)
            return {**models_payload(raw, protocol, key), 'status': status}


def finish(actor, snapshot, result, elapsed_ms):
    with az.policy_transaction() as conn:
        provider_control.require_admin(conn, actor)
        row = conn.execute('SELECT version FROM managed_providers WHERE id=%s', (snapshot['id'],)).fetchone()
        if not row or row['version'] != snapshot['version']:
            az.fail('provider_version_conflict', 409)
        az.audit(conn, actor, 'provider.probe.finished', snapshot['id'], details={
            'probe_id': snapshot['probe_id'], 'version': snapshot['version'], 'code': result['code'],
            'status': result['status'], 'model_count': result['model_count'], 'elapsed_ms': elapsed_ms, 'mode': snapshot['mode'],
            'checks': [{key: check[key] for key in ('id', 'status', 'code')} for check in result.get('checks', [])]})
        return {**result, 'provider_id': snapshot['id'], 'version': snapshot['version'], 'elapsed_ms': elapsed_ms}


async def probe(actor, provider_id, expected_version, reason, mode='models'):
    snapshot = await asyncio.to_thread(begin, actor, provider_id, expected_version, reason, mode)
    started = time.monotonic()
    try:
        if mode == 'protocols':
            from app.services.provider_diagnostics import diagnose
            operation = diagnose(snapshot)
        else:
            operation = fetch_models(snapshot)
        result = await asyncio.wait_for(operation, timeout=TOTAL_TIMEOUT)
    except (asyncio.TimeoutError, httpx.TimeoutException):
        result = failure('upstream_timeout')
    except (httpx.HTTPError, ValueError):
        result = failure('upstream_connection_failed')
    finally:
        snapshot.pop('key', None)
    return await asyncio.to_thread(finish, actor, snapshot, result, round((time.monotonic() - started) * 1000))
