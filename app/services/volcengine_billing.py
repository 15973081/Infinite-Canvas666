"""Ark video usage accounting. Prices are CNY per million completion tokens."""
from copy import deepcopy
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
import time
from urllib.parse import urlparse


PRICE_SOURCE = "https://www.volcengine.com/docs/82379/1544106"
PRICE_VERSION = "volcengine-video-2026-09-09"


def timestamp_ms(value):
    return int(datetime.fromisoformat(value).timestamp() * 1000)


VERIFIED_FROM = timestamp_ms("2026-09-09T00:00:00+08:00")


def model_family(model):
    value = str(model or "").lower().replace(".", "-")
    match = re.fullmatch(r"(?:doubao-)?seedance-(2-5|2-0)(-fast|-mini)?(?:-\d{6})?", value)
    return "seedance-" + match[1] + (match[2] or "") if match else ""


def official_ark(provider):
    host = urlparse(provider.get("base_url") or "").hostname or ""
    return host in {"ark.cn-beijing.volces.com", "ark.cn-shanghai.volces.com"}


def official_video_prices():
    # Verified on 2026-09-09. Never apply this catalog retroactively to older tasks.
    rates = {
        "seedance-2-5": {"480p": (70, 42), "720p": (70, 42), "1080p": (77, 46)},
        "seedance-2-0": {"480p": (46, 28), "720p": (46, 28), "1080p": (51, 31), "4k": (26, 16)},
        "seedance-2-0-fast": {"480p": (37, 22), "720p": (37, 22)},
        "seedance-2-0-mini": {"480p": (23, 14), "720p": (23, 14)},
    }
    rows = []
    for model, resolutions in rates.items():
        for resolution, prices in resolutions.items():
            for has_video, price in enumerate(prices):
                row = dict(kind="video", model=model, resolution=resolution,
                           has_video_input=bool(has_video), service_tier="default",
                           billing_type="per_million_tokens", unit_price=str(price),
                           currency="CNY", effective_from=VERIFIED_FROM, effective_to=0,
                           price_version=PRICE_VERSION, price_source=PRICE_SOURCE)
                discount, end = None, None
                if model == "seedance-2-5" and resolution == "1080p":
                    discount, end = "0.72", "2026-09-17T14:00:00+08:00"
                elif model in {"seedance-2-0-fast", "seedance-2-0-mini"}:
                    discount = "0.75" if model.endswith("fast") else "0.4"
                    end = "2026-10-07T14:00:00+08:00"
                if discount:
                    end_ms = timestamp_ms(end)
                    rows.append({**row, "unit_price": str(Decimal(price) * Decimal(discount)),
                                 "list_price": str(price), "discount": discount, "effective_to": end_ms})
                    row["effective_from"] = end_ms
                rows.append(row)
    return rows


def pricing_context(provider, at_ms=None):
    return {"at": int(at_ms if at_ms is not None else time.time() * 1000),
            "custom_prices": deepcopy(provider.get("model_prices") or []),
            "official_prices": official_video_prices() if official_ark(provider) else [],
            "discounts": deepcopy(provider.get("model_discounts") or []),
            "version": PRICE_VERSION}


def _active(row, at):
    return int(row.get("effective_from") or 0) <= at and (
        not row.get("effective_to") or at < int(row["effective_to"]))


def _valid_tokens(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def video_accounting(raw, request, provider, context):
    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    usage = deepcopy(data.get("usage")) if isinstance(data.get("usage"), dict) else {}
    info = {key: deepcopy(data[key]) for key in (
        "model", "resolution", "ratio", "duration", "frames", "framespersecond", "width", "height",
        "generate_audio", "service_tier", "seed", "draft", "created_at", "updated_at", "output_format"
    ) if key in data}
    info.update(requested_model=request.get("model", ""), provider_id=provider["id"],
                has_video_input=any(bool(v) for v in request.get("videos", [])),
                requested_resolution=request.get("resolution", ""),
                requested_duration=request.get("duration"),
                task_id=data.get("id") or data.get("task_id") or "")
    model = info.get("model") or info["requested_model"]
    cost = {"status": "unknown", "source": "actual", "billing_source": "volcengine_usage",
            "kind": "video", "providerId": provider["id"], "model": model,
            "billing_type": "per_million_tokens", "currency": "CNY", "price_basis_at": context["at"],
            "usage_field": "usage.completion_tokens", "reason": "missing_usage"}
    tokens = usage.get("completion_tokens")
    if not _valid_tokens(tokens):
        return {"usage": usage, "video_info": info, "cost": cost}
    cost["quantity"] = tokens
    resolution = str(info.get("resolution") or "").lower()
    tier = str(info.get("service_tier") or "default")
    if not resolution:
        cost["reason"] = "missing_video_spec"
        return {"usage": usage, "video_info": info, "cost": cost}
    def matches(row, official=False):
        return (row.get("kind") == "video" and row.get("billing_type") == "per_million_tokens"
                and (row.get("model") == model_family(model) if official else row.get("model") in {model, info["requested_model"]})
                and row.get("resolution") == resolution
                and row.get("has_video_input") is info["has_video_input"]
                and row.get("service_tier", "default") == tier
                and _active(row, context["at"]))
    custom = [r for r in context["custom_prices"] if matches(r)]
    official = [r for r in context["official_prices"] if matches(r, True)]
    candidates = custom or official
    if not candidates:
        cost["reason"] = "missing_price"
        return {"usage": usage, "video_info": info, "cost": cost}
    price = max(candidates, key=lambda r: int(r.get("effective_from") or 0))
    from app.services.model_commercial import attach_discount, amounts
    price = attach_discount(price, {"model_discounts": context.get("discounts", [])}, "video", info["requested_model"], context["at"])
    try:
        unit_price = Decimal(str(price["unit_price"]))
        if not unit_price.is_finite() or unit_price < 0:
            raise ValueError("invalid price")
        # CNY / 1M tokens × tokens × 1M micros / CNY: only round the final amount.
        breakdown = amounts(unit_price * tokens, price)
        amount = breakdown["amount_micros"]
    except (InvalidOperation, ValueError, OverflowError):
        cost["reason"] = "invalid_price"
        return {"usage": usage, "video_info": info, "cost": cost}
    cost.update(breakdown)
    cost["resolution"] = resolution
    cost.update(status="priced", reason="", unit_price=str(unit_price), amount_micros=amount,
                price_effective_from=price.get("effective_from", 0),
                price_effective_to=price.get("effective_to", 0),
                price_source="custom" if custom else PRICE_SOURCE,
                price_version=price.get("price_version", "custom"), price_snapshot=deepcopy(price))
    return {"usage": usage, "video_info": info, "cost": cost}
