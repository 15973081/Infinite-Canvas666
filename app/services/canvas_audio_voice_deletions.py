"""Explicit supplier voice deletion; persisted outcomes never delete audio assets."""
import uuid
import httpx
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.canvas_audio_voices import context, identity, normalize
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.storage import database
from app.storage.workspace import current_workspace
from app.providers.registry import httpx_provider_kwargs
from app.utils import bearer_auth_value


def scope(payload, conn, write=False):
    provider, key, account, member = context(conn, payload.provider_id, payload.model)
    if payload.catalog_id != identity(account):
        az.fail('audio_voice_account_changed', 409)
    if write:
        az.require(conn, current_access.get().principal, 'generation.submit', current_workspace())
        ensure(conn, current_workspace(), 'write')
    return provider, key, account, member


def public(row):
    return {'voice_id': row['voice_id'], 'state': row['state'], 'operation_id': str(row['operation_id']),
            'can_retry': row['state'] in {'failed', 'unknown'} or row['state']=='pending' and row['dispatched_at'] is None}


def finish(conn, row, state):
    changed = conn.execute('''UPDATE audio_voice_deletions SET state=%s,updated_at=now()
        WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s
          AND (operation_id=%s OR %s='deleted') AND state<>'deleted' RETURNING *''',
        (state, row['workspace_id'], row['provider_id'], row['account_ref'], row['voice_id'], row['operation_id'],state)).fetchone()
    if state == 'deleted':
        conn.execute('DELETE FROM audio_voice_registrations WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s',
            (row['workspace_id'],row['provider_id'],row['account_ref'],row['voice_id']))
        conn.execute('DELETE FROM audio_voice_favorites WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s',
            (row['workspace_id'],row['provider_id'],row['account_ref'],row['voice_id']))
    return changed or conn.execute('SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s',
        (row['workspace_id'],row['provider_id'],row['account_ref'],row['voice_id'])).fetchone()


def reconcile(conn, provider_id, account, member, value):
    # A crashed request remains uncertain, never implicitly retried. An explicit
    # new confirmation may retry the same immutable supplier voice ID.
    conn.execute('''UPDATE audio_voice_deletions SET state='unknown',updated_at=now()
        WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND member_id=%s
          AND state='pending' AND dispatched_at<clock_timestamp()-interval '60 seconds' ''',
        (current_workspace(),provider_id,account,member))
    rows = conn.execute('''SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s
        AND account_ref=%s AND member_id=%s AND state IN ('pending','unknown','failed') FOR UPDATE''',
        (current_workspace(), provider_id, account, member)).fetchall()
    for row in rows:
        # An omitted or malformed category is not evidence that a voice is gone.
        category = value.get(row['voice_type'])
        if isinstance(category,list) and all(isinstance(item,dict) and isinstance(item.get('voice_id'),str) for item in category):
            if row['voice_id'] not in {item['voice_id'] for item in category}:
                finish(conn,row,'deleted')
    return conn.execute('SELECT voice_id,state FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND member_id=%s',
        (current_workspace(),provider_id,account,member)).fetchall()


