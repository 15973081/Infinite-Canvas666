"""MediaKit REST transport, matching volcengine/mediakit-cli's cloud contract.

Upload -> one paid tool POST -> poll original ID -> durable result publication.
Credentials stay in the existing encrypted provider configuration.
"""
import asyncio
import ipaddress
import math
import re
import socket
import time
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException
from app.models import CanvasMediaKitTaskRequest
from app.providers.registry import get_api_provider_exact, provider_env_key_value, httpx_provider_kwargs
from app.services.canvas_tasks import save_canvas_task, get_canvas_task
from app.storage import tasks, media, finalization


def task_kind(payload):
    return 'llm' if payload.model == 'video-understand-router' else 'video'


def validate_provider(provider, payload, recovery=False):
    if provider.get('protocol') != 'mediakit':
        raise HTTPException(400, '请选择火山 MediaKit 供应商')
    if not recovery:
        from app.services.model_commercial import enforce
        enforce(provider, 'chat' if task_kind(payload) == 'llm' else 'video', payload.model_dump(mode='json'))
    if not provider_env_key_value(provider['id']):
        raise HTTPException(400, '请先配置 MediaKit API Key')


def source_asset(payload):
    asset = media.get_asset(payload.videos[0])
    if not asset or asset['kind'] != 'video':
        raise HTTPException(400, '请先将视频保存到当前空间的素材库')
    return asset


def create(payload):
    from app.storage.settings import postgres_enabled, member_auth_enabled
    from app.services.canvas import load_canvas
    from app.services.canvas_ledger import task_billing_fields
    if not postgres_enabled() or not member_auth_enabled():
        raise HTTPException(409, {'code': 'member_durable_tasks_required'})
    load_canvas(payload.canvas_id)
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload)
    source_asset(payload)
    kind = task_kind(payload)
    task = {'id': payload.client_task_id, 'type': kind, 'mediakit': True, 'status': 'queued',
            'provider_id': provider['id'], 'provider_name': provider.get('name') or provider['id'],
            'model': payload.model, 'created_at': time.time(), 'updated_at': time.time(), 'result': None,
            **task_billing_fields(payload, 'chat' if kind == 'llm' else 'video')}
    # Understanding uses prompt, rather than the ordinary chat message field.
    task['billing_request']['prompt'] = payload.prompt
    stored = save_canvas_task(task, payload.model_dump(mode='json'))
    return {'task_id': stored['id'], 'status': stored['status'], 'canvas_binding': stored['canvas_binding']}


def get(task_id):
    task = get_canvas_task(task_id)
    if not task or not task.get('mediakit'):
        raise HTTPException(404, 'MediaKit 任务不存在')
    return task


def headers(provider):
    return {'Authorization': 'Bearer ' + provider_env_key_value(provider['id']),
            'Accept': 'application/json', 'Content-Type': 'application/json',
            'X-Amk-Task-Source': 'infinite-canvas'}


def response_value(response):
    if response.status_code >= 400:
        raise HTTPException(502, 'MediaKit 请求失败（HTTP %s），请核对配置和原任务' % response.status_code)
    try:
        value = response.json()
    except ValueError:
        raise HTTPException(502, 'MediaKit 返回无效 JSON') from None
    if not isinstance(value, dict):
        raise HTTPException(502, 'MediaKit 返回无效结果')
    return value


