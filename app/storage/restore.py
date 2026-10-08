"""Restore a trusted local bundle into an empty database with atomic fencing."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import uuid
from urllib.parse import quote, urlencode

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
from app.storage import backup, database

RESTORE_LOCK = 642193027
PG_KEYS = {'host':'PGHOST','hostaddr':'PGHOSTADDR','port':'PGPORT','user':'PGUSER','password':'PGPASSWORD',
           'dbname':'PGDATABASE','sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT','sslcert':'PGSSLCERT',
           'sslkey':'PGSSLKEY','channel_binding':'PGCHANNELBINDING','connect_timeout':'PGCONNECT_TIMEOUT',
           'target_session_attrs':'PGTARGETSESSIONATTRS','application_name':'PGAPPNAME','options':'PGOPTIONS'}


def target_environment(url):
    config = conninfo_to_dict(url)
    if not config.get('host') or not config.get('dbname') or set(config)-PG_KEYS.keys():
        raise ValueError('Restore requires explicit supported target connection fields')
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update({PG_KEYS[k]:v for k,v in config.items()})
    env.setdefault('PGCONNECT_TIMEOUT','10')
    uri = 'postgresql:///' + quote(config['dbname'],safe='') + '?' + urlencode({k:v for k,v in config.items() if k!='dbname'})
    return config, env, uri


def fencing_sql(conn, manifest, restore_id, reason, deletion_records=()):
    schema = sql.Identifier(manifest['schema']).as_string(conn)
    literal = lambda value: sql.Literal(value).as_string(conn)
    expected = ','.join('('+str(version)+','+literal(hashlib.sha256(source.encode()).hexdigest())+')'
                        for version, source in database.migrations())
    assets = literal(json.dumps(manifest['objects']))
    details = literal(json.dumps({'restore_id':restore_id,'backup_sha256':manifest['database_sha256'],'reason':reason}))
    deletion_rows=[{**asset,'owner_id':record['owner_id']} for record in deletion_records for asset in record['objects']]
    deletion_json=literal(json.dumps(deletion_rows))
    deletion_roots_json=literal(json.dumps([r for r in deletion_records if r['kind']=='attachment']))
    conversations_json=literal(json.dumps([r for r in deletion_records if r['kind']=='conversation']))
    skills_json=literal(json.dumps([r for r in deletion_records if r['kind']=='skill']))
    accounts_json=literal(json.dumps([{'owner_id':r['owner_id']} for r in deletion_records if r['kind']=='account']))
    return f"""
SET LOCAL search_path TO {schema}, pg_catalog;
CREATE TEMP TABLE restore_expected_migrations(version integer,sha256 text) ON COMMIT DROP;
INSERT INTO restore_expected_migrations VALUES {expected};
DO $$ BEGIN
 IF EXISTS ((SELECT version,sha256 FROM schema_migrations EXCEPT ALL SELECT * FROM restore_expected_migrations)
 UNION ALL (SELECT * FROM restore_expected_migrations EXCEPT ALL SELECT version,sha256 FROM schema_migrations)) THEN
 RAISE EXCEPTION 'restore_schema_version_mismatch'; END IF;
END $$;
CREATE TEMP TABLE restore_deleted_conversations ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset({conversations_json}::jsonb) AS d(workspace_id text,document_id text,owner_id text);
DELETE FROM workspace_documents w USING restore_deleted_conversations d
 WHERE w.kind='conversation' AND w.workspace_id=d.workspace_id AND w.id=d.document_id;
CREATE TEMP TABLE restore_deleted_skills ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset({skills_json}::jsonb) AS d(workspace_id text,skill_id text,owner_id text);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM prompt_skills s JOIN restore_deleted_skills d ON d.skill_id=s.id
 WHERE s.origin_workspace_id<>d.workspace_id OR coalesce(s.uploader_id,'')<>d.owner_id) THEN
 RAISE EXCEPTION 'restore_skill_deletion_identity_mismatch'; END IF;
END $$;
DELETE FROM member_skill_preferences WHERE skill_id IN (SELECT skill_id FROM restore_deleted_skills);
DELETE FROM workspace_skill_installs WHERE skill_id IN (SELECT skill_id FROM restore_deleted_skills);
UPDATE workspace_documents SET value=jsonb_set(value,'{{skills}}',coalesce((SELECT jsonb_agg(item)
 FROM jsonb_array_elements(coalesce(value->'skills','[]'::jsonb)) item
 WHERE item->>'id' NOT IN (SELECT skill_id FROM restore_deleted_skills)),'[]'::jsonb)),revision=revision+1
 WHERE kind='skill_library' AND EXISTS(SELECT 1 FROM restore_deleted_skills);
