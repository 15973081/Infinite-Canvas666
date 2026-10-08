"""Server-owned context budgets; byte upper bound rather than claimed exact tokens."""
import os
from fastapi import HTTPException


def normalize_limits(value):
    if not isinstance(value,dict) or len(value)>500:
        raise ValueError('invalid chat context limits')
    if any(not isinstance(model,str) or not model.strip() or len(model)>180 or
           type(limit) is not int or not 1024<=limit<=50_000_000 for model,limit in value.items()):
        raise ValueError('invalid chat context limits')
    return dict(value)


def measure(provider,model,messages):
    configured=(provider.get('chat_context_limits') or {}).get(model)
    limit=configured or max(1024,int(os.getenv('CHAT_DEFAULT_CONTEXT_TOKENS','131072')))
    reserve=min(limit//4,max(0,int(os.getenv('CHAT_OUTPUT_RESERVE_TOKENS','4096'))))
    image_tokens=max(1,int(os.getenv('CHAT_IMAGE_ESTIMATE_TOKENS','16384')))
    # UTF-8 bytes conservatively bound byte-level text tokenizers. Images and
    # protocol framing remain estimates, so provider-side rejection is possible.
    text_bytes=0;images=0
    for message in messages:
        content=message.get('content') or ''
        if isinstance(content,str): text_bytes+=len(content.encode('utf-8'))
        elif isinstance(content,list):
            for part in content:
                if part.get('type')=='text': text_bytes+=len((part.get('text') or '').encode('utf-8'))
                elif part.get('type')=='image_url': images+=1
    estimated=text_bytes+64*len(messages)+256+images*image_tokens
    return {'estimated_input_tokens':estimated,'reserved_output_tokens':reserve,'context_tokens':limit,
            'remaining_tokens':max(0,limit-reserve-estimated),'over_limit':estimated+reserve>limit,
            'source':'model_config' if configured else 'platform_default',
            'method':'utf8_byte_upper_bound_with_image_estimate','image_count':images}


def enforce(provider,model,messages):
    budget=measure(provider,model,messages)
    if budget['over_limit']:
        raise HTTPException(413,{'code':'chat_context_over_limit','message':
            f"上下文保守估算 {budget['estimated_input_tokens']:,} token，加上回复预留超过 {budget['context_tokens']:,} 的上限。请减少 Skill、选择附件区域、开启新对话或切换更大容量模型。",
            'budget':budget})
    return budget
