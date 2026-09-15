from contextlib import contextmanager
from unittest.mock import Mock, patch
import pytest
from fastapi import HTTPException
from app.services import canvas_asset_purge as purge
from app.services import canvas_asset_catalog as catalog
from app.storage import media

KEY='ast_'+'a'*32

def test_reference_scan_covers_aliases_ids_and_nested_urls():
    aliases={'/output/old.png':KEY}
    for value in [KEY, {'nodes':[{'url':'/assets/cloud/'+KEY+'/x.png'}]}, ['/output/old.png']]:
        assert purge.contains_ref(value,{KEY},aliases)
    assert not purge.contains_ref({'url':'https://example.test/x.png'},{KEY},aliases)

@pytest.mark.parametrize('source',[0,1,2])
def test_reference_guard_blocks_canvas_backup_and_task(source):
    conn=Mock();conn.execute.side_effect=[[]]*source+[[{'label':'retained','value':{'url':KEY}}]]
    with pytest.raises(HTTPException,match='409'):
        purge.check_references(conn,{KEY},{})


def setup_purge(monkeypatch, *, version=2, trash=True, state='ready'):
    row={'version':version,'trashed_at':trash}
    asset={'id':KEY,'status':state,'object_version_id':'version'}
    queries=[]; commits=[]
    conn=Mock()
    def execute(query,args=None):
        queries.append(query)
        result=Mock()
        if 'SELECT * FROM canvas_asset_catalog' in query: result.fetchone.return_value=row
        elif 'WITH RECURSIVE' in query: result.fetchall.return_value=[asset]
        return result
    conn.execute.side_effect=execute
    @contextmanager
    def connection():
        yield conn
        commits.append(len(queries))
    monkeypatch.setattr(purge,'connection',connection)
    monkeypatch.setattr(catalog,'aliases_for',lambda c:{})
    monkeypatch.setattr(purge,'check_references',Mock())
    return queries,commits


def payload():
    return {'action':'purge','confirm_permanent':True,'items':[{'key':KEY,'version':2}]}


def test_deletion_commits_tombstone_before_object_io(monkeypatch):
    queries,commits=setup_purge(monkeypatch)
    def remove(asset):
        assert commits and any("status='deleting'" in q for q in queries)
        assert not any("status='deleted'" in q for q in queries)
    monkeypatch.setattr(purge,'delete_object',remove)
    assert purge.purge(payload())=={'changed':1,'failures':[]}
    assert any("status='deleted'" in q for q in queries)


def test_storage_failure_stays_retryable(monkeypatch):
    queries,_=setup_purge(monkeypatch,state='deleting')
    monkeypatch.setattr(purge,'delete_object',Mock(side_effect=RuntimeError('denied')))
    result=purge.purge(payload())
    assert result['changed']==0 and len(result['failures'])==1
    assert not any("status='deleted'" in q for q in queries)

@pytest.mark.parametrize('kwargs',[{'version':3},{'trash':False}])
def test_stale_or_nontrashed_selection_never_deletes(monkeypatch,kwargs):
    setup_purge(monkeypatch,**kwargs)
    delete=Mock();monkeypatch.setattr(purge,'delete_object',delete)
    with pytest.raises(HTTPException): purge.purge(payload())
    delete.assert_not_called()


def test_explicit_confirmation_required():
    data=payload();data['confirm_permanent']=False
    with pytest.raises(HTTPException): purge.purge(data)


def test_filesystem_deletes_only_exact_version(tmp_path,monkeypatch):
    store=media.FilesystemStore(tmp_path)
    one=store.path('assets/example','a'*32);one.parent.mkdir(parents=True);one.write_bytes(b'a')
    two=store.path('assets/example','b'*32);two.write_bytes(b'b')
    monkeypatch.setattr(media,'store',lambda:store)
    asset={'bucket':'local-simulation','object_key':'assets/example','object_version_id':'a'*32}
    purge.delete_object(asset);purge.delete_object(asset)
    assert not one.exists() and two.read_bytes()==b'b'


def test_tos_delete_uses_exact_version_and_checks_bucket(monkeypatch):
    store=object.__new__(media.TosStore);store.bucket='private';store.client=Mock()
    monkeypatch.setattr(media,'store',lambda:store)
    purge.delete_object({'bucket':'private','object_key':'one','object_version_id':'v1'})
    store.client.delete_object.assert_called_once_with('private','one',version_id='v1')
    with pytest.raises(HTTPException): purge.delete_object({'bucket':'other','object_key':'one','object_version_id':'v1'})


def test_reference_writer_rejects_deleting_asset():
    conn=Mock();conn.execute.side_effect=[[],Mock(fetchall=lambda:[{'id':KEY,'status':'deleting'}])]
    with pytest.raises(HTTPException): media.lock_retained_references(conn,{'url':'/assets/cloud/'+KEY+'/x'})
