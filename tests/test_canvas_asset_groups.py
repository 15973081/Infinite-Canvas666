from unittest.mock import patch
from app.storage.canvas_asset_groups import merged_items
from app.services.canvas import canvas_assets_index

def test_membership_survives_removing_or_replacing_nodes():
    old = [{'id':'one','url':'a'}, {'id':'two','url':'b'}]
    current = [{'id':'one','url':'updated'}, {'id':'three','url':'c'}]
    result = merged_items(old, current)
    assert {i['id']:i['url'] for i in result} == {'one':'updated','two':'b','three':'c'}
    assert old[0]['url'] == 'a'

def test_deleted_and_purged_groups_remain_searchable():
    docs = [{'id':s,'title':'Canvas '+s,'kind':'classic','asset_source_state':s,
             '_asset_group_items':[{'id':s,'canvas_id':s,'canvas_title':'Canvas '+s,'canvas_kind':'classic','url':'https://example.test/'+s+'.mp4'}]}
            for s in ('active','deleted','purged')]
    with patch('app.services.canvas.postgres_enabled',return_value=True), patch('app.storage.canvas_asset_groups.documents',side_effect=lambda: iter(docs)):
        active=canvas_assets_index(managed=False)
        deleted=canvas_assets_index(managed=False,source_state='deleted')
        all_groups=canvas_assets_index(managed=False,source_state='all')
    assert [c['id'] for c in active['canvases']] == ['active']
    assert {c['id'] for c in deleted['canvases']} == {'deleted','purged'}
    assert len(all_groups['items']) == 3
    assert {i['canvas_state'] for i in deleted['items']} == {'deleted','purged'}

import os
import uuid
import pytest
from app.storage.database import connection
from app.storage.workspace import workspace_scope
from app.storage import canvases
from app.services.canvas_asset_catalog import mutate

@pytest.mark.skipif(os.getenv("CANVAS_ASSET_GROUP_INTEGRATION") != "1", reason="requires isolated local PostgreSQL")
def test_group_lifecycle_in_postgres():
    class Rollback(Exception): pass
    with pytest.raises(Rollback):
        with connection() as conn:
            assert conn.execute('SELECT current_database() AS name').fetchone()['name'].startswith('canvas_delivery_')
            workspace = 'group_test_' + uuid.uuid4().hex
            other = workspace + '_other'
            for wid in (workspace, other):
                conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)', (wid,'Group lifecycle test'))
            with workspace_scope(workspace):
                canvas = {'id':workspace,'title':'Original title','kind':'classic','nodes':[{'id':'n','type':'video','url':'https://example.test/video.mp4'}],'connections':[]}
                canvases.save(canvas)
                assert len(canvas_assets_index()['items']) == 1
                canvas['nodes']=[]
                canvas['title']='Renamed canvas'
                canvases.save(canvas)
                assert canvas_assets_index()['items'][0]['canvas_title']=='Renamed canvas'
                canvas['deleted_at']=1000
                canvases.save(canvas)
                assert not canvas_assets_index()['items']
                deleted=canvas_assets_index(source_state='deleted')
                assert len(deleted['items'])==1 and deleted['items'][0]['canvas_state']=='deleted'
                canvases.purge(canvas['id'])
                purged=canvas_assets_index(source_state='deleted')
                assert purged['items'][0]['canvas_state']=='purged'
                item=purged['items'][0]
                mutate({'action':'edit','items':[{'key':item['asset_key'],'version':0}],'metadata':{'name':'Kept video'}})
                assert not canvas_assets_index()['items']  # Catalog overlay cannot leak across source filters.
                assert canvas_assets_index(source_state='deleted')['items'][0]['name']=='Kept video'
                mutate({'action':'trash','items':[{'key':item['asset_key'],'version':1}]})
                assert not canvas_assets_index(source_state='deleted')['items']
                assert len(canvas_assets_index(source_state='deleted',trash=True)['items'])==1
                mutate({'action':'restore','items':[{'key':item['asset_key'],'version':2}]})
                conn.execute('DELETE FROM canvases WHERE workspace_id=%s AND id=%s',(workspace,canvas['id']))
                assert canvas_assets_index(source_state='deleted')['items'][0]['name']=='Kept video'
            with workspace_scope(other):
                assert not canvas_assets_index(source_state='all')['items']
            raise Rollback()