SET CONSTRAINTS prompt_skill_current_version DEFERRED;
DELETE FROM prompt_skill_versions WHERE skill_id IN (SELECT skill_id FROM restore_deleted_skills);
DELETE FROM prompt_skills WHERE id IN (SELECT skill_id FROM restore_deleted_skills);
CREATE TEMP TABLE restore_closed_accounts ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset({accounts_json}::jsonb) AS d(owner_id text);
DELETE FROM workspace_documents WHERE kind='conversation' AND EXISTS(
 SELECT 1 FROM restore_closed_accounts d WHERE starts_with(id,d.owner_id||'/'));
DELETE FROM member_skill_preferences WHERE member_id IN(SELECT owner_id FROM restore_closed_accounts);
DELETE FROM canvas_draft_copies WHERE member_id IN(SELECT owner_id FROM restore_closed_accounts);
DELETE FROM workspace_member_roles WHERE member_id IN(SELECT owner_id FROM restore_closed_accounts);
DELETE FROM workspace_members WHERE member_id IN(SELECT owner_id FROM restore_closed_accounts);
DELETE FROM platform_member_roles WHERE member_id IN(SELECT owner_id FROM restore_closed_accounts);
UPDATE prompt_skills SET uploader_name='已注销成员' WHERE uploader_id IN(SELECT owner_id FROM restore_closed_accounts);
UPDATE members SET status='closed',closed_at=coalesce(closed_at,clock_timestamp()),
 username='closed_'||substr(encode(sha256(convert_to(id,'UTF8')),'hex'),1,32),display_name='已注销成员',avatar='',
 password_salt=NULL,password_digest=NULL WHERE id IN(SELECT owner_id FROM restore_closed_accounts);
INSERT INTO account_closures(member_id) SELECT id FROM members WHERE id IN(SELECT owner_id FROM restore_closed_accounts)
 ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM members m JOIN restore_closed_accounts d ON d.owner_id=m.id) AND (
 NOT EXISTS(SELECT 1 FROM platform_member_roles g JOIN roles r ON r.id=g.role_id AND r.active AND r.builtin_key='superadmin'
 JOIN members m ON m.id=g.member_id AND m.status='active') OR EXISTS(
 SELECT 1 FROM workspaces w WHERE w.status='active' AND EXISTS(SELECT 1 FROM roles r WHERE r.workspace_id=w.id AND r.builtin_key='admin')
 AND NOT EXISTS(SELECT 1 FROM workspace_member_roles g JOIN roles r ON r.id=g.role_id AND r.active AND r.builtin_key='admin'
 JOIN members m ON m.id=g.member_id AND m.status='active' WHERE g.workspace_id=w.id))) THEN
 RAISE EXCEPTION 'restore_administrator_transfer_required'; END IF;
END $$;
INSERT INTO management_events(action,target_id,details)
 SELECT 'account.close_replayed',owner_id,jsonb_build_object('owner_id',owner_id,'restore_id',{literal(restore_id)}) FROM restore_closed_accounts;
CREATE TEMP TABLE restore_expected_assets ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset({assets}::jsonb) AS a(id text,bucket text,region text,object_key text,
 object_version_id text,size_bytes bigint,sha256 text,status text);
DO $$ BEGIN
 IF EXISTS ((SELECT id,bucket,region,object_key,object_version_id,size_bytes,sha256,status FROM assets
 EXCEPT ALL SELECT * FROM restore_expected_assets) UNION ALL
 (SELECT * FROM restore_expected_assets EXCEPT ALL
 SELECT id,bucket,region,object_key,object_version_id,size_bytes,sha256,status FROM assets)) THEN
 RAISE EXCEPTION 'restore_asset_manifest_mismatch'; END IF;
END $$;
CREATE TEMP TABLE restore_deletion_objects ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset({deletion_json}::jsonb) AS d(id text,workspace_id text,owner_id text,
 bucket text,object_key text,object_version_id text,unpublished boolean);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM assets a JOIN restore_deletion_objects d ON d.id=a.id WHERE
 a.workspace_id<>d.workspace_id OR a.metadata->>'chat_owner' IS DISTINCT FROM d.owner_id
 OR a.bucket<>d.bucket OR a.object_key<>d.object_key
 OR (d.object_version_id IS NOT NULL AND a.object_version_id IS DISTINCT FROM d.object_version_id)) THEN
 RAISE EXCEPTION 'restore_deletion_identity_mismatch'; END IF;
END $$;
UPDATE assets a SET status='deleted',display_name='',deleted_at=coalesce(deleted_at,clock_timestamp()),updated_at=clock_timestamp()
 FROM restore_deletion_objects d WHERE a.id=d.id AND a.workspace_id=d.workspace_id;
