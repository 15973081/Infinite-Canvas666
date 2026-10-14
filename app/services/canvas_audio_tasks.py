"""Durable MiniMax speech/music generation with immutable audio publication."""
import asyncio
import base64
import json
import math
import re
import subprocess
import time

import httpx
from fastapi import HTTPException
from app.models import CanvasAudioTaskRequest
from app.utils import bearer_auth_value
from app.providers.registry import get_api_provider_exact, httpx_provider_kwargs, provider_env_key_value
from app.services.canvas_tasks import save_canvas_task, get_canvas_task
from app.storage import tasks, finalization, media
from app.storage.settings import postgres_enabled, member_auth_enabled


def validate_provider(provider, payload):
    if provider.get('protocol') != 'minimax':
        raise HTTPException(400, {'code': 'audio_protocol_not_supported'})
    from app.services.model_commercial import enforce
    enforce(provider, 'audio', payload.model_dump(mode='json'))
    if not payload.model.lower().startswith('speech-' if payload.mode == 'speech' else 'music-'):
        raise HTTPException(400, {'code': 'audio_model_mode_mismatch'})
    if not provider_env_key_value(provider['id']) or not provider.get('base_url'):
        raise HTTPException(400, {'code': 'audio_provider_not_configured'})


def create(payload):
    if not postgres_enabled() or not member_auth_enabled():
        raise HTTPException(409, {'code': 'member_durable_tasks_required'})
    from app.services.canvas import load_canvas
    from app.services.canvas_ledger import task_billing_fields
    load_canvas(payload.canvas_id)
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload)
    task = {'id': payload.client_task_id, 'type': 'audio', 'status': 'queued',
            'provider_id': provider['id'], 'provider_name': provider.get('name') or provider['id'], 'model': payload.model,
            'created_at': time.time(), 'updated_at': time.time(), 'result': None,
            **task_billing_fields(payload, 'audio')}
    stored = save_canvas_task(task, payload.model_dump(mode='json'))
    return {'task_id': stored['id'], 'status': stored['status'], 'canvas_binding': stored['canvas_binding']}


def get(task_id):
    task = get_canvas_task(task_id)
    if not task or task.get('type') != 'audio':
        raise HTTPException(404, {'code': 'audio_task_not_found'})
    return task


def upstream_request(payload):
    body = {'model': payload.model, 'output_format': 'hex'}
    if payload.mode == 'speech':
        body.update(text=payload.prompt, stream=False, language_boost='auto',
                    voice_setting={'voice_id': payload.timbre_id, 'speed': payload.speed, 'vol': payload.vol if payload.vol else 1, 'pitch': payload.pitch},
                    audio_setting={'sample_rate': 32000, 'bitrate': 128000, 'format': 'mp3', 'channel': 1})
        effects = {'pitch': payload.voice_modify_pitch, 'intensity': payload.voice_modify_intensity, 'timbre': payload.voice_modify_timbre}
        if payload.voice_modify_sound_effects:
            effects['sound_effects'] = payload.voice_modify_sound_effects
        if any(effects.values()):
            body['voice_modify'] = effects
        return 't2a_v2', body
    body.update(prompt=payload.prompt, lyrics_optimizer=payload.music_mode == 'ADAPTIVE',
                is_instrumental=payload.music_mode == 'INSTRUMENTAL',
                audio_setting={'sample_rate': 44100, 'bitrate': 256000, 'format': 'mp3'})
    if payload.music_mode == 'CUSTOM':
        body['lyrics'] = payload.lyrics
    return 'music_generation', body


