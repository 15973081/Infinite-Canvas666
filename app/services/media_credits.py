"""Credit quotes and settlement for explicitly bound durable media tasks."""
from copy import deepcopy
import json
from pathlib import Path
import time

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import credit_policy, credit_wallet, video_duration

MAPPINGS = Path(__file__).resolve().parents[2] / 'config' / 'credit-media-models.json'


def bindings():
    return json.loads(MAPPINGS.read_text(encoding='utf-8'))


def model_code(request):
    value = bindings().get(request.get('provider_id'), {}).get(request.get('model'))
    return value.get('draft' if request.get('draft') else 'default') if isinstance(value, dict) else value


def prepare_quote(config, request, *, input_metadata=(), now=None):
    from app.services.media import volcengine_seedance25_task_type, volcengine_video_duration
    code = model_code(request)
    rule = next((r for r in config['rules'] if r['modelCode'] == code), None)
    if not rule or not rule['enabled']:
        raise HTTPException(400, {'code': 'credit_media_rule_unavailable', 'model_code': code})
    videos = [v for v in request.get('videos', []) if v]
    input_seconds = sum(item['seconds'] or 0 for item in input_metadata)
    tool = request.get('provider_id') == 'mediakit'
    understand = tool and request['model'] == 'video-understand-router'
    automatic = False
    if tool:
        duration = 1 if understand else input_seconds
        if not understand and duration <= 0:
            raise HTTPException(400, {'code': 'credit_input_video_duration_required'})
    elif code in {'PIXDANCE_2_5', 'PIXDANCE_2_5_DRAFT'}:
        task_mode = request.get('task_mode') or 'auto'
        task_type = ('edit' if task_mode == 'edit' else 'extend' if task_mode in {'extend_forward','extend_backward'}
                     else volcengine_seedance25_task_type(request.get('prompt') or '', len(videos)))
        automatic = request.get('duration') == -1 or task_type in {'edit', 'extend'}
        duration = 30 if automatic else request.get('duration', 5)
        if not 4 <= duration <= 30:
            raise HTTPException(400, {'code': 'credit_video_duration_invalid'})
    else:
        duration = volcengine_video_duration(request.get('duration', 5))
    if rule['pricingConfig'].get('isInputVideoPerSecond') and videos:
        if len(input_metadata) != len(videos) or any(item['seconds'] is None for item in input_metadata):
            raise HTTPException(400, {'code': 'credit_input_video_duration_required',
                'message': '输入视频缺少可核验时长，请先上传至当前空间。'})
    resolution = str(request.get('resolution') or '720P').strip().upper()
    if resolution == 'AUTO':
        resolution = '720P'
    params = {'resolution': resolution, 'duration': duration,
              'includeAudio': bool(request.get('generate_audio')), 'tool_version': request.get('tool_version') or 'standard',
              'level': request.get('level') or 'Balanced'}
    inputs = {'model_code': code, 'params': params, 'count': 1,
              'input_video_count': len(videos), 'input_video_seconds': input_seconds,
              'input_image_count': sum(bool(r.get('url')) for r in request.get('images', []) if isinstance(r, dict)),
              'input_audio_count': sum(bool(v) for v in request.get('audios', []))}
    at = time.time() if now is None else now
    quote = credit_policy.model_quote({'rules':[rule]}, **inputs, now=at)
    return {'input': inputs, 'rule': deepcopy(rule), 'quote': quote, 'quoted_at': at,
            'input_video_metadata': deepcopy(list(input_metadata)),
            'provider_id': request['provider_id'], 'model_id': request['model'],
            'basis': {'duration_seconds': duration, 'automatic_duration': automatic,
                      'resolution': resolution, 'automatic_resolution': not request.get('resolution') or request.get('resolution') == 'auto',
                      'draft_source_task_id': request.get('draft_source_task_id') or None}}


