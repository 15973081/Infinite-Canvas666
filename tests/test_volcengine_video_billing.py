import asyncio
from copy import deepcopy
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.volcengine_billing import pricing_context, video_accounting, timestamp_ms, VERIFIED_FROM
from app.providers.registry import merge_model_price_history, normalize_model_prices


PROVIDER = {"id": "volcengine", "protocol": "volcengine", "base_url": "https://ark.cn-beijing.volces.com/api/v3"}
MODEL = "doubao-seedance-2-5-260628"
NOW = timestamp_ms("2026-09-09T12:00:00+08:00")


def response(model=MODEL, tokens=108900, resolution="720p"):
    return {"id": "upstream-test", "status": "succeeded", "model": model,
            "usage": {"completion_tokens": tokens, "total_tokens": tokens, "extra": {"retained": True}},
            "resolution": resolution, "duration": 5, "ratio": "16:9", "framespersecond": 24,
            "content": {"video_url": "https://example.invalid/video.mp4"}}


def custom_price(model=MODEL, resolution="720p", has_video=False, price="10.1234567"):
    return dict(kind="video", model=model, billing_type="per_million_tokens", resolution=resolution,
                has_video_input=has_video, service_tier="default", unit_price=price,
                currency="CNY", effective_from=NOW-1, effective_to=0)


class VolcengineAccountingTests(unittest.TestCase):
    def calculate(self, raw=None, request=None, provider=None, at=NOW):
        provider = provider or PROVIDER
        return video_accounting(raw or response(), request or {"model": MODEL, "duration": -1},
                                provider, pricing_context(provider, at))

    def test_models_use_different_rates_and_preserve_usage_and_actual_spec(self):
        result = self.calculate()
        self.assertEqual(result["cost"]["amount_micros"], 7623000)
        self.assertEqual(result["video_info"]["duration"], 5)
        self.assertEqual(result["video_info"]["requested_duration"], -1)
        self.assertTrue(result["usage"]["extra"]["retained"])
        result20 = self.calculate(response(model="doubao-seedance-2-0-260128"))
        self.assertEqual(result20["cost"]["unit_price"], "46")

    def test_reference_video_uses_returned_minimum_tokens_without_recalculation(self):
        result = self.calculate(request={"model": MODEL, "videos": ["asset://video"]})
        self.assertEqual(result["cost"]["quantity"], 108900)
        self.assertEqual(result["cost"]["unit_price"], "42")
        self.assertTrue(result["video_info"]["has_video_input"])

    def test_discount_boundary_and_frozen_price_snapshot(self):
        end = timestamp_ms("2026-09-17T14:00:00+08:00")
        before = self.calculate(response(resolution="1080p"), at=end-1)
        after = self.calculate(response(resolution="1080p"), at=end)
        self.assertEqual(before["cost"]["unit_price"], "55.44")
        self.assertEqual(after["cost"]["unit_price"], "77")
        self.assertEqual(before["cost"]["price_effective_to"], end)

    def test_missing_and_malformed_usage_are_unknown_not_zero_or_seconds(self):
        for value in (None, "100", -1, True, 1.5):
            with self.subTest(value=value):
                raw = response(tokens=value)
                raw["usage"]["total_tokens"] = 1000
                result = self.calculate(raw)
                self.assertEqual(result["cost"]["reason"], "missing_usage")
                self.assertNotIn("amount_micros", result["cost"])
        self.assertEqual(self.calculate(response(tokens=0))["cost"]["amount_micros"], 0)

    def test_unknown_resolution_model_tier_and_preverification_date_stay_unknown(self):
        for raw in (response(resolution=""), response(model="unknown-model"),
                    {**response(), "service_tier": "flex"}):
            self.assertEqual(self.calculate(raw)["cost"]["status"], "unknown")
        self.assertEqual(self.calculate(at=VERIFIED_FROM-1)["cost"]["status"], "unknown")

    def test_reseller_does_not_inherit_official_rates_but_can_configure_tokens(self):
        provider = {**PROVIDER, "base_url": "https://example.invalid/video"}
        self.assertEqual(self.calculate(provider=provider)["cost"]["status"], "unknown")
        provider["model_prices"] = [custom_price(price="1.25")]
        self.assertEqual(self.calculate(provider=provider)["cost"]["amount_micros"], 136125)

    def test_custom_price_precision_and_snapshot_survive_setting_changes(self):
        provider = {**PROVIDER, "model_prices": [custom_price()]}
        context = pricing_context(provider, NOW)
        provider["model_prices"][0]["unit_price"] = "999"
        result = video_accounting(response(tokens=3), {"model": MODEL}, provider, context)
        self.assertEqual(result["cost"]["amount_micros"], 30)
        self.assertEqual(result["cost"]["unit_price"], "10.1234567")
        context["custom_prices"][0]["unit_price"] = "777"
        self.assertEqual(result["cost"]["price_snapshot"]["unit_price"], "10.1234567")

    def test_endpoint_alias_uses_actual_model_and_nested_usage_is_preserved(self):
        raw = response()
        result = self.calculate({"data": raw}, {"model": "ep-test"})
        self.assertEqual(result["cost"]["model"], MODEL)
        self.assertEqual(result["video_info"]["requested_model"], "ep-test")
        self.assertEqual(result["usage"], raw["usage"])

    def test_all_dimensions_survive_normalization_and_independent_history_updates(self):
        rows = [custom_price(), custom_price(has_video=True), custom_price(resolution="1080p")]
        self.assertEqual(len(normalize_model_prices(rows)), 3)
        desired = deepcopy(rows)
        desired[0]["unit_price"] = "20"
        merged = merge_model_price_history(rows, desired, effective_at=NOW)
        self.assertEqual(len(merged), 4)
        self.assertEqual(len([r for r in merged if not r["effective_to"]]), 3)
        closed = next(r for r in merged if r["effective_to"])
        self.assertEqual(closed["unit_price"], "10.1234567")
        self.assertEqual(closed["effective_to"], NOW)

    def test_free_price_is_valid_and_new_token_price_is_not_retroactive(self):
        row = custom_price(price="0")
        self.assertEqual(normalize_model_prices([row])[0]["unit_price"], "0")
        self.assertEqual(merge_model_price_history([], [row], NOW)[0]["effective_from"], NOW)
        legacy = dict(kind="video", model="other", billing_type="per_second", unit_price="1")
        self.assertEqual(merge_model_price_history([], [legacy], NOW)[0]["effective_from"], NOW)
        for invalid in (None, "", " ", False):
            self.assertEqual(normalize_model_prices([custom_price(price=invalid)]), [])


