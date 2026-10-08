"""Auto-generated router."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse, JSONResponse
from typing import List, Dict, Any, Optional
import json, os, time, re, uuid, shutil, asyncio, httpx, urllib.parse, hashlib, base64
from app.models import *
from app.state import *
from app.config import *
from app.utils import *
from app.providers.registry import *
from app.services.canvas import *
from app.services.assets import *
from app.services.prompt import *
from app.services.media import *
from app.services.chat import *


router = APIRouter()


def prepare_chat(payload):
    """Resolve the assigned provider and validate before writing conversation history."""
    provider = get_api_provider(payload.provider)
    model = selected_model(payload.model, preferred_chat_model(provider))
    if managed_providers_enabled():
        from app.services.model_commercial import enforce
        enforce(provider, 'chat', {'model': model})
    base, headers, model = resolve_chat_provider(provider['id'], model)
    return provider, base, headers, model


@router.post("/api/chat")
async def chat(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    _conv_provider, chat_base, chat_hdrs, model = prepare_chat(payload)
    from app.services.prompt_skills import resolve
    selected_skills = resolve(payload.skill_ids)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message), persist=False)
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    image_refs = image_references(refs)
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
        "skill_refs": selected_skills,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    _conv_is_apimart = is_apimart_provider(_conv_provider)
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history:
        msg = await asyncio.to_thread(upstream_message_from_record, item)
        if msg:
            upstream_messages.append(msg)
    save_conversation(user_id, conversation)
    from app.services import chat_billing
    billing = await asyncio.to_thread(chat_billing.begin, _conv_provider, model, conversation, user_id)
    raw_usage, outcome = None, 'uncertain'
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            conv_req_body = {"model": model, "messages": upstream_messages}
            if _conv_is_apimart:
                conv_req_body["stream"] = False
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json=conv_req_body,
            )
            response.raise_for_status()
            raw = response.json()
            raw_data = unwrap_apimart_response(raw) if isinstance(raw, dict) else raw
            raw_usage = raw_data.get('usage') if isinstance(raw_data, dict) else None
            content = text_from_chat_response(raw).strip()
            if content:
                outcome = 'succeeded'
    except httpx.HTTPStatusError as exc:
        outcome = 'rejected' if exc.response.status_code < 500 else 'uncertain'
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, model, _conv_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail='上游回复格式无效，费用待核对。') from exc
    finally:
        cost = chat_billing.finish(billing, raw_usage, outcome)
    assistant_message = {
        "id": uuid.uuid4().hex,
        "role": "assistant",
        "content": content or "接口返回了空回复。",
        "created_at": now_ms(),
        "model": model,
        "raw_usage": raw_usage,
        "cost": cost,
    }

    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)
    return {"conversation": conversation, "message": assistant_message}

@router.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    _stream_provider, chat_base, chat_hdrs, model = prepare_chat(payload)
    from app.services.prompt_skills import resolve
    selected_skills = resolve(payload.skill_ids)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message), persist=False)
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
        "skill_refs": selected_skills,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history:
        msg = await asyncio.to_thread(upstream_message_from_record, item)
        if msg:
            upstream_messages.append(msg)
    save_conversation(user_id, conversation)

    from app.services import chat_billing
    billing = await asyncio.to_thread(chat_billing.begin, _stream_provider, model, conversation, user_id)
    async def stream():
        content_parts = []
        raw_usage = None
        outcome, completed = 'uncertain', False
        try:
            yield sse_event({"type": "meta", "conversation": conversation})
            body = {"model": model, "messages": upstream_messages, "stream": True}
            price = billing['price'] or {}
            if price.get('billing_type') == 'per_million_tokens' and price.get('stream_usage', True) and _stream_provider.get('protocol', 'openai') == 'openai':
                body['stream_options'] = {'include_usage': True}
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json=body,
                ) as response:
                    if response.status_code >= 400:
                        outcome = 'rejected' if response.status_code < 500 else 'uncertain'
                        detail = await response.aread()
                        body = detail.decode("utf-8", errors="ignore")
                        friendly = friendly_chat_error_detail(body, model, _stream_provider)
                        yield sse_event({"type": "error", "detail": friendly or f"上游接口错误：{body}"})
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            completed = True
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(chunk, dict) and chunk.get("usage"):
                            raw_usage = chunk.get("usage")
                        if isinstance(chunk, dict) and chunk.get('error'):
                            yield sse_event({'type': 'error', 'detail': '上游流式回复失败，费用待核对。'})
                            return
                        if isinstance(chunk, dict) and any(c.get('finish_reason') is not None for c in chunk.get('choices', []) if isinstance(c, dict)):
                            completed = True
                        delta = text_delta_from_chat_chunk(chunk)
                        if delta:
                            content_parts.append(delta)
                            yield sse_event({"type": "delta", "delta": delta})
            if not completed:
                yield sse_event({'type': 'error', 'detail': '回复连接中断，费用待核对；未自动重试。'})
                return
            if ''.join(content_parts).strip():
                outcome = 'succeeded'
        except httpx.HTTPError as exc:
            log_net_error("对话(流式) 网络/TLS错误", exc)
            yield sse_event({"type": "error", "detail": f"请求上游接口失败：{exc}"})
            return
        finally:
            cost = chat_billing.finish(billing, raw_usage, outcome)

        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": "".join(content_parts).strip() or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw_usage,
            "cost": cost,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        save_conversation(user_id, conversation)
        yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

    return StreamingResponse(stream(), media_type="text/event-stream")