def reserve(conn, row):
    if row['kind'] not in {'video', 'llm'} or not model_code(row['request']):
        return
    if not row['requested_by']:
        raise HTTPException(401, {'code': 'task_requester_required'})
    if row['provider_id'] == 'mediakit' and row['request'].get('mediakit') is not True:
        raise HTTPException(400, {'code':'mediakit_task_required', 'message':'请通过 MediaKit 任务接口调用该工具。'})
    request = deepcopy(row['request'])
    inherited = None
    source_id = request.get('draft_source_task_id')
    if source_id:
        source = conn.execute('SELECT request FROM tasks WHERE id=%s AND workspace_id=%s', (source_id, row['workspace_id'])).fetchone()
        if not source:
            raise HTTPException(400, {'code': 'credit_draft_source_missing'})
        request = {**source['request'], 'resolution':'1080p', 'draft':False, 'draft_source_task_id':source_id}
        original = conn.execute("SELECT quote_snapshot FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s", (source_id,)).fetchone()
        inherited = original['quote_snapshot'].get('input_video_metadata') if original else None
    policy = credit_policy.read(conn)
    code = model_code(request)
    rule = next((r for r in policy['config']['rules'] if r['modelCode']==code), None)
    requires_input = bool(rule and rule['pricingConfig'].get('isInputVideoPerSecond')) or (
        row['provider_id']=='mediakit' and row['kind']=='video')
    metadata = []
    for ref in request.get('videos', []):
        if not ref:
            continue
        saved = next((item for item in inherited or [] if item['ref']==ref), None)
        seconds = video_duration.seconds(saved['seconds']) if saved else None
        if seconds is None:
            seconds = video_duration.asset_seconds(conn, ref, required=requires_input)
        metadata.append({'ref':ref, 'seconds':seconds})
    snapshot = prepare_quote(policy['config'], request, input_metadata=metadata)
    try:
        credit_wallet.freeze_credits(conn, row['requested_by'], source_type='canvas_task', source_id=row['id'],
            credits=snapshot['quote']['credits'], quote_version=policy['version'], quote_snapshot=snapshot,
            workspace_id=row['workspace_id'], model_code=code)
    except credit_wallet.CreditWalletError as error:
        raise HTTPException(402 if error.code=='insufficient_credits' else 409, {'code':error.code, **error.details}) from error


def review(conn, row, reason, message, actual=None):
    metadata = {'status':'needs_review', 'error':message, 'credit_review':{'reason':reason, 'actual_credits':actual}}
    return conn.execute('''UPDATE tasks SET status='needs_review',error_code=%s,error_message=%s,
        legacy_metadata=legacy_metadata || %s,completed_at=clock_timestamp() WHERE id=%s RETURNING *''',
        (reason, message, Jsonb(metadata), row['id'])).fetchone()


def settle(conn, row):
    if row['kind'] not in {'video', 'llm'} or row['status'] not in {'succeeded','failed','cancelled'}:
        return row
    hold = conn.execute("SELECT * FROM credit_holds WHERE source_type='canvas_task' AND source_id=%s", (row['id'],)).fetchone()
    if not hold:
        return row
    result = row['result'] or {}
    if row['status'] in {'failed','cancelled'}:
        credit_wallet.release_credits(conn, hold['id'], reason='媒体任务失败或取消')
        return row
    snapshot = hold['quote_snapshot']
    if row['kind']=='llm':
        if not str(result.get('text') or '').strip():
            return review(conn, row, 'credit_output_missing', '理解任务缺少有效回复，等待人工核查。')
        actual = hold['frozen_credits']
    else:
        if not result.get('videos'):
            return review(conn, row, 'credit_output_missing', '任务缺少已落盘视频，等待人工核查。')
        duration = video_duration.output_seconds(result)
        if duration is None:
            return review(conn, row, 'credit_output_duration_missing', '视频结果已保留，但无法核验输出时长；积分保持冻结。')
        info = result.get('video_info') or {}
        params = {**snapshot['input']['params'], 'duration': duration}
        resolution = info.get('resolution') or result.get('resolution')
        if resolution:
            params['resolution'] = str(resolution).strip().upper()
        if type(info.get('generate_audio')) is bool:
            params['includeAudio'] = info['generate_audio']
        try:
            actual = credit_policy.model_quote({'rules':[snapshot['rule']]},
                **{**snapshot['input'], 'params':params}, now=snapshot['quoted_at'])['credits']
        except HTTPException:
            return review(conn, row, 'credit_output_spec_unpriced', '视频结果已保留，但实际规格无法按冻结规则报价；积分保持冻结。')
    if actual > hold['frozen_credits']:
        return review(conn, row, 'credit_actual_exceeds_hold', '实际结果费用超过预冻结金额，结果已保留；积分保持冻结。', actual)
    credit_wallet.settle_credits(conn, hold['id'], actual, reason='媒体任务交付结算')
    return conn.execute("UPDATE tasks SET error_code=NULL,legacy_metadata=legacy_metadata-'credit_review' WHERE id=%s RETURNING *", (row['id'],)).fetchone()