async def delete(payload):
    workspace=current_workspace()
    with az.policy_transaction() as conn:
        provider,key,account,member=scope(payload,conn,True)
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('voice-delete:'+workspace+':'+payload.provider_id+':'+account+':'+payload.voice_id,))
        row=conn.execute('SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s FOR UPDATE',
            (workspace,payload.provider_id,account,payload.voice_id)).fetchone()
        if row and row['member_id']!=member:
            az.fail('voice_delete_not_owned',404)
        resume=bool(row and row['state']=='pending' and row['dispatched_at'] is None)
        if row and (row['state']=='deleted' or row['state']=='pending' and not resume or row['state']=='unknown' and not payload.retry):
            return public(row)
        registered=conn.execute('''SELECT r.*,t.request FROM audio_voice_registrations r JOIN tasks t ON t.id=r.task_id AND t.workspace_id=r.workspace_id
            WHERE r.workspace_id=%s AND r.provider_id=%s AND r.account_ref=%s AND r.voice_id=%s AND r.member_id=%s FOR UPDATE OF r''',
            (workspace,payload.provider_id,account,payload.voice_id,member)).fetchone()
        if not registered:
            az.fail('voice_delete_not_owned',404)
        mode=registered['request'].get('mode')
        if mode not in {'design','clone'}:
            az.fail('voice_delete_type_not_supported',400)
        operation=row['operation_id'] if resume else uuid.uuid4();history=(row['history'] or [])+[{'operation_id':str(row['operation_id']),'state':row['state'],'at':row['updated_at'].isoformat()}] if row else []
        if not resume:row=conn.execute('''INSERT INTO audio_voice_deletions(workspace_id,provider_id,account_ref,voice_id,member_id,task_id,voice_type,operation_id,state,history)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s)
            ON CONFLICT(workspace_id,provider_id,account_ref,voice_id) DO UPDATE
            SET operation_id=excluded.operation_id,state='pending',dispatched_at=NULL,updated_at=now(),history=excluded.history RETURNING *''',
            (workspace,payload.provider_id,account,payload.voice_id,member,registered['task_id'],'voice_generation' if mode=='design' else 'voice_cloning',operation,Jsonb(history))).fetchone()
    # Single dispatch claim. A duplicate request observes the journal instead of
    # issuing another external POST; a retry requires a new explicit confirmation.
    with database.connection() as conn:
        claimed=conn.execute('''UPDATE audio_voice_deletions SET dispatched_at=now() WHERE workspace_id=%s
            AND provider_id=%s AND account_ref=%s AND voice_id=%s AND operation_id=%s AND state='pending'
            AND dispatched_at IS NULL RETURNING *''', (workspace,payload.provider_id,account,payload.voice_id,operation)).fetchone()
    if not claimed:
        with database.connection() as conn:
            latest=conn.execute('SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s', (workspace,payload.provider_id,account,payload.voice_id)).fetchone()
        return public(latest)
    state='unknown'
    try:
        base=provider['base_url'].rstrip('/')
        async with httpx.AsyncClient(timeout=20,**httpx_provider_kwargs(provider)) as client:
            response=await client.post(base+('/' if base.endswith('/v1') else '/v1/')+'delete_voice',
                headers={'Authorization':bearer_auth_value(key)},json={'voice_type':row['voice_type'],'voice_id':payload.voice_id})
        if len(response.content)<=1024*1024:
            value=response.json();ack=value.get('base_resp') if isinstance(value,dict) else None
            if isinstance(ack,dict) and type(ack.get('status_code')) is int:
                if response.is_success and ack['status_code']==0 and value.get('voice_id')==payload.voice_id:state='deleted'
                elif ack['status_code']!=0 and response.status_code<500:state='failed'
    except (httpx.HTTPError,ValueError):
        pass
    with database.connection() as conn:
        row=finish(conn,row,state)
    return public(row)


async def status(payload):
    with az.policy_transaction() as conn:
        provider,key,account,member=scope(payload,conn)
        row=conn.execute('SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s AND member_id=%s',
            (current_workspace(),payload.provider_id,account,payload.voice_id,member)).fetchone()
        if not row:az.fail('voice_delete_not_found',404)
        if row['state']=='deleted':return public(row)
    try:
        base=provider['base_url'].rstrip('/')
        async with httpx.AsyncClient(timeout=20,**httpx_provider_kwargs(provider)) as client:
            response=await client.post(base+('/' if base.endswith('/v1') else '/v1/')+'get_voice',headers={'Authorization':bearer_auth_value(key)},json={'voice_type':'all'})
        response.raise_for_status()
        if len(response.content)>8*1024*1024:raise ValueError()
        value=response.json();normalize(value)
    except (httpx.HTTPError,ValueError):
        raise HTTPException(502,'删除结果暂不可查询，请稍后重试') from None
    with az.policy_transaction() as conn:
        _,_,current,owner=scope(payload,conn)
        if current!=account or owner!=member:az.fail('audio_voice_account_changed',409)
        reconcile(conn,payload.provider_id,account,member,value)
        row=conn.execute('SELECT * FROM audio_voice_deletions WHERE workspace_id=%s AND provider_id=%s AND account_ref=%s AND voice_id=%s AND member_id=%s',
            (current_workspace(),payload.provider_id,account,payload.voice_id,member)).fetchone()
        return public(row)
