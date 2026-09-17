"""TOS is fully simulated; no remote objects or billable generation involved."""
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace as NS
import pytest
from app.storage import upload_cleanup as cleanup


class StoreError(Exception):
    def __init__(self, code, status=404):
        self.code=code; self.status_code=status; self.request_id='test-request'


class FakeTos:
    bucket='test-bucket'
    def __init__(self):
        self.client=self; self.entries={}; self.calls=[]; self.fail={}; self.page_size=1
    def add(self,key,version,size=7,marker=False):
        self.entries[(key,version)]=NS(key=key,version_id=version,size=size,marker=marker)
    def list_object_versions(self,bucket,prefix,key_marker=None,version_id_marker=None,max_keys=None):
        self.calls.append(('list',prefix,key_marker,version_id_marker))
        if 'list' in self.fail: raise self.fail['list']
        values=sorted((v for v in self.entries.values() if v.key.startswith(prefix)),key=lambda v:(v.key,v.version_id))
        if key_marker: values=[v for v in values if (v.key,v.version_id)>(key_marker,version_id_marker)]
        more=len(values)>self.page_size; values=values[:self.page_size]
        last=values[-1] if values else None
        return NS(versions=[v for v in values if not v.marker],delete_markers=[v for v in values if v.marker],
                  is_truncated=more,next_key_marker=last.key if more else None,next_version_id_marker=last.version_id if more else None)
    def head_object(self,bucket,key,version_id=None):
        assert version_id,'cleanup must never use current-object HEAD'
        self.calls.append(('head',key,version_id))
        v=self.entries.get((key,version_id))
        if not v or v.marker: raise StoreError('NoSuchVersion')
        return NS(version_id=version_id,content_length=v.size)
    def delete_object(self,bucket,key,version_id=None):
        assert version_id and version_id!='null'
        self.calls.append(('delete',key,version_id))
        if version_id in self.fail: raise self.fail[version_id]
        self.entries.pop((key,version_id),None)
    def abort_multipart_upload(self,bucket,key,upload_id):
        self.calls.append(('abort',key,upload_id))
        if 'abort' in self.fail: raise self.fail['abort']


@pytest.fixture
def stage(monkeypatch):
    from app.storage import media
    monkeypatch.setattr(media,'current_workspace',lambda:'default')
    monkeypatch.setattr(cleanup,'current_workspace',lambda:'default')
    monkeypatch.setattr(media,'media_backend',lambda:'tos')
    now=datetime.now(timezone.utc)
    aid='ast_'+'a'*32
    row={'asset_id':aid,'workspace_id':'default','asset_workspace':'default','backend':'tos','bucket':'test-bucket',
         'staging_key':'staging/default/'+aid,'staging_version_id':'recorded','upload_id':'multipart',
         'expires_at':now-timedelta(hours=2),'lease_until':None,'cleanup_lease_until':None}
    return row,FakeTos()


def report(): return {'deleted':[],'bytes':0}


def test_exact_key_all_pages_includes_data_under_delete_marker(stage):
    row,store=stage;key=row['staging_key']
    store.add(key,'recorded',10);store.add(key,'old',20);store.add(key,'marker',marker=True)
    store.add(key+'-other','unrelated',99);store.add('media/default/keep','formal',100)
    dry=cleanup.inventory(row,store)
    assert len(dry)==3 and sum(v['bytes'] for v in dry)==30
    assert not any(c[0] in ('delete','abort') for c in store.calls)
    r=report();cleanup.clean_objects(row,store,r)
    assert r['bytes']==30 and len(r['deleted'])==3
    assert len(store.entries)==2
    deleted=[c for c in store.calls if c[0]=='delete']
    assert deleted[0]==('delete',key,'recorded')
    assert all(c[1]==key for c in deleted)
    r=report();cleanup.clean_objects(row,store,r);assert r['bytes']==0


@pytest.mark.parametrize('field,value,code',[
    ('workspace_id','other','workspace_mismatch'),('asset_workspace','other','workspace_mismatch'),
    ('bucket','other','bucket_mismatch'),('staging_key','staging/default/other','staging_key_mismatch'),
    ('backend','filesystem','backend_mismatch')])
def test_mismatch_never_touches_storage(stage,field,value,code):
    row,store=stage;row[field]=value
    with pytest.raises(cleanup.CleanupError) as e: cleanup.clean_objects(row,store,report())
    assert e.value.code==code and not store.calls


@pytest.mark.parametrize('failure',[StoreError('AccessDenied',403),TimeoutError('network')])
def test_partial_failure_tracks_confirmed_versions_and_retry(stage,failure):
    row,store=stage;key=row['staging_key']
    store.add(key,'recorded',10);store.add(key,'second',20);store.fail['second']=failure
    r=report()
    with pytest.raises(type(failure)): cleanup.clean_objects(row,store,r)
    assert r['bytes']==10 and len(r['deleted'])==1
    store.fail.clear();retry=report();cleanup.clean_objects(row,store,retry)
    assert retry['bytes']==20 and not store.entries


def test_no_version_is_recovered_by_listing_and_null_version_is_refused(stage):
    row,store=stage;row['staging_version_id']=None
    store.add(row['staging_key'],'historical',12)
    r=report();cleanup.clean_objects(row,store,r);assert r['bytes']==12
    store.add(row['staging_key'],'null',12)
    with pytest.raises(cleanup.CleanupError,match='immutable'): cleanup.inventory(row,store)


def test_listing_permission_error_cannot_claim_absence(stage):
    row,store=stage;store.fail['list']=StoreError('AccessDenied',403)
    with pytest.raises(StoreError): cleanup.clean_objects(row,store,report())
    assert not any(c[0]=='delete' for c in store.calls)


def test_missing_multipart_is_idempotent_but_bucket_404_is_not(stage):
    row,store=stage;store.fail['abort']=StoreError('NoSuchUpload')
    cleanup.clean_objects(row,store,report())
    store.fail['abort']=StoreError('NoSuchBucket')
    with pytest.raises(StoreError): cleanup.clean_objects(row,store,report())


def test_active_credentials_and_leases_wait(stage):
    row,_=stage;now=datetime.now(timezone.utc)
    row['expires_at']=now
    assert cleanup.waiting_reason(row,3600)=='credential_lifetime_and_grace'
    row['expires_at']=now-timedelta(hours=2);row['lease_until']=now+timedelta(minutes=1)
    assert cleanup.waiting_reason(row,3600)=='active_upload_lease'
    row['lease_until']=None;row['cleanup_lease_until']=now+timedelta(minutes=1)
    assert cleanup.waiting_reason(row,3600)=='cleanup_in_progress'


def test_invalid_pagination_fails_closed(stage,monkeypatch):
    row,store=stage
    monkeypatch.setattr(store,'list_object_versions',lambda *a,**k:NS(versions=[],delete_markers=[],is_truncated=True,next_key_marker=row['staging_key'],next_version_id_marker='same'))
    with pytest.raises(cleanup.CleanupError,match='advance'): cleanup.inventory(row,store)
