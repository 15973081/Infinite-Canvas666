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
    assert state(row, {'version': 99})['state'] == 'unsupported'
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


def test_v1_persisted_bindings_remain_readable_after_v2_upgrade():
    row = {'id': 'c', 'kind': 'classic', 'revision': 2, 'document': document()}
    binding = {'version': 1, 'canvas_id': 'c', 'canvas_kind': 'classic', 'source_node_id': 'src',
               'target_node_id': 'out', 'submitted_revision': 1,
               'graph_sha256': graph_fingerprint(row['document'], 'src', 'out', version=1)}
    assert binding['graph_sha256'] != graph_fingerprint(row['document'], 'src', 'out')
    assert state(row, binding)['state'] == 'unchanged'
    row['document']['nodes'][0]['text'] = 'changed after upgrade'
    assert state(row, binding)['state'] == 'changed'


def test_client_input_digest_is_an_expectation_not_authority():
    row = {'id': 'c', 'kind': 'smart', 'revision': 2, 'document': document()}
    target = {'source_node_id': 'src', 'target_node_id': 'out', 'base_revision': 2,
              'input_sha256': graph_fingerprint(row['document'], 'src', 'out')}
    assert capture(row, target, 'a' * 64)['version'] == 3
    row['document']['nodes'][0]['text'] = 'server has different input at same revision'
    with pytest.raises(HTTPException, match='task_binding_input_conflict'):
        capture(row, target, 'a' * 64)
    for invalid in ('forged', 'A' * 64, 1, False):
        with pytest.raises(HTTPException): capture(row, {**target, 'input_sha256': invalid}, 'a' * 64)


@pytest.mark.parametrize('model', [OnlineImageRequest, CanvasVideoRequest])
def test_client_input_digest_validation_and_optional_idempotency(model):
    from app.storage.tasks import fingerprint
    target = {'source_node_id': 'src', 'target_node_id': 'out', 'base_revision': 1}
    original = model(prompt='p', canvas_target=target).model_dump()
    absent = copy.deepcopy(original)
    absent['canvas_target'].pop('input_sha256')
    assert fingerprint(original) == fingerprint(absent)
    for digest in ('a' * 63, 'a' * 65, 'A' * 64, 'a' * 64 + '\n', 1):
        with pytest.raises(ValidationError): model(prompt='p', canvas_target={**target, 'input_sha256': digest})
    bound = model(prompt='p', canvas_target={**target, 'input_sha256': 'a' * 64}).model_dump()
    assert fingerprint(original) != fingerprint(bound)


def test_portable_number_types_unicode_and_shared_golden_vectors():
    import json
    from pathlib import Path
    from app.storage.task_canvas_bindings import portable_digest, portable_value
    cases = json.loads((Path(__file__).parent / 'fixtures/task-input-bindings-v2.json').read_text(encoding='utf-8'))
    for case in cases['values']:
        assert portable_digest(case['value']) == case['sha256'], case['name']
    for case in cases['graphs']:
        assert graph_fingerprint(case['document'], case['source'], case['target']) == case['sha256'], case['name']
        assert graph_fingerprint(case['document'], case['source'], case['target'], version=1) == case['legacy_v1_sha256'], case['name']
        row = {'id': 'old', 'kind': 'classic', 'revision': 7, 'document': case['document']}
        binding = {'version': 1, 'canvas_id': 'old', 'canvas_kind': 'classic', 'source_node_id': case['source'],
                   'target_node_id': case['target'], 'submitted_revision': 2, 'graph_sha256': case['legacy_v1_sha256']}
        assert state(row, binding)['state'] == 'unchanged'
    assert portable_value(1.0) == portable_value(1) == ['number', '3ff0000000000000']
    assert portable_value(-0.0) == portable_value(0)
    assert portable_digest({'\U00010000': 1, '\ue000': 2}) == portable_digest({'\ue000': 2, '\U00010000': 1})
    assert len({portable_digest(value) for value in (None, False, 0, '0', [], {})}) == 6


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf'), 9007199254740992,
                                   -9007199254740992, '\ud800', {'\udfff': 'bad'}, {1: 'not a JSON key'}])
def test_portable_fingerprint_rejects_lossy_or_invalid_values(value):
    from app.storage.task_canvas_bindings import portable_digest
    with pytest.raises(HTTPException): portable_digest(value)


def test_v3_ignores_only_asset_ids_derived_from_local_urls_and_keeps_v2_readable():
    doc = document()
    doc['nodes'][2]['images'] = [{'url': '/assets/cloud/ast_result/one.png', 'run': {'refs': [{'url': '/api/media/ast_ref/content'}]}}]
    before = graph_fingerprint(doc, 'src', 'out')
    old_v2 = graph_fingerprint(doc, 'src', 'out', version=2)
    doc['nodes'][2]['images'][0]['media_asset_id'] = 'ast_result'
    doc['nodes'][2]['images'][0]['run']['refs'][0]['media_asset_id'] = 'ast_ref'
    assert graph_fingerprint(doc, 'src', 'out') == before
    assert graph_fingerprint(doc, 'src', 'out', version=2) != old_v2
    old_binding = {'version': 2, 'canvas_id': 'c', 'canvas_kind': 'classic', 'source_node_id': 'src', 'target_node_id': 'out',
                   'graph_sha256': graph_fingerprint(doc, 'src', 'out', version=2)}
    assert state({'id': 'c', 'kind': 'classic', 'revision': 2, 'document': doc}, old_binding)['state'] == 'unchanged'
    doc['nodes'][2]['images'][0]['url'] = '/assets/cloud/ast_new/two.png'
    assert graph_fingerprint(doc, 'src', 'out') != before
    for item in ({'media_asset_id': 'ast_only'}, {'url': 'https://provider.test/image', 'media_asset_id': 'ast_external'}):
        doc['nodes'][2]['images'] = [item]
        first = graph_fingerprint(doc, 'src', 'out')
        item['media_asset_id'] += '_different'
        assert graph_fingerprint(doc, 'src', 'out') != first