class VolcengineTaskPersistenceTests(unittest.TestCase):
    def test_download_failure_keeps_accounting_and_restart_does_not_poll_or_reprice(self):
        from app.models import CanvasVideoRequest
        from app.routers import canvas
        from app.services import canvas_tasks
        task_id = "canvas_vid_billing_test"
        payload = CanvasVideoRequest(client_task_id=task_id, prompt="test", provider_id="volcengine", model=MODEL)
        context = pricing_context(PROVIDER, NOW)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CANVAS_TASK_DB_PATH": str(Path(directory)/"tasks.db")}):
            canvas_tasks.save_canvas_task({"id":task_id, "type":"video", "status":"polling", "created_at":NOW/1000,
                "upstream_task_id":"upstream-test", "video_pricing":context}, payload.model_dump())
            try:
                with patch.object(canvas, "save_remote_video_to_output", AsyncMock(side_effect=RuntimeError("download failed"))):
                    with self.assertRaises(RuntimeError):
                        asyncio.run(canvas._finish_canvas_video(payload, PROVIDER, response(), "upstream-test", context))
                stored = canvas_tasks.get_canvas_task(task_id)
                self.assertEqual(stored["result"]["usage"]["completion_tokens"], 108900)
                self.assertEqual(stored["result"]["cost"]["amount_micros"], 7623000)
                self.assertEqual(stored["upstream_status"], "succeeded")
                canvas.CANVAS_TASKS.pop(task_id, None)
                changed = {**PROVIDER, "model_prices": [custom_price(price="999")]}
                with patch.object(canvas, "get_api_provider", return_value=changed), \
                        patch.object(canvas, "save_remote_video_to_output", AsyncMock(return_value="/output/test.mp4")), \
                        patch.object(canvas, "wait_for_video_task", AsyncMock(side_effect=AssertionError("must reuse saved result"))):
                    asyncio.run(canvas.resume_canvas_video_task(task_id, payload))
                stored = canvas_tasks.get_canvas_task(task_id)
                self.assertEqual(stored["status"], "succeeded")
                self.assertEqual(stored["result"]["videos"], ["/output/test.mp4"])
                self.assertEqual(stored["result"]["cost"]["amount_micros"], 7623000)
            finally:
                canvas.CANVAS_TASKS.pop(task_id, None)


if __name__ == "__main__":
    unittest.main()