def public_upload_url(value):
    """The upload endpoint is supplier-returned; never forward our API key to it."""
    parts = urlsplit(value)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.fragment:
        raise HTTPException(502, 'MediaKit 上传地址无效')
    try:
        addresses = socket.getaddrinfo(parts.hostname, parts.port or 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError()
    except (ValueError, OSError):
        raise HTTPException(502, 'MediaKit 上传地址不可用') from None
    return value


async def upload(client, provider, payload):
    source_asset(payload)
    path = await asyncio.to_thread(media.materialize, payload.videos[0])
    if not path or not Path(path).is_file():
        raise HTTPException(400, '视频素材不可读取')
    if Path(path).stat().st_size > 10 * 1024 ** 3:
        raise HTTPException(413, '视频超过 10 GB，请先缩小文件')
    endpoint = provider['base_url'].rstrip('/')
    value = response_value(await client.post(endpoint + '/api/v1/tools-sync/request-media-upload-url',
                                             headers=headers(provider), json={'tool_name': payload.model}))
    target = value.get('result')
    if value.get('success') is False or not isinstance(target, dict):
        raise HTTPException(502, 'MediaKit 未返回上传凭证')
    file_id = target.get('file_id')
    if not isinstance(file_id, str) or not file_id.strip() or len(file_id) > 4096:
        raise HTTPException(502, 'MediaKit 未返回媒体标识')
    url = await asyncio.to_thread(public_upload_url, str(target.get('upload_url') or ''))
    method = str(target.get('method') or 'PUT').upper()
    if method != 'PUT':
        raise HTTPException(502, 'MediaKit 返回了不支持的上传方式')
    upload_headers = {}
    for item in target.get('upload_headers') or []:
        if isinstance(item, dict):
            key = item.get('key') or item.get('name') or item.get('header')
            value = item.get('value', item.get('val', ''))
        elif isinstance(item, str) and ':' in item:
            key, value = item.split(':', 1)
        else:
            continue
        if not isinstance(key, str) or not isinstance(value, str) or key.lower() in {'authorization', 'cookie', 'host'}:
            raise HTTPException(502, 'MediaKit 上传请求头无效')
        upload_headers[key.strip()] = value.strip()
    upload_headers['Content-Length'] = str(Path(path).stat().st_size)

    async def chunks():
        with open(path, 'rb') as stream:
            while chunk := await asyncio.to_thread(stream.read, 1024 * 1024):
                yield chunk
    response = await client.put(url, headers=upload_headers, content=chunks(), timeout=600, follow_redirects=False)
    if not 200 <= response.status_code < 300:
        raise HTTPException(502, 'MediaKit 视频上传失败，尚未提交处理任务')
    return file_id


def tool_body(payload, file_id):
    if payload.model == 'video-understand-router':
        return {'video_urls': [file_id], 'prompt': payload.prompt, 'level': payload.level}
    body = {'video_url': file_id}
    if payload.model == 'enhance-video':
        body['tool_version'] = payload.tool_version
        if payload.resolution:
            body['resolution'] = payload.resolution
    return body


async def run_task(task_id, request):
    from app.storage.submission import paid_post
    payload = CanvasMediaKitTaskRequest(**{key: value for key, value in request.items() if key != '_canvas_binding'})
    task = tasks.get(task_id)
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload, bool(task.get('upstream_task_id')))
    endpoint = provider['base_url'].rstrip('/')
    async with httpx.AsyncClient(timeout=120, follow_redirects=False, **httpx_provider_kwargs(provider)) as client:
        if not task.get('upstream_task_id'):
            file_id = await upload(client, provider, payload)
            task.update(status='submitting', error='', updated_at=time.time())
            await asyncio.to_thread(save_canvas_task, task)
            value = response_value(await paid_post(client, endpoint + '/api/v1/tools/' + payload.model,
                                                    headers=headers(provider), json=tool_body(payload, file_id)))
            if value.get('success') is False:
                task.update(status='failed', error='MediaKit 未接受处理任务，请核对供应商配置', updated_at=time.time())
                await asyncio.to_thread(save_canvas_task, task)
                return
            job = value.get('task_id')
            if not isinstance(job, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', job):
                raise HTTPException(502, 'MediaKit 未返回任务编号，请核对原请求；不会自动重试')
            task.update(status='polling', upstream_task_id=job, updated_at=time.time())
            await asyncio.to_thread(save_canvas_task, task)
        try:
            response = await client.get(endpoint + '/api/v1/tasks/' + quote(task['upstream_task_id'], safe=''), headers=headers(provider))
        except httpx.RequestError:
            return  # Resume the original job on the next worker claim.
        if response.status_code in {429, 500, 502, 503, 504}:
            return
        value = response_value(response)
    status = value.get('status')
    if status in {'failed', 'canceled', 'cancelled'} or value.get('success') is False:
        task.update(status='failed', error='MediaKit 处理失败，请核对上游任务 ' + task['upstream_task_id'], updated_at=time.time())
        await asyncio.to_thread(save_canvas_task, task)
        return
    if status in {'pending', 'queued', 'running', 'processing', 'submitted'}:
        return
    if status != 'completed':
        raise HTTPException(502, 'MediaKit 返回未知状态，已保留原任务')
    result = value.get('result')
    if not isinstance(result, dict):
        raise HTTPException(502, 'MediaKit 完成结果为空，已保留原任务')
    info = {'model': payload.model, 'mediakit_task_id': task['upstream_task_id']}
    duration = result.get('duration')
    if type(duration) in {int, float} and math.isfinite(duration) and duration > 0:
        info['mediakit_duration'] = duration
    if task_kind(payload) == 'llm':
        contents = result.get('contents')
        if not isinstance(contents, list) or not contents or any(not isinstance(text, str) or not text.strip() for text in contents):
            raise HTTPException(502, 'MediaKit 未返回视频理解内容')
        text = '\n\n'.join(contents)
        if len(text) > 500000:
            raise HTTPException(502, 'MediaKit 理解结果过长，请核对原任务')
        usage = result.get('token_usage')
        info['usage'] = {key: val for key, val in (usage if isinstance(usage, dict) else {}).items()
                         if key in {'input_tokens', 'output_tokens', 'total_tokens'} and type(val) is int and val >= 0}
        published = await finalization.publish_result({**info, 'text': text}, [text], 'text', provider['id'])
    else:
        url = result.get('video_url')
        if not isinstance(url, str) or not url.startswith('https://'):
            raise HTTPException(502, 'MediaKit 未返回可下载的视频结果')
        published = await finalization.publish_result({**info, 'videos': []}, [url], 'videos', provider['id'])
    task = tasks.get(task_id)
    task.update(status='succeeded', result=published, error='', submission_unknown=False, updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
