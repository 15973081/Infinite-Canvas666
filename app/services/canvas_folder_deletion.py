"""Native recursive folder deletion: one commit, all leases, durable receipts."""
import hashlib
import json
import time
from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.services.canvas_leases import validate, Proof
from app.storage.canvas_directory import lock
from app.storage.settings import postgres_enabled, member_auth_enabled
from app.storage.workspace import current_workspace


def ready():
    if not postgres_enabled() or not member_auth_enabled():
        az.fail('member_durable_folder_deletion_required',409)


def access(conn, write=False):
    ready()
    value=current_access.get()
    if value is None or value.principal.audience!='workbench':
        az.fail('workbench_session_required')
    for permission in ('canvas.read','canvas.edit','canvas.delete') if write else ('canvas.read',):
        az.require(conn,value.principal,permission,current_workspace())
    ensure(conn,current_workspace(),'write' if write else 'read')
    return value.principal


def tree(conn, folder_id, for_update=False):
    row=conn.execute("SELECT value,revision FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_folders' AND id='default'"+(' FOR UPDATE' if for_update else ''),(current_workspace(),)).fetchone()
    folders=(row['value'].get('folders') or []) if row else []
    by_id={item['id']:item for item in folders}
    if folder_id not in by_id:
        az.fail('folder_not_found',404)
    children={}
    for item in folders:children.setdefault(item.get('parent_id') or '',[]).append(item['id'])
    pending=[folder_id];ids=set()
    while pending:
        item=pending.pop()
        if item in ids:continue
        ids.add(item);pending.extend(children.get(item,[]))
    selected=[{'id':item,'name':by_id[item]['name'],'parent_id':by_id[item].get('parent_id') or ''} for item in sorted(ids)]
    canvases=conn.execute("""SELECT id,title,kind,revision,document->>'folder_id' AS folder_id,deleted_at
        FROM canvases WHERE workspace_id=%s AND document->>'folder_id'=ANY(%s)
        AND coalesce(document->>'purged_at','')='' ORDER BY id""",(current_workspace(),sorted(ids))).fetchall()
    records=[{**{key:item[key] for key in ('id','title','kind','revision','folder_id')},'deleted_at':int(item['deleted_at'].timestamp()*1000) if item['deleted_at'] else 0} for item in canvases]
    shape={'folder_id':folder_id,'name':by_id[folder_id]['name'],'folders':selected,'canvases':records}
    digest=hashlib.sha256(json.dumps(shape,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {**shape,'plan_sha256':digest},row


def prepare(folder_id):
    ready()
    with az.policy_transaction() as conn:
        access(conn);lock(conn)
        return tree(conn,folder_id)[0]


def journal(conn, operation_id):
    return conn.execute("SELECT value FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_folder_deletion' AND id=%s",(current_workspace(),operation_id)).fetchone()


def status(folder_id,operation_id):
    ready()
    with az.policy_transaction() as conn:
        actor=access(conn);row=journal(conn,operation_id)
        if not row:return {'state':'not_found','operation_id':operation_id}
        value=row['value']
        if value['member_id']!=actor.member_id or value['folder_id']!=folder_id:
            az.fail('folder_deletion_not_found',404)
        return {'state':'done',**value['result']}


def delete(folder_id,payload):
    ready()
    with az.policy_transaction() as conn:
        actor=access(conn,True);lock(conn,True)
        prior=journal(conn,payload.operation_id)
        if prior:
            value=prior['value']
            if (value['member_id'],value['folder_id'],value['name'],value['plan_sha256'])!=(actor.member_id,folder_id,payload.name,payload.plan_sha256):
                az.fail('folder_deletion_operation_conflict',409)
            return value['result']
        plan,directory=tree(conn,folder_id,True)
        if payload.name!=plan['name'] or payload.plan_sha256!=plan['plan_sha256']:
            az.fail('folder_deletion_plan_changed',409)
        proofs={item.id:item for item in payload.canvases}
        if len(proofs)!=len(payload.canvases) or set(proofs)!={item['id'] for item in plan['canvases']}:
            az.fail('folder_deletion_proofs_incomplete',409)
        # Check every member/session-bound token and revision before any write.
        for item in plan['canvases']:
            proof=proofs[item['id']]
            validate(conn,actor,current_workspace(),item['id'],Proof(proof.token,proof.generation,proof.revision),include_document=False)
        stamp=int(time.time()*1000);ids=sorted(proofs);folder_ids=[item['id'] for item in plan['folders']]
        if ids:
            conn.execute("""UPDATE canvases SET deleted_at=coalesce(deleted_at,clock_timestamp()),
                document=document || %s || jsonb_build_object('deleted_at',floor(extract(epoch FROM coalesce(deleted_at,clock_timestamp()))*1000)::bigint),
                revision=revision+1,updated_at=clock_timestamp(),updated_by=%s WHERE workspace_id=%s AND id=ANY(%s)""",
                (Jsonb({'purged_at':stamp,'updated_at':stamp}),actor.member_id,current_workspace(),ids))
            conn.execute("UPDATE canvas_edit_leases SET released_at=clock_timestamp(),expires_at=clock_timestamp() WHERE workspace_id=%s AND canvas_id=ANY(%s)",(current_workspace(),ids))
        retained={**directory['value'],'folders':[item for item in directory['value']['folders'] if item['id'] not in set(folder_ids)]}
        conn.execute("UPDATE workspace_documents SET value=%s,revision=revision+1,updated_at=now() WHERE workspace_id=%s AND kind='canvas_folders' AND id='default'",(Jsonb(retained),current_workspace()))
        result={'ok':True,'operation_id':payload.operation_id,'folder_id':folder_id,'folder_ids':folder_ids,'canvas_ids':ids,'deleted_at':stamp}
        record={'member_id':actor.member_id,'folder_id':folder_id,'name':payload.name,'plan_sha256':payload.plan_sha256,'result':result}
        conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'canvas_folder_deletion',%s,%s)",(current_workspace(),payload.operation_id,Jsonb(record)))
        az.audit(conn,actor,'canvas.folder.delete_tree',folder_id,current_workspace(),{'operation_id':payload.operation_id,'folder_ids':folder_ids,'canvas_ids':ids})
        return result
