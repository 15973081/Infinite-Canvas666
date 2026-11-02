"""Exercise both H3 models at the paid transport boundary without network calls."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models import CanvasVideoRequest
from app.routers import canvas
from app.services.media import apimart_video_resolution, video_output_urls
from app.services.model_commercial import policies, discounts
from app.providers.registry import normalize_model_prices


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
    return post, upload


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
    assert apimart_video_resolution('MiniMax-H3', '') == '2K'
    assert apimart_video_resolution('MiniMax-H3-Max', '') == '768P'
    with pytest.raises(HTTPException):
        apimart_video_resolution('MiniMax-H3', '1080p')
    assert video_output_urls({'data': {'result': {'videos': [{'url': ['https://example.invalid/out.mp4']}]}}}) == ['https://example.invalid/out.mp4']
