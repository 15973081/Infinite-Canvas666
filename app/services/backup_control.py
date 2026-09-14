"""Audited backup requests and a separate, serial backup executor.

Artifacts stay in the operator-configured private directory. No HTTP download,
restore, arbitrary file path, or subprocess command is accepted from a client.
"""
import os
from pathlib import Path

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import authorization as az
from app.storage import database

EXECUTOR_LOCK = 642193015


def backup_root():
    value = os.getenv('MANAGEMENT_BACKUP_ROOT', '').strip()
    if not value or not Path(value).is_absolute():
        az.fail('backup_storage_unconfigured', 503)
    return Path(value).resolve()


def require(conn, actor, workspace, *, request=False):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, ('backup.request' if request else 'backup.read') if workspace else 'backup.platform', workspace)


def public(row):
    return {key: row[key] for key in ('id','workspace_id','kind','status','reason','created_at',
                                      'started_at','completed_at','summary','error_code')}


def listing(actor, workspace=None, after=None, limit=50):
    with az.policy_transaction() as conn:
        require(conn, actor, workspace)
        rows = conn.execute("""SELECT * FROM backup_jobs WHERE workspace_id IS NOT DISTINCT FROM %s
            AND (%s::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM backup_jobs
                WHERE id=%s AND workspace_id IS NOT DISTINCT FROM %s))
            ORDER BY created_at DESC,id DESC LIMIT %s""",
            (workspace, after, after, workspace, limit+1)).fetchall()
        return {'jobs': [public(row) for row in rows[:limit]],
                'next': str(rows[limit-1]['id']) if len(rows)>limit else None,
                'configured': bool(os.getenv('MANAGEMENT_BACKUP_ROOT', '').strip()) and Path(os.getenv('MANAGEMENT_BACKUP_ROOT', '')).is_absolute()}


def request(actor, request_id, reason, workspace=None):
    if not isinstance(reason, str) or not reason.strip() or len(reason)>1000 or workspace == '':
        az.fail('invalid_backup_request', 400)
    with az.policy_transaction(change=True) as conn:
        require(conn, actor, workspace, request=True)
        row = conn.execute('SELECT * FROM backup_jobs WHERE id=%s', (request_id,)).fetchone()
        if row:
            if (row['member_id'],row['session_id'],row['workspace_id'],row['reason']) != (
                    actor.member_id,actor.session_id,workspace,reason.strip()):
                az.fail('backup_request_conflict',409)
            return public(row)
        backup_root()
        if conn.execute("""SELECT 1 FROM backup_jobs WHERE workspace_id IS NOT DISTINCT FROM %s
            AND status IN ('queued','running')""",(workspace,)).fetchone():
            az.fail('backup_already_pending',409)
        row = conn.execute("""INSERT INTO backup_jobs(id,workspace_id,member_id,session_id,kind,reason)
            VALUES(%s,%s,%s,%s,%s,%s) RETURNING *""",
            (request_id,workspace,actor.member_id,actor.session_id,
             'workspace_export' if workspace else 'platform_backup',reason.strip())).fetchone()
        az.audit(conn,actor,'backup.request',str(request_id),workspace,{'kind':row['kind'],'reason':reason.strip()})
        return public(row)


def finish(row, status, *, summary=None, error=None):
    with az.policy_transaction(change=True) as conn:
        # Recheck the original management session and current permissions before
        # publishing success. A revoked request leaves only a private artifact.
        actor = az.Principal(row['member_id'],row['session_id'],'management')
        if status == 'succeeded':
            try:
                require(conn,actor,row['workspace_id'],request=True)
            except HTTPException:
                status, summary, error = 'cancelled', {}, 'backup_authorization_changed'
        updated = conn.execute("""UPDATE backup_jobs SET status=%s,summary=%s,error_code=%s,
            completed_at=clock_timestamp() WHERE id=%s AND status='running' RETURNING *""",
            (status,Jsonb(summary or {}),error,row['id'])).fetchone()
        if updated:
            az.audit(conn,None,'backup.'+status,str(row['id']),row['workspace_id'],
                     {'requester_id':row['member_id'],'error_code':error,'summary':summary or {}})
        return public(updated) if updated else None


def execute(row):
    from app.storage import backup, workspace_export
    folder = backup_root() / database.schema_name() / str(row['id'])
    folder.mkdir(parents=True,exist_ok=False)
    if row['workspace_id']:
        manifest = workspace_export.export(folder / 'workspace',row['workspace_id'])
        workspace_export.verify(folder / 'workspace')
        return {'tables':manifest['counts'],'objects':manifest['object_count'],
                'object_bytes':manifest['object_bytes'],'unfinished_assets':manifest['unfinished_assets']}
    result = backup.dump(folder / 'database.dump')
    manifest = backup.verify(folder / 'database.dump')
    return {key:result[key] for key in ('objects','object_bytes','unfinished_assets')} | {
        'database_bytes':manifest['database_size_bytes'],'database_sha256':manifest['database_sha256']}


def run_one():
    """One process owns execution across DB commits and slow object IO.

    A session advisory lock has no lease timeout: another executor cannot steal
    work while a large export is still alive. After a process crash, the next
    executor records interrupted work as failed and never overwrites its files.
    """
    backup_root()
    with database.pool().connection() as guard:
        locked = guard.execute('SELECT pg_try_advisory_lock(%s) AS locked',(EXECUTOR_LOCK,)).fetchone()['locked']
        guard.commit()
        if not locked:
            return {'status':'executor_busy'}
        try:
            with az.policy_transaction(change=True) as conn:
                interrupted = conn.execute("""UPDATE backup_jobs SET status='failed',
                    error_code='backup_interrupted',completed_at=clock_timestamp()
                    WHERE status='running' RETURNING id,workspace_id""").fetchall()
                for old in interrupted:
                    az.audit(conn,None,'backup.failed',str(old['id']),old['workspace_id'],{'error_code':'backup_interrupted'})
                row = conn.execute("""SELECT * FROM backup_jobs WHERE status='queued'
                    ORDER BY created_at,id LIMIT 1 FOR UPDATE""").fetchone()
                if not row:
                    return {'status':'idle'}
                actor = az.Principal(row['member_id'],row['session_id'],'management')
                try:
                    require(conn,actor,row['workspace_id'],request=True)
                except HTTPException:
                    conn.execute("""UPDATE backup_jobs SET status='cancelled',error_code='backup_authorization_changed',
                        completed_at=clock_timestamp() WHERE id=%s""",(row['id'],))
                    az.audit(conn,None,'backup.cancelled',str(row['id']),row['workspace_id'],
                             {'error_code':'backup_authorization_changed'})
                    return {'id':str(row['id']),'status':'cancelled'}
                conn.execute("UPDATE backup_jobs SET status='running',started_at=clock_timestamp() WHERE id=%s",(row['id'],))
                az.audit(conn,None,'backup.started',str(row['id']),row['workspace_id'],{'requester_id':row['member_id']})
            try:
                summary = execute(row)
            except Exception:
                # Errors may contain paths, DSNs or signed object URLs. A stable
                # code is sufficient for the UI; retain incomplete files locally.
                return finish(row,'failed',error='backup_export_failed')
            return finish(row,'succeeded',summary=summary)
        finally:
            guard.rollback()
            guard.execute('SELECT pg_advisory_unlock(%s)',(EXECUTOR_LOCK,))
            guard.commit()
