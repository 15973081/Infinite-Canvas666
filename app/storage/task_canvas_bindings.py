"""Immutable task targets and semantic graph fingerprints; never edit a canvas here."""
import copy
import hashlib
import json

from fastapi import HTTPException

# Coordinates, measurement, progress and history are not generation inputs. Keep
# every other field, including unknown future parameters, conservatively bound.
NODE_DISPLAY = frozenset({
    'x', 'y', 'w', 'h', 'width', 'height', 'scale', 'selected', 'expanded', 'collapsed',
    'running', 'queued', 'pending', 'pendingTasks', '_pending', 'runStatus', 'runError',
    '_cascadeIdx', '_cascadeFailed', 'runStartedAt', 'runFinishedAt', 'runElapsedMs',
    'runTimerHidden', 'updated_at',
})
MEDIA_DISPLAY = frozenset({'w', 'h', 'width', 'height', 'preview_url', 'thumbnail', 'thumbnail_url'})
EDGE_DISPLAY = frozenset({'id', 'selected', 'hovered', 'color'})


def invalid(code, status=409):
    raise HTTPException(status, {'code': code})


def digest(value):
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, {'code': 'task_binding_document_invalid'}) from exc
    return hashlib.sha256(encoded).hexdigest()


def node_input(node):
    result = {key: value for key, value in node.items() if key not in NODE_DISPLAY}
    # Preview generation/measurement must not invalidate the original media.
    for key in ('images', 'refs', 'runInputRefs', 'runPromptRefs'):
        values = result.get(key)
        if isinstance(values, list):
            result[key] = [{k: v for k, v in item.items() if k not in MEDIA_DISPLAY}
                           if isinstance(item, dict) else item for item in values]
    return result


def graph_fingerprint(document, source_id, target_id):
    """Bind both nodes and their full upstream graph, with deterministic ordering."""
    raw_nodes, raw_edges = document.get('nodes') or [], document.get('connections') or []
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        invalid('task_binding_document_invalid', 400)
    if len(raw_nodes) > 20000 or len(raw_edges) > 100000:
        invalid('task_binding_graph_too_large', 400)
    nodes = {}
    for node in raw_nodes:
        if not isinstance(node, dict) or not isinstance(node.get('id'), str):
            continue
        if node['id'] in nodes:
            invalid('task_binding_duplicate_node', 400)
        nodes[node['id']] = node
    if source_id not in nodes or target_id not in nodes:
        invalid('task_binding_node_missing')
    incoming = {}
    for edge in raw_edges:
        if isinstance(edge, dict) and isinstance(edge.get('from'), str) and isinstance(edge.get('to'), str):
            incoming.setdefault(edge['to'], []).append(edge)
    visited, edges, pending = set(), [], [source_id, target_id]
    while pending:
        node_id = pending.pop()
        if node_id in visited:
            continue
        if node_id not in nodes:
            invalid('task_binding_node_missing')
        visited.add(node_id)
        node = nodes[node_id]
        if node.get('type') in {'group', 'promptGroup'}:
            pending.extend(item for item in (node.get('items') or []) if isinstance(item, str))
        for position, edge in enumerate(incoming.get(node_id, [])):
            edges.append({'position': position, 'connection': {k: v for k, v in edge.items() if k not in EDGE_DISPLAY}})
            pending.append(edge['from'])
    edges.sort(key=digest)
    return digest({'nodes': [node_input(nodes[key]) for key in sorted(visited)], 'connections': edges,
                   'settings': document.get('settings') or {}})


def capture(canvas, target, request_sha256):
    if not isinstance(target, dict) or set(target) != {'source_node_id', 'target_node_id', 'base_revision'}:
        invalid('task_binding_target_invalid', 400)
    if type(target['base_revision']) is not int or target['base_revision'] != canvas['revision']:
        invalid('task_binding_revision_conflict')
    for key in ('source_node_id', 'target_node_id'):
        if not isinstance(target[key], str) or not target[key].strip() or len(target[key]) > 160:
            invalid('task_binding_target_invalid', 400)
    return {'version': 1, 'canvas_id': canvas['id'], 'canvas_kind': canvas['kind'],
            'source_node_id': target['source_node_id'], 'target_node_id': target['target_node_id'],
            'submitted_revision': canvas['revision'], 'request_sha256': request_sha256,
            'graph_sha256': graph_fingerprint(canvas['document'], target['source_node_id'], target['target_node_id'])}


def stored(request):
    value = (request or {}).get('_canvas_binding')
    return copy.deepcopy(value) if isinstance(value, dict) else None


def state(canvas, binding):
    """Read-only observation, not permission to write or submit a paid request."""
    if not binding:
        return {'state': 'unbound'}
    if binding.get('version') != 1:
        return {'state': 'unsupported'}
    summary = {'source_node_id': binding.get('source_node_id'), 'target_node_id': binding.get('target_node_id'),
               'submitted_revision': binding.get('submitted_revision')}
    if not canvas or canvas.get('deleted_at') or binding.get('canvas_id') != canvas.get('id'):
        return {**summary, 'state': 'missing'}
    try:
        current = graph_fingerprint(canvas['document'], binding['source_node_id'], binding['target_node_id'])
    except (HTTPException, KeyError):
        return {**summary, 'state': 'missing', 'current_revision': canvas['revision']}
    return {**summary, 'state': 'unchanged' if current == binding.get('graph_sha256') and canvas.get('kind') == binding.get('canvas_kind') else 'changed',
            'current_revision': canvas['revision']}
