import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collections import OrderedDict
from threading import Lock
from types import SimpleNamespace
from unittest.mock import Mock, patch
from app.storage.media import TosStore, BROWSER_MEDIA_CACHE_CONTROL


def make_store():
    store = TosStore.__new__(TosStore)
    store.bucket = 'private-bucket'
    store._browser_urls = OrderedDict()
    store._browser_urls_lock = Lock()
    store.client = Mock()
    store.client.pre_signed_url.side_effect = lambda *a, **k: SimpleNamespace(signed_url='signed-' + str(store.client.pre_signed_url.call_count))
    return store


@patch.dict('os.environ', {'TOS_PUBLIC_ENDPOINT': 'https://example.invalid'})
def test_reuses_url_without_crossing_member_workspace_or_version():
    store = make_store()
    asset = {'object_key': 'image', 'object_version_id': 'v1'}
    with patch('app.storage.media.time.monotonic', return_value=100):
        one = store.signed_url(asset, 300, ('space-a', 'member-a'))
        assert store.signed_url(asset, 300, ('space-a', 'member-a')) == one
        assert store.signed_url(asset, 300, ('space-a', 'member-b')) != one
        assert store.signed_url(asset, 300, ('space-b', 'member-a')) != one
        assert store.signed_url({**asset, 'object_version_id': 'v2'}, 300, ('space-a', 'member-a')) != one
    query = store.client.pre_signed_url.call_args.kwargs['query']
    assert query['response-cache-control'] == BROWSER_MEDIA_CACHE_CONTROL
    assert query['versionId'] == 'v2'
    with patch('app.storage.media.time.monotonic', return_value=340):
        assert store.signed_url(asset, 300, ('space-a', 'member-a')) != one


@patch.dict('os.environ', {'TOS_PUBLIC_ENDPOINT': 'https://example.invalid'})
def test_provider_links_are_not_browser_cached_and_short_ttl_is_bounded():
    store = make_store()
    asset = {'object_key': 'image', 'object_version_id': 'v1'}
    store.signed_url(asset, 300)
    assert store.client.pre_signed_url.call_args.kwargs['query']['response-cache-control'] == 'private, no-store'
    assert not store._browser_urls
    store.signed_url(asset, 30, ('space', 'member'))
    assert 'max-age=15' in store.client.pre_signed_url.call_args.kwargs['query']['response-cache-control']


def test_new_objects_have_explicit_private_cache_metadata(tmp_path):
    store = make_store()
    path = tmp_path / 'image.webp'
    path.write_bytes(b'test')
    store.client.put_object_from_file.return_value = SimpleNamespace(version_id='v1')
    store.client.head_object.return_value = SimpleNamespace(content_length=4)
    assert store.put('key', path, 'image/webp') == 'v1'
    args = store.client.put_object_from_file.call_args.kwargs
    assert args['cache_control'] == BROWSER_MEDIA_CACHE_CONTROL
    assert args['forbid_overwrite'] is True
