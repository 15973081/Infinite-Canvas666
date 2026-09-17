"""Disposable PostgreSQL + local objects/fake TOS; never production credentials."""
import os
import uuid
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace as NS
from unittest.mock import patch

import pytest
from psycopg.types.json import Jsonb
from test_upload_cleanup_versions import FakeTos,StoreError

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def seed(status='deleted',expired=True):
    from app.storage import database
    aid='ast_'+uuid.uuid4().hex;key='staging/default/'+aid
    with database.connection() as conn:
        conn.execute("INSERT INTO assets(id,kind,status,bucket,region,object_key,object_version_id,staging_key,staging_version_id,size_bytes,sha256,content_type) "
                     "VALUES(%s,'image',%s,'test-bucket','test',%s,'formal',%s,'recorded',7,%s,'image/png')",
                     (aid,status,'media/default/'+aid,key,'0'*64))
        conn.execute("INSERT INTO media_uploads(workspace_id,asset_id,idempotency_key,request_sha256,backend,size_bytes,part_size,part_count,status,expires_at) "
                     "VALUES('default',%s,%s,%s,'tos',7,7,1,'ready',now()+make_interval(secs=>%s))",
                     (aid,uuid.uuid4().hex,'0'*64,-7200 if expired else 3600))
    return aid,key


@contextmanager
def tos(store):
    from app.storage import media
    with patch.object(media,'store',return_value=store),patch.object(media,'media_backend',return_value='tos'):
        yield


def read(aid):
    from app.storage import database
    with database.connection() as conn:
        return conn.execute('SELECT * FROM media_uploads WHERE asset_id=%s',(aid,)).fetchone()


def test_staging_cleanup_dry_run_and_historical_deleted_recovery():
    from app.storage import uploads
    aid,key=seed();store=FakeTos();store.add(key,'recorded',7);store.add(key,'marker',marker=True)
    with tos(store):
        dry=uploads.cleanup(asset_ids=[aid])
        assert dry['candidate_bytes']==7 and dry['items'][0]['state']=='candidate'
        assert read(aid)['cleanup_attempts']==0 and read(aid)['cleaned_at'] is None
        assert not any(c[0] in ('delete','abort') for c in store.calls)
        done=uploads.cleanup(apply=True,asset_ids=[aid])
        assert done['completed']==1 and done['cleaned_bytes']==7 and done['remaining']==0
        assert read(aid)['cleanup_state']=='complete' and read(aid)['cleaned_at']
        assert uploads.cleanup(apply=True,asset_ids=[aid])['examined']==0


def test_staging_cleanup_failure_does_not_block_batch_and_retries():
    from app.storage import uploads
    a,keya=seed();b,keyb=seed();store=FakeTos();store.add(keya,'recorded',7);store.add(keya,'second',11);store.add(keyb,'okay',9)
    store.fail['second']=StoreError('AccessDenied',403)
    with tos(store):
        result=uploads.cleanup(apply=True,asset_ids=[a,b])
        assert result['completed']==1 and result['failed']==1 and result['cleaned_bytes']==16
        assert read(a)['cleanup_error']['code']=='AccessDenied'
        assert read(a)['cleanup_bytes']==7 and read(a)['cleaned_at'] is None
        assert read(b)['cleaned_at']
        store.fail.clear();done=uploads.cleanup(apply=True,asset_ids=[a])
        assert done['completed']==1 and read(a)['cleanup_bytes']==18


@pytest.mark.parametrize('mode',['unexpired','upload_lease','cleanup_lease','wrong_bucket'])
def test_staging_cleanup_rechecks_safety(mode):
    from app.storage import database,uploads
    aid,key=seed(expired=mode!='unexpired');store=FakeTos();store.add(key,'recorded')
    with database.connection() as conn:
        if mode=='upload_lease': conn.execute("UPDATE media_uploads SET lease_until=now()+interval '1 hour',status='verifying' WHERE asset_id=%s",(aid,))
        if mode=='cleanup_lease': conn.execute("UPDATE media_uploads SET cleanup_lease_until=now()+interval '1 hour' WHERE asset_id=%s",(aid,))
        if mode=='wrong_bucket': conn.execute("UPDATE assets SET bucket='another-bucket' WHERE id=%s",(aid,))
    with tos(store):
        result=uploads.cleanup(apply=True,asset_ids=[aid])
    assert result['completed']==0 and read(aid)['cleaned_at'] is None
    assert not store.calls
    if mode=='wrong_bucket': assert read(aid)['cleanup_error']['code']=='bucket_mismatch'


