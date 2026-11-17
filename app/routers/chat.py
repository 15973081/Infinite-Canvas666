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


def admit_chat(provider, model, conversation, user_id, messages):
    from contextlib import nullcontext
    from app.storage.database import connection
    from app.storage.settings import postgres_enabled
    from app.services import chat_billing
    with connection() if postgres_enabled() else nullcontext():
        billing = chat_billing.begin(provider, model, conversation, user_id, messages)
        save_conversation(user_id, conversation)
        return billing


def deliver_reply(billing, user_id, conversation, model, content, raw_usage):
    from contextlib import nullcontext
    from app.storage.database import connection
    from app.storage.settings import postgres_enabled
    from app.services import chat_billing
    message = {'id': uuid.uuid4().hex, 'role': 'assistant', 'content': content,
               'created_at': now_ms(), 'model': model, 'raw_usage': raw_usage,
               'chat_call_id': billing['id'], 'cost': chat_billing.calculate(billing['price'], raw_usage, 'succeeded')}
    conversation['messages'].append(message)
    conversation['updated_at'] = now_ms()
    with connection() if postgres_enabled() else nullcontext():
        save_conversation(user_id, conversation)
        chat_billing.finish(billing, raw_usage, 'succeeded', delivered=True)
    return message


def prepare_chat(payload):
    """Resolve the assigned provider and validate before writing conversation history."""
    if payload.provider == 'mediakit' or payload.model == 'video-understand-router':
        raise HTTPException(400, '该模型需通过 MediaKit 视频理解任务接口调用。')
    provider = get_api_provider(payload.provider)
    if provider.get('protocol') == 'mediakit':
        raise HTTPException(400, '该模型需通过 MediaKit 视频理解任务接口调用。')
    model = selected_model(payload.model, preferred_chat_model(provider))
    if managed_providers_enabled():
        from app.services.model_commercial import enforce
        enforce(provider, 'chat', {'model': model})
    base, headers, model = resolve_chat_provider(provider['id'], model)
    return provider, base, headers, model


@router.post('/api/chat/budget')
async def context_budget(payload:ChatRequest,request:Request,x_user_id:str=Header(default='')):
    user_id=safe_user_id(x_user_id,request)
    provider,_,_,model=prepare_chat(payload)
    from app.services.prompt_skills import resolve
    selected=resolve(payload.skill_ids)
    conversation=load_conversation(user_id,payload.conversation_id) if payload.conversation_id else {'messages':[]}
    record={'role':'user','content':payload.message,'skill_refs':selected,
            'attachments':[ref.model_dump() for ref in payload.reference_images if ref.url]}
    messages=[{'role':'system','content':SYSTEM_PROMPT}]
    for item in [*conversation['messages'],record][-MAX_HISTORY_MESSAGES:]:
        message=await asyncio.to_thread(upstream_message_from_record,item)
        if message: messages.append(message)
    from app.services.chat_context_budget import measure
    return JSONResponse(measure(provider,model,messages),headers={'Cache-Control':'private, no-store'})


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
    from app.services.chat_context_budget import enforce
    enforce(_conv_provider,model,upstream_messages)
    from app.services import chat_billing
    billing = await asyncio.to_thread(admit_chat, _conv_provider, model, conversation, user_id, upstream_messages)
    raw_usage, outcome = None, 'uncertain'
    upstream_outcome = None
    try:
        async with asyncio.timeout(AI_REQUEST_TIMEOUT), httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
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
            if not content:
                raise HTTPException(502, '上游返回空回复，积分已退回。')
            upstream_outcome = 'succeeded'
            assistant_message = deliver_reply(billing, user_id, conversation, model, content, raw_usage)
            outcome = 'succeeded'
    except httpx.HTTPStatusError as exc:
        outcome = 'rejected' if exc.response.status_code < 500 else 'uncertain'
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, model, _conv_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    except TimeoutError as exc:
        raise HTTPException(504, '对话超过最大等待时间，积分已退回。') from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail='上游回复格式无效，费用待核对。') from exc
    finally:
        chat_billing.finish(billing, raw_usage, outcome, cost_outcome=upstream_outcome)
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
    from app.services.chat_context_budget import enforce
    enforce(_stream_provider,model,upstream_messages)
    from app.services import chat_billing
    billing = await asyncio.to_thread(admit_chat, _stream_provider, model, conversation, user_id, upstream_messages)
    async def stream():
        content_parts = []
        raw_usage = None
        outcome, completed = 'uncertain', False
        upstream_outcome = None
        try:
            yield sse_event({"type": "meta", "conversation": conversation})
            body = {"model": model, "messages": upstream_messages, "stream": True}
            price = billing['price'] or {}
            if price.get('billing_type') == 'per_million_tokens' and price.get('stream_usage', True) and _stream_provider.get('protocol', 'openai') == 'openai':
                body['stream_options'] = {'include_usage': True}
            async with asyncio.timeout(AI_REQUEST_TIMEOUT), httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
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
            content = ''.join(content_parts).strip()
            if not content:
                yield sse_event({'type': 'error', 'detail': '上游返回空回复，积分已退回。'})
                return
            upstream_outcome = 'succeeded'
            assistant_message = deliver_reply(billing, user_id, conversation, model, content, raw_usage)
            outcome = 'succeeded'
        except httpx.HTTPError as exc:
            log_net_error("对话(流式) 网络/TLS错误", exc)
            yield sse_event({"type": "error", "detail": f"请求上游接口失败：{exc}"})
            return
        except Exception as exc:
            import logging
            logging.exception('Chat reply could not be delivered')
            yield sse_event({'type': 'error', 'detail': '回复未能完整保存，积分将退回。'})
            return
        finally:
            chat_billing.finish(billing, raw_usage, outcome, cost_outcome=upstream_outcome)
        yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

    return StreamingResponse(stream(), media_type="text/event-stream")

