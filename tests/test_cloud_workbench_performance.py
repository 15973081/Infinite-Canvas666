"""Real PostgreSQL regression gates for large canvases and scoped batching."""
import os
import uuid
from unittest.mock import patch

import pytest
import psycopg

from test_cloud_member_gateway import operator, world, headers

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def test_large_member_save_batches_refs_and_preserves_lease_snapshot(world, tmp_path):
    from app.storage import database, media
    from app.storage.workspace import workspace_scope
    client, space = world['editor'], world['a']
    with workspace_scope(space['id']), media.operation_scope():
        source = tmp_path/'fixture.bin'
        source.write_bytes(b'isolated test fixture')
        template = media.publish(source)
        ids = ['ast_' + uuid.uuid4().hex for _ in range(300)]
        with database.connection() as conn:
            conn.execute('''INSERT INTO assets(id,workspace_id,role,kind,status,display_name,bucket,region,
                object_key,object_version_id,size_bytes,sha256,content_type)
                SELECT ref,%s,'original','image','ready','fixture.png',bucket,region,ref,object_version_id,
                    size_bytes,sha256,content_type FROM assets CROSS JOIN unnest(%s::text[]) AS ref WHERE id=%s''',
                (space['id'],ids,template['id']))
            conn.execute('''INSERT INTO asset_aliases(workspace_id,source_namespace,legacy_ref,asset_id)
                SELECT %s,'local','/assets/input/'||ref||'.png',ref FROM unnest(%s::text[]) AS ref''', (space['id'],ids))
    created = client.post('/api/canvases',headers=headers(space),json={'title':'large fixture','kind':'smart'})
    assert created.status_code == 200
    cid = created.json()['canvas']['id']
    path = '/api/canvases/'+cid
    lease = client.post(path+'/edit-lease/acquire',headers=headers(space),json={}).json()
    proof = {**headers(space),'X-Canvas-Edit-Token':lease['edit_token'],
             'X-Canvas-Generation':str(lease['generation']),'X-Canvas-Revision':str(lease['revision'])}
    nodes = [{'id':str(i),'type':'image','url':'/assets/input/'+aid+'.png'} for i,aid in enumerate(ids*3)]
    executed = []
    original = psycopg.Connection.execute
    def count(conn, query, *args, **kwargs):
        executed.append(str(query))
        return original(conn,query,*args,**kwargs)
    with patch.object(psycopg.Connection,'execute',count):
        saved = client.put(path,headers=proof,json={'base_revision':lease['revision'],'nodes':nodes,
                                                    'connections':[],'title':'large fixture'})
    assert saved.status_code == 200, saved.text
    value = saved.json()['canvas']
    assert len(value['nodes']) == 900
    assert all(n['url'].startswith('/assets/cloud/') for n in value['nodes'])
    assert sum('SELECT * FROM assets' in q for q in executed) == 1
    assert sum('INSERT INTO canvas_assets' in q for q in executed) == 1
    assert sum('SELECT legacy_ref,asset_id FROM asset_aliases' in q for q in executed) == 1
    assert len(executed) < 150  # Guard against authorization/query count growing with every node.
    with workspace_scope(space['id']),database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM canvas_assets WHERE canvas_id=%s',(cid,)).fetchone()['n'] == 300
    proof['X-Canvas-Revision'] = str(value['revision'])
    assert client.post(path+'/backup',headers=proof).status_code == 200
    backups = client.get(path+'/backups',headers=headers(space)).json()['backups']
    assert len(backups) == 1 and backups[0]['node_count'] == 900 and backups[0]['size'] > 0
    with patch.object(psycopg.Connection,'execute',count):
        executed.clear()
        assert client.get(path+'/edit-lease',headers=headers(space)).status_code == 200
    assert not any('SELECT * FROM canvases' in q for q in executed)
    assert client.post(path+'/edit-lease/release',headers=proof).status_code == 200
    with workspace_scope(space['id']),database.connection() as conn:
        snapshot = conn.execute('SELECT document FROM canvas_release_snapshots WHERE canvas_id=%s ORDER BY created_at DESC LIMIT 1',(cid,)).fetchone()
        assert snapshot['document']['nodes'] == value['nodes']
    assert client.put(path,headers=proof,json={'base_revision':value['revision'],'nodes':[]}).status_code == 409
