"""Paginated generated assets; history never submits or restores a generation task."""
import base64
import json
import math
from datetime import datetime
from fastapi import HTTPException
from app.services import authorization as az
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.storage import media
from app.storage.workspace import current_workspace

PERMISSIONS = ('canvas.read', 'task.read', 'asset.read')
KIND = "CASE WHEN t.kind='model' THEN 'model' WHEN a.kind IN ('image','video','audio') THEN a.kind ELSE 'file' END"


def access(conn, canvas_id):
    actor = current_access.get()
    if actor is None or actor.principal.audience != 'workbench':
        az.fail('workbench_session_required')
    for action in PERMISSIONS:
        az.require(conn, actor.principal, action, current_workspace())
    ensure(conn, current_workspace(), 'read')
    if canvas_id:
        from app.services.canvas_leases import canvas_row
        if canvas_row(conn, current_workspace(), canvas_id)['deleted_at']:
            az.fail('canvas_not_found', 404)


def clauses(canvas_id, kind):
    values = ["t.workspace_id=%s", "t.canvas_id IS NOT NULL", "t.status='succeeded'", "t.kind IN ('online-image','video','audio','model')",
              "a.status='ready'", "a.deleted_at IS NULL", "a.role<>'task-result-source'", "NOT (a.metadata ? 'chat_owner')"]
    args = [current_workspace()]
    if canvas_id:
        values.append('t.canvas_id=%s'); args.append(canvas_id)
    if kind != 'all':
        values.append(KIND + '=%s'); args.append(kind)
    return values, args


def query(values):
    return """SELECT DISTINCT ON(a.id) a.*,t.id AS task_id,t.canvas_id,t.model,t.request,t.provider_id,
        """ + KIND + """ AS history_kind FROM tasks t
        CROSS JOIN LATERAL jsonb_array_elements_text(t.output_asset_ids) output(asset_id)
        JOIN assets a ON a.workspace_id=t.workspace_id AND a.id=output.asset_id
        WHERE """ + ' AND '.join(values) + ' ORDER BY a.id,t.created_at DESC,t.id DESC'


def item(row):
    metadata = row.get('metadata') or {}
    value = {'id': row['id'], 'url': media.stable_url(row), 'name': row['display_name'], 'kind': row['history_kind'],
             'created_at': row['created_at'].isoformat(), 'task_id': row['task_id'], 'canvas_id': row['canvas_id'], 'model': row['model']}
    for target, keys in [('natural_w', ('width', 'natural_w')), ('natural_h', ('height', 'natural_h')), ('duration', ('duration',))]:
        number = next((metadata[key] for key in keys if isinstance(metadata.get(key), (int, float)) and not isinstance(metadata.get(key), bool)), None)
        if number is not None and math.isfinite(number) and number > 0:
            value[target] = number
    return value


def page(canvas_id='', kind='all', cursor='', limit=100):
    if kind not in {'all', 'image', 'video', 'audio', 'model', 'file'} or not 1 <= limit <= 100:
        raise HTTPException(400, '无效的历史筛选或分页大小')
    values, args = clauses(canvas_id, kind)
    if cursor:
        try:
            if len(cursor) > 2048: raise ValueError()
            workspace, scope, media_kind, stamp, asset_id = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            after = datetime.fromisoformat(stamp)
            if workspace != current_workspace() or scope != canvas_id or media_kind != kind or after.tzinfo is None or not media.ASSET_ID.fullmatch(asset_id):
                raise ValueError()
        except (ValueError, TypeError, UnicodeError):
            raise HTTPException(400, '无效的历史分页游标') from None
        values.append('(a.created_at,a.id)<(%s,%s)');args.extend([after, asset_id])
    with az.policy_transaction() as conn:
        access(conn, canvas_id)
        rows = conn.execute('SELECT * FROM (' + query(values) + ') generated ORDER BY created_at DESC,id DESC LIMIT %s', (*args, limit + 1)).fetchall()
    more = len(rows) > limit; rows = rows[:limit]; next_cursor = None
    if more:
        last = rows[-1]
        next_cursor = base64.urlsafe_b64encode(json.dumps([current_workspace(), canvas_id, kind, last['created_at'].isoformat(), last['id']]).encode()).decode()
    return {'items': [item(row) for row in rows], 'next_cursor': next_cursor}


def detail(asset_id, canvas_id=''):
    values, args = clauses(canvas_id, 'all'); values.append('a.id=%s');args.append(asset_id)
    with az.policy_transaction() as conn:
        access(conn, canvas_id)
        row = conn.execute(query(values), args).fetchone()
    if not row:
        raise HTTPException(404, '生成素材不存在或已删除')
    request = row.get('request') or {}
    return {'item': item(row), 'parameters': {key: request[key] for key in
            ('prompt', 'model', 'size', 'quality', 'duration', 'resolution', 'aspect_ratio', 'mode', 'generate_type', 'music_mode') if key in request}}
