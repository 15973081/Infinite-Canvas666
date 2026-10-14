"""Recorded voice cloning with validated samples and restartable audition output."""
import array
import asyncio
import hashlib
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import httpx
from fastapi import HTTPException
from app.storage import media, tasks, finalization
from app.services.canvas_tasks import save_canvas_task
from app.providers.registry import httpx_provider_kwargs, provider_env_key_value
from app.utils import bearer_auth_value


def sample_path(ref, encode=False):
    asset = media.get_asset(ref)
    if not asset or asset['kind'] != 'audio' or (asset.get('metadata') or {}).get('chat_owner'):
        raise HTTPException(400, '录音样本请先上传到当前空间')
    path = media.materialize(ref)
    if not path or Path(path).stat().st_size > 20 * 1024 * 1024:
        raise HTTPException(413, '录音样本超过 20 MB')
    command = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-vn', '-t', '62',
                              '-ac', '1', '-ar', '32000', '-f', 's16le', 'pipe:1'], capture_output=True, timeout=60,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if command.returncode or len(command.stdout) % 2:
        raise HTTPException(400, '录音样本无法解码，请重新录制')
    pcm = array.array('h', command.stdout)
    if sys.byteorder != 'little':
        pcm.byteswap()
    duration = len(pcm) / 32000
    # A recorder stop callback may arrive a fraction after the 60 s timer.
    # Permit up to one second of capture latency, then trim the supplier sample.
    if not 10 <= duration <= 61:
        raise HTTPException(400, '录音时长需在10秒～60秒之间')
    frames = sum(math.sqrt(sum(value * value for value in pcm[i:i+2048]) / len(pcm[i:i+2048])) / 32768 > .1
                 for i in range(0, len(pcm), 2048))
    if frames < 10:
        raise HTTPException(400, '录音样本音量不足，请重试')
    if not encode:
        return path
    output = media.operation()['root'] / 'voice-clone-sample.mp3'
    command = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-vn', '-t', '60',
                              '-ac', '1', '-ar', '32000', '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(output)],
                             capture_output=True, timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if command.returncode:
        raise HTTPException(400, '录音转码失败，请重新录制')
    media.check_budget()
    return output


def validate_mp3(path):
    command = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=format_name', '-of', 'json', str(path)],
                             capture_output=True, timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        info = json.loads(command.stdout)
        valid = command.returncode == 0 and info['format']['format_name'] == 'mp3' and any(
            stream.get('codec_name') == 'mp3' and stream.get('codec_type') == 'audio' for stream in info['streams'])
    except (ValueError, KeyError, TypeError):
        valid = False
    if not valid:
        raise HTTPException(502, '音色试听无法解码；已保留供应商结果来源')


async def save_preview(source, slot):
    if not isinstance(source, dict) or not isinstance(source.get('url'), str):
        raise HTTPException(502, '音色试听来源格式无效')
    token = media.result_slot.set(slot)
    try:
        return await media.download_remote(source['url'], 'voice_preview_', provider={'proxy_url': source.get('proxy_url') or ''},
                                           default_extension='.mp3', validate_file=validate_mp3)
    finally:
        media.result_slot.reset(token)


async def run_clone(task_id, payload, provider):
    from app.storage.submission import paid_post, admit
    sample = await asyncio.to_thread(sample_path, payload.sample_audio, True)
    base = provider['base_url'].rstrip('/')
    base += '/' if base.endswith('/v1') else '/v1/'
    headers = {'Authorization': bearer_auth_value(provider_env_key_value(provider['id']))}
    voice_id = 'canvas-voice-' + hashlib.sha256(payload.client_task_id.encode()).hexdigest()[:32]
    task = tasks.get(task_id)
    task.update(status='submitting', error='', updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
    async with httpx.AsyncClient(timeout=600, **httpx_provider_kwargs(provider)) as client:
        # File upload is preparation, not a second generation. No API key or
        # caller-supplied supplier file id is persisted in the task request.
        await asyncio.to_thread(admit, False)
        with Path(sample).open('rb') as stream:
            response = await client.post(base + 'files/upload', headers=headers, data={'purpose': 'voice_clone'},
                                         files={'file': ('voice-sample.mp3', stream, 'audio/mpeg')})
        response.raise_for_status()
        value = response.json()
        file_id = (value.get('file') or {}).get('file_id') if isinstance(value, dict) else None
        if not isinstance(value, dict) or (value.get('base_resp') or {}).get('status_code') != 0 or type(file_id) is not int or file_id <= 0:
            raise HTTPException(502, '录音上传未确认，未提交音色生成')
        response = await paid_post(client, base + 'voice_clone', headers=headers, json={
            'file_id': file_id, 'voice_id': voice_id, 'text': payload.preview_text, 'model': payload.clone_preview_model})
        response.raise_for_status()
        value = response.json()
    if not isinstance(value, dict) or (value.get('base_resp') or {}).get('status_code') != 0 or value.get('input_sensitive') is True or not isinstance(value.get('demo_audio'), str) or not value['demo_audio']:
        raise HTTPException(502, '音色供应商未返回可用试听，请核对原任务')
    info = {'mode': 'clone', 'format': 'mp3', 'voice_id': voice_id}
    extra = value.get('extra_info') or {}
    if isinstance(extra, dict) and type(extra.get('usage_characters')) is int and extra['usage_characters'] >= 0:
        info['usage_characters'] = extra['usage_characters']
    result = {'audios': [], 'audio_info': info, 'providerId': payload.provider_id, 'model': payload.model}
    # Checkpoint the supplier URL before download. Publication recovery never
    # uploads another sample or makes another paid clone request.
    result = await finalization.publish_result(result, [{'url': value['demo_audio'], 'proxy_url': provider.get('proxy_url') or ''}], 'audios', payload.provider_id)
    task = tasks.get(task_id)
    task.update(status='succeeded', result=result, error='', submission_unknown=False, updated_at=time.time())
    await asyncio.to_thread(save_canvas_task, task)
