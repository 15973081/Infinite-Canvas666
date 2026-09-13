import os
from app.storage.settings import postgres_enabled
import re
import json
import uuid

from fastapi import HTTPException

from app.config import CONVERSATION_DIR
from app.state import CONVERSATION_LOCK
from app.utils import now_ms
from app.storage.workspace import current_workspace


def user_dir(user_id):
    path = os.path.join(CONVERSATION_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path

def conversation_path(user_id, conversation_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return os.path.join(user_dir(user_id), f"{cleaned}.json")

def save_conversation(user_id, conversation):
    if postgres_enabled():
        from app.storage.documents import put
        from app.storage.media import normalize_document
        return put("conversation", user_id + "/" + conversation["id"], normalize_document(conversation))
    with CONVERSATION_LOCK:
        path = conversation_path(user_id, conversation["id"])
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, ensure_ascii=False, indent=2)

def new_conversation(user_id, title="新对话"):
    timestamp = now_ms()
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话")[:80],
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
    }
    save_conversation(user_id, conversation)
    return conversation

def load_conversation(user_id, conversation_id):
    if postgres_enabled():
        from app.storage.documents import get
        value = get("conversation", user_id + "/" + conversation_id)
        if value is None:
            raise HTTPException(404, "对话不存在")
        return value
    path = conversation_path(user_id, conversation_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="对话不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def list_conversations(user_id, limit=100, offset=0):
    if postgres_enabled():
        from app.storage.database import connection
        with connection() as conn:
            return conn.execute("""SELECT value->>'id' AS id, value->>'title' AS title,
                value->'created_at' AS created_at, value->'updated_at' AS updated_at,
                left(coalesce(jsonb_path_query_array(value, '$.messages[*] ? (@.role != "system")')->-1->>'content',''),800) AS last_message
                FROM workspace_documents WHERE workspace_id=%s AND kind='conversation' AND starts_with(id,%s)
                ORDER BY CASE WHEN jsonb_typeof(value->'updated_at')='number' THEN (value->>'updated_at')::numeric ELSE 0 END DESC,id DESC
                LIMIT %s OFFSET %s""", (current_workspace(), user_id + "/", limit, offset)).fetchall()
    records = []
    for filename in os.listdir(user_dir(user_id)):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(user_dir(user_id), filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        messages = data.get("messages", [])
        last_message = next((m for m in reversed(messages) if m.get("role") != "system"), None)
        records.append({
            "id": data.get("id"),
            "title": data.get("title", "新对话"),
            "created_at": data.get("created_at", 0),
            "updated_at": data.get("updated_at", 0),
            "last_message": (last_message or {}).get("content", ""),
        })
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)[offset:offset + limit]


def upstream_message_from_record(item):
    from app.services.media import image_references, reference_to_data_url, attachment_text_blocks
    role = item.get("role")
    if role not in {"user", "assistant"} or item.get("type") == "image":
        return None
    attachments = item.get("attachments") or []
    if attachments and role == "user":
        text = item.get("content", "")
        blocks = attachment_text_blocks(attachments)
        if blocks:
            text = f"{text}\n\n以下是用户上传附件的可读内容，请在回答时参考：\n\n" + "\n\n---\n\n".join(blocks)
        content = [{"type": "text", "text": text}]
        for ref in image_references(attachments)[:4]:
            url = reference_to_data_url(ref)
            if url:
                content.append({"type": "image_url", "image_url": {"url": url}})
        return {"role": role, "content": content}
    return {"role": role, "content": item.get("content", "")}
