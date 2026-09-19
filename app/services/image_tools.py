"""Workspace-managed image transformations using the ordinary image task pipeline."""
from copy import deepcopy
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az, provider_control
from app.services.model_commercial import enforce
from app.storage.workspace import current_workspace

RATIOS = ('1:1', '2:1', '16:9', '9:16', '4:3', '3:4')
RESOLUTIONS = {'1k': 1024, '2k': 2048, '4k': 4096}
PROMPTS = {
    'panorama': 'Based on the reference image, generate a seamless 360-degree equirectangular panorama. Preserve the scene, visual style and main subjects. Extend the surroundings coherently in all directions; align the left and right edges seamlessly. Keep the horizon level and use spherical panorama projection. No text, frames or watermarks.',
    'depth': 'Convert the reference image into a clean grayscale relative depth map. Preserve the exact composition, silhouettes and object boundaries. Near surfaces are white, distant surfaces are black, with smooth grayscale transitions for intermediate depth. Remove color, texture, lighting and shadows. Output only the depth map, without labels, legends or borders.',
}


def defaults():
    return {kind: {'enabled': False, 'provider_id': '', 'model': '', 'ratio': '2:1' if kind == 'panorama' else '1:1',
                   'resolution': '2k', 'quality': 'auto', 'prompt': prompt} for kind, prompt in PROMPTS.items()}


def size(config):
    w, h = map(int, config['ratio'].split(':'))
    edge = RESOLUTIONS[config['resolution']]
    return f'{round(edge*w/max(w,h))}x{round(edge*h/max(w,h))}'


def normalize(value):
    if not isinstance(value, dict) or set(value) != set(PROMPTS):
        raise HTTPException(400, '请分别配置全景图和深度图。')
    result = deepcopy(value)
    for config in result.values():
        if not isinstance(config, dict) or set(config) != {'enabled','provider_id','model','ratio','resolution','quality','prompt'}:
            raise HTTPException(400, '图片工具配置字段不完整。')
        if (type(config['enabled']) is not bool or any(not isinstance(config[k], str) for k in config if k != 'enabled') or
                config['ratio'] not in RATIOS or config['resolution'] not in RESOLUTIONS or
                config['quality'] not in ('auto','low','medium','high') or not 1 <= len(config['prompt'].strip()) <= 8000 or
                len(config['provider_id']) > 80 or len(config['model']) > 180):
            raise HTTPException(400, '请检查模型、比例、清晰度和提示词。')
        if config['enabled'] and (not config['provider_id'] or not config['model']):
            raise HTTPException(400, '启用前请选择供应商和图片模型。')
        config['prompt'] = config['prompt'].strip()
    return result


def read(conn, workspace):
    row = conn.execute("SELECT value,revision FROM workspace_documents WHERE workspace_id=%s AND kind='image-tools' AND id='default'", (workspace,)).fetchone()
    return {'config': row['value'] if row else defaults(), 'revision': row['revision'] if row else 0}


def available_provider(conn, workspace, config):
    row = conn.execute("""SELECT p.config FROM managed_providers p JOIN workspace_provider_grants g ON g.provider_id=p.id
        WHERE g.workspace_id=%s AND p.id=%s AND p.config->>'enabled'='true'""", (workspace, config['provider_id'])).fetchone()
    if not row or provider_control.retired(config['provider_id']):
        raise HTTPException(400, '工具供应商未启用或未分配到此空间，请在管理平台配置。')
    enforce(row['config'], 'image', {'model': config['model'], 'size': size(config)})
    return row['config']


def management(actor, workspace, *, config=None, expected_revision=None, reason=''):
    with az.policy_transaction(change=config is not None) as conn:
        provider_control.require_admin(conn, actor)
        az.require(conn, actor, 'canvas.read', workspace)
        if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND status='active'", (workspace,)).fetchone():
            az.fail('workspace_unavailable')
        current = read(conn, workspace)
        if config is not None:
            if not reason.strip():
                raise HTTPException(400, '请填写修改原因。')
            if expected_revision != current['revision']:
                raise HTTPException(409, '图片工具配置已变更，请刷新后重新编辑。')
            clean = normalize(config)
            for item in clean.values():
                if item['enabled']: available_provider(conn, workspace, item)
            conn.execute("""INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'image-tools','default',%s)
                ON CONFLICT(workspace_id,kind,id) DO UPDATE SET value=excluded.value,revision=workspace_documents.revision+1,updated_at=now()""", (workspace, Jsonb(clean)))
            az.audit(conn, actor, 'image_tools.configure', 'image-tools', workspace,
                     {'revision': current['revision']+1, 'reason': reason.strip(), 'config': clean})
            current = read(conn, workspace)
        providers = conn.execute("""SELECT p.id,p.config FROM managed_providers p JOIN workspace_provider_grants g ON g.provider_id=p.id
            WHERE g.workspace_id=%s AND p.config->>'enabled'='true' ORDER BY p.id""", (workspace,)).fetchall()
        return {**current, 'providers': [{'id': p['id'], 'name': p['config'].get('name', p['id']), 'models': p['config'].get('image_models', [])}
                                       for p in providers if not provider_control.retired(p['id'])], 'ratios': RATIOS}


def catalog():
    from app.storage.settings import postgres_enabled
    if not postgres_enabled():
        raise HTTPException(400, '图片工具需要成员空间及管理平台配置。')
    with az.policy_transaction() as conn:
        current = read(conn, current_workspace())
        result = {}
        for kind, item in current['config'].items():
            value = {**item, 'size': size(item), 'unavailable_reason': ''}
            if item['enabled']:
                try: available_provider(conn, current_workspace(), item)
                except HTTPException as error:
                    value.update(enabled=False, unavailable_reason=str(error.detail))
            else: value['unavailable_reason'] = '此工具尚未在管理平台启用。'
            result[kind] = value
        return {'revision': current['revision'], 'tools': result}


def apply(payload):
    """Freeze authoritative parameters BEFORE pricing/enqueueing; worker uses that snapshot."""
    from app.storage.settings import postgres_enabled
    if not postgres_enabled():
        raise HTTPException(400, '图片工具需要成员空间及管理平台配置。')
    if not payload.canvas_id or len(payload.reference_images) != 1:
        raise HTTPException(400, '请选择画布中的一张图片。')
    with az.policy_transaction() as conn:
        current = read(conn, current_workspace())
        if payload.image_tool_revision != current['revision']:
            raise HTTPException(409, '图片工具配置已更新，请重新打开工具后生成。')
        config = current['config'][payload.image_tool]
        if not config['enabled']: raise HTTPException(400, '此工具尚未在管理平台启用。')
        available_provider(conn, current_workspace(), config)
        from app.storage import media
        asset = media.get_asset(payload.reference_images[0].url)
        if not asset or asset['kind'] != 'image':
            raise HTTPException(400, '参考素材必须是当前空间中可读取的图片。')
        payload.provider_id, payload.model = config['provider_id'], config['model']
        payload.prompt, payload.size, payload.quality, payload.n = config['prompt'], size(config), config['quality'], 1
