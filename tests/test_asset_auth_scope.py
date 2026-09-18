import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from app.models import AssetAvatarRegisterRequest, AssetAvatarBatchRegisterRequest
from app.routers import assets
from app.services import media, provider_control
from app.providers import registry


def registered(status="Active"):
    return {"id":"item", "url":"/assets/library/copied.png", "kind":"image", "registrations":{
        "volcengine":{"status":status, "provider_id":"volcengine", "project_name":"project-a",
                      "asset_uri":"asset://verified", "asset_id":"verified", "task_id":"verified"}}}


def library(item):
    return {"libraries":[{"id":"library","categories":[{"items":[item]}]}]}


@pytest.mark.parametrize("status", ["Active","Processing","Failed","Cancelled"])
@pytest.mark.parametrize("change", ["provider","project"])
def test_cross_scope_register_never_skips_or_overwrites(monkeypatch, status, change):
    item=registered(status); before=deepcopy(item)
    provider={"id":"other" if change=="provider" else "volcengine", "protocol":"volcengine",
              "volcengine_project_name":"project-b" if change=="project" else "project-a"}
    monkeypatch.setattr(assets,"load_asset_library",lambda:library(item))
    monkeypatch.setattr(assets,"find_asset_item_in_library",lambda *args:item)
    monkeypatch.setattr(assets,"get_api_provider_exact",lambda value:provider)
    save=Mock(); monkeypatch.setattr(assets,"save_asset_library",save)
    submit=AsyncMock(); monkeypatch.setattr(assets,"submit_volcengine_avatar_asset",submit)
    request=AssetAvatarRegisterRequest(library_id="library",provider_id=provider["id"])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(assets.register_asset_library_avatar("item",request))
    assert exc.value.status_code==409
    assert item==before
    save.assert_not_called(); submit.assert_not_called()
    batch=asyncio.run(assets.batch_register_asset_library_avatar(AssetAvatarBatchRegisterRequest(**request.model_dump(),ids=["item"])))
    assert batch["submitted"]==0 and batch["failed"]==1 and batch["skipped"]==0
    assert item==before


def test_same_scope_active_registration_is_idempotent(monkeypatch):
    item=registered()
    monkeypatch.setattr(assets,"load_asset_library",lambda:library(item))
    monkeypatch.setattr(assets,"find_asset_item_in_library",lambda *args:item)
    monkeypatch.setattr(assets,"get_api_provider_exact",lambda value:{"id":"volcengine","protocol":"volcengine","volcengine_project_name":"project-a"})
    result=asyncio.run(assets.register_asset_library_avatar("item",AssetAvatarRegisterRequest(library_id="library",provider_id="volcengine")))
    assert result["skipped"] is True


@pytest.mark.parametrize("operation", ["check_asset_library_avatar","cancel_asset_library_avatar"])
def test_status_and_cancel_reject_foreign_project(monkeypatch, operation):
    item=registered("Processing")
    monkeypatch.setattr(assets,"load_asset_library",lambda:library(item))
    monkeypatch.setattr(assets,"find_asset_item_in_library",lambda *args:item)
    monkeypatch.setattr(assets,"get_api_provider_exact",lambda value:{"id":"volcengine","protocol":"volcengine","volcengine_project_name":"project-b"})
    upstream=AsyncMock(); monkeypatch.setattr(assets,"check_volcengine_avatar_task",upstream)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(getattr(assets,operation)("item",AssetAvatarRegisterRequest(library_id="library",provider_id="volcengine")))
    assert exc.value.status_code==409
    upstream.assert_not_called()


def test_failed_status_clears_uri_and_uses_bound_provider(monkeypatch):
    item=registered(); provider={"id":"volcengine","protocol":"volcengine","volcengine_project_name":"project-a"}
    monkeypatch.setattr(assets,"load_asset_library",lambda:library(item))
    monkeypatch.setattr(assets,"find_asset_item_in_library",lambda *args:item)
    monkeypatch.setattr(assets,"get_api_provider_exact",lambda value:provider)
    monkeypatch.setattr(assets,"save_asset_library",Mock())
    upstream=AsyncMock(return_value={"status":"Failed","detail":"rejected"})
    monkeypatch.setattr(assets,"check_volcengine_avatar_task",upstream)
    asyncio.run(assets.check_asset_library_avatar("item",AssetAvatarRegisterRequest(library_id="library",provider_id="volcengine")))
    assert item["registrations"]["volcengine"]["asset_uri"]==""
    upstream.assert_awaited_once_with("verified","project-a",provider=provider)


