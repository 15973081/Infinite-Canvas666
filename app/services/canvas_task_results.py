"""Recover independently persisted task outputs without overwriting generation targets."""
import copy
import hashlib
import math
import logging
from psycopg.types.json import Jsonb

from app.services import authorization as az
from app.services.canvas_leases import canvas_row, request_write, event
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.storage import media, canvases
from app.storage.workspace import current_workspace

PERMISSIONS = ('canvas.read', 'task.read', 'asset.read')


def apply_delivery(document, delivery):
    """Append trusted server output only; never replace prompts or reference media."""
    task_id, result_node = delivery['task_id'], delivery['node']
    nodes = document.setdefault('nodes', [])
    items = result_node.get('images') or [{'kind': 'text', 'text': result_node.get('text', '')}]
    if not delivery_present(document, delivery):
        target = next((n for n in nodes if n.get('id') == delivery.get('target_id') and
                       n.get('type') in {'output', 'smart-image'}), None)
        if target is not None and result_node.get('images'):
            existing = {media.id_from_ref(item) for node in nodes for item in (node.get('images') or [])}
            target['images'] = [*(target.get('images') or []),
                                *(copy.deepcopy(item) for item in items if item['media_asset_id'] not in existing)]
        else:
            # The original target can be deleted or become a different node type.
            # A deterministic fallback makes repeated worker completion idempotent.
            fallback = copy.deepcopy(result_node)
            taken = {node.get('id') for node in nodes}
            suffix = 1
            while fallback['id'] in taken:
                suffix += 1
                fallback['id'] = result_node['id'] + '_' + str(suffix)
            nodes.append(fallback)
    for node in nodes:
        if isinstance(node.get('_pending'), list):
            node['_pending'] = [p for p in node['_pending'] if not isinstance(p, dict) or p.get('canvasTaskId') != task_id]
        if isinstance(node.get('pendingTasks'), list):
            node['pendingTasks'] = [p for p in node['pendingTasks'] if not isinstance(p, dict) or p.get('taskId') != task_id]
            node['pending'] = len(node['pendingTasks'])
            if not node['pending']:
                node['running'] = False


def pending_ids(document):
    return {str(item.get(key)) for node in (document.get('nodes') or [])
            for field, key in (('_pending', 'canvasTaskId'), ('pendingTasks', 'taskId'))
            for item in (node.get(field) or []) if isinstance(item, dict) and item.get(key)}


def delivery_present(document, delivery):
    node = delivery['node']
    if not node.get('images'):
        return included(document, delivery['task_id'], [{'kind': 'text', 'text': node.get('text', '')}])
    actual = {media.id_from_ref(item) for n in (document.get('nodes') or []) for item in (n.get('images') or [])}
    return {item['media_asset_id'] for item in node['images']} <= actual


