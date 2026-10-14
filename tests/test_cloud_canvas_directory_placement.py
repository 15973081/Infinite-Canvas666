"""Real database coverage for native mixed file-tree placement."""
import os
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import acquire, proof
from test_cloud_canvas_folder_deletion import setup

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def body(kind, target, placement, source_parent='', target_parent=''):
    return {'target_kind': kind, 'target_id': target, 'placement': placement,
            'source_parent_id': source_parent, 'target_parent_id': target_parent}


def move(world, kind, source, payload, head=None):
    return world['editor'].patch('/api/' + ('canvas-folders' if kind == 'folder' else 'canvases') + '/' + source + '/placement',
                                  headers=head or headers(world['a']), json=payload)


def test_directory_placement_moves_a_whole_folder_preserving_descendant_documents_and_order_after_rename(world):
    root, child, leaf, outside, canvases = setup(world)
    before = [world['editor'].get('/api/canvases/' + item['id'], headers=headers(world['a'])).json()['canvas'] for item in canvases]
    result = move(world, 'folder', root, body('folder', outside, 'into'))
    assert result.status_code == 200, result.text
    assert result.json()['ordering'][outside][-1] == 'folder:' + root
    assert {item['id']: item['parent_id'] for item in result.json()['folders']} == {root: outside, child: root, leaf: child, outside: ''}
    after = [world['editor'].get('/api/canvases/' + item['id'], headers=headers(world['a'])).json()['canvas'] for item in canvases]
    assert before == after
    assert world['editor'].patch('/api/canvas-folders/' + root, headers=headers(world['a']), json={'name': '改名后'}).status_code == 200
    catalog = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
    assert catalog['ordering'][outside][-1] == 'folder:' + root


def test_directory_placement_interleaves_folders_and_canvases_without_rewriting_siblings(world):
    root, child, leaf, outside, canvases = setup(world)
    target = canvases[-1]
    result = move(world, 'folder', child, body('canvas', target['id'], 'above', root, outside))
    assert result.status_code == 200, result.text
    assert result.json()['ordering'][outside] == ['folder:' + child, 'canvas:' + target['id']]
    source = canvases[0]; lease = acquire(world, '/api/canvases/' + source['id'])
    result = move(world, 'canvas', source['id'], body('folder', child, 'below', root, outside), proof(world, lease, source['revision']))
    assert result.status_code == 200, result.text
    assert result.json()['ordering'][outside] == ['folder:' + child, 'canvas:' + source['id'], 'canvas:' + target['id']]
    assert result.json()['canvas']['folder_id'] == outside
    assert result.json()['canvas']['revision'] == source['revision'] + 1
    assert world['editor'].get('/api/canvases/' + target['id'], headers=headers(world['a'])).json()['canvas']['revision'] == target['revision']


@pytest.mark.parametrize('kind,placement', [('folder', 'into'), ('folder', 'above'), ('folder', 'below')])
def test_directory_placement_rejects_a_folder_inside_its_descendants_without_partial_changes(world, kind, placement):
    root, child, leaf, outside, canvases = setup(world)
    before = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
    result = move(world, 'folder', root, body(kind, leaf, placement, '', child))
    assert result.status_code == 400 and result.json()['detail']['code'] == 'directory_placement_cycle', result.text
    assert world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json() == before


def test_directory_placement_rejects_stale_source_target_and_missing_canvas_proofs(world):
    root, child, leaf, outside, canvases = setup(world)
    before = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
    for payload in (body('folder', outside, 'into', root), body('folder', child, 'into', '', outside)):
        result = move(world, 'folder', root, payload)
        assert result.status_code == 409 and result.json()['detail']['code'] == 'directory_target_changed', result.text
    result = move(world, 'canvas', canvases[0]['id'], body('folder', outside, 'into', root))
    assert result.status_code == 428, result.text
    assert world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json() == before


def test_directory_placement_moves_to_root_and_repeated_relative_placement_has_the_same_order(world):
    root, child, leaf, outside, canvases = setup(world)
    result = move(world, 'folder', child, body('root', '', 'into', root))
    assert result.status_code == 200 and result.json()['folder_id'] == '', result.text
    payload = body('folder', root, 'above')
    first = move(world, 'folder', child, payload); second = move(world, 'folder', child, payload)
    assert first.status_code == second.status_code == 200
    assert first.json()['ordering'] == second.json()['ordering']
    assert second.json()['ordering'][''].index('folder:' + child) + 1 == second.json()['ordering'][''].index('folder:' + root)


