"""Exact indexed lookups match the recursive scanner without loading snapshots."""
import os,uuid
import pytest
from psycopg.types.json import Jsonb
from test_cloud_member_gateway import operator,world
pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='isolated PostgreSQL required')

def test_sql_reference_candidates_never_omit_python_references():
    from app.storage import media,database
    a='ast_'+'a'*32;b='ast_'+'b'*32
    cases=[None,{},[],a,a+'\n',a+'/suffix',a+'?',a+'x',a.upper(),'/assets/cloud/'+a+'/x?query=1',
           '/api/media/'+b,'/api/media/'+b+'?x=1','https://external/api/media/'+a+'/x',
           {'key':a,'nested':[[b,{'url':'/api/media/'+a+'/content'}]],a:'not-a-reference'},
           {'escaped':r'\u0061st_'+'a'*32,'number':12,'boolean':True}]
    def collect(v):
        if isinstance(v,str):return {media.id_from_ref(v)}-{''}
        if isinstance(v,list):return set().union(*(collect(x) for x in v))
        if isinstance(v,dict):return set().union(*(collect(x) for x in v.values()))
        return set()
    with database.connection() as c:
        for value in cases:
            got=c.execute('SELECT asset_reference_candidates(%s::jsonb) ids',(Jsonb(value),)).fetchone()['ids']
            assert collect(value)<=set(got),value

def test_index_tracks_retained_documents_exactly_across_updates_and_workspaces(world):
    from app.storage import database,documents
    from app.storage.workspace import workspace_scope
    from app.services.canvas_asset_purge import referenced_asset_ids,check_references
    from fastapi import HTTPException
    a='ast_'+uuid.uuid4().hex;b='ast_'+uuid.uuid4().hex;wid=world['a']['id']
    with workspace_scope(wid),database.connection() as c:
        assert referenced_asset_ids(c,set())==set()
        # Use direct isolated rows to exercise retained snapshots and index writes.
        c.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'retained-test','one',%s)",
                  (wid,Jsonb({'nested':[{'url':'/assets/cloud/'+a+'/file.png'}],'prefix':'text '+b})))
        c.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'retained-test','other',%s)",
                  (world['b']['id'],Jsonb({'id':b})))
        assert referenced_asset_ids(c,{a,b})=={a}
        assert referenced_asset_ids(c,{a,b})==referenced_asset_ids(c).intersection({a,b})
        check_references(c,{b},{})  # A prose substring is not a real reference.
        with pytest.raises(HTTPException) as error: check_references(c,{a},{})
        assert error.value.status_code==409
        c.execute("UPDATE workspace_documents SET value=%s WHERE workspace_id=%s AND kind='retained-test' AND id='one'",(Jsonb({'id':b}),wid))
        assert referenced_asset_ids(c,{a,b})=={b}
        c.execute("DELETE FROM workspace_documents WHERE workspace_id=%s AND kind='retained-test'",(wid,))
        assert referenced_asset_ids(c,{a,b})==set()

def test_candidate_lookup_uses_index_expressions(world):
    from app.storage import database
    with database.connection() as c:
        c.execute('SET LOCAL enable_seqscan=off')
        plan=c.execute('EXPLAIN (FORMAT JSON) SELECT value FROM workspace_documents WHERE asset_reference_candidates(value) && %s::text[]',(['ast_'+'f'*32],)).fetchone()['QUERY PLAN']
        assert 'documents_reference_ids' in str(plan)