@pytest.mark.parametrize("status", ["Processing","Failed","Cancelled"])
@pytest.mark.parametrize("value", ["asset://verified","/assets/library/copied.png"])
def test_invalid_registration_never_falls_back_to_raw_media(monkeypatch,status,value):
    item=registered(status); item["registrations"]["volcengine"]["asset_uri"]=""
    monkeypatch.setattr(media,"load_asset_library",lambda:library(item))
    raw=Mock(); monkeypatch.setattr(media,"volcengine_media_reference_url",raw)
    verify=AsyncMock(); monkeypatch.setattr(media,"ensure_volcengine_asset_active",verify)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(media.volcengine_video_media_reference_url(value,"project-a",provider={"id":"volcengine"}))
    assert exc.value.status_code==409
    raw.assert_not_called(); verify.assert_not_called()


def test_scope_is_checked_before_upstream_use(monkeypatch):
    monkeypatch.setattr(media,"load_asset_library",lambda:library(registered()))
    verify=AsyncMock(); monkeypatch.setattr(media,"ensure_volcengine_asset_active",verify)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(media.volcengine_video_media_reference_url("asset://verified","project-b",provider={"id":"volcengine"}))
    assert exc.value.status_code==409; verify.assert_not_called()


def test_valid_asset_has_priority_over_bucket_and_uses_one_library_snapshot(monkeypatch):
    snapshot=library(registered()); provider={"id":"volcengine"}
    load=Mock(side_effect=AssertionError("must reuse snapshot")); monkeypatch.setattr(media,"load_asset_library",load)
    verify=AsyncMock(return_value="asset://verified"); monkeypatch.setattr(media,"ensure_volcengine_asset_active",verify)
    raw=Mock(); monkeypatch.setattr(media,"volcengine_media_reference_url",raw)
    assert asyncio.run(media.volcengine_video_media_reference_url("/assets/library/copied.png","project-a",provider=provider,library=snapshot))=="asset://verified"
    verify.assert_awaited_once_with("asset://verified","project-a",provider=provider)
    raw.assert_not_called(); load.assert_not_called()


def test_asset_check_uses_selected_provider_credentials(monkeypatch):
    monkeypatch.setattr(registry,"managed_providers_enabled",lambda:True)
    credential=Mock(return_value="mock-secret"); monkeypatch.setattr(provider_control,"credential",credential)
    assert registry.volcengine_access_key_value("second")=="mock-secret"
    assert registry.volcengine_secret_key_value("second")=="mock-secret"
    assert [call.args for call in credential.call_args_list]==[("second","volcengine_access_key_id"),("second","volcengine_secret_access_key")]


def test_library_failure_never_degrades_to_raw_media(monkeypatch):
    monkeypatch.setattr(media,"load_asset_library",Mock(side_effect=RuntimeError("unavailable")))
    raw=Mock(); monkeypatch.setattr(media,"volcengine_media_reference_url",raw)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(media.volcengine_video_media_reference_url("/assets/library/copied.png"))
    assert exc.value.status_code==503
    raw.assert_not_called()


def test_get_asset_receives_selected_provider_and_project(monkeypatch):
    class Client:
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
    client=Client(); provider={"id":"second"}
    monkeypatch.setattr(media.httpx,"AsyncClient",lambda **kwargs:client)
    rpc=AsyncMock(return_value={"Status":"Active"}); monkeypatch.setattr(media,"volcengine_ark_asset_call",rpc)
    assert asyncio.run(media.ensure_volcengine_asset_active("asset://verified","project-b",provider))=="asset://verified"
    rpc.assert_awaited_once_with(client,"GetAsset",{"Id":"verified","ProjectName":"project-b"},provider=provider)
