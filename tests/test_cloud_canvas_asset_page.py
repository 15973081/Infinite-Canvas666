import os
import uuid
from unittest.mock import patch
import pytest

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def test_asset_page_matches_catalog_and_keeps_workspace_search_trash_isolated():
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    from app.storage.canvas_asset_groups import save_group
    from app.services.canvas_asset_page import page
    from app.services.canvas import canvas_assets_index
    from app.services import canvas_asset_catalog as catalog
    from psycopg.types.json import Jsonb
    wid = 'page_' + uuid.uuid4().hex
    with connection() as conn:
        conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)', (wid,wid))
    with workspace_scope(wid):
        with connection() as conn:
            for cid,deleted in [('a',0),('b',1)]:
                save_group(conn, dict(id=cid,title='画布'+cid,kind='smart',updated_at=100,deleted_at=deleted,
                    nodes=[dict(id=str(i),type='image',url=f'https://example.test/{i}.png',name=f'image {i}') for i in range(125)]))
        # The paged endpoint must not invoke the full-document aggregation path.
        with patch('app.services.canvas.canvas_assets_index', side_effect=AssertionError('full scan')):
            first = page(limit=60)
            second = page(limit=60,offset=60)
            last = page(limit=60,offset=120)
        assert first['total']==125 and len(first['items'])==60 and first['has_more']
        assert len(last['items'])==5 and not last['has_more']
        ids = [i['id'] for result in (first,second,last) for i in result['items']]
        assert len(set(ids))==125
        assert page(source_state='deleted')['total']==125
        assert page(source_state='all')['total']==250
        assert page(canvas_id='b')['total']==0
        assert page(category='classic')['total']==0
        assert page(query='%_')['total']==0  # literal search, not SQL wildcards
        item=first['items'][0]
        with connection() as conn:
            conn.execute('''INSERT INTO canvas_asset_catalog(workspace_id,asset_key,metadata,snapshot)
                VALUES(%s,%s,%s,%s)''',(wid,item['asset_key'],Jsonb({'name':'独特名字','tags':['测试标签']}),Jsonb(item)))
        assert page(query='独特名字')['total']==1
        assert page(query='测试标签')['items'][0]['catalog_version']==1
        with connection() as conn:
            conn.execute('UPDATE canvas_asset_catalog SET trashed_at=now() WHERE workspace_id=%s',(wid,))
        assert page()['total']==124
        assert page(trash=True)['total']==1 and page(trash=True)['trash_count']==1
        full=canvas_assets_index(trash=True,source_state='all')
        bounded=page(trash=True,source_state='all')
        assert sorted(i['id'] for i in full['items'])==sorted(i['id'] for i in bounded['items'])
    # Same canvas ids in another workspace cannot leak into this query.
    assert not any(c['title']=='画布a' for c in page()['canvases'])


def test_asset_page_legacy_backfill_alias_and_retained_snapshot(tmp_path):
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    from app.services.canvas_asset_page import page
    from psycopg.types.json import Jsonb
    wid='page_'+uuid.uuid4().hex
    doc=dict(id='legacy',title='旧画布',kind='classic',updated_at=10,nodes=[dict(id='n',type='image',url='/output/hello%20world.png')])
    with connection() as conn:
        conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)',(wid,wid))
        conn.execute('INSERT INTO canvas_asset_groups(workspace_id,canvas_id,document) VALUES(%s,%s,%s)',(wid,'legacy',Jsonb(doc)))
    with workspace_scope(wid):
        from app.storage import media
        path=tmp_path/'image.png';path.write_bytes(b'private-test-object')
        asset=media.publish(path)
        with connection() as conn:
            conn.execute('INSERT INTO asset_aliases(workspace_id,source_namespace,legacy_ref,asset_id) VALUES(%s,%s,%s,%s)',
                         (wid,os.getenv('ASSET_SOURCE_NAMESPACE','local'),'/output/hello world.png',asset['id']))
        result=page(category='classic')
        assert result['total']==1
        assert result['items'][0]['asset_key']==asset['id']
        assert 'nodes' not in result['canvases'][0]
        with connection() as conn:
            assert conn.execute('SELECT legacy_ref FROM canvas_asset_items WHERE workspace_id=%s',(wid,)).fetchone()['legacy_ref']=='/output/hello world.png'
            snapshot=dict(id='retained',canvas_id='legacy',canvas_kind='classic',canvas_title='旧画布',url='https://example.test/orphan.png')
            conn.execute('INSERT INTO canvas_asset_catalog(workspace_id,asset_key,snapshot,trashed_at) VALUES(%s,%s,%s,now())',(wid,'retained',Jsonb(snapshot)))
        assert page(category='classic',trash=True)['items'][0]['id']=='retained'
        # Newly created aliases are resolved at query time, not frozen in the projection.
        with connection() as conn:
            conn.execute('DELETE FROM asset_aliases WHERE workspace_id=%s',(wid,))
        assert page(category='classic')['items'][0]['asset_key'].startswith('url_')
        with connection() as conn:
            conn.execute("UPDATE canvas_asset_groups SET document=document-'nodes',items='[]' WHERE workspace_id=%s",(wid,))
        assert page(category='classic')['total']==0
