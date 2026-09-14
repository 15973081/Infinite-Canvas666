"""Real PostgreSQL backup queue, scope fences and offline artifact verification."""
import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, PASSWORD
from test_cloud_management import platform

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


@pytest.fixture(autouse=True)
def isolated_jobs(monkeypatch,tmp_path):
    from app.storage.database import connection
    monkeypatch.setenv('MANAGEMENT_BACKUP_ROOT',str(tmp_path/'backups'))
    with connection() as c:
        previous=[r['id'] for r in c.execute('SELECT id FROM backup_jobs')]
    yield
    with connection() as c:
        c.execute("""UPDATE backup_jobs SET status='cancelled' WHERE status IN ('queued','running')
            AND NOT(id=ANY(%s::uuid[]))""",(previous,))


def enqueue(platform,workspace=None,request_id=None):
    payload={'request_id':str(request_id or uuid.uuid4()),'reason':'隔离验收备份'}
    response=platform['client'].post('/api/backups',params={'workspace':workspace} if workspace else {},json=payload)
    assert response.status_code==200,response.text
    return response.json(),payload


def bundle(job):
    from app.services.backup_control import backup_root
    from app.storage.database import schema_name
    return backup_root()/schema_name()/job['id']


def test_backup_requests_are_idempotent_scoped_and_audited(world,platform):
    from app.services import backup_control
    from app.storage.database import connection
    wid=world['a']['id']
    job,payload=enqueue(platform,wid)
    replay=platform['client'].post('/api/backups',params={'workspace':wid},json=payload)
    assert replay.json()==job
    assert platform['client'].post('/api/backups',params={'workspace':world['b']['id']},json=payload).status_code==409
    assert platform['client'].post('/api/backups',params={'workspace':wid},json={**payload,'request_id':str(uuid.uuid4())}).status_code==409
    assert platform['client'].get('/api/backups',params={'workspace':world['b']['id']}).json()['jobs']==[]
    assert platform['client'].get('/api/backups').json()['jobs']==[]
    with connection() as c:
        assert c.execute("SELECT count(*) AS n FROM management_events WHERE action='backup.request' AND target_id=%s",(job['id'],)).fetchone()['n']==1
    assert not {'session_id','member_id','path','directory'} & job.keys()
    concurrent_id=uuid.uuid4()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:backup_control.request(platform['operator'],concurrent_id,payload['reason'],world['b']['id']),range(2)))
    assert results[0]==results[1]


def test_space_export_contains_only_shared_scope_and_verifies_bytes(world,platform,tmp_path):
    from app.storage import canvases,media,documents,workspace_export,database
    from app.storage.workspace import workspace_scope
    from app.services.backup_control import run_one
    for key in ('a','b'):
        with workspace_scope(world[key]['id']):
            path=tmp_path/(key+'.bin');path.write_bytes(('object-'+key).encode())
            asset=media.publish(path)
            canvases.save({'id':'export-'+uuid.uuid4().hex,'title':key,'nodes':[{'id':'n','url':media.stable_url(asset)}],'connections':[]})
            documents.put('canvas_folders','default',{'folders':[{'name':key}]})
            documents.put('conversation','private',{'secret':'private-conversation-'+key})
            documents.put('api_providers','default',{'api_key':'never-export-key'})
    job,_=enqueue(platform,world['a']['id'])
    result=run_one()
    assert result['status']=='succeeded',result
    folder=bundle(job)/'workspace'
    manifest=workspace_export.verify(folder)
    assert manifest['object_count']==1 and manifest['counts']['canvases']==1
    assert manifest['counts']['workspace_documents']==1
    assert 'private_conversations' in manifest['excluded']
    rows=[json.loads(l) for l in (folder/'assets.jsonl').read_text().splitlines()]
    assert rows[0]['workspace_id']==world['a']['id']
    assert (folder/'objects/00000000.blob').read_bytes()==b'object-a'
    documents_text=(folder/'workspace_documents.jsonl').read_text()
    assert 'never-export-key' not in documents_text and 'private-conversation' not in documents_text
    with database.connection() as c:
        events=[r['action'] for r in c.execute('SELECT action FROM management_events WHERE target_id=%s ORDER BY id',(job['id'],))]
    assert events==['backup.request','backup.started','backup.succeeded']
    (folder/'objects/00000000.blob').write_bytes(b'corrupt')
    with pytest.raises(ValueError,match='checksum'):
        workspace_export.verify(folder)


