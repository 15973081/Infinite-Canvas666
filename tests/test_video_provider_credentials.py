"""Video submission and polling must use managed credentials, never host keys."""
import asyncio
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import HTTPException

from app.models import CanvasVideoRequest
from app.providers import registry
from app.routers import canvas
from app.services import media, provider_control


PROVIDER = {
    "id": "volcengine",
    "name": "火山引擎",
    "protocol": "volcengine",
    "base_url": "https://example.invalid",
}
MODEL = "doubao-seedance-2-0-mini-260615"


class SubmissionCaptured(Exception):
    pass


@pytest.fixture
def video_transport(monkeypatch):
    monkeypatch.setattr(registry, "managed_providers_enabled", lambda: True)
    credential = Mock(return_value="managed-test-key")
    monkeypatch.setattr(provider_control, "credential", credential)
    monkeypatch.setattr(canvas, "get_api_provider", lambda _: PROVIDER)
    monkeypatch.setattr(canvas, "video_api_root", lambda _: PROVIDER["base_url"])
    monkeypatch.setattr(canvas, "_volcengine_video_pricing", lambda *args: None)
    monkeypatch.setattr(canvas, "httpx_provider_kwargs", lambda _: {})
    monkeypatch.setattr(canvas, "video_submit_url_candidates", lambda *args: ["https://example.invalid/generate"])
    client = AsyncMock()
    client.__aenter__.return_value = client
    monkeypatch.setattr(canvas.httpx, "AsyncClient", Mock(return_value=client))
    # Stop at the paid transport boundary: these tests never send upstream requests.
    post = AsyncMock(side_effect=SubmissionCaptured)
    monkeypatch.setattr(canvas, "paid_post", post)
    return credential, post, client


def submit():
    return asyncio.run(canvas.canvas_video_impl(CanvasVideoRequest(
        provider_id="volcengine", model=MODEL, prompt="让图片角色动起来",
    )))


@pytest.mark.parametrize("host_key", [None, "obsolete-host-key"])
def test_submission_uses_managed_key_even_without_host_key(monkeypatch, video_transport, host_key):
    if host_key is None:
        monkeypatch.delenv("ARK_API_KEY", raising=False)
    else:
        monkeypatch.setenv("ARK_API_KEY", host_key)
    credential, post, _ = video_transport
    with pytest.raises(SubmissionCaptured):
        submit()
    assert post.await_count == 1
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer managed-test-key"
    assert post.call_args.kwargs["json"]["model"] == MODEL
    assert all(call.args == ("volcengine",) for call in credential.call_args_list)


def test_missing_managed_key_does_not_fall_back_to_host(monkeypatch, video_transport):
    credential, post, _ = video_transport
    credential.return_value = ""
    monkeypatch.setenv("ARK_API_KEY", "must-not-be-used")
    with pytest.raises(HTTPException) as error:
        submit()
    assert error.value.status_code == 400
    assert "API 平台管理" in error.value.detail
    post.assert_not_awaited()


def test_workspace_credential_denial_prevents_submission(video_transport):
    credential, post, _ = video_transport
    credential.side_effect = HTTPException(403, "provider_not_assigned")
    with pytest.raises(HTTPException) as error:
        submit()
    assert error.value.status_code == 403
    assert error.value.detail == "provider_not_assigned"
    post.assert_not_awaited()


def test_polling_refreshes_managed_credentials(monkeypatch, video_transport):
    credential, post, client = video_transport
    monkeypatch.setenv("ARK_API_KEY", "obsolete-host-key")
    credential.side_effect = ["managed-first-key", "managed-rotated-key"]
    monkeypatch.setattr(media.asyncio, "sleep", AsyncMock())
    monkeypatch.setattr(media, "video_api_root", lambda _: PROVIDER["base_url"])
    monkeypatch.setattr(media, "video_task_url_candidates", lambda *args: ["https://example.invalid/task"])
    client.get.side_effect = [
        httpx.Response(200, json={"status": status}, request=httpx.Request("GET", "https://example.invalid/task"))
        for status in ("running", "succeeded")
    ]
    result = asyncio.run(media.wait_for_video_task(client, PROVIDER, "existing-task"))
    assert result["status"] == "succeeded"
    assert [call.kwargs["headers"]["Authorization"] for call in client.get.call_args_list] == [
        "Bearer managed-first-key", "Bearer managed-rotated-key",
    ]
    post.assert_not_awaited()


def test_legacy_environment_key_still_works(monkeypatch, video_transport):
    credential, post, _ = video_transport
    monkeypatch.setattr(registry, "managed_providers_enabled", lambda: False)
    monkeypatch.setenv("ARK_API_KEY", "legacy-test-key")
    with pytest.raises(SubmissionCaptured):
        submit()
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer legacy-test-key"
    credential.assert_not_called()
