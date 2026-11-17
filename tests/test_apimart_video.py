"""APIMart H3 adapters and isolation from other providers; no network calls."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models import CanvasVideoRequest
from app.routers import canvas
from app.services.media import apimart_video_resolution, video_output_urls
from app.services.apimart_video import apimart_video_model, build_apimart_video_request
from app.services.model_commercial import policies, discounts
from app.providers.registry import normalize_model_prices
from app.services import apimart_video, media, canvas_ledger


class Captured(Exception):
    pass


@pytest.fixture
def transport(monkeypatch):
    provider = {'id': 'test', 'name': 'APIMart', 'protocol': 'apimart', 'base_url': 'https://example.invalid'}
    monkeypatch.setattr(canvas, 'get_api_provider', lambda _: provider)
    monkeypatch.setattr(canvas, 'provider_env_key_value', lambda _: 'unit-key')
    monkeypatch.setattr(canvas, 'httpx_provider_kwargs', lambda _: {})
    monkeypatch.setattr(canvas, 'api_headers', lambda **_: {})
    client = AsyncMock()
    client.__aenter__.return_value = client
    monkeypatch.setattr(canvas.httpx, 'AsyncClient', lambda **_: client)
    upload = AsyncMock(side_effect=lambda client, provider, url: url)
    for name in ['upload_image_for_apimart', 'upload_video_for_apimart', 'upload_audio_for_apimart']:
        monkeypatch.setattr(canvas, name, upload)
    post = AsyncMock(side_effect=Captured)
    monkeypatch.setattr(canvas, 'paid_post', post)
    monkeypatch.setattr(apimart_video, 'probe_stream_duration', lambda _: 8.0)
    return post, upload


@pytest.mark.parametrize('model,duration,resolution', [
    ('kling-v4', 3, '720p'), ('kling-v4', 30, '1080p'),
    ('kling-v4-flash', 3, '720p'), ('kling-v4-flash', 20, '720p'),
])
def test_kling_wire_duration_and_resolution(transport, model, duration, resolution):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model=model, duration=duration, resolution=resolution)
    body = post.call_args.kwargs['json']
    assert body['duration'] == duration
    assert body['resolution'] == resolution
    assert 'size' not in body and 'watermark' not in body


@pytest.mark.parametrize('model', ['kling-v4', 'kling-v4-flash'])
def test_kling_first_frame_needs_no_prompt_or_aspect(transport, model):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model=model, prompt='', images=[{'url': 'https://example.invalid/i.png'}])
    body = post.call_args.kwargs['json']
    assert body['resolution'] == '720p'
    assert body['image_with_roles'][0]['role'] == 'first_frame'
    assert all(key not in body for key in ['prompt', 'size', 'aspect_ratio'])


def test_kling_ten_frames_keep_middle_order(transport):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model='kling-v4', task_mode='image',
               images=[{'url': f'https://example.invalid/{i}.png'} for i in range(10)])
    images = post.call_args.kwargs['json']['image_with_roles']
    assert [item['role'] for item in images] == ['first_frame'] + ['keyframe'] * 8 + ['last_frame']
    assert [item['url'] for item in images] == [f'https://example.invalid/{i}.png' for i in range(10)]


@pytest.mark.parametrize('model', ['kling-v4', 'kling-v4-flash'])
def test_kling_reference_preserves_ten_images_and_five_videos(transport, model):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model=model, task_mode='reference', audio_setting='origin', aspect_ratio='auto',
               images=[{'url': f'https://example.invalid/{i}.png'} for i in range(10)],
               videos=[f'https://example.invalid/{i}.mp4' for i in range(5)])
    body = post.call_args.kwargs['json']
    assert len(body['image_with_roles']) == 10 and len(body['video_urls']) == 5
    assert body['omni_reference_task_type'] == 'reference'
    assert body['audio_setting'] == 'origin' and body['aspect_ratio'] == 'auto'


@pytest.mark.parametrize('mode', ['edit', 'extend'])
def test_kling_edit_extend_and_persisted_defaults(transport, mode):
    post, _ = transport
    payload = CanvasVideoRequest(model='kling-v4', provider_id='test', prompt='test', task_mode=mode,
                                 videos=['https://example.invalid/in.mp4'])
    payload = CanvasVideoRequest(**canvas._canvas_video_payload_dict(payload))
    with pytest.raises(Captured):
        asyncio.run(canvas.canvas_video_impl(payload))
    body = post.call_args.kwargs['json']
    assert body['video_url'] == 'https://example.invalid/in.mp4'
    assert body['omni_reference_task_type'] == mode and 'video_urls' not in body
    assert 'aspect_ratio' not in body
    assert ('duration' not in body) if mode == 'edit' else body['duration'] == 5


@pytest.mark.parametrize('kwargs', [
    {'model': 'kling-v4-flash', 'resolution': '1080p'},
    {'model': 'kling-v4-flash', 'duration': 21}, {'duration': 31}, {'duration': 0},
    {'model': 'kling-v4-flash', 'audios': ['https://example.invalid/a.mp3']},
    {'model': 'kling-v4-flash', 'images': [{'url': 'https://example.invalid/i.png'}] * 2},
    {'task_mode': 'extend', 'videos': []},
    {'task_mode': 'reference', 'images': [{'url': 'https://example.invalid/i.png'}] * 11},
    {'task_mode': 'image', 'images': [{'url': 'https://example.invalid/i.png', 'role': 'last_frame'}]},
    {'task_mode': 'extend', 'videos': ['https://example.invalid/v.mp4'], 'audio_setting': 'origin'},
    {'prompt': ''}, {'watermark': True},
])
def test_kling_rejects_invalid_inputs_before_upload(transport, kwargs):
    post, upload = transport
    with pytest.raises(HTTPException) as error:
        submit(**{'model': 'kling-v4', **kwargs})
    assert error.value.status_code == 400
    post.assert_not_awaited()
    upload.assert_not_awaited()


def test_kling_accounting_input_seconds_and_missing_probe(monkeypatch):
    body = {'model': 'kling-v4', 'resolution': '720p', 'duration': 5,
            'omni_reference_task_type': 'reference', 'video_urls': ['https://example.invalid/v.mp4']}
    monkeypatch.setattr(apimart_video, 'probe_stream_duration', lambda _: 8.0)
    info = asyncio.run(apimart_video.kling_video_info(body))
    assert info['billing_duration'] == 13
    provider = {'id': 'test', 'protocol': 'apimart'}
    price = {'billing_type': 'per_second', 'unit_price': '1', 'currency': 'CNY'}
    result = apimart_video.kling_accounting(info, provider, price)
    assert result['cost']['amount_micros'] == 13000000
    monkeypatch.setattr(apimart_video, 'probe_stream_duration', lambda _: None)
    result = apimart_video.kling_accounting(asyncio.run(apimart_video.kling_video_info(body)), provider, price)
    assert result['cost']['status'] == 'unknown'
    assert canvas_ledger.price_log({'status': 'success', 'cost': result['cost'], 'request': {'duration': 5}}, frozen_price=price)['status'] == 'unknown'


@pytest.mark.parametrize('model,continuation', [('kling-v4', 'full'), ('kling-v4-flash', 'segment')])
def test_kling_extend_bills_only_additional_seconds(model, continuation):
    info = asyncio.run(apimart_video.kling_video_info({'model': model, 'resolution': '720p',
        'duration': 5, 'omni_reference_task_type': 'extend', 'video_url': 'https://example.invalid/v.mp4'}))
    assert info['billing_duration'] == 5 and not info['has_video_input']
    assert info['continuation'] == continuation


def test_kling_name_on_other_provider_keeps_generic_defaults(monkeypatch, transport):
    post, _ = transport
    monkeypatch.setattr(canvas, 'get_api_provider', lambda _: {
        'id': 'test', 'protocol': 'openai', 'base_url': 'https://elsewhere.invalid'})
    with pytest.raises(Captured):
        submit(model='kling-v4')
    body = post.call_args.kwargs['json']
    assert body['duration'] == 5
    assert body.get('aspect_ratio') == '16:9' or body.get('size') == '16:9'


def test_apimart_polling_does_not_fail_on_local_deadline(monkeypatch):
    from unittest.mock import Mock
    import httpx
    client = AsyncMock()
    client.get.side_effect = [httpx.Response(200, json={'data': {'status': status}},
        request=httpx.Request('GET', 'https://example.invalid/task')) for status in ['processing', 'completed']]
    monkeypatch.setattr(media, 'VIDEO_POLL_TIMEOUT', -1)
    monkeypatch.setattr(media.asyncio, 'sleep', AsyncMock())
    monkeypatch.setattr(media, 'api_headers', Mock(return_value={}))
    result = asyncio.run(media.wait_for_video_task(client, {'protocol': 'apimart', 'base_url': 'https://example.invalid'}, 'test'))
    assert result['data']['status'] == 'completed' and client.get.call_count == 2


def submit(**kwargs):
    return asyncio.run(canvas.canvas_video_impl(CanvasVideoRequest(**{
        'prompt': '海边日落', 'provider_id': 'test', 'model': 'MiniMax-H3', **kwargs})))


@pytest.mark.parametrize('model,resolution,duration', [
    ('MiniMax-H3', '2K', 4), ('MiniMax-H3', '768P', 15),
    ('MiniMax-H3-Max', '480P', 5), ('MiniMax-H3-Max', '768P', 15),
    ('minimax-h3-max', '1080P', 8),
])
def test_wire_request_and_1080p_omission(transport, model, resolution, duration):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model=model, resolution=resolution.lower(), duration=duration, watermark=True,
               generate_audio=True, return_last_frame=True, seed=42)
    body = post.call_args.kwargs['json']
    assert body['resolution'] == resolution
    assert body['duration'] == duration
    assert body['model'] in {'MiniMax-H3', 'MiniMax-H3-Max'}
    assert 'size' not in body and body['aspect_ratio'] == '16:9'
    assert all(key not in body for key in ['seed', 'return_last_frame', 'generate_audio', 'aigc_watermark'])
    assert ('watermark' in body) == (resolution != '1080P')


@pytest.mark.parametrize('kwargs', [
    {'model': 'MiniMax-H3-Max', 'duration': 4}, {'duration': 16},
    {'model': 'MiniMax-H3-Max', 'resolution': '2k'}, {'resolution': '1080p'},
    {'prompt': ' '}, {'prompt': '字' * 7001}, {'aspect_ratio': '9:21'},
    {'audios': ['https://example.invalid/a.mp3']},
    {'images': [{'url': 'https://example.invalid/i.png', 'role': 'first_frame'}], 'videos': ['https://example.invalid/v.mp4']},
    {'images': [{'url': 'https://example.invalid/i.png', 'role': 'first_frame'}, {'url': 'https://example.invalid/r.png'}]},
    {'images': [{'url': 'https://example.invalid/i.png', 'role': 'first_frame'}] * 2},
    {'images': [{'url': 'https://example.invalid/i.png', 'role': 'middle_frame'}]},
    {'images': [{'url': ''}]},
    {'images': [{'url': 'https://example.invalid/i.png'}] * 10},
    {'videos': ['https://example.invalid/v.mp4'] * 4},
    {'audios': ['https://example.invalid/a.mp3'] * 4},
])
def test_invalid_inputs_rejected_before_upload_or_submission(transport, kwargs):
    post, upload = transport
    with pytest.raises(HTTPException) as error:
        submit(**kwargs)
    assert error.value.status_code == 400
    post.assert_not_awaited()
    upload.assert_not_awaited()


@pytest.mark.parametrize('model', ['MiniMax-H3', 'MiniMax-H3-Max'])
def test_multimodal_reference_and_unlabelled_images_are_preserved(transport, model):
    post, _ = transport
    with pytest.raises(Captured):
        submit(model=model, images=[{'url': 'https://example.invalid/a.png', 'role': 'reference_image'},
                                   {'url': 'https://example.invalid/b.png'}],
               videos=['https://example.invalid/v.mp4'], audios=['https://example.invalid/a.mp3'])
    body = post.call_args.kwargs['json']
    assert len(body['image_with_roles']) == 2
    assert all(item['role'] == 'reference_image' for item in body['image_with_roles'])
    assert len(body['video_urls']) == len(body['audio_urls']) == 1


def test_first_last_frames_ignore_aspect(transport):
    post, _ = transport
    with pytest.raises(Captured):
        submit(images=[{'url': 'https://example.invalid/a.png', 'role': 'first'},
                       {'url': 'https://example.invalid/b.png', 'role': 'last'}], aspect_ratio='9:21')
    body = post.call_args.kwargs['json']
    assert body['aspect_ratio'] == 'adaptive'
    assert [item['role'] for item in body['image_with_roles']] == ['first_frame', 'last_frame']


def test_one_failed_image_upload_does_not_silently_drop_an_input(transport):
    post, upload = transport
    upload.side_effect = ['https://example.invalid/a.png', 'ERR:upload failed']
    with pytest.raises(HTTPException) as error:
        submit(images=[{'url': '/assets/a.png'}, {'url': '/assets/b.png'}])
    assert error.value.status_code == 400
    post.assert_not_awaited()


def test_seedance_keeps_its_existing_combination_restriction(transport):
    post, _ = transport
    with pytest.raises(HTTPException) as error:
        submit(model='doubao-seedance-2.0',
               images=[{'url': 'https://example.invalid/a.png', 'role': 'reference_image'}],
               videos=['https://example.invalid/v.mp4'])
    assert error.value.status_code == 400
    post.assert_not_awaited()


def test_exact_tiers_roundtrip_through_commercial_configuration():
    for resolution in ['768p', '2k']:
        rule = {'video:MiniMax-H3': {'resolutions': [resolution]}}
        assert policies(rule)['video:MiniMax-H3']['resolutions'] == [resolution]
        price = {'kind': 'video', 'model': 'MiniMax-H3', 'billing_type': 'per_second', 'unit_price': '1', 'resolution': resolution}
        assert normalize_model_prices([price])[0]['resolution'] == resolution
        discount = {'kind': 'video', 'model': 'MiniMax-H3', 'rate': '0.8', 'resolution': resolution}
        assert discounts([discount])[0]['resolution'] == resolution
    provider = {'protocol': 'apimart'}
    def body(model, resolution=''):
        return build_apimart_video_request(provider, CanvasVideoRequest(model=model, resolution=resolution, prompt='test'))
    assert body('MiniMax-H3')['resolution'] == '2K'
    assert body('MiniMax-H3-Max')['resolution'] == '768P'
    with pytest.raises(HTTPException):
        body('MiniMax-H3', '1080p')
    # The generic media helper no longer contains manufacturer-specific overrides.
    assert apimart_video_resolution('MiniMax-H3', '1080p') == '1080p'
    assert video_output_urls({'data': {'result': {'videos': [{'url': ['https://example.invalid/out.mp4']}]}}}) == ['https://example.invalid/out.mp4']


@pytest.mark.parametrize('provider', [
    {'protocol': 'openai', 'base_url': 'https://api.minimax.io'},
    {'protocol': 'openai', 'base_url': 'https://other.invalid'},
    {'protocol': 'openai', 'base_url': 'https://apimart.ai.other.invalid'},
    {'protocol': 'openai', 'base_url': 'https://other.invalid/apimart.ai'},
    {'protocol': 'openai', 'base_url': 'https://other.invalid?upstream=apimart.ai'},
])
@pytest.mark.parametrize('model', ['MiniMax-H3', 'MiniMax-H3-Max'])
def test_other_providers_never_inherit_apimart_rules(monkeypatch, transport, provider, model):
    post, upload = transport
    provider = {'id': 'test', **provider}
    assert apimart_video_model(provider, model) is None
    payload = CanvasVideoRequest(model=model, prompt='test', duration=30, resolution='custom-tier')
    assert build_apimart_video_request(provider, payload) is None
    monkeypatch.setattr(canvas, 'get_api_provider', lambda _: provider)
    with pytest.raises(Captured):
        submit(model=model, duration=30, resolution='custom-tier', watermark=True)
    body = post.call_args.kwargs['json']
    assert body['duration'] == 30
    assert body['resolution'] == 'custom-tier'
    assert body['watermark'] is True
    upload.assert_not_awaited()


@pytest.mark.parametrize('provider', [
    {'protocol': 'apimart', 'base_url': 'https://proxy.invalid'},
    {'base_url': 'https://api.apimart.ai/v1'},
    {'base_url': 'https://apimart.ai'},
])
def test_apimart_protocol_and_real_hostname_select_gateway_rules(provider):
    assert apimart_video_model(provider, 'minimax-h3-max').duration_min == 5
    assert build_apimart_video_request(provider, CanvasVideoRequest(model='unregistered-video', prompt='test')) is None