def test_platform_job_executes_real_pg_dump_and_object_verification(monkeypatch,tmp_path):
    from psycopg import sql
    from app.services import backup_control,members
    from app.storage import backup,database,media
    # The larger suite deliberately leaves synthetic native TOS versions
    # (e.g. final-v1). A filesystem backup must not pretend those bytes exist.
    # Exercise a full real dump in an independent schema/store instead.
    schema='backup_fixture_'+uuid.uuid4().hex
    database.close()
    with monkeypatch.context() as settings:
        settings.setenv('DATABASE_SCHEMA',schema)
        settings.setenv('OBJECT_STORE_ROOT',str(tmp_path/'objects'))
        try:
            database.migrate()
            member=members.bootstrap('backup-admin','备份验收',PASSWORD)
            token=members.login(member['username'],PASSWORD,audience='management',source='isolated-backup')['token']
            actor=members.resolve_session(token,'management')
            source=tmp_path/'saved.bin';source.write_bytes(b'full backup original')
            media.publish(source)
            job=backup_control.request(actor,uuid.uuid4(),'完整快照验收')
            job['id']=str(job['id'])
            result=backup_control.run_one()
            assert result['status']=='succeeded',result
            manifest=backup.verify(bundle(job)/'database.dump')
            assert result['summary']['database_sha256']==manifest['database_sha256']
            assert result['summary']['database_bytes']>0 and result['summary']['objects']==1
            assert 'dump' not in result['summary'] and 'manifest' not in result['summary']
        finally:
            assert database.schema_name()==schema
            with database.connection() as c:
                c.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
            database.close()