INSERT INTO chat_attachment_deletions(workspace_id,asset_id,owner_id,objects,state,completed_at)
 SELECT d.workspace_id,d.asset_id,d.owner_id,d.objects,'succeeded',clock_timestamp()
 FROM jsonb_to_recordset({deletion_roots_json}::jsonb) AS d(workspace_id text,asset_id text,owner_id text,objects jsonb)
 WHERE EXISTS(SELECT 1 FROM assets a WHERE a.workspace_id=d.workspace_id AND a.id=d.asset_id)
 ON CONFLICT(workspace_id,asset_id) DO UPDATE SET state='succeeded',completed_at=clock_timestamp(),
 lease_token=NULL,lease_until=NULL,last_error='';
INSERT INTO management_events(action,target_id,workspace_id,details)
 SELECT DISTINCT 'chat.attachment.delete_replayed',d.id,d.workspace_id,jsonb_build_object('owner_id',d.owner_id,'restore_id',{literal(restore_id)})
 FROM restore_deletion_objects d JOIN assets a ON a.id=d.id AND a.workspace_id=d.workspace_id;
UPDATE chat_attachment_deletions j SET state='succeeded',completed_at=clock_timestamp(),lease_token=NULL,
 lease_until=NULL,last_error='' WHERE EXISTS(SELECT 1 FROM restore_deletion_objects d
 WHERE d.id=j.asset_id AND d.workspace_id=j.workspace_id);
DELETE FROM chat_upload_reservations;
UPDATE chat_attachment_deletions SET lease_token=NULL,lease_until=NULL,available_at=clock_timestamp()
 WHERE state<>'succeeded';
CREATE TEMP TABLE restore_counts AS SELECT
 (SELECT count(*) FROM member_sessions WHERE revoked_at IS NULL) AS sessions,
 (SELECT count(*) FROM canvas_edit_leases) AS canvas_leases,
 (SELECT count(*) FROM tasks WHERE status IN ('queued','running','submitting','polling','finalizing')) AS tasks_to_review,
 (SELECT count(*) FROM media_uploads WHERE status IN ('initiating','uploading','verifying')) AS uploads_aborted,
 (SELECT count(*) FROM backup_jobs WHERE status IN ('queued','running')) AS backups_interrupted;
UPDATE member_sessions SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL;
UPDATE members SET auth_version=auth_version+1;
UPDATE member_activations SET consumed_at=clock_timestamp() WHERE consumed_at IS NULL;
INSERT INTO collaboration_events(workspace_id,canvas_id,action,previous_generation,generation,revision,reason)
 SELECT l.workspace_id,l.canvas_id,'database.restore.invalidate',l.generation,l.generation+1,c.revision,{literal(reason)}
 FROM canvas_edit_leases l JOIN canvases c ON c.workspace_id=l.workspace_id AND c.id=l.canvas_id;
UPDATE canvas_edit_leases SET generation=generation+1,member_id=NULL,member_auth_version=NULL,login_session_id=NULL,
 edit_session_id=NULL,token_hash=NULL,expires_at=NULL,released_at=clock_timestamp();
UPDATE canvas_transfer_requests SET status='rejected',resolved_at=clock_timestamp() WHERE status='pending';
UPDATE canvas_transfer_requests SET expires_at=LEAST(expires_at,clock_timestamp());
UPDATE tasks SET status='needs_review',error_code='database_restored_requires_review',
 error_message='数据库已恢复；请核对备份之后的提交与结果，未重新生成',updated_at=clock_timestamp()
 WHERE status IN ('queued','running','submitting','polling','finalizing');
UPDATE tasks SET lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE lease_token IS NOT NULL;
UPDATE assets SET status='failed',updated_at=clock_timestamp() WHERE status<>'deleted' AND id IN
 (SELECT asset_id FROM media_uploads WHERE status IN ('initiating','uploading','verifying'));
UPDATE media_uploads SET status='aborted',updated_at=clock_timestamp()
 WHERE status IN ('initiating','uploading','verifying');
UPDATE media_uploads SET lease_token=NULL,lease_until=NULL,expires_at=LEAST(expires_at,clock_timestamp());
UPDATE backup_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'failed' END,
 error_code='database_restored_requires_review',completed_at=clock_timestamp() WHERE status IN ('queued','running');
DELETE FROM service_heartbeats;
DELETE FROM member_presence_sockets;
INSERT INTO maintenance_controls(scope_key,mode,version,message,reason,updated_at)
 VALUES('platform','recovering',1,'数据库已恢复，等待运维检查',{literal(reason)},clock_timestamp())
 ON CONFLICT(scope_key) DO UPDATE SET mode='recovering',version=maintenance_controls.version+1,
 message=excluded.message,reason=excluded.reason,updated_by=NULL,planned_at=NULL,drain_started_at=NULL,drain_deadline=NULL,updated_at=excluded.updated_at;
