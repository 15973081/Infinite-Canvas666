"""Bounded, read-only protocol hints. A diagnostic is not a generation test."""
import asyncio
import json
import uuid

import httpx

from app.services import provider_probes as probes
from app.providers.registry import upstream_model_headers


def root_url(base_url):
    base = base_url.rstrip('/')
    for suffix in ('/api/v3', '/v1beta', '/v1'):
        if base.endswith(suffix):
            return base[:-len(suffix)]
    return base


def response_code(status):
    if 300 <= status < 400:
        return 'upstream_redirect'
    if status in (401, 403):
        return 'upstream_auth_rejected'
    if status == 429:
        return 'upstream_rate_limited'
    if status >= 500:
        return 'upstream_error'
    return None


def task_result(status, raw, protocol):
    result = {'status': status, 'code': response_code(status) or 'task_endpoint_inconclusive', 'compatible': False}
    if response_code(status):
        return result
    if 200 <= status < 300:
        return {**result, 'code': 'unexpected_task_response'}
    if not isinstance(raw, dict):
        return {**result, 'code': 'upstream_invalid_response'}
    error = raw.get('error')
    if not isinstance(error, dict):
        return result
    message = str(error.get('message') or '').strip().lower().rstrip('。.')
    # APIMart documents this validation shape. It is a hint, not proof of billing authorization.
    if protocol == 'apimart' and status == 400 and error.get('code') == 400 and error.get('type') == 'invalid_request_error' and message in {'invalid task id', '无效的任务id'}:
        return {**result, 'code': 'task_id_validation', 'compatible': True}
    if status in (400, 404) and error.get('code') and error.get('message'):
        return {**result, 'code': 'task_error_response'}
    return result


async def check_task(snapshot, protocol, base):
    suffix = '/api/v3/contents/generations/tasks/' if protocol == 'volcengine' else '/v1/tasks/'
    url = base + suffix + 'healthcheck_probe_do_not_submit_' + uuid.uuid4().hex
    options = {'timeout': httpx.Timeout(10, connect=5), 'follow_redirects': False, 'trust_env': False}
    if snapshot['config'].get('proxy_url'):
        options['proxy'] = snapshot['config']['proxy_url']
    async with httpx.AsyncClient(**options) as client:
        async with client.stream('GET', url, headers=upstream_model_headers(snapshot['key'], protocol)) as response:
            status = response.status_code
            early = response_code(status)
            if early:
                return {'status': status, 'code': early, 'compatible': False}
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > probes.MAX_BYTES:
                    return {'status': status, 'code': 'upstream_response_too_large', 'compatible': False}
                body.extend(chunk)
            try:
                raw = json.loads(body)
            except (ValueError, UnicodeError, RecursionError):
                return {'status': status, 'code': 'upstream_invalid_response', 'compatible': False}
            return task_result(status, raw, protocol)


async def check_models(snapshot, protocol, base):
    trial = {**snapshot, 'config': {**snapshot['config'], 'base_url': base, 'protocol': protocol}}
    result = await probes.fetch_models(trial)
    return {key: result[key] for key in ('status', 'code', 'model_count')} | {'compatible': bool(result['ok'])}


async def diagnose(snapshot):
    base = root_url(snapshot['config']['base_url'])
    targets = [('openai_models', 'openai', '/v1/models', check_models),
               ('gemini_models', 'gemini', '/v1beta/models', check_models),
               ('volcengine_models', 'volcengine', '/api/v3/models', check_models),
               ('apimart_tasks', 'apimart', '/v1/tasks/{probe_id}', check_task),
               ('volcengine_tasks', 'volcengine', '/api/v3/contents/generations/tasks/{probe_id}', check_task)]
    async def check(target):
        name, protocol, path, action = target
        try:
            result = await asyncio.wait_for(action(snapshot, protocol, base), timeout=max(.001, probes.TOTAL_TIMEOUT * .9))
        except (asyncio.TimeoutError, httpx.TimeoutException):
            result = {'status': 0, 'code': 'upstream_timeout', 'compatible': False}
        except (httpx.HTTPError, ValueError):
            result = {'status': 0, 'code': 'upstream_connection_failed', 'compatible': False}
        return {'id': name, 'protocol': protocol, 'path': path, **result}
    checks = await asyncio.gather(*(check(target) for target in targets))
    suggestions = []
    for result in checks:
        if snapshot['id'] == 'volcengine' and result['protocol'] != 'volcengine':
            continue
        if result['compatible'] and result['protocol'] not in {item['protocol'] for item in suggestions}:
            suffix = {'openai': '/v1', 'apimart': '/v1', 'gemini': '/v1beta', 'volcengine': '/api/v3'}[result['protocol']]
            suggestions.append({'protocol': result['protocol'], 'base_url': base + suffix, 'evidence': result['id']})
    return {'ok': bool(suggestions), 'status': 0, 'model_count': 0,
            'code': 'protocol_candidates' if suggestions else 'protocol_inconclusive', 'checks': checks, 'suggestions': suggestions}
