import pytest
from app.services.canvas_cover import resolve_cover
from app.models import CanvasSaveRequest


NODES = [
    {'id': 'prompt', 'type': 'prompt', 'text': 'https://example.test/prompt.mp4'},
    {'id': 'picture', 'type': 'image', 'url': '/assets/picture.png'},
    {'id': 'video', 'type': 'output', 'images': [
        {'url': '/assets/a.png', 'kind': 'image'},
        {'url': '/output/first.mp4', 'kind': 'video', 'thumbnail_url': '/assets/poster.jpg'},
        {'url': '/output/second.mp4'}]},
    {'id': 'later', 'type': 'image', 'url': '/output/later.webm'}]


def test_default_cover_is_first_video_result_not_prompt_or_first_image():
    assert resolve_cover(NODES) == {'node_id': 'video', 'index': 1, 'kind': 'video',
                                    'url': '/output/first.mp4', 'thumbnail': '/assets/poster.jpg'}


def test_manual_image_selection_and_deleted_node_fallback():
    assert resolve_cover(NODES, {'node_id': 'picture'})['kind'] == 'image'
    assert resolve_cover(NODES, {'node_id': 'deleted'}) == resolve_cover(NODES)
    assert resolve_cover(NODES[:2])['node_id'] == 'picture'
    assert resolve_cover([]) is None


@pytest.mark.parametrize('url', ['javascript:alert(1)', 'data:image/png;base64,AA', 'blob:abc', '//third.test/a.jpg', 'asset://private', '/assets/'+'x'*4096+'.png'])
def test_cover_ignores_transient_or_unsafe_sources(url):
    assert resolve_cover([{'id': 'bad', 'type': 'image', 'url': url}]) is None


def test_cover_schema_limits_and_older_clients_do_not_clear_selection():
    assert 'cover' not in CanvasSaveRequest().model_fields_set
    assert 'cover' in CanvasSaveRequest(cover=None).model_fields_set
    with pytest.raises(ValueError):
        CanvasSaveRequest(cover={'node_id': 'a', 'index': -2})
    with pytest.raises(ValueError):
        CanvasSaveRequest(cover={'text': 'x'*81})
