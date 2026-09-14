"""Durable canvas text generation; one paid admission, recoverable completion."""
import asyncio
import time

from fastapi import HTTPException
from app.models import CanvasLLMRequest, CanvasLLMTaskRequest
from app.services.canvas_tasks import save_canvas_task, get_canvas_task
from app.storage import tasks, finalization
from app.storage.settings import postgres_enabled, member_auth_enabled


def create(payload: CanvasLLMTaskRequest):
    if not postgres_enabled() or not member_auth_enabled():
        raise HTTPException(409, {'code': 'member_durable_tasks_required'})
    from app.providers.registry import get_api_provider_exact
    from app.services.canvas import load_canvas
    from app.services.canvas_ledger import task_billing_fields
    load_canvas(payload.canvas_id)
    provider = get_api_provider_exact(payload.provider_id)
    payload.provider_id = provider['id']
    request = payload.model_dump(mode='json')
    task = {'id': payload.client_task_id, 'type': 'llm', 'status': 'queued',
            'provider_id': payload.provider_id, 'model': payload.model,
            'created_at': time.time(), 'updated_at': time.time(), 'result': None,
            **task_billing_fields(payload, 'chat')}
    stored = save_canvas_task(task, request)
    return {'task_id': stored['id'], 'status': stored['status'], 'canvas_binding': stored['canvas_binding']}


def get(task_id):
    task = get_canvas_task(task_id)
    if not task or task.get('type') != 'llm':
        raise HTTPException(404, {'code': 'llm_task_not_found'})
    return task


async def run_task(task_id, request):
    from app.routers.canvas import execute_canvas_llm
    payload = CanvasLLMTaskRequest(**{k: v for k, v in request.items() if k != '_canvas_binding'})
    task = tasks.get(task_id)
    task.update(status='submitting', error='', updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
    legacy = CanvasLLMRequest(**{k: v for k, v in payload.model_dump().items()
                                if k in {'message', 'system_prompt', 'model', 'messages', 'images', 'videos'}},
                              provider=payload.provider_id)
    result = await execute_canvas_llm(legacy, durable=True)
    # The supplier reply and usage survive a failed task/ledger transaction.
    # A worker restart finishes this checkpoint without another paid call.
    result = await finalization.publish_result(result, [result['text']], 'text', payload.provider_id)
    task = tasks.get(task_id)
    task.update(status='succeeded', result=result, error='', submission_unknown=False, updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
