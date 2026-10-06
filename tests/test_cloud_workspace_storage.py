"""Workspace storage inventory and HTTP isolation against disposable PostgreSQL."""
import os
import uuid
import pytest
from test_cloud_member_gateway import operator, world, headers

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def asset(conn, workspace, kind, size, status='ready', version='1', parent=None):
    identity = 'ast_' + uuid.uuid4().hex
    conn.execute('''INSERT INTO assets(id,workspace_id,kind,status,bucket,region,object_key,
        object_version_id,size_bytes,sha256,content_type,parent_asset_id)
        VALUES(%s,%s,%s,%s,'test','test',%s,%s,%s,%s,'application/octet-stream',%s)''',
        (identity, workspace, kind, status, identity, version, size, 'a'*64, parent))
    return identity


def test_workspace_storage_counts_objects_once_and_never_downloads(world, monkeypatch):
    from app.storage.database import connection
    from app.storage import media
    def forbidden(*args, **kwargs):
        raise AssertionError('Storage usage must not contact the object store')
    monkeypatch.setattr(media, 'store', forbidden)
    a, b = world['a'], world['b']
    with connection() as conn:
        parent = asset(conn,a['id'],'image',1024)
        asset(conn,a['id'],'image',512,parent=parent)
        asset(conn,a['id'],'video',2048)
        asset(conn,a['id'],'audio',256,status='deleting')
        asset(conn,a['id'],'file',4096,status='deleted')
        asset(conn,a['id'],'file',999999,status='uploading',version=None)
        asset(conn,a['id'],'file',None,status='failed')
        asset(conn,b['id'],'video',2**30)
    response = world['viewer'].get('/api/workspace/storage',headers=headers(a))
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['workspace_id'] == a['id']
    assert data['bytes'] == 3840 and data['files'] == 5
    assert data['pending_files'] == 1 and data['unknown_files'] == 1
    assert data['retained_bytes'] == 256 and data['quota_bytes'] is None
    assert data['by_kind']['image']['bytes'] == 1536
    assert 'object_key' not in response.text and 'bucket' not in response.text
    with connection() as conn:
        conn.execute("UPDATE assets SET status='deleted' WHERE workspace_id=%s AND kind='video'",(a['id'],))
    assert world['viewer'].get('/api/workspace/storage',headers=headers(a)).json()['bytes'] == 1792


def test_workspace_storage_empty_and_access_boundaries(world):
    from fastapi.testclient import TestClient
    from main import app
    from app.services import members
    a, b = world['a'], world['b']
    response = world['editor'].get('/api/workspace/storage',headers=headers(a))
    assert response.status_code == 200 and response.json()['bytes'] == 0
    assert response.json()['files'] == 0
    assert world['outsider'].get('/api/workspace/storage',headers=headers(a)).status_code == 403
    assert world['editor'].get('/api/workspace/storage',headers=headers(b)).status_code == 403
    assert world['editor'].get('/api/workspace/storage').status_code == 400
    assert world['editor'].get('/api/workspace/storage?workspace='+b['id'],headers=headers(a)).status_code == 400
    with TestClient(app) as anonymous:
        assert anonymous.get('/api/workspace/storage',headers=headers(a)).status_code == 401
    # Totals remain available to a team viewer without permission to read media itself.
    role = members.create_role(world['operator'],'Storage summary',['canvas.read'],a['id'])
    members.assign_roles(world['operator'],world['people'][1]['id'],[role],a['id'])
    assert world['viewer'].get('/api/workspace/storage',headers=headers(a)).status_code == 200
    members.remove_workspace_member(world['operator'],world['people'][1]['id'],a['id'])
    assert world['viewer'].get('/api/workspace/storage',headers=headers(a)).status_code == 403
