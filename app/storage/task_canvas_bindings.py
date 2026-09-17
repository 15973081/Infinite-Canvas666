"""Immutable task targets and semantic graph fingerprints; never edit a canvas here."""
import copy
import hashlib
import json
import math
import re
import struct

from fastapi import HTTPException

# Coordinates, measurement and progress are not generation inputs. Keep
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


def portable_value(value):
    """Tagged JSON tree shared with JS; numbers use their exact binary64 bytes.

    Reject integers JS cannot represent exactly rather than accepting a lossy
    hash. Unicode scalar sorting and explicit tags avoid key/type ambiguity.
    """
    if value is None:
        return ['null']
    if isinstance(value, bool):
        return ['bool', value]
    if isinstance(value, (int, float)):
        if (isinstance(value, int) and abs(value) > 9007199254740991) or not math.isfinite(value) or (value == int(value) and abs(value) > 9007199254740991):
            invalid('task_binding_document_invalid', 400)
        return ['number', struct.pack('>d', 0.0 if value == 0 else float(value)).hex()]
    if isinstance(value, str):
        if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
            invalid('task_binding_document_invalid', 400)
        return ['string', value]
    if isinstance(value, list):
        return ['array', [portable_value(item) for item in value]]
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        return ['object', [[portable_value(key)[1], portable_value(value[key])] for key in sorted(value)]]
    invalid('task_binding_document_invalid', 400)


def portable_digest(value):
    return digest(portable_value(value))


def semantic_media(value):
    """A saved local URL determines its asset ID; the added ID is not an edit."""
    if isinstance(value, list):
        return [semantic_media(item) for item in value]
    if isinstance(value, dict):
        local_url = isinstance(value.get('url'), str) and re.match(r'^/(?:assets/cloud|api/media)/ast_[A-Za-z0-9_-]+(?:/|$)', value['url'])
        return {key: semantic_media(item) for key, item in value.items() if not (key == 'media_asset_id' and local_url)}
    return value


def node_input(node, version=3):
    result = {key: value for key, value in node.items() if key not in NODE_DISPLAY}
    # Preview/view state is presentation only. Preserve legacy v2 fingerprints.
    media_display = MEDIA_DISPLAY | {'viewed'} if version >= 3 else MEDIA_DISPLAY
    for key in ('images', 'refs', 'runInputRefs', 'runPromptRefs'):
        values = result.get(key)
        if isinstance(values, list):
            result[key] = [{k: v for k, v in item.items() if k not in media_display}
                           if isinstance(item, dict) else item for item in values]
    return semantic_media(result) if version >= 3 else result


def graph_fingerprint(document, source_id, target_id, version=3):
    """Bind both nodes and their full upstream graph, with deterministic ordering."""
    if not isinstance(document, dict):
        invalid('task_binding_document_invalid', 400)
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
            items = node.get('items') or []
            if version >= 2 and not isinstance(items, list):
                invalid('task_binding_document_invalid', 400)
            pending.extend(item for item in items if isinstance(item, str))
        for position, edge in enumerate(incoming.get(node_id, [])):
            edges.append({'position': position, 'connection': {k: v for k, v in edge.items() if k not in EDGE_DISPLAY}})
            pending.append(edge['from'])
    if version not in (1, 2, 3):
        invalid('task_binding_version_unsupported', 400)
    edges.sort(key=digest if version == 1 else lambda edge: (edge['connection']['to'], edge['position']))
    encode = digest if version == 1 else portable_digest
    return encode({'nodes': [node_input(nodes[key], version) for key in sorted(visited)], 'connections': edges,
                   'settings': document.get('settings') or {}})


def capture(canvas, target, request_sha256):
    required = {'source_node_id', 'target_node_id', 'base_revision'}
    if not isinstance(target, dict) or not required <= set(target) or set(target) - required - {'input_sha256'}:
        invalid('task_binding_target_invalid', 400)
    if type(target['base_revision']) is not int or target['base_revision'] != canvas['revision']:
        invalid('task_binding_revision_conflict')
    for key in ('source_node_id', 'target_node_id'):
        if not isinstance(target[key], str) or not target[key].strip() or len(target[key]) > 160:
            invalid('task_binding_target_invalid', 400)
    current = graph_fingerprint(canvas['document'], target['source_node_id'], target['target_node_id'])
    expected = target.get('input_sha256')
    if expected is not None and (not isinstance(expected, str) or len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected)):
        invalid('task_binding_target_invalid', 400)
    if expected is not None and expected != current:
        invalid('task_binding_input_conflict')
    return {'version': 3, 'canvas_id': canvas['id'], 'canvas_kind': canvas['kind'],
            'source_node_id': target['source_node_id'], 'target_node_id': target['target_node_id'],
            'submitted_revision': canvas['revision'], 'request_sha256': request_sha256,
            'graph_sha256': current}


def stored(request):
    value = (request or {}).get('_canvas_binding')
    return copy.deepcopy(value) if isinstance(value, dict) else None


def state(canvas, binding):
    """Read-only observation, not permission to write or submit a paid request."""
    if not binding:
        return {'state': 'unbound'}
    if binding.get('version') not in (1, 2, 3):
        return {'state': 'unsupported'}
    summary = {'source_node_id': binding.get('source_node_id'), 'target_node_id': binding.get('target_node_id'),
               'submitted_revision': binding.get('submitted_revision')}
    if not canvas or canvas.get('deleted_at') or binding.get('canvas_id') != canvas.get('id'):
        return {**summary, 'state': 'missing'}
    try:
        current = graph_fingerprint(canvas['document'], binding['source_node_id'], binding['target_node_id'], binding['version'])
    except (HTTPException, KeyError):
        return {**summary, 'state': 'missing', 'current_revision': canvas['revision']}
    return {**summary, 'state': 'unchanged' if current == binding.get('graph_sha256') and canvas.get('kind') == binding.get('canvas_kind') else 'changed',
            'current_revision': canvas['revision']}