def test_backup_permissions_and_revocation_before_execution(world,platform):
    from fastapi.testclient import TestClient
    from app.services import members,backup_control
    person=world['people'][1];wid=world['a']['id']
    role=members.create_role(platform['operator'],'备份操作-'+uuid.uuid4().hex,['backup.read','backup.request'],wid)
    members.assign_roles(platform['operator'],person['id'],[role],wid)
    with TestClient(platform['app'],base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as client:
        assert client.post('/api/auth/login',json={'username':person['username'],'password':PASSWORD}).status_code==200
        assert client.get('/api/backups').status_code==403
        assert client.get('/api/backups',params={'workspace':world['b']['id']}).status_code==403
        response=client.post('/api/backups',params={'workspace':wid},json={'request_id':str(uuid.uuid4()),'reason':'撤权前请求'})
        assert response.status_code==200,response.text
        members.assign_roles(platform['operator'],person['id'],[world['a']['roles']['viewer']],wid)
        assert client.get('/api/backups',params={'workspace':wid}).status_code==403
        result=backup_control.run_one()
        assert result['status']=='cancelled' and not bundle(response.json()).exists()
    assert world['editor'].post('/api/backups',json={'request_id':str(uuid.uuid4()),'reason':'wrong audience'}).status_code==403


def test_revoke_during_export_prevents_success_publication(world,platform,monkeypatch):
    from app.services import members,backup_control
    person=world['people'][1];wid=world['a']['id']
    role=members.create_role(platform['operator'],'备份撤权-'+uuid.uuid4().hex,['backup.request'],wid)
    members.assign_roles(platform['operator'],person['id'],[role],wid)
    login=members.login(person['username'],PASSWORD,audience='management',source=uuid.uuid4().hex)
    actor=members.resolve_session(login['token'],'management')
    job=backup_control.request(actor,uuid.uuid4(),'执行中撤权',wid)
    def export(row):
        members.assign_roles(platform['operator'],person['id'],[world['a']['roles']['viewer']],wid)
        return {'objects':0}
    monkeypatch.setattr(backup_control,'execute',export)
    result=backup_control.run_one()
    assert result['status']=='cancelled' and result['summary']=={}
    assert result['error_code']=='backup_authorization_changed'


def test_live_executor_cannot_be_stolen_and_interrupted_jobs_do_not_overwrite(world,platform,monkeypatch):
    from app.services import backup_control
    from app.storage.database import connection
    job,_=enqueue(platform,world['a']['id'])
    entered,release=threading.Event(),threading.Event()
    def export(row):
        entered.set()
        assert release.wait(10)
        return {'objects':0}
    monkeypatch.setattr(backup_control,'execute',export)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(backup_control.run_one)
        try:
            assert entered.wait(5)
            assert backup_control.run_one()=={'status':'executor_busy'}
        finally:
            release.set()
        assert future.result(timeout=10)['status']=='succeeded'
    job,_=enqueue(platform,world['a']['id'])
    folder=bundle(job);folder.mkdir(parents=True);(folder/'partial').write_text('keep')
    with connection() as c:
        c.execute("UPDATE backup_jobs SET status='running' WHERE id=%s",(job['id'],))
    assert backup_control.run_one()=={'status':'idle'}
    with connection() as c:
        row=c.execute('SELECT status,error_code FROM backup_jobs WHERE id=%s',(job['id'],)).fetchone()
    assert row=={'status':'failed','error_code':'backup_interrupted'}
    assert (folder/'partial').read_text()=='keep'


def test_export_failure_is_durable_and_redacted(world,platform,monkeypatch):
    from app.services import backup_control
    job,_=enqueue(platform,world['a']['id'])
    def fail(row):
        raise OSError('secret-token-in-signed-url /private/path')
    monkeypatch.setattr(backup_control,'execute',fail)
    result=backup_control.run_one()
    assert result['status']=='failed' and result['error_code']=='backup_export_failed'
    response=platform['client'].get('/api/backups',params={'workspace':world['a']['id']})
    assert 'secret-token' not in response.text and '/private/path' not in response.text
    assert response.json()['jobs'][0]['status']=='failed'
    # An explicit new request uses a new immutable output location.
    next_job,_=enqueue(platform,world['a']['id'])
    assert next_job['id']!=job['id']


def test_missing_backup_configuration_refuses_request_without_queue(platform,monkeypatch):
    monkeypatch.delenv('MANAGEMENT_BACKUP_ROOT')
    response=platform['client'].post('/api/backups',json={'request_id':str(uuid.uuid4()),'reason':'无目录'})
    assert response.status_code==503
    assert response.json()['detail']['code']=='backup_storage_unconfigured'


def test_damaged_object_never_publishes_export_completion(world,platform,monkeypatch,tmp_path):
    from app.storage import media
    from app.storage.workspace import workspace_scope
    from app.services import backup_control
    source=tmp_path/'original.bin';source.write_bytes(b'keep original')
    with workspace_scope(world['a']['id']):
        media.publish(source)
    job,_=enqueue(platform,world['a']['id'])
    original_download=media.FilesystemStore.download
    def damaged(self,asset,target):
        original_download(self,asset,target)
        Path(target).write_bytes(b'damaged copy')
    monkeypatch.setattr(media.FilesystemStore,'download',damaged)
    result=backup_control.run_one()
    assert result['status']=='failed'
    assert not (bundle(job)/'workspace/manifest.json').exists()
    assert source.read_bytes()==b'keep original'


def test_read_only_backup_role_cannot_request_and_pagination_is_scoped(world,platform):
    from fastapi.testclient import TestClient
    from app.services import members,backup_control
    wid=world['a']['id']
    for _ in range(2):
        enqueue(platform,wid)
        assert backup_control.run_one()['status']=='succeeded'
    person=world['people'][1]
    role=members.create_role(platform['operator'],'备份查看-'+uuid.uuid4().hex,['backup.read'],wid)
    members.assign_roles(platform['operator'],person['id'],[role],wid)
    with TestClient(platform['app'],base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as c:
        assert c.post('/api/auth/login',json={'username':person['username'],'password':PASSWORD}).status_code==200
        first=c.get('/api/backups',params={'workspace':wid,'limit':1}).json()
        second=c.get('/api/backups',params={'workspace':wid,'limit':1,'after':first['next']}).json()
        assert first['jobs'][0]['id']!=second['jobs'][0]['id'] and second['next'] is None
        assert c.post('/api/backups',params={'workspace':wid},json={'request_id':str(uuid.uuid4()),'reason':'无请求权限'}).status_code==403
