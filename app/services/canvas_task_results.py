"""Recover independently persisted task outputs without overwriting generation targets."""
import copy
import hashlib
import math

from app.services import authorization as az
from app.services.canvas_leases import canvas_row, request_write, event
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.storage import media, canvases
from app.storage.workspace import current_workspace

PERMISSIONS = ('canvas.read', 'task.read', 'asset.read')


def require(conn, canvas_id, write=False):
    access = current_access.get()
    if access is None or access.principal.audience != 'workbench':
        az.fail('workbench_session_required')
    for action in PERMISSIONS:
        az.require(conn, access.principal, action, current_workspace())
    if write:
        return request_write(conn, canvas_id, operation='write', include_document=True)
    ensure(conn, current_workspace(), 'read')
    row = canvas_row(conn, current_workspace(), canvas_id)
    if row['deleted_at']:
        az.fail('canvas_not_found', 404)
    return row


def outputs(conn, task):
    result = task.get('result') or {}
    if not isinstance(result, dict):
        return []
    if task['kind'] == 'llm':
        text = result.get('text')
        return [{'kind': 'text', 'text': text}] if isinstance(text, str) and text else []
    values = result.get('videos' if task['kind'] == 'video' else 'images') or []
    if not isinstance(values, list) or not values or len(values) > 100:
        return []
    ids = [media.id_from_ref(item) for item in values]
    if not all(ids):
        return []  # Unmigrated/remote results remain in the task for review.
    assets = {a['id']: a for a in conn.execute("SELECT * FROM assets WHERE workspace_id=%s AND id=ANY(%s) AND status='ready' AND deleted_at IS NULL AND role<>'task-result-source' ORDER BY id FOR SHARE", (current_workspace(), ids))}
    if any(asset_id not in assets for asset_id in ids):
        return []
    return [{'media_asset_id': aid, 'url': media.stable_url(assets[aid]),
             'name': assets[aid]['display_name'], 'kind': assets[aid]['kind'], 'generatedResult': True}
            for aid in dict.fromkeys(ids)]


def included(document, task_id, items):
    if not items:
        return False
    if items[0].get('kind') == 'text':
        return any(node.get('result_task_id') == task_id and
                   node.get('text' if node.get('type') in {'prompt', 'smart-prompt'} else 'outputText') == items[0]['text']
                   for node in (document.get('nodes') or []))
    wanted = {item['media_asset_id'] for item in items}
    nodes = document.get('nodes') or []
    def images(node):
        values = node.get('images')
        return values if isinstance(values, list) else []
    def ids(node):
        return {media.id_from_ref(item) for item in images(node)}
    for node in nodes:
        if node.get('result_task_id') == task_id and wanted <= ids(node):
            return True
        matched = [item for item in images(node) if isinstance(item, dict)
                   and isinstance(item.get('run'), dict) and item['run'].get('canvasTaskId') == task_id]
        if wanted <= {media.id_from_ref(item) for item in matched}:
            return True
    # Smart media omit generation metadata; match a successful log AND its actual media.
    logged = any(log.get('canvas_task_id') == task_id and not log.get('error') for log in (document.get('logs') or []) if isinstance(log, dict))
    return logged and wanted <= set().union(*(ids(node) for node in nodes))


def catalog(canvas_id, after=''):
    if len(after) > 160:
        az.fail('task_result_cursor_invalid', 400)
    with az.policy_transaction() as conn:
        canvas = require(conn, canvas_id)
        rows = conn.execute("SELECT id,kind,model,provider_id,result,canvas_revision,canvas_edit_generation,completed_at,request FROM tasks WHERE workspace_id=%s AND canvas_id=%s AND status='succeeded' AND kind IN ('video','online-image','llm') AND (%s='' OR id<%s) ORDER BY id DESC LIMIT 31", (current_workspace(), canvas_id, after, after)).fetchall()
        from app.storage.task_canvas_bindings import stored, state
        result = []
        for task in rows[:30]:
            items = outputs(conn, task)
            result.append({'id': task['id'], 'kind': task['kind'], 'model': task['model'],
                           'completed_at': task['completed_at'].isoformat() if task['completed_at'] else None,
                           'state': 'in_canvas' if included(canvas['document'], task['id'], items) else 'ready' if items else 'unavailable',
                           'outputs': items, 'submitted_revision': task['canvas_revision'],
                           'binding': state(canvas, stored(task['request']))})
        return {'canvas_id': canvas_id, 'revision': canvas['revision'], 'results': result,
                'next_after': rows[29]['id'] if len(rows) > 30 else None}


def join(canvas_id, task_id):
    with az.policy_transaction() as conn:
        canvas, lease = require(conn, canvas_id, True)
        if canvas['deleted_at']:
            az.fail('canvas_not_found', 404)
        task = conn.execute("SELECT * FROM tasks WHERE workspace_id=%s AND canvas_id=%s AND id=%s FOR SHARE", (current_workspace(), canvas_id, task_id)).fetchone()
        if not task:
            az.fail('task_result_not_found', 404)
        if task['status'] != 'succeeded' or task['kind'] not in {'video', 'online-image', 'llm'}:
            az.fail('task_result_not_ready', 409)
        items = outputs(conn, task)
        if not items:
            az.fail('task_result_assets_unavailable', 409)
        document = canvases._document(canvas)
        if included(document, task_id, items):
            return {'canvas': document, 'already_in_canvas': True}
        # Identity is derived from the persisted task; neither request nodes nor a
        # browser-supplied result can authorize a write to an old generation target.
        node_id = 'task_result_' + hashlib.sha256(task_id.encode()).hexdigest()[:32]
        if any(node.get('id') == node_id for node in document.get('nodes', [])):
            az.fail('task_result_node_conflict', 409)
        nodes = copy.deepcopy(document.get('nodes') or [])
        def right(node):
            x = node.get('x', 0)
            return float(x) if isinstance(x, (int, float)) and math.isfinite(x) else 0
        x = min(100000, max((right(node) for node in nodes), default=0) + 360)
        node = {'id': node_id, 'type': 'smart-image' if canvas['kind'] == 'smart' else 'output',
                'x': x, 'y': 120, 'images': items, 'result_task_id': task_id,
                'title': '生成结果', 'outputKind': 'video' if task['kind'] == 'video' else 'image'}
        if task['kind'] == 'llm':
            node = {'id': node_id, 'type': 'smart-prompt' if canvas['kind'] == 'smart' else 'prompt',
                    'x': x, 'y': 120, 'text': items[0]['text'], 'result_task_id': task_id, 'title': '对话生成结果'}
        # Only remove this task's stale progress indicator; other tasks and graph data stay intact.
        for old in nodes:
            if isinstance(old.get('_pending'), list):
                old['_pending'] = [p for p in old['_pending'] if not isinstance(p, dict) or p.get('canvasTaskId') != task_id]
            if isinstance(old.get('pendingTasks'), list):
                old['pendingTasks'] = [p for p in old['pendingTasks'] if not isinstance(p, dict) or p.get('taskId') != task_id]
                old['pending'] = len(old['pendingTasks'])
        nodes.append(node)
        document['nodes'] = nodes
        canvases.save(document)
        event(conn, current_access.get().principal, lease, 'task.result.join', lease['generation'], document['revision'], '加入已完成任务结果：' + task_id)
        return {'canvas': document, 'already_in_canvas': False}
