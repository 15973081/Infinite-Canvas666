"""Real pg_dump/psql restore with atomic member, lease and worker fencing."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys
import uuid
from contextlib import contextmanager
from unittest.mock import patch

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
import pytest

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
PASSWORD='restore-test-password-12345'


@pytest.fixture
def bundle(tmp_path):
    from app.storage import database, media, canvases, backup
    from app.storage.workspace import workspace_scope
    from app.services import members, canvas_leases, provider_control, authorization as az
    original_url=os.environ['DATABASE_URL'];source='restore_fixture_'+uuid.uuid4().hex
    target='cloud_restore_'+uuid.uuid4().hex
    target_url=make_conninfo(original_url,dbname=target)
    database.close()
    with tempfile.TemporaryDirectory(prefix='r27-',dir=Path(__file__).resolve().parents[1]/'.local/cloud') as short_root, psycopg.connect(make_conninfo(original_url,dbname='postgres'),autocommit=True) as admin:
        tmp_path=Path(short_root)
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target)))
        try:
            with patch.dict(os.environ,{'DATABASE_SCHEMA':source,'MEDIA_BACKEND':'filesystem','OBJECT_STORE_ROOT':str(tmp_path/'source-objects'),
                'DELETION_LEDGER_ROOT':str(tmp_path/'source-ledger'),
                'MEDIA_TEMP_DIR':str(tmp_path/'source-tmp'),'AUTH_MODE':'members','PUBLIC_BASE_URL':'http://testserver','MEDIA_SIGNING_KEY':'original-restore-signing-key-1234567890'}):
                database.migrate()
                person=members.bootstrap('restore-admin','恢复管理员',PASSWORD)
                admin_token=members.login('restore-admin',PASSWORD,audience='management')['token']
                operator=members.resolve_session(admin_token,'management')
                spaces=[members.create_workspace(operator,name,person['id']) for name in ('恢复空间 A','恢复空间 B')]
                invited=members.create_member(operator,'restore-editor','编辑者');editor=members.activate(invited['activation_token'],PASSWORD)
                viewer_invite=members.create_member(operator,'restore-viewer','审核者');viewer=members.activate(viewer_invite['activation_token'],PASSWORD)
                pending=members.create_member(operator,'restore-pending','待激活成员')
                role=members.create_role(operator,'自定义审核员',['canvas.read','asset.read'],spaces[1]['id'])
                members.assign_roles(operator,viewer['id'],[role],spaces[1]['id'])
                members.assign_roles(operator,editor['id'],[spaces[0]['roles']['editor']],spaces[0]['id'])
                members.assign_roles(operator,editor['id'],[spaces[1]['roles']['editor']],spaces[1]['id'])
                member_token=members.login('restore-editor',PASSWORD)['token'];actor=members.resolve_session(member_token)
                provider_control.save(operator,'restore-provider',{'name':'恢复供应商','protocol':'openai','base_url':'https://provider.invalid','image_models':['synthetic']},0,
                    secrets={'api_key':'synthetic-preserved-provider-key'},reason='恢复验收')
                path=tmp_path/'original.bin';path.write_bytes(b'immutable recovery content')
                canvases_data=[]
                for i,space in enumerate(spaces):
                    with workspace_scope(space['id']):
                        for kind in ('classic','smart'):
                            value={'id':'restored-'+kind+'-'+str(i),'kind':kind,'title':'恢复画布','nodes':[{'id':'n','type':'text','text':'保留内容'}],'connections':[]}
                            canvases.save(value);canvases_data.append(value['id'])
                with workspace_scope(spaces[0]['id']):
                    asset=media.publish(path);old_signed=media.browser_url(asset)
                    lease=canvas_leases.acquire(actor,canvases_data[0])
                    from app.services import member_presence, canvas_page_reports
                    member_presence.status(actor,uuid.uuid4())
                    canvas_page_reports.report(actor,canvases_data[0],uuid.uuid4(),1,False)
                    unfinished=media.publish(path)
                with database.connection() as c:
                    c.execute("UPDATE assets SET status='uploading' WHERE id=%s",(unfinished['id'],))
                    c.execute("""INSERT INTO media_uploads(asset_id,workspace_id,idempotency_key,request_sha256,backend,size_bytes,part_size,part_count,status,expires_at)
                        VALUES(%s,%s,'restore-upload',%s,'filesystem',1,1,1,'uploading',clock_timestamp()+interval '1 hour')""",(unfinished['id'],spaces[0]['id'],'0'*64))
                    for status in ('queued','submitting','polling','finalizing','succeeded'):
                        c.execute("""INSERT INTO tasks(id,workspace_id,kind,status,idempotency_key,request_sha256,lease_owner,lease_token,lease_until)
                            VALUES(%s,%s,'video',%s,%s,%s,'source-worker',gen_random_uuid(),clock_timestamp()+interval '1 hour')""",
                            ('restore-task-'+status,spaces[0]['id'],status,'restore-task-'+status,'0'*64))
                    c.execute("""INSERT INTO ledger_entries(id,workspace_id,canvas_id,created_at,log_json,cost_json,source,cost_status,amount_micros,currency,kind,estimated,status,updated_at)
                        VALUES('restore-fee',%s,%s,123,'{"usage":7}','{"exact":true}','original','known',1234567,'CNY','video',0,'complete',123)""",(spaces[0]['id'],canvases_data[0]))
                    c.execute("""INSERT INTO backup_jobs(id,workspace_id,member_id,session_id,kind,status,reason)
                        VALUES(%s,%s,%s,%s,'workspace_export','running','原备份任务')""",(uuid.uuid4(),spaces[0]['id'],operator.member_id,operator.session_id))
                    c.execute("INSERT INTO service_heartbeats(instance_id,kind) VALUES('source-worker','worker')")
                    preserved={table:c.execute(sql.SQL('SELECT * FROM {} ORDER BY 1').format(sql.Identifier(table))).fetchall()
                        for table in ('workspaces','roles','role_permissions','workspace_members','workspace_member_roles','platform_member_roles','canvases','ledger_entries','managed_providers')}
                dump=tmp_path/'backup.dump';backup.dump(dump)
                yield {'dump':dump,'target':target,'url':target_url,'destination':tmp_path/'recovered','schema':source,
                       'spaces':spaces,'asset':asset,'lease':lease,'canvases':canvases_data,'admin_token':admin_token,'member_token':member_token,
                       'activation':pending['activation_token'],'preserved':preserved,'old_signed':old_signed,'path':path}
        finally:
            database.close()
            with psycopg.connect(original_url,autocommit=True) as source_conn:
                assert source.startswith('restore_fixture_') and len(source)==48
                source_conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(source)))
            assert target.startswith('cloud_restore_') and len(target)==46
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(target)))


@contextmanager
def restored_environment(bundle):
    from app.storage import database
    values=dict(line.split('=',1) for line in (bundle['destination']/'storage.env').read_text().splitlines())
    database.close()
    with patch.dict(os.environ,values):
        try:
            yield
        finally:
            database.close()


def test_real_restore_preserves_business_data_and_invalidates_every_old_session(bundle):
    from app.storage import restore, database, media
    from app.storage.workspace import workspace_scope
    from app.services import members, maintenance_control as control, canvas_leases, authorization as az, provider_control
    from fastapi import HTTPException
    from fastapi.testclient import TestClient
    from app.services.member_gateway import COOKIE
    result=restore.restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='完整恢复验收')
    assert result['fenced'] and result['mode']=='recovering' and result['counts']['tasks_to_review']==4
    with restored_environment(bundle):
        database.check()
        with database.connection() as c:
            for table,rows in bundle['preserved'].items():
                assert c.execute(sql.SQL('SELECT * FROM {} ORDER BY 1').format(sql.Identifier(table))).fetchall()==rows,table
            assert c.execute('SELECT count(*) AS n FROM member_sessions WHERE revoked_at IS NULL').fetchone()['n']==0
            assert c.execute('SELECT token_hash,generation FROM canvas_edit_leases').fetchone()=={'token_hash':None,'generation':bundle['lease']['generation']+1}
            assert {r['status'] for r in c.execute("SELECT status FROM tasks WHERE id<>'restore-task-succeeded'")}=={'needs_review'}
            assert c.execute('SELECT count(*) AS n FROM tasks WHERE lease_token IS NOT NULL').fetchone()['n']==0
            assert c.execute('SELECT status FROM media_uploads').fetchone()['status']=='aborted'
            assert c.execute('SELECT status FROM backup_jobs').fetchone()['status']=='failed'
            assert c.execute('SELECT count(*) AS n FROM service_heartbeats').fetchone()['n']==0
            assert c.execute('SELECT count(*) AS n FROM member_presence_sockets').fetchone()['n']==0
            assert c.execute("SELECT count(*) AS n FROM management_events WHERE action='database.restore'").fetchone()['n']==1
        assert members.resolve_session(bundle['admin_token'],'management') is None
        assert members.resolve_session(bundle['member_token']) is None
        with pytest.raises(HTTPException): members.activate(bundle['activation'],PASSWORD)
        admin_login=members.login('restore-admin',PASSWORD,audience='management');admin=members.resolve_session(admin_login['token'],'management')
        assert control.snapshot(admin)['control']['mode']=='recovering'
        with database.connection() as c:
            provider=c.execute("SELECT * FROM managed_providers WHERE id='restore-provider'").fetchone()
            assert provider_control.decrypt(provider)['api_key']=='synthetic-preserved-provider-key'
        from main import app
        with TestClient(app) as client:
            client.cookies.set(COOKIE,bundle['member_token'])
            assert client.get('/api/canvases',headers={'X-Workspace-ID':bundle['spaces'][0]['id']}).status_code==401
            client.cookies.clear()
            assert client.post('/api/auth/login',json={'username':'restore-editor','password':PASSWORD}).status_code==200
            assert client.get('/api/canvases',headers={'X-Workspace-ID':bundle['spaces'][0]['id']}).status_code==503
            state=control.snapshot(admin)['control']
            control.change(admin,None,'normal',state['version'],reason='恢复检查完成',confirm_recovery=True)
            assert client.get(bundle['old_signed'],headers={'X-Workspace-ID':bundle['spaces'][0]['id']}).status_code==403
            actor=members.resolve_session(client.cookies.get(COOKIE))
            with workspace_scope(bundle['spaces'][0]['id']):
                from app.services.member_presence import status
                assert status(actor)['online_members']==0
                with pytest.raises(HTTPException):
                    canvas_leases.renew(actor,bundle['canvases'][0],canvas_leases.Proof(bundle['lease']['edit_token'],bundle['lease']['generation']))
                assert canvas_leases.acquire(actor,bundle['canvases'][0])['generation']>bundle['lease']['generation']
                restored=media.get_asset(bundle['asset']['id'])
                assert restored['object_version_id']==bundle['asset']['object_version_id']
                assert client.get(media.browser_url(restored),headers={'X-Workspace-ID':bundle['spaces'][0]['id']}).content==bundle['path'].read_bytes()
                with media.operation_scope(): assert Path(media.materialize(restored['id'])).read_bytes()==bundle['path'].read_bytes()
    # Source identities and source lease remain untouched by isolated restore.
    assert members.resolve_session(bundle['admin_token'],'management') is not None


def test_restore_rejects_occupied_target_and_existing_destination(bundle):
    from app.storage.restore import restore
    with psycopg.connect(bundle['url'],autocommit=True) as c:
        c.execute('CREATE TABLE keep(value text)');c.execute("INSERT INTO keep VALUES('original')")
    with pytest.raises(ValueError,match='empty'):
        restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='拒绝覆盖')
    assert not bundle['destination'].exists()
    with psycopg.connect(bundle['url'],autocommit=True) as c:
        assert c.execute('SELECT value FROM keep').fetchone()[0]=='original'
    bundle['destination'].mkdir();marker=bundle['destination']/'keep';marker.write_text('original')
    with pytest.raises(ValueError,match='new'):
        restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='拒绝目录覆盖')
    assert marker.read_text()=='original'


def test_fencing_failure_rolls_back_raw_restored_sessions_and_schema(bundle,monkeypatch):
    from app.storage import restore
    original=restore.fencing_sql
    monkeypatch.setattr(restore,'fencing_sql',lambda *args: original(*args)+"\nSELECT 1/0;\n")
    with pytest.raises(subprocess.CalledProcessError):
        restore.restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='原子恢复故障')
    with psycopg.connect(bundle['url']) as c:
        assert c.execute('SELECT 1 FROM pg_namespace WHERE nspname=%s',(bundle['schema'],)).fetchone() is None
    assert not (bundle['destination']/'restore-complete.json').exists()
    assert not (bundle['destination']/'storage.env').exists()


def test_cli_restores_from_environment_without_leaking_target_credentials(bundle):
    env={**os.environ,'RESTORE_DATABASE_URL':bundle['url']}
    result=subprocess.run([sys.executable,'tools/cloud_restore.py','--source',str(bundle['dump']),'--database',bundle['target'],
        '--destination',str(bundle['destination']),'--reason','命令行恢复验收'],env=env,capture_output=True,text=True,encoding='utf-8',timeout=30,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)['fenced'] is True
    assert bundle['url'] not in result.stdout+result.stderr
    assert (bundle['destination']/'restore-complete.json').exists()


@pytest.mark.parametrize('mismatch',['assets','migrations'])
def test_manifest_or_migration_mismatch_never_publishes_restored_credentials(bundle,monkeypatch,mismatch):
    from app.storage import restore, database
    if mismatch=='assets':
        path=bundle['dump'].with_suffix('.objects.json')
        manifest=json.loads(path.read_text(encoding='utf-8'))
        manifest['objects'][0]['region']='different-region'
        path.write_text(json.dumps(manifest),encoding='utf-8')
    else:
        migrations=database.migrations()
        monkeypatch.setattr(database,'migrations',lambda:[(v,s+'\n-- changed release') for v,s in migrations])
    with pytest.raises(subprocess.CalledProcessError):
        restore.restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='拒绝不一致恢复')
    with psycopg.connect(bundle['url']) as c:
        assert c.execute('SELECT 1 FROM pg_namespace WHERE nspname=%s',(bundle['schema'],)).fetchone() is None
    assert not (bundle['destination']/'restore-complete.json').exists()


def test_restore_rejects_wrong_database_name_and_live_target_clients(bundle):
    from app.storage.restore import restore
    with pytest.raises(ValueError,match='mismatch'):
        restore(bundle['dump'],bundle['url'],'wrong_database',bundle['destination'],reason='目标防错')
    with psycopg.connect(bundle['url']) as other:
        other.execute('SELECT 1')
        with pytest.raises(ValueError,match='other clients'):
            restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='目标连接防错')
    assert not bundle['destination'].exists()


def test_old_backup_replays_later_private_attachment_deletion_before_opening_restored_database(bundle):
    from app.storage import backup,media,restore,database
    from app.storage.workspace import workspace_scope
    from app.services import members,chat_attachments
    from app.services.member_context import access_scope
    actor=members.resolve_session(bundle['member_token'])
    workspace=bundle['spaces'][0]['id']
    with workspace_scope(workspace),access_scope(actor,workspace,()):
        private=media.publish(bundle['path'],'private-original.txt',role='chat-attachment',
                              metadata={'chat_owner':actor.member_id,'chat_shared':False})
        preview=media.publish(bundle['path'],'private-preview.bin',parent_asset_id=private['id'],role='preview')
    old=bundle['dump'].parent/'before-private-deletion.dump';backup.dump(old)
    with workspace_scope(workspace),access_scope(actor,workspace,()):
        assert chat_attachments.delete(private['id'],True)=={'deleted':True}
    offline=bundle['dump'].parent/'offline-objects'
    receipt=backup.restore_objects(old,offline)
    assert receipt['deletions_skipped']==2
    assert not media.FilesystemStore(offline).path(private['object_key'],private['object_version_id']).exists()
    assert not media.FilesystemStore(offline).path(preview['object_key'],preview['object_version_id']).exists()
    assert backup.verify(old)['objects']  # Retention of the original backup is separate.
    result=restore.restore(old,bundle['url'],bundle['target'],bundle['destination'],reason='旧备份删除重放')
    assert result['deleted_objects_replayed']==2
    with restored_environment(bundle),workspace_scope(workspace):
        with database.connection() as conn:
            row=conn.execute('SELECT * FROM assets WHERE id=%s',(private['id'],)).fetchone()
            assert row['status']=='deleted' and not row['display_name']
            assert conn.execute('SELECT state FROM chat_attachment_deletions WHERE asset_id=%s',(private['id'],)).fetchone()['state']=='succeeded'
            assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='chat.attachment.delete_replayed' AND target_id=%s",(private['id'],)).fetchone()['n']==1
        assert not media.store().path(private['object_key'],private['object_version_id']).exists()
        assert not media.store().path(preview['object_key'],preview['object_version_id']).exists()
        assert media.store().path(bundle['asset']['object_key'],bundle['asset']['object_version_id']).exists()
        from fastapi import HTTPException
        with pytest.raises(HTTPException): media.get_asset(private['id'])
        with pytest.raises(HTTPException): media.get_asset(preview['id'])


def test_missing_or_wrong_deletion_ledger_stops_restore_before_destination_creation(bundle,tmp_path):
    from app.storage import backup,restore,deletion_ledger
    manifest=backup.verify(bundle['dump'])
    wrong=tmp_path/'wrong-ledger';deletion_ledger.identity(wrong,create=True)
    with pytest.raises(ValueError,match='identity mismatch'):
        restore.restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='账本身份防错',deletion_ledger_directory=wrong)
    assert not bundle['destination'].exists()
    with pytest.raises(ValueError,match='identity is missing'):
        restore.restore(bundle['dump'],bundle['url'],bundle['target'],bundle['destination'],reason='账本缺失防错',deletion_ledger_directory=tmp_path/'missing')
    assert not bundle['destination'].exists()


def test_old_backup_replays_account_closure_conversation_and_skill_package_deletion(bundle):
    from app.storage import backup,media,restore,database
    from app.storage.workspace import workspace_scope
    from app.services import members,prompt_skills,account_closure,chat_attachment_cleanup
    from app.services.member_context import access_scope
    from app.services.chat import new_conversation,save_conversation
    from app.storage.documents import delete
    from test_prompt_skills import MD
    actor=members.resolve_session(bundle['member_token']);workspace=bundle['spaces'][0]['id']
    with workspace_scope(workspace),access_scope(actor,workspace,()):
        private=media.publish(bundle['path'],'close-original.txt',role='chat-attachment',metadata={'chat_owner':actor.member_id,'chat_shared':False})
        first=new_conversation(actor.member_id,'explicit-deletion')
        second=new_conversation(actor.member_id,'close-snapshot')
        second['messages']=[{'role':'user','content':'private-snapshot-to-remove','skill_refs':[{'context':'private-skill-history'}]}]
        save_conversation(actor.member_id,second)
        skill=prompt_skills.publish(MD,'SKILL.md','workspace')
    old=bundle['dump'].parent/'before-account-closure.dump';backup.dump(old)
    with workspace_scope(workspace),access_scope(actor,workspace,()):
        delete('conversation',actor.member_id+'/'+first['id'])
        prompt_skills.change(skill['id'],remove=True);prompt_skills.uninstall(skill['id']);prompt_skills.purge(skill['id'],True)
    result=account_closure.close(actor,PASSWORD,'注销并删除本人数据')
    assert result['closed'] and result['pending_attachments']==1
    assert chat_attachment_cleanup.run_pending()==[{'deleted':True}]
    receipt=restore.restore(old,bundle['url'],bundle['target'],bundle['destination'],reason='注销与正文删除重放')
    assert receipt['deleted_objects_replayed']==1
    with restored_environment(bundle):
        with database.connection() as conn:
            row=conn.execute('SELECT * FROM members WHERE id=%s',(actor.member_id,)).fetchone()
            assert row['status']=='closed' and not row['password_digest'] and row['display_name']=='已注销成员'
            assert conn.execute("SELECT count(*) AS n FROM workspace_documents WHERE kind='conversation' AND starts_with(id,%s)",(actor.member_id+'/',)).fetchone()['n']==0
            assert conn.execute('SELECT count(*) AS n FROM prompt_skill_versions WHERE skill_id=%s',(skill['id'],)).fetchone()['n']==0
            assert conn.execute('SELECT count(*) AS n FROM workspace_skill_installs WHERE skill_id=%s',(skill['id'],)).fetchone()['n']==0
            assert conn.execute("SELECT value FROM workspace_documents WHERE kind='skill_library'").fetchone()['value']['skills']==[]
            assert conn.execute('SELECT status FROM assets WHERE id=%s',(private['id'],)).fetchone()['status']=='deleted'
            assert conn.execute('SELECT count(*) AS n FROM workspace_members WHERE member_id=%s',(actor.member_id,)).fetchone()['n']==0
            assert conn.execute('SELECT 1 FROM account_closures WHERE member_id=%s',(actor.member_id,)).fetchone()
            assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='account.close_replayed' AND target_id=%s",(actor.member_id,)).fetchone()['n']==1
        assert members.resolve_session(bundle['member_token']) is None
        assert not media.FilesystemStore(bundle['destination']/'objects').path(private['object_key'],private['object_version_id']).exists()
