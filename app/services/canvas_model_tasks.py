"""Durable Hunyuan 3D submissions, original-job polling and validated GLB outputs."""
import asyncio
import base64
import json
import math
import time
from pathlib import Path
import httpx
from PIL import Image
from fastapi import HTTPException
from app.models import CanvasModelTaskRequest
from app.providers.registry import get_api_provider_exact, httpx_provider_kwargs
from app.services import provider_control
from app.services.canvas_tasks import save_canvas_task, get_canvas_task
from app.services.hunyuan3d import signed_request
from app.storage import tasks, media, finalization


def credentials(provider_id):
    from app.services import authorization as az
    with az.policy_transaction() as conn:
        values = provider_control.decrypt(provider_control.configured(conn, provider_id))
        return values.get('hunyuan_secret_id'), values.get('hunyuan_secret_key')


def validate_provider(provider, payload, recovery=False):
    from app.services.model_commercial import enforce
    if provider.get('protocol') != 'hunyuan3d':
        raise HTTPException(400, {'code': 'model_protocol_not_supported'})
    if not recovery:
        enforce(provider, 'model', payload.model_dump(mode='json'))
    if not all(credentials(provider['id'])):
        raise HTTPException(400, {'code': 'model_credentials_not_configured'})


def image_data(payload):
    data = []
    total = 0
    for ref in payload.images:
        asset = media.get_asset(ref)
        if not asset or asset['kind'] != 'image':
            raise HTTPException(400, '3D 参考图片请先上传到当前空间')
        path = media.materialize(ref)
        if not path or Path(path).stat().st_size > 6 * 1024 * 1024:
            raise HTTPException(413, '3D 参考图片超过 6 MB')
        try:
            with Image.open(path) as image:
                low, high = (129,4999) if payload.mode == 'multi' else (128,5000)
                if image.format not in {'JPEG','PNG','WEBP'} or not all(low <= n <= high for n in image.size) or payload.mode == 'multi' and image.format not in {'JPEG','PNG'}:
                    raise HTTPException(400, '请使用有效尺寸的参考图片，多图模式使用 PNG 或 JPEG')
                image.verify()
        except (OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(400, '3D 参考图片无法解码，请重新上传') from None
        content = Path(path).read_bytes()
        total += len(content)
        if total > 6 * 1024 * 1024:
            raise HTTPException(413, '多图参考合计超过 6 MB')
        data.append(base64.b64encode(content).decode())
    return data


def upstream_body(payload, images):
    body = {'Model': payload.model, 'GenerateType': payload.generate_type, 'EnablePBR': payload.enable_pbr}
    if payload.generate_type == 'LowPoly':
        body['PolygonType'] = payload.polygon_type
    else:
        body['FaceCount'] = payload.face_count
    if payload.prompt:
        body['Prompt'] = payload.prompt
    if images:
        body['ImageBase64'] = images[0]
        if payload.mode == 'multi' and len(images) > 1:
            body['MultiViewImages'] = [{'ViewType': view, 'ViewImageBase64': image} for view, image in zip(payload.view_types[1:], images[1:])]
    return body


def create(payload):
    from app.storage.settings import postgres_enabled, member_auth_enabled
    from app.services.canvas import load_canvas
    from app.services.canvas_ledger import task_billing_fields
    if not postgres_enabled() or not member_auth_enabled():
        raise HTTPException(409, {'code': 'member_durable_tasks_required'})
    load_canvas(payload.canvas_id)
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload)
    with media.operation_scope():
        image_data(payload)  # Reject invalid inputs before admission and billing.
    task = {'id': payload.client_task_id, 'type': 'model', 'status': 'queued', 'provider_id': provider['id'],
            'provider_name': provider.get('name') or provider['id'], 'model': payload.model, 'created_at': time.time(),
            'updated_at': time.time(), 'result': None, **task_billing_fields(payload, 'model')}
    stored = save_canvas_task(task, payload.model_dump(mode='json'))
    return {'task_id': stored['id'], 'status': stored['status'], 'canvas_binding': stored['canvas_binding']}


def get(task_id):
    task = get_canvas_task(task_id)
    if not task or task.get('type') != 'model':
        raise HTTPException(404, {'code': 'model_task_not_found'})
    return task


def response_value(response):
    response.raise_for_status()
    result = response.json()
    value = result.get('Response') if isinstance(result, dict) else None
    if not isinstance(value, dict) or value.get('Error'):
        raise HTTPException(502, '混元 3D 请求未确认，请核对原任务')
    return value


async def run_task(task_id, request):
    from app.storage.submission import paid_post
    payload = CanvasModelTaskRequest(**{key: value for key, value in request.items() if key != '_canvas_binding'})
    task = tasks.get(task_id)
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload, bool(task.get('upstream_task_id')))
    secret_id, secret_key = credentials(provider['id'])
    async with httpx.AsyncClient(timeout=120, **httpx_provider_kwargs(provider)) as client:
        if not task.get('upstream_task_id'):
            images = await asyncio.to_thread(image_data, payload)
            body = upstream_body(payload, images)
            content, headers = signed_request(provider, 'SubmitHunyuanTo3DProJob', body, secret_id, secret_key, int(time.time()))
            task.update(status='submitting', error='', updated_at=time.time())
            await asyncio.to_thread(save_canvas_task, task)
            value = response_value(await paid_post(client, provider['base_url'], content=content, headers=headers))
            job = value.get('JobId')
            if not isinstance(job, str) or not 1 <= len(job) <= 180:
                raise HTTPException(502, '混元 3D 未返回任务标识，请核对原任务')
            task.update(status='polling', upstream_task_id=job, updated_at=time.time())
            await asyncio.to_thread(save_canvas_task, task)
        content, headers = signed_request(provider, 'QueryHunyuanTo3DProJob', {'JobId': task['upstream_task_id']}, secret_id, secret_key, int(time.time()))
        try:
            response = await client.post(provider['base_url'], content=content, headers=headers)
        except httpx.RequestError:
            return  # Original job remains polling; a failed query is never a new submission.
        if response.status_code in {429,500,502,503,504}:
            return
        value = response_value(response)
    if value.get('Status') in {'WAIT', 'RUN'}:
        return
    if value.get('Status') == 'FAIL':
        task.update(status='failed', error='混元 3D 生成失败，请核对任务 ' + task['upstream_task_id'], updated_at=time.time())
        await asyncio.to_thread(save_canvas_task, task)
        return
    if value.get('Status') != 'DONE':
        raise HTTPException(502, '混元 3D 返回了未知任务状态，原任务已保留')
    files = value.get('ResultFile3Ds')
    output = next((item.get('Url') for item in files if isinstance(item, dict) and str(item.get('Type')).upper() == 'GLB'), None) if isinstance(files, list) else None
    if not isinstance(output, str) or not output.startswith(('https://', 'http://')):
        raise HTTPException(502, '混元 3D 未返回可入库的 GLB，原任务已保留')
    info = {'job_id': task['upstream_task_id'], 'generate_type': payload.generate_type, 'requested_face_count': payload.face_count}
    credits = value.get('ResultCreditConsumed')
    if type(credits) in {int,float} and math.isfinite(credits) and credits >= 0:
        info['credits_consumed'] = credits
    result = await finalization.publish_result({'models': [], 'model_info': info, 'model': payload.model},
        [{'url': output, 'proxy_url': provider.get('proxy_url') or ''}], 'models', provider['id'])
    task = tasks.get(task_id)
    task.update(status='succeeded', result=result, error='', submission_unknown=False, updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
