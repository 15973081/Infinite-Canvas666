"""Expand a version-bound graph delta before the existing canvas save checks."""
import copy
import json

from fastapi import HTTPException
from app.models import CanvasSaveRequest


def expand_canvas_delta(canvas, payload):
    delta = payload.graph_delta
    if delta is None:
        return payload
    if {'nodes', 'connections'} & payload.model_fields_set:
        raise HTTPException(400, '不能同时提交完整画布和增量')
    # This baseline is independent of the lease's latest revision. A queued
    # request must never apply an old diff to a newer document unknowingly.
    if (delta.base_updated_at != canvas.get('updated_at') or
            delta.base_revision != canvas.get('revision')):
        raise HTTPException(409, {'code': 'canvas_delta_conflict',
                                 'message': '增量基准已变化，请重新加载后合并', 'canvas': canvas})

    def invalid():
        raise HTTPException(400, '画布增量格式或节点关系不一致')

    def node_map(items):
        result = {}
        for item in items:
            key = item.get('id')
            if not isinstance(key, str) or not key or key in result:
                invalid()
            result[key] = item
        return result

    nodes = node_map(canvas.get('nodes') or [])
    created, updated = node_map(delta.create), node_map(delta.update)
    removed = set(delta.delete)
    if (len(removed) != len(delta.delete) or removed & (created.keys() | updated.keys()) or
            created.keys() & (nodes.keys() | updated.keys()) or
            not updated.keys() <= nodes.keys() or not removed <= nodes.keys()):
        invalid()
    nodes = {key: value for key, value in nodes.items() if key not in removed}
    nodes.update(updated)
    nodes.update(created)
    if delta.node_order is not None:
        if len(delta.node_order) != len(nodes) or set(delta.node_order) != nodes.keys():
            invalid()
        nodes = {key: nodes[key] for key in delta.node_order}

    def edge_key(edge):
        # JSON parsed by JavaScript writes 1.0 back as 1. They represent the
        # same connection metadata and must match for removal/reordering.
        def normalize(value):
            if isinstance(value, float) and value.is_integer():
                return int(value)
            if isinstance(value, dict):
                return {key: normalize(item) for key, item in value.items()}
            if isinstance(value, list):
                return [normalize(item) for item in value]
            return value
        return json.dumps(normalize(edge), sort_keys=True, ensure_ascii=False, separators=(',', ':'))

    def edge_map(items):
        result = {edge_key(item): item for item in items}
        if len(result) != len(items):
            invalid()
        return result

    edges = edge_map(canvas.get('connections') or [])
    added, deleted = edge_map(delta.connections_add), edge_map(delta.connections_remove)
    if not deleted.keys() <= edges.keys():
        invalid()
    edges = {key: value for key, value in edges.items() if key not in deleted}
    if added.keys() & edges.keys():
        invalid()
    # Validate newly introduced connections; unchanged legacy edges are kept.
    for edge in added.values():
        if any(not isinstance(edge.get(key), str) or edge[key] not in nodes for key in ('from', 'to')):
            invalid()
    edges.update(added)
    if any(isinstance(edge.get(key), str) and edge[key] in removed for edge in edges.values() for key in ('from', 'to')):
        invalid()
    if delta.connections_order is not None:
        ordered = edge_map(delta.connections_order)
        if ordered.keys() != edges.keys():
            invalid()
        edges = ordered

    fields = CanvasSaveRequest.model_fields.keys() - {'graph_delta'}
    document = copy.deepcopy({key: value for key, value in canvas.items() if key in fields})
    document.update(payload.model_dump(exclude_unset=True, exclude={'graph_delta'}))
    document.update(nodes=list(nodes.values()), connections=list(edges.values()))
    return CanvasSaveRequest.model_validate(document)
