"""Assigned-provider voice directory, personal favorites and existing audio samples."""
import hashlib
import httpx
from fastapi import HTTPException
from app.services import authorization as az, provider_control
from app.services.member_context import current_access
from app.services.model_commercial import enforce
from app.storage.workspace import current_workspace
from app.storage.media import stable_url
from app.providers.registry import httpx_provider_kwargs
from app.utils import bearer_auth_value


def context(conn, provider_id, model):
    access = current_access.get()
    if not access:
        az.fail('member_required', 401)
    for permission in ('provider.use', 'task.read', 'asset.read'):
        az.require(conn, access.principal, permission, current_workspace())
    row = provider_control.configured(conn, provider_id)
    provider = row['config']
    enforce(provider, 'audio', {'model': model})
    if provider.get('protocol') != 'minimax' or not model.startswith('speech-'):
        az.fail('speech_voice_catalog_not_supported', 400)
    key = provider_control.decrypt(row).get('api_key')
    if not key:
        az.fail('audio_provider_not_configured', 400)
    return provider, key, provider_control.binding(row), access.principal.member_id


def identity(account):
    return hashlib.sha256(account.encode()).hexdigest()


def normalize(value):
    if not isinstance(value, dict) or not isinstance(value.get('base_resp'), dict) or value['base_resp'].get('status_code') != 0:
        raise HTTPException(502, '音色目录暂不可用，请稍后重试')
    result, seen = [], set()
    languages = {'Chinese (Mandarin)': 'Chinese', 'Cantonese': 'Chinese,Yue'}
    for key, category in [('system_voice', 'system'), ('voice_cloning', 'clone'), ('voice_generation', 'clone')]:
        rows = value.get(key) or []
        if not isinstance(rows, list) or len(rows) > 10000:
            raise HTTPException(502, '音色目录格式无效')
        for row in rows:
            if not isinstance(row, dict):
                continue
            voice_id = row.get('voice_id')
            if not isinstance(voice_id, str) or not 1 <= len(voice_id) <= 180 or voice_id in seen:
                continue
            seen.add(voice_id)
            description = row.get('description')
            description = ' · '.join(x for x in description if isinstance(x, str)) if isinstance(description, list) else description if isinstance(description, str) else ''
            prefix = voice_id.split('_', 1)[0] if '_' in voice_id else ''
            # Only explicit provider metadata or known language ID prefixes;
            # never infer gender or age from a name/description.
            language = row.get('language') or languages.get(prefix, prefix if prefix in {'English','Japanese','Korean','Spanish','Portuguese','French','Indonesian','German','Russian','Italian','Arabic','Turkish','Ukrainian','Dutch','Vietnamese','Thai','Polish','Romanian','Greek','Czech','Finnish','Hindi'} else '')
            result.append({'id': voice_id, 'name': str(row.get('voice_name') or voice_id)[:240], 'description': description[:1000], 'category': category,
                           **{key: str(val)[:64] for key, val in {'language': language, 'accent': row.get('accent') or '', 'gender': row.get('gender') or '', 'age': row.get('age_group') or ''}.items()}})
    return result


async def catalog(provider_id, model):
    with az.policy_transaction() as conn:
        provider, key, account, member = context(conn, provider_id, model)
    base = provider['base_url'].rstrip('/')
    try:
        async with httpx.AsyncClient(timeout=20, **httpx_provider_kwargs(provider)) as client:
            # Directory lookup only: never synthesize speech to audition a voice.
            response = await client.post(base + ('/' if base.endswith('/v1') else '/v1/') + 'get_voice',
                                         headers={'Authorization': bearer_auth_value(key)}, json={'voice_type': 'all'})
            response.raise_for_status()
            if len(response.content) > 8 * 1024 * 1024:
                raise HTTPException(502, '音色目录超过大小限制')
            voices = normalize(response.json())
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, '音色目录读取失败，请稍后重试') from None
    with az.policy_transaction() as conn:
        _, _, current, owner = context(conn, provider_id, model)
        if current != account or owner != member:
            az.fail('audio_voice_account_changed', 409)
        favorite = {row['voice_id'] for row in conn.execute('''SELECT voice_id FROM audio_voice_favorites
            WHERE workspace_id=%s AND member_id=%s AND provider_id=%s AND account_ref=%s''', (current_workspace(), member, provider_id, account))}
        samples = conn.execute('''SELECT DISTINCT ON(t.request->>'timbre_id') t.request->>'timbre_id' AS voice_id,a.*
            FROM tasks t JOIN generation_outputs g ON g.task_id=t.id AND g.workspace_id=t.workspace_id AND g.output_index=0
            JOIN assets a ON a.id=g.asset_id AND a.workspace_id=g.workspace_id
            WHERE t.workspace_id=%s AND t.provider_id=%s AND t.provider_account_ref=%s AND t.kind='audio'
              AND t.status='succeeded' AND t.request->>'mode'='speech' AND a.status='ready' AND a.deleted_at IS NULL
              AND coalesce(t.result#>>'{audio_info,muted}','false')<>'true'
            ORDER BY t.request->>'timbre_id',t.completed_at DESC LIMIT 1000''', (current_workspace(), provider_id, account)).fetchall()
        preview = {row['voice_id']: stable_url(row) for row in samples}
    for voice in voices:
        voice['favorite'] = voice['id'] in favorite
        voice['preview_url'] = preview.get(voice['id'], '')
    return {'provider_id': provider_id, 'catalog_id': identity(account), 'voices': voices}


def favorite(payload):
    with az.policy_transaction() as conn:
        _, _, account, member = context(conn, payload.provider_id, payload.model)
        if payload.catalog_id != identity(account):
            az.fail('audio_voice_account_changed', 409)
        args = (current_workspace(), member, payload.provider_id, account, payload.voice_id)
        if payload.favorite:
            conn.execute('''INSERT INTO audio_voice_favorites(workspace_id,member_id,provider_id,account_ref,voice_id)
                VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''', args)
        else:
            conn.execute('''DELETE FROM audio_voice_favorites
                WHERE workspace_id=%s AND member_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s''', args)
    return {'voice_id': payload.voice_id, 'favorite': payload.favorite}