def deliver_completed(conn, task_id, *, only_pending=False):
    """Part of the worker's success transaction, independent of a browser lease.

    Result delivery has its own version. It does not advance the editor's revision:
    a subsequent stale editor save must merge the unseen deliveries under the same
    canvas row lock instead of either losing outputs or rejecting the user's draft.
    """
    workspace = current_workspace()
    task = conn.execute('SELECT * FROM tasks WHERE workspace_id=%s AND id=%s', (workspace, task_id)).fetchone()
    if not task or task['status'] != 'succeeded' or not task['canvas_id'] or task['kind'] not in {'online-image', 'video', 'llm'}:
        return False
    canvas = conn.execute('SELECT * FROM canvases WHERE workspace_id=%s AND id=%s FOR UPDATE', (workspace, task['canvas_id'])).fetchone()
    if not canvas:
        return False
    document = copy.deepcopy(canvas['document'])
    if only_pending and (canvas['deleted_at'] or task_id not in pending_ids(document)):
        return False
    registry = document.setdefault('_task_results', {'version': 0, 'entries': {}})
    if task_id in registry['entries']:
        return False
    items = outputs(conn, task)
    if not items:
        if only_pending:
            return False  # Historical remote/missing assets need separate repair.
        raise ValueError('Successful task outputs are not ready for canvas delivery')
    request = task.get('request') or {}
    binding = request.get('_canvas_binding') or {}
    if binding and (binding.get('canvas_id') != canvas['id'] or binding.get('canvas_kind') != canvas['kind']):
        raise ValueError('Task result canvas binding mismatch')
    for item in items:
        item['run'] = {'canvasTaskId': task_id, 'prompt': request.get('prompt') or request.get('message') or '',
                       'providerId': task.get('provider_id'), 'model': task.get('model')}
        if task.get('created_at') and task.get('completed_at'):
            elapsed = (task['completed_at'] - task['created_at']).total_seconds()
            if elapsed > 0:
                item['runMs'] = round(elapsed * 1000)
    nodes = document.get('nodes') or []
    right = max((float(n.get('x', 0)) for n in nodes if isinstance(n.get('x', 0), (int, float)) and math.isfinite(n.get('x', 0))), default=0)
    node = {'id': 'task_result_' + hashlib.sha256(task_id.encode()).hexdigest()[:32],
            'type': 'smart-image' if canvas['kind'] == 'smart' else 'output',
            'x': min(100000, right + 360), 'y': 120, 'images': items,
            'title': '生成结果', 'result_task_id': task_id, 'outputKind': 'video' if task['kind'] == 'video' else 'image'}
    if task['kind'] == 'llm':
        node.update(type='smart-prompt' if canvas['kind'] == 'smart' else 'prompt', text=items[0]['text'])
        node.pop('images')
    registry['version'] += 1
    delivery = {'task_id': task_id, 'version': registry['version'], 'target_id': binding.get('target_node_id'), 'node': node}
    registry['entries'][task_id] = delivery
    apply_delivery(document, delivery)
    conn.execute('UPDATE canvases SET document=%s WHERE workspace_id=%s AND id=%s', (Jsonb(document), workspace, canvas['id']))
    ids = sorted(media.referenced_ids({k: v for k, v in document.items() if k != '_task_results'}))
    if ids:
        conn.execute('INSERT INTO canvas_assets(workspace_id,canvas_id,asset_id) SELECT %s,%s,unnest(%s::text[]) ON CONFLICT DO NOTHING', (workspace, canvas['id'], ids))
    from app.storage.canvas_asset_groups import save_group
    save_group(conn, canvases._document({**canvas, 'document': document}))
    return True


def merge_unseen_deliveries(document, stored_document, seen_version):
    registry = copy.deepcopy(stored_document.get('_task_results') or {'version': 0, 'entries': {}})
    if not isinstance(seen_version, int) or not 0 <= seen_version <= registry['version']:
        az.fail('task_result_version_invalid', 409)
    for delivery in registry['entries'].values():
        if delivery['version'] > seen_version and delivery_present(stored_document, delivery):
            apply_delivery(document, delivery)
    # This section is server-owned; discard any browser/import-supplied registry.
    if registry['entries']:
        document['_task_results'] = registry
    else:
        document.pop('_task_results', None)


def deliveries(canvas_id, after_version):
    """Authorized read of server deliveries; never reacquire an editing lease."""
    with az.policy_transaction() as conn:
        canvas = require(conn, canvas_id)
        registry = canvas['document'].get('_task_results') or {'version': 0, 'entries': {}}
        if not 0 <= after_version <= registry['version']:
            az.fail('task_result_version_invalid', 409)
        result = []
        for delivery in registry['entries'].values():
            if delivery['version'] <= after_version:
                continue
            # A user who has already seen and removed a result owns that deletion.
            if delivery_present(canvas['document'], delivery):
                result.append(delivery)
        return {'canvas_id': canvas_id, 'result_version': registry['version'], 'deliveries': result}


def reconcile_pending(after='', limit=20):
    """Worker sweep for old completed placeholders, never deleted historical outputs.

    Scan a bounded page; reread pending identity under the delivery row lock so a
    concurrent intentional deletion cannot cause an old result to be resurrected.
    """
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    with connection() as conn:
        rows = conn.execute("""SELECT id,workspace_id,document FROM canvases
            WHERE id>%s AND deleted_at IS NULL AND
            (document @? '$.nodes[*]._pending[*]' OR document @? '$.nodes[*].pendingTasks[*]')
            ORDER BY id LIMIT %s""", (after, limit)).fetchall()
    for canvas in rows:
        with workspace_scope(canvas['workspace_id']):
            for task_id in sorted(pending_ids(canvas['document'])):
                try:
                    with connection() as conn:
                        deliver_completed(conn, task_id, only_pending=True)
                except Exception:
                    logging.exception('Canvas result reconciliation failed: %s / %s', canvas['id'], task_id)
    return rows[-1]['id'] if len(rows) == limit else ''


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
