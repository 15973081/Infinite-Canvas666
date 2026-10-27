import asyncio
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from app.services import media

@pytest.mark.parametrize("kind", ["image", "video", "audio"])
def test_unverified_volcengine_uses_bucket(kind):
    url = "/assets/cloud/ast_" + "a"*32 + "/file"
    with patch.object(media, "volcengine_asset_uri_for_library_url", return_value=""), patch.object(media, "bucket_reference_url", return_value="https://bucket/signed") as bucket:
        assert asyncio.run(media.volcengine_video_media_reference_url(url, max_image_size=None)) == "https://bucket/signed"
        bucket.assert_called_once()

@pytest.mark.parametrize("direct", [True, False])
def test_verified_asset_has_priority(direct):
    with patch.object(media, "volcengine_asset_uri_for_library_url", return_value="asset://verified"), patch.object(media, "ensure_volcengine_asset_active", new=AsyncMock(return_value="asset://verified")) as verify, patch.object(media, "bucket_reference_url") as bucket:
        assert asyncio.run(media.volcengine_video_media_reference_url("asset://verified" if direct else "/assets/a.png")) == "asset://verified"
        verify.assert_awaited_once()
        bucket.assert_not_called()

def test_apimart_image_does_not_reupload_bucket():
    client = AsyncMock()
    with patch.object(media, "bucket_reference_url", return_value="https://bucket/signed"):
        assert asyncio.run(media.upload_image_for_apimart(client, {}, "/assets/a.png")) == "https://bucket/signed"
    client.post.assert_not_called()

def test_image_url_and_legacy_fallback():
    with patch.object(media, "bucket_reference_url", return_value="https://bucket/signed"), patch.object(media, "reference_to_data_url") as encode:
        assert media.volcengine_image_payload({"url":"/assets/a.png"}) == "https://bucket/signed"
        encode.assert_not_called()
    with patch.object(media, "bucket_reference_url", return_value=""), patch.object(media, "reference_to_data_url", return_value="data:image/png;base64,AA=="):
        assert media.image_reference_for_provider({"url":"/assets/a.png"}).startswith("data:")

def test_non_tos_does_not_access_bucket():
    with patch.object(media, "postgres_enabled", return_value=True), patch.object(media, "media_backend", return_value="filesystem"), patch("app.storage.media.get_asset") as get:
        assert media.bucket_reference_url("/assets/a.png") == ""
        get.assert_not_called()

def test_cached_resized_image_is_signed():
    asset = {"id":"ast_"+"a"*32, "object_version_id":"v1", "kind":"image"}
    derived = {"status":"ready", "id":"ast_"+"b"*32}
    with patch.object(media, "postgres_enabled", return_value=True), patch.object(media, "media_backend", return_value="tos"), patch("app.storage.media.get_asset", side_effect=[asset, derived]), patch("app.storage.media.browser_url", return_value="https://bucket/resized") as sign, patch.object(media, "reference_to_data_url") as encode:
        assert media.bucket_reference_url("/assets/a.png", 1536) == "https://bucket/resized"
        sign.assert_called_once_with(derived, provider=True)
        encode.assert_not_called()

def test_resized_copy_is_published_and_temporary_file_removed(tmp_path):
    asset = {"id":"ast_"+"a"*32, "object_version_id":"v1", "kind":"image"}
    derived = {"status":"ready", "id":"ast_"+"b"*32}
    with patch.object(media, "postgres_enabled", return_value=True), patch.object(media, "media_backend", return_value="tos"), patch("app.storage.media.get_asset", side_effect=[asset, None]), patch("app.storage.media.scratch_directory", return_value=str(tmp_path)), patch.object(media, "reference_to_data_url", return_value="data:image/png;base64,aGVsbG8=") as resize, patch("app.storage.media.publish", return_value=derived) as publish, patch("app.storage.media.browser_url", return_value="https://bucket/new"):
        assert media.bucket_reference_url("/assets/a.png", 1536) == "https://bucket/new"
        resize.assert_called_once_with({"url":"/assets/a.png"}, max_size=1536)
        assert publish.call_args.kwargs["parent_asset_id"] == asset["id"]
        assert list(tmp_path.iterdir()) == []

@pytest.mark.parametrize("kind", ["image", "video", "audio"])
def test_base64_mode_skips_bucket_by_kind(kind):
    provider = {"media_input_modes": {kind:"base64"}}
    with patch.object(media, "bucket_reference_url") as bucket, patch.object(media, "reference_to_data_url", return_value=f"data:{kind}/test;base64,AA=="):
        assert media.volcengine_media_reference_url("/assets/a", max_image_size=None, provider=provider, kind=kind).startswith("data:")
        bucket.assert_not_called()

def test_modes_do_not_affect_other_media():
    with patch.object(media, "bucket_reference_url", return_value="https://bucket/image"):
        assert media.volcengine_media_reference_url("/assets/a", provider={"media_input_modes":{"audio":"base64"}}, kind="image") == "https://bucket/image"

def test_base64_mode_preserves_verified_asset():
    with patch.object(media, "ensure_volcengine_asset_active", new=AsyncMock(return_value="asset://verified")), patch.object(media, "bucket_reference_url") as bucket:
        assert asyncio.run(media.volcengine_video_media_reference_url("asset://verified", provider={"media_input_modes":{"image":"base64"}})) == "asset://verified"
        bucket.assert_not_called()

def test_video_base64_content():
    value = "data:video/mp4;base64,AA=="
    assert asyncio.run(media.volcengine_video_reference_content_items(value, direct_video=True))[0]["video_url"]["url"] == value

def test_mode_validation():
    from app.providers.registry import normalize_media_input_modes
    assert normalize_media_input_modes(None) == dict(image="url", video="url", audio="url")
    assert normalize_media_input_modes({"video":"base64"})["video"] == "base64"
    for invalid in [{"image":"invalid"}, {"other":"url"}, []]:
        with pytest.raises(ValueError):
            normalize_media_input_modes(invalid)


@pytest.mark.parametrize("mode", ["url", "base64"])
def test_member_image_is_encoded_when_no_public_bucket_is_available(tmp_path, mode):
    import base64
    from io import BytesIO
    from PIL import Image
    path = tmp_path / "reference.png"
    Image.new("RGB", (24, 16), "red").save(path)
    ref = "/api/media/ast_" + "a" * 32 + "/content"
    provider = {"media_input_modes": {"image": mode}}
    with patch.object(media, "volcengine_asset_uri_for_library_url", return_value=""), patch.object(media, "bucket_reference_url", return_value=""), patch.object(media, "output_file_from_url", return_value=str(path)) as resolve:
        result = asyncio.run(media.volcengine_video_media_reference_url(ref, provider=provider))
    resolve.assert_called_once_with(ref)
    header, encoded = result.split(",", 1)
    assert header == "data:image/jpeg;base64"
    with Image.open(BytesIO(base64.b64decode(encoded))) as image:
        assert image.size == (24, 16)


def test_member_image_keeps_public_bucket_url_in_url_mode():
    ref = "/api/media/ast_" + "a" * 32 + "/content"
    with patch.object(media, "bucket_reference_url", return_value="https://bucket/signed"), patch.object(media, "reference_to_data_url") as encode:
        assert media.volcengine_media_reference_url(ref) == "https://bucket/signed"
        encode.assert_not_called()