def test_staging_cleanup_concurrent_claim_is_exclusive():
    import threading
    from app.storage import uploads
    from app.storage.workspace import workspace_scope
    aid,key=seed();store=FakeTos();store.add(key,'recorded');entered=threading.Event();release=threading.Event()
    original=store.delete_object
    def slow(*args,**kwargs):
        entered.set();assert release.wait(5);return original(*args,**kwargs)
    store.delete_object=slow
    def run():
        with workspace_scope('default'): return uploads.cleanup(apply=True,asset_ids=[aid])
    with tos(store),ThreadPoolExecutor(2) as pool:
        first=pool.submit(run)
        try:
            assert entered.wait(5)
            second=pool.submit(run).result(5)
            assert second['pending']==1 and second['completed']==0
        finally: release.set()
        assert first.result(5)['completed']==1
    assert len([c for c in store.calls if c[0]=='delete'])==1


def test_staging_cleanup_purge_waits_and_retains_catalog_then_finishes(tmp_path):
    from app.storage import database,media,uploads
    from app.services import canvas_asset_purge as purge,canvas_asset_catalog as catalog
    # Real local formal object and preview, with staged source still under TTL.
    path=tmp_path/'image.png';path.write_bytes(b'original fixture')
    asset=media.publish(path);child=media.publish(path,parent_asset_id=asset['id'],role='preview')
    aid=asset['id'];key='staging/default/'+aid;store=media.store();version=store.put(key+'/source',path,'image/png')
    with database.connection() as conn:
        conn.execute('UPDATE assets SET staging_key=%s,staging_version_id=%s WHERE id=%s',(key,version,aid))
        conn.execute("INSERT INTO media_uploads(workspace_id,asset_id,idempotency_key,request_sha256,backend,size_bytes,part_size,part_count,status,expires_at) "
                     "VALUES('default',%s,%s,%s,'filesystem',16,16,1,'ready',now()+interval '1 hour')",(aid,uuid.uuid4().hex,'0'*64))
        conn.execute("INSERT INTO canvas_asset_catalog(workspace_id,asset_key,snapshot,trashed_at) VALUES('default',%s,%s,now())",
                     (aid,Jsonb({'id':aid,'url':media.stable_url(asset),'canvas_id':'cleanup-canvas','canvas_kind':'classic'})))
    payload={'confirm_permanent':True,'items':[{'key':aid,'version':1}]}
    result=purge.purge(payload)
    assert result['changed']==0 and result['pending'][0]['message']=='正式文件已删除，暂存清理待完成'
    for a in [asset,child]: assert not store.path(a['object_key'],a['object_version_id']).exists()
    assert store.path(key+'/source',version).exists()
    view=catalog.decorate({'items':[],'canvases':[{'id':'cleanup-canvas'}],'categories':[]},trash=True)
    assert view['items'][0]['staging_pending']
    with database.connection() as conn:
        conn.execute("UPDATE media_uploads SET expires_at=now()-interval '2 hours' WHERE asset_id=%s",(aid,))
    assert purge.purge(payload)=={'changed':1,'failures':[]}
    assert not store.path(key+'/source',version).exists()
    view=catalog.decorate({'items':[],'canvases':[{'id':'cleanup-canvas'}],'categories':[]},trash=True)
    assert not view['items']


def test_staging_cleanup_other_workspace_selection_cannot_delete():
    from app.storage import uploads
    from app.storage.workspace import workspace_scope
    aid,key=seed();store=FakeTos();store.add(key,'recorded')
    with tos(store),workspace_scope('unrelated-workspace'):
        assert uploads.cleanup(apply=True,asset_ids=[aid])['examined']==0
    assert not store.calls and read(aid)['cleaned_at'] is None
