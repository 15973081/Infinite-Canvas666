"""Read-only batch validation and estimates from current server pricing."""
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from app.models import OnlineImageRequest, CanvasVideoRequest, CanvasLLMTaskRequest, CanvasAudioTaskRequest, CanvasModelTaskRequest


class BatchPreviewItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node_id: str = Field(min_length=1, max_length=96)
    kind: Literal['image', 'video', 'llm', 'audio', 'model']
    input_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    request: dict[str, Any]


class CanvasBatchPreview(BaseModel):
    model_config = ConfigDict(extra='forbid')
    frame_id: str = Field(min_length=1, max_length=96)
    base_revision: int = Field(ge=1)
    items: list[BatchPreviewItem] = Field(min_length=1, max_length=20000)


def estimate(kind, request, provider):
    from app.services.canvas_ledger import historical_price, MAX_AMOUNT
    from app.services.model_commercial import amounts
    price = historical_price({'kind': 'chat' if kind == 'llm' else kind, 'providerId': provider['id'], 'model': request['model']},
                             int(time.time() * 1000), [provider], {**request, 'has_video_input': bool(request.get('videos'))})
    if not price:
        return {'status': 'unknown'}
    mode = price.get('billing_type')
    if mode == 'disabled':
        return {'status': 'estimated', 'currency': price.get('currency') or 'CNY', 'amount_micros': 0, 'base_amount_micros': 0}
    quantity = request.get('n', 1) if kind == 'image' else 1
    if mode == 'per_second':
        quantity = request.get('duration')
    elif mode == 'per_10k_characters' and kind == 'audio':
        quantity = Decimal(len(request.get('prompt', ''))) / 10000
    elif mode not in {'per_call', 'per_image'}:
        return {'status': 'unknown'}
    try:
        unit, quantity = Decimal(str(price['unit_price'])), Decimal(str(quantity))
        if not unit.is_finite() or unit < 0 or not quantity.is_finite() or quantity <= 0:
            return {'status': 'unknown'}
        value = amounts((unit * 1000000).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * quantity, price)
        if not 0 <= value['amount_micros'] <= MAX_AMOUNT:
            return {'status': 'unknown'}
    except (InvalidOperation, ValueError, TypeError, KeyError):
        return {'status': 'unknown'}
    return {'status': 'estimated', 'currency': price.get('currency') or 'CNY',
            'amount_micros': value['amount_micros'], 'base_amount_micros': value['base_amount_micros']}


def preview(canvas_id, payload):
    from app.services.canvas import load_canvas
    from app.providers.registry import get_api_provider_exact
    from app.services.model_commercial import enforce
    from app.storage.task_canvas_bindings import graph_fingerprint
    from app.services.canvas_ledger import MAX_AMOUNT
    canvas = load_canvas(canvas_id)
    if canvas.get('revision') != payload.base_revision:
        raise HTTPException(409, '画布已变化，请重新预览批量执行')
    by_id = {node['id']: node for node in canvas.get('nodes', [])}
    frame = by_id.get(payload.frame_id)
    if not frame or frame.get('type') != 'smart-frame':
        raise HTTPException(409, '分组已变化，请重新预览')
    ids = [item.node_id for item in payload.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, '批量节点不可重复')
    models = {'image': OnlineImageRequest, 'video': CanvasVideoRequest, 'llm': CanvasLLMTaskRequest,
              'audio': CanvasAudioTaskRequest, 'model': CanvasModelTaskRequest}
    from app.storage.database import connection
    from app.storage.workspace import current_workspace
    with connection() as conn:
        rows = conn.execute("SELECT request->'_canvas_binding'->>'target_node_id' AS node_id FROM tasks WHERE workspace_id=%s AND canvas_id=%s AND status=ANY(%s)",
                            (current_workspace(), canvas_id, ['queued', 'running', 'submitting', 'polling', 'finalizing', 'needs_review'])).fetchall()
    busy_ids = {row['node_id'] for row in rows if row['node_id']}
    prepared, skipped, totals, unknown, providers = [], [], {}, 0, {}
    for item in payload.items:
        node = by_id.get(item.node_id)
        if not node or node.get('frameId') != frame['id'] or graph_fingerprint(canvas, item.node_id, item.node_id) != item.input_sha256:
            raise HTTPException(409, '节点、分组或生成输入已变化，请重新预览')
        if item.node_id in busy_ids:
            skipped.append({'nodeId': item.node_id, 'reason': 'busy'})
            continue
        try:
            request = models[item.kind](**{**item.request, 'canvas_id': canvas_id,
                'client_task_id': 'canvas_' + ('img' if item.kind == 'image' else 'vid' if item.kind == 'video' else item.kind) + '_preview00000000',
                'canvas_target': {'source_node_id': item.node_id, 'target_node_id': item.node_id, 'base_revision': payload.base_revision, 'input_sha256': item.input_sha256}})
            if request.provider_id not in providers:
                providers[request.provider_id] = get_api_provider_exact(request.provider_id)
            provider = providers[request.provider_id]
            values = request.model_dump(mode='json')
            enforce(provider, 'chat' if item.kind == 'llm' else item.kind, values)
            if item.kind == 'video':
                from app.routers.canvas import _validate_video_output_format
                _validate_video_output_format(request, provider)
            if item.kind == 'audio':
                from app.services.canvas_audio_tasks import validate_provider
                validate_provider(provider, request)
            elif item.kind == 'model':
                from app.services.canvas_model_tasks import validate_provider, image_data
                from app.storage import media
                validate_provider(provider, request)
                with media.operation_scope():
                    image_data(request)
            cost = estimate(item.kind, values, provider)
        except (ValidationError, HTTPException) as error:
            message = '生成参数无效' if isinstance(error, ValidationError) else error.detail
            skipped.append({'nodeId': item.node_id, 'reason': 'invalid', 'message': message})
            continue
        prepared.append({'nodeId': item.node_id, 'kind': item.kind, 'cost': cost})
        if cost['status'] == 'unknown':
            unknown += 1
        else:
            currency = cost['currency']
            total = totals.setdefault(currency, {'amount_micros': 0, 'base_amount_micros': 0})
            for key in total:
                total[key] += cost[key]
    totals = {currency: {key: str(value) if value > MAX_AMOUNT else value for key, value in cost.items()} for currency, cost in totals.items()}
    return {'prepared': prepared, 'skipped': skipped, 'costs': totals, 'unknownCount': unknown}
