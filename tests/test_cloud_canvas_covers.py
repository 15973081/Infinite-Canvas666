"""Cover selection and compact directory resolution against isolated PostgreSQL."""
import os
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_canvas_covers import NODES
from app.services.canvas_cover import resolve_cover

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('kind', ['classic', 'smart'])
def test_node_cover_save_directory_switch_fallback_and_lease(world, kind):
    client=world['editor']; path, original=setup_canvas(world, kind); lease=acquire(world,path)
    # External test refs need no asset publication; no media is fetched.
    nodes=[{**n, 'url': n.get('url','').replace('/assets/', 'https://example.test/').replace('/output/', 'https://example.test/'),
            'images': [{**v, 'url':v['url'].replace('/assets/','https://example.test/').replace('/output/','https://example.test/'),
                        'thumbnail_url':v.get('thumbnail_url','').replace('/assets/','https://example.test/')} for v in n.get('images',[])]} for n in NODES]
    def save(revision, **extra):
        return client.put(path,headers=proof(world,lease,revision),json={'title':original['title'],'nodes':nodes,
            'base_revision':revision,**extra})
    result=save(lease['revision']); assert result.status_code==200,result.text
    revision=result.json()['canvas']['revision']
    def directory():
        response=client.get('/api/canvases',headers=headers(world['a']))
        assert response.status_code==200,response.text
        row=next(c for c in response.json()['canvases'] if c['id']==original['id'])
        assert 'nodes' not in row and 'logs' not in row
        return row
    assert directory()['cover_media']==resolve_cover(nodes)
    selection={'node_id':'picture','index':-1,'text':'左上角标题'}
    selected=save(revision,cover=selection); assert selected.status_code==200,selected.text
    revision=selected.json()['canvas']['revision']
    assert directory()['cover']==selection
    assert directory()['cover_media']==resolve_cover(nodes,selection)
    # Label-only metadata edits do not replace selection or media; old clients omit it.
    renamed=client.post(path+'/meta',headers=proof(world,lease,revision),json={'title':'新名称'})
    assert renamed.status_code==200,renamed.text
    revision=renamed.json()['canvas']['revision']
    assert renamed.json()['canvas']['cover']==selection
    older=save(revision); assert older.status_code==200,older.text
    revision=older.json()['canvas']['revision']
    assert directory()['cover']==selection
    nodes[:]=[n for n in nodes if n['id']!='picture']
    deleted=save(revision); assert deleted.status_code==200,deleted.text
    revision=deleted.json()['canvas']['revision']
    assert directory()['cover_media']==resolve_cover(nodes)
    auto=save(revision,cover=None); assert auto.status_code==200,auto.text
    assert directory()['cover'] is None
    assert client.put(path,headers=headers(world['a']),json={'cover':selection,'nodes':nodes}).status_code in (409,423,428)