def test_directory_placement_permissions_and_workspace_boundaries_preserve_the_directory(world):
    root, child, leaf, outside, canvases = setup(world)
    before = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
    for kind, source in [('folder', root), ('canvas', canvases[0]['id'])]:
        path = '/api/' + ('canvas-folders' if kind == 'folder' else 'canvases') + '/' + source + '/placement'
        assert world['viewer'].patch(path, headers=headers(world['a']), json=body('root', '', 'into')).status_code == 403
        assert world['outsider'].patch(path, headers=headers(world['a']), json=body('root', '', 'into')).status_code == 403
    assert world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json() == before


def test_directory_placement_serializes_with_tree_deletion_and_invalidates_its_old_target_plan(world):
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from unittest.mock import patch
    from app.services.canvas_directory_placement import ordering
    from app.services.canvas_folder_deletion import lock
    from test_cloud_canvas_folder_deletion import prepare, request, delete
    root, child, leaf, outside, canvases = setup(world)
    old_plan = request(world, prepare(world, root))
    moving, proceed, deleting = threading.Event(), threading.Event(), threading.Event()
    def paused(conn):
        moving.set()
        assert proceed.wait(10)
        return ordering(conn)
    def observed(conn, exclusive=False):
        if exclusive: deleting.set()
        return lock(conn, exclusive)
    with patch('app.services.canvas_directory_placement.ordering', paused), patch('app.services.canvas_folder_deletion.lock', observed), ThreadPoolExecutor(2) as pool:
        movement = pool.submit(move, world, 'folder', child, body('folder', outside, 'into', root))
        assert moving.wait(10)
        deletion = pool.submit(delete, world, root, old_plan)
        try:
            assert deleting.wait(10)
            assert not deletion.done()
        finally: proceed.set()
        moved, removed = movement.result(timeout=10), deletion.result(timeout=10)
    assert moved.status_code == 200, moved.text
    assert removed.status_code == 409 and removed.json()['detail']['code'] == 'folder_deletion_plan_changed', removed.text
    catalog = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
    assert {item['id']: item['parent_id'] for item in catalog['folders']} == {root: '', child: outside, leaf: child, outside: ''}
    for item in canvases:
        assert world['editor'].get('/api/canvases/' + item['id'], headers=headers(world['a'])).status_code == 200


def test_directory_placement_actual_browser_saves_drags_mixed_siblings_and_reloads_persisted_order(world):
    import json
    import subprocess
    from pathlib import Path
    from app.storage import database
    from app.storage.workspace import workspace_scope
    root, child, leaf, outside, canvases = setup(world)
    item = canvases[0]; path = '/api/canvases/' + item['id']; lease = acquire(world, path)
    saved = world['editor'].put(path, headers=proof(world, lease, item['revision']), json={'nodes': [{'id': 'text', 'type': 'smart-prompt', 'text': '初始文本', 'images': []}], 'connections': [], 'base_revision': item['revision']})
    assert saved.status_code == 200, saved.text
    item = saved.json()['canvas']
    assert world['editor'].post(path + '/edit-lease/release', headers=proof(world, lease, item['revision'])).status_code == 200
    directory = Path(__file__).resolve().parents[1]
    process = subprocess.Popen(['node', str(directory / 'tests/helpers/pixmax-directory-placement-http.cjs')], cwd=directory, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    done, moves = False, []
    try:
        process.stdin.write(json.dumps({'initial': {'canvas': item, 'member': world['people'][0]['id'], 'workspace': world['a']['id'], 'root': root, 'child': child, 'outside': outside}}) + '\n'); process.stdin.flush()
        for line in process.stdout:
            message = json.loads(line)
            if message.get('done'): done = True; break
            response = world['editor'].request(message['method'], message['path'], headers={**message['headers'], **headers(world['a'])}, content=message.get('body'))
            if message['path'].endswith('/placement'):
                assert response.status_code == 200, response.text
                moves.append(response.json())
            process.stdin.write(json.dumps({'id': message['id'], 'status': response.status_code, 'body': response.json()}) + '\n'); process.stdin.flush()
        process.wait(timeout=5)
        assert process.returncode == 0, process.stderr.read()
        assert done and len(moves) == 3
        with workspace_scope(world['a']['id']), database.connection() as conn:
            value = conn.execute('SELECT document FROM canvases WHERE id=%s', (item['id'],)).fetchone()['document']
            assert value['nodes'][0]['text'] == '真实拖放最终保存' and value['folder_id'] == outside
        catalog = world['editor'].get('/api/canvas-folders', headers=headers(world['a'])).json()
        parents = {entry['id']: entry['parent_id'] for entry in catalog['folders']}
        assert parents[root] == parents[child] == outside and parents[leaf] == child
        order = catalog['ordering'][outside]
        assert order.index('folder:' + child) + 1 == order.index('folder:' + root)
        assert order.index('folder:' + root) + 1 == order.index('canvas:' + item['id'])
    finally:
        if process.poll() is None: process.kill(); process.wait(timeout=5)
        for handle in (process.stdin, process.stdout, process.stderr): handle.close()
