import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from unittest.mock import patch,Mock
from contextlib import contextmanager
from app.services import canvas_asset_catalog as catalog

def test_aliases_and_stable_urls_share_identity():
    key='ast_'+'a'*32
    aliases={'/output/old.png':key}
    assert catalog.key_for('/output/old.png',aliases)==key
    assert catalog.key_for('/assets/cloud/'+key+'/picture.png',aliases)==key

def test_external_urls_are_not_fetched_or_stripped():
    one=catalog.key_for('https://example.test/image?version=1',{})
    two=catalog.key_for('https://example.test/image?version=2',{})
    assert one!=two

def test_trash_snapshot_survives_canvas_removal():
    row={"asset_key":"url_x","metadata":{"name":"saved"},"snapshot":{"id":"one","url":"https://test/x.png","name":"old","canvas_id":"canvas","canvas_kind":"classic"},"version":2,"trashed_at":"today"}
    conn=Mock();conn.execute.return_value=[row]
    @contextmanager
    def connection(): yield conn
    with patch.object(catalog,'connection',connection),patch.object(catalog,'aliases_for',return_value={}),patch.object(catalog,'current_workspace',return_value='workspace'):
        result=catalog.decorate({'items':[],'canvases':[{'id':'canvas'}],'categories':[]},trash=True)
    assert result['items'][0]['name']=='saved'
    assert result['trash_count']==1

def test_reference_scan_reports_every_node_and_deleted_canvas():
    url='/assets/cloud/ast_'+'a'*32+'/x.png'
    doc={'id':'c','title':'Canvas','deleted_at':1,'nodes':[{'id':'n1','url':url},{'id':'n2','url':url}]}
    @contextmanager
    def connection(): yield Mock()
    with patch.object(catalog,'connection',connection),patch.object(catalog,'aliases_for',return_value={}),patch('app.services.canvas.iter_canvas_documents',return_value=iter([doc])):
        refs=catalog.references('ast_'+'a'*32)
    assert len(refs)==2
    assert all(r['canvas_trashed'] for r in refs)
