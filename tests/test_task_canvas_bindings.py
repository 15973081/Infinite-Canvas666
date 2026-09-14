"""Semantic task binding rejects changed inputs while tolerating presentation updates."""
import copy
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.storage.task_canvas_bindings import graph_fingerprint, capture, state, stored
from app.models import OnlineImageRequest, CanvasVideoRequest


def document():
    return {'nodes': [{'id': 'prompt', 'type': 'prompt', 'text': 'original'},
                      {'id': 'src', 'type': 'generator', 'model': 'model-a'},
                      {'id': 'out', 'type': 'output', 'images': []}],
            'connections': [{'id': 'e1', 'from': 'prompt', 'to': 'src'}, {'from': 'src', 'to': 'out'}]}


def test_semantic_binding_ignores_layout_progress_previews_and_unrelated_nodes():
    original = document()
    expected = graph_fingerprint(original, 'src', 'out')
    changed = copy.deepcopy(original)
    changed['nodes'][0].update(x=20, y=40, w=100, h=80, running=True, updated_at=22)
    changed['nodes'][2].update(_pending=[{'canvasTaskId': 't'}], pendingTasks=[{'taskId': 't'}], pending=1)
    changed['nodes'].append({'id': 'unrelated', 'text': 'other work'})
    changed['nodes'].reverse()
    changed['connections'][0]['id'] = 'render-id'
    changed.update(viewport={'x': 500}, logs=[{'error': 'runtime only'}])
    assert graph_fingerprint(changed, 'src', 'out') == expected


@pytest.mark.parametrize('change', ['prompt', 'model', 'media', 'generated', 'parameters', 'edges', 'defaults', 'output'])
def test_semantic_binding_changes_for_generation_inputs(change):
    original = document()
    expected = graph_fingerprint(original, 'src', 'out')
    if change == 'prompt': original['nodes'][0]['text'] = 'changed'
    if change == 'model': original['nodes'][1]['model'] = 'model-b'
    if change == 'media': original['nodes'][0].update(type='image', url='/api/media/new/content')
    if change == 'generated': original['nodes'][0]['generatedOutputs'] = ['/new.png']
    if change == 'parameters': original['nodes'][1]['future_parameter'] = {'seed': 4}
    if change == 'edges': original['connections'][0]['from'] = 'out'
    if change == 'defaults': original['settings'] = {'model': 'new-default'}
    if change == 'output': original['nodes'][2]['images'] = [{'url': '/new.png'}]
    assert graph_fingerprint(original, 'src', 'out') != expected


def test_group_members_and_same_target_reference_order_are_bound():
    doc = document()
    doc['nodes'].extend([{'id': 'group', 'type': 'promptGroup', 'items': ['grouped']},
                         {'id': 'grouped', 'type': 'prompt', 'text': 'group text'}])
    doc['connections'].append({'from': 'group', 'to': 'src'})
    expected = graph_fingerprint(doc, 'src', 'out')
    doc['nodes'][-1]['text'] = 'changed group text'
    assert graph_fingerprint(doc, 'src', 'out') != expected
    doc['nodes'][-1]['text'] = 'group text'
    doc['connections'].reverse()
    assert graph_fingerprint(doc, 'src', 'out') != expected


def test_capture_revision_nodes_kind_and_stored_copy_are_authoritative():
    row = {'id': 'c', 'kind': 'classic', 'revision': 2, 'document': document()}
    target = {'source_node_id': 'src', 'target_node_id': 'out', 'base_revision': 2}
    binding = capture(row, target, 'a' * 64)
    assert state(row, binding)['state'] == 'unchanged'
    row['revision'] += 1
    assert state(row, binding)['state'] == 'unchanged'
    row['kind'] = 'smart'
    assert state(row, binding)['state'] == 'changed'
    with pytest.raises(HTTPException, match='task_binding_revision_conflict'):
        capture(row, target, 'a' * 64)
    row['document']['nodes'].pop()
    assert state(row, binding)['state'] == 'missing'
    assert state(None, binding)['state'] == 'missing'
    assert state(row, None)['state'] == 'unbound'
    assert state(row, {'version': 2})['state'] == 'unsupported'
    request = {'_canvas_binding': binding}
    stored(request)['graph_sha256'] = 'forged'
    assert stored(request) == binding


@pytest.mark.parametrize('model', [OnlineImageRequest, CanvasVideoRequest])
def test_request_target_is_bounded_and_rejects_client_fingerprints(model):
    target = {'source_node_id': 'src', 'target_node_id': 'out', 'base_revision': 1}
    assert model(prompt='p', canvas_target=target).canvas_target.base_revision == 1
    for changes in ({'base_revision': True}, {'base_revision': 0}, {'source_node_id': ''}, {'graph_sha256': 'forged'}):
        with pytest.raises(ValidationError): model(prompt='p', canvas_target={**target, **changes})


def test_optional_target_and_server_metadata_preserve_legacy_idempotency():
    from app.storage.tasks import fingerprint
    original = {'prompt': 'p', 'model': 'm'}
    assert fingerprint(original) == fingerprint({**original, 'canvas_target': None})
    assert fingerprint(original) == fingerprint({**original, '_canvas_binding': {'graph_sha256': 'server-only'}})
    target = {'source_node_id': 'src', 'target_node_id': 'out', 'base_revision': 1}
    assert fingerprint(original) != fingerprint({**original, 'canvas_target': target})


def test_legacy_non_object_request_fingerprints_remain_distinct():
    from app.storage.tasks import fingerprint
    values = [None, [], {}, 'legacy request']
    assert len({fingerprint(value) for value in values}) == len(values)