INSERT INTO management_events(action,target_id,details)
 SELECT 'database.restore',{literal(restore_id)},{details}::jsonb || to_jsonb(c) FROM restore_counts c;
SELECT json_build_object('restore_id',{literal(restore_id)},'fenced',true,'counts',to_jsonb(c)) FROM restore_counts c;
"""


def restore(path, target_url, expected_database, destination, *, reason, deletion_ledger_directory=None):
    path, destination = Path(path).resolve(), Path(destination).resolve()
    if not isinstance(reason,str) or not reason.strip() or len(reason)>1000:
        raise ValueError('Restore reason required')
    manifest = backup.verify(path)
    from app.storage import deletion_ledger
    ledger,records=deletion_ledger.load(manifest.get('deletion_ledger'),deletion_ledger_directory)
    if manifest['media_backend']!='filesystem' or not re.fullmatch(r'[a-z][a-z0-9_]{0,62}',manifest['schema']):
        raise ValueError('Restore requires a local filesystem bundle with a valid schema')
    if destination.exists() or path.is_relative_to(destination) or destination.is_relative_to(path.with_suffix('.objects')):
        raise ValueError('Restore destination must be new and separate from the bundle')
    config, env, uri = target_environment(target_url)
    if config['dbname']!=expected_database or expected_database in {'postgres','template0','template1'}:
        raise ValueError('Restore target database mismatch')
    restore_id = str(uuid.uuid4())
    with psycopg.connect(target_url,autocommit=True,row_factory=dict_row,connect_timeout=10) as guard:
        guard.execute('SELECT pg_advisory_lock(%s)',(RESTORE_LOCK,))
        if guard.execute('SELECT current_database() AS name').fetchone()['name']!=expected_database:
            raise ValueError('Restore target database mismatch')
        # Never overwrite any existing application, including a different schema.
        occupied = guard.execute("""SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_')
            OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
            OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS occupied""").fetchone()['occupied']
        if occupied or guard.execute('SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() LIMIT 1').fetchone():
            raise ValueError('Restore target must be empty and have no other clients')
        destination.mkdir(parents=True)
        objects = backup.restore_objects(path,destination/'objects',deletion_records=records)
        # Collect deletions committed while copying; later deletions are also
        # blocked by the live ledger at every private-media read entry point.
        ledger,records=deletion_ledger.load(manifest['deletion_ledger'],ledger['directory'])
        removed=deletion_ledger.prune_restored_objects(destination/'objects',manifest,records)
        source_sql, fence_sql = destination/'database.sql', destination/'fence.sql'
        subprocess.run([backup.pg_tool('pg_restore'),'--no-owner','--no-privileges','--file='+str(source_sql),str(path)],
                       check=True,capture_output=True,timeout=600,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        fence_sql.write_text(fencing_sql(guard,manifest,restore_id,reason.strip(),records),encoding='utf-8')
        # DDL, records and credential invalidation become visible together.
        result = subprocess.run([backup.pg_tool('psql'),'-X','-qAt','--no-password','--set=ON_ERROR_STOP=1',
            '--single-transaction','--file='+str(source_sql),'--file='+str(fence_sql)],env=env,
            check=True,capture_output=True,timeout=600,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        summary = json.loads(result.stdout.decode('utf-8').strip().splitlines()[-1])
        if summary.get('restore_id')!=restore_id or summary.get('fenced') is not True:
            raise RuntimeError('Restore completion evidence missing')
        values = {'DATABASE_BACKEND':'postgres','DATABASE_URL':uri,'DATABASE_SCHEMA':manifest['schema'],
                  'AUTH_MODE':'members','MEDIA_BACKEND':'filesystem','OBJECT_STORE_ROOT':str(destination/'objects'),
                  'MEDIA_TEMP_DIR':str(destination/'tmp'),'APP_RUNTIME_DIR':str(destination/'runtime'),
                  'DELETION_LEDGER_ROOT':ledger['directory'],
                  'MEDIA_SIGNING_KEY':secrets.token_urlsafe(48),'CLOUD_EMBEDDED_WORKER':'false'}
        with os.fdopen(os.open(destination/'storage.env',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w',encoding='utf-8') as file:
            file.write(''.join(k+'='+v+'\n' for k,v in values.items()))
        receipt = {**summary,'database':expected_database,'schema':manifest['schema'],
                   'objects':objects['objects'],'object_bytes':objects['object_bytes'],
                   'backup_sha256':manifest['database_sha256'],'mode':'recovering'}
        receipt['deleted_objects_replayed']=removed+objects['deletions_skipped']
        with (destination/'restore-complete.json').open('x',encoding='utf-8') as file:
            json.dump(receipt,file,ensure_ascii=False,indent=2)
        return receipt