def response_result(value, payload):
    if not isinstance(value, dict) or not isinstance(value.get('base_resp'), dict) or value['base_resp'].get('status_code') != 0:
        raise HTTPException(502, '音频供应商未确认成功，请核对原任务')
    data, info = value.get('data'), value.get('extra_info') or {}
    if not isinstance(data, dict) or data.get('status') != 2:
        raise HTTPException(502, '音频供应商未返回完整结果，请核对原任务')
    encoded = data.get('audio')
    if not isinstance(encoded, str) or len(encoded) > 128 * 1024 * 1024 or len(encoded) % 2 or not re.fullmatch('[0-9a-fA-F]+', encoded):
        raise HTTPException(502, '音频结果编码无效，请核对原任务')
    audio = bytes.fromhex(encoded)
    if not isinstance(info, dict):
        raise HTTPException(502, '音频结果信息无效')
    duration = info.get('audio_length' if payload.mode == 'speech' else 'music_duration')
    audio_info = {'mode': payload.mode, 'format': 'mp3'}
    if payload.mode == 'speech' and payload.vol == 0:
        audio_info['muted'] = True
    if type(duration) in {int, float} and math.isfinite(duration) and duration > 0:
        audio_info['duration'] = duration / 1000
    characters = info.get('usage_characters')
    if type(characters) is int and characters >= 0:
        audio_info['usage_characters'] = characters
    result = {'audios': [], 'audio_info': audio_info, 'providerId': payload.provider_id, 'model': payload.model,
              'upstream_trace_id': str(value.get('trace_id') or '')[:240]}
    source = 'data:audio/mpeg;base64,' + base64.b64encode(audio).decode('ascii')
    return result, source


def save_audio_source(source, slot, muted=False):
    if not isinstance(source, str) or not source.startswith('data:audio/mpeg;base64,'):
        raise HTTPException(502, '音频结果来源格式无效')
    try:
        content = base64.b64decode(source.split(',', 1)[1], validate=True)
    except (ValueError, TypeError) as error:
        raise HTTPException(502, '音频结果来源编码无效') from error
    if not content or len(content) > 64 * 1024 * 1024:
        raise HTTPException(413, '音频结果大小无效或超过限制')
    media.check_budget(len(content))
    path = media.operation()['root'] / (slot + '.mp3')
    path.write_bytes(content)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=format_name', '-of', 'json', str(path)],
                           capture_output=True, timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        metadata = json.loads(probe.stdout)
        valid = probe.returncode == 0 and metadata['format']['format_name'] == 'mp3' and any(
            stream.get('codec_type') == 'audio' and stream.get('codec_name') == 'mp3' for stream in metadata['streams'])
    except (ValueError, KeyError, TypeError):
        valid = False
    if not valid:
        raise HTTPException(502, '供应商返回的音频无法解码；已保留结果来源')
    if muted:
        # The native canvas permits zero volume; MiniMax requires a positive
        # synthesis volume. Preserve the spoken timing and publish silence.
        output = path.with_name(slot + '-muted.mp3')
        command = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-vn', '-af', 'volume=0',
                                  '-ar', '32000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(output)],
                                 capture_output=True, timeout=120, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if command.returncode:
            raise HTTPException(502, '静音处理未完成，原结果已保留')
        media.check_budget()
        path = output
    return media.stable_url(media.publish(path, asset_id=slot, role='generated'))


async def run_task(task_id, request):
    from app.storage.submission import paid_post
    payload = CanvasAudioTaskRequest(**{key: value for key, value in request.items() if key != '_canvas_binding'})
    provider = get_api_provider_exact(payload.provider_id)
    validate_provider(provider, payload)
    endpoint, body = upstream_request(payload)
    base = provider['base_url'].rstrip('/')
    url = base + ('/' if base.endswith('/v1') else '/v1/') + endpoint
    task = tasks.get(task_id)
    task.update(status='submitting', error='', updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
    async with httpx.AsyncClient(timeout=600, **httpx_provider_kwargs(provider)) as client:
        response = await paid_post(client, url, headers={'Authorization': bearer_auth_value(provider_env_key_value(provider['id'])), 'Content-Type': 'application/json'}, json=body)
        response.raise_for_status()
        result, source = response_result(response.json(), payload)
    result = await finalization.publish_result(result, [source], 'audios', payload.provider_id)
    task = tasks.get(task_id)
    task.update(status='succeeded', result=result, error='', submission_unknown=False, updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
