"""Previewed, audited account assignment; never changes task author or amounts."""
import hashlib
import json
from fastapi import HTTPException
from app.services import authorization as az
from psycopg.types.json import Jsonb


def authorize(conn,actor,workspace):
    if actor.audience!='management': az.fail('management_entry_required')
    if not workspace: az.fail('billing_workspace_required',400)
    if 'billing.assign.platform' in az.effective_permissions(conn,actor.member_id):
        az.require(conn,actor,'billing.assign.platform')
    else:
        az.require(conn,actor,'billing.assign',workspace)
    if not conn.execute('SELECT 1 FROM workspaces WHERE id=%s',(workspace,)).fetchone(): az.fail('workspace_unavailable')


def choices(actor,workspace,query=''):
    with az.policy_transaction() as conn:
        authorize(conn,actor,workspace)
        canvases=conn.execute("""SELECT e.canvas_id,coalesce(g.document->>'title',e.canvas_id) AS title,count(*) AS records
            FROM ledger_entries e LEFT JOIN canvas_asset_groups g ON g.workspace_id=e.workspace_id AND g.canvas_id=e.canvas_id
            WHERE e.workspace_id=%s AND e.canvas_id<>'__account_tasks__'
            AND (e.canvas_id ILIKE %s OR g.document->>'title' ILIKE %s)
            GROUP BY e.canvas_id,g.document->>'title' ORDER BY title,e.canvas_id LIMIT 201""",(workspace,'%'+query+'%','%'+query+'%')).fetchall()
        members=conn.execute("""SELECT m.id,m.username,m.display_name FROM members m
            JOIN workspace_members wm ON wm.member_id=m.id WHERE wm.workspace_id=%s AND m.status='active'
            ORDER BY m.username,m.id""",(workspace,)).fetchall()
        return {'canvases':canvases[:200],'truncated':len(canvases)>200,'members':members}


def assign(actor,workspace,canvas_id,member_id,reason,include_assigned=False,preview_token=None):
    if not reason.strip() or len(reason)>1000: az.fail('billing_reason_required',400)
    with az.policy_transaction() as conn:
        authorize(conn,actor,workspace)
        lock='pg_advisory_xact_lock' if preview_token is not None else 'pg_advisory_xact_lock_shared'
        conn.execute('SELECT '+lock+'(hashtextextended(%s,0))',('ledger:'+workspace,))
        target=conn.execute("""SELECT m.id,m.username,m.display_name FROM members m JOIN workspace_members wm ON wm.member_id=m.id
            WHERE wm.workspace_id=%s AND m.id=%s AND m.status='active'""",(workspace,member_id)).fetchone()
        if not target: az.fail('billing_target_unavailable',409)
        rows=conn.execute("""SELECT e.id,e.updated_at,e.cost_status,e.amount_micros::text,e.currency,
            coalesce(a.member_id,o.member_id) AS current_member,coalesce(a.version,0) AS assignment_version
            FROM ledger_entries e LEFT JOIN ledger_owners o ON o.entry_id=e.id
            LEFT JOIN ledger_account_assignments a ON a.entry_id=e.id
            WHERE e.workspace_id=%s AND e.canvas_id=%s ORDER BY e.id LIMIT 2001""",(workspace,canvas_id)).fetchall()
        if len(rows)>2000: az.fail('billing_assignment_too_large',400)
        selected=[r for r in rows if (include_assigned or r['current_member'] is None) and r['current_member']!=member_id]
        totals={}
        for row in selected:
            if row['cost_status']=='priced': totals[row['currency']]=totals.get(row['currency'],0)+int(row['amount_micros'])
        snapshot=[actor.member_id,workspace,canvas_id,target,reason.strip(),include_assigned,rows]
        token=hashlib.sha256(json.dumps(snapshot,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        result={'preview_token':token,'records':len(selected),'skipped':len(rows)-len(selected),
                'totals':[{'currency':key,'amount_micros':str(value)} for key,value in sorted(totals.items())],
                'unknown':sum(r['cost_status']=='unknown' for r in selected),'target':target}
        if preview_token is None: return result
        if preview_token!=token: az.fail('billing_assignment_changed',409)
        if not selected: az.fail('billing_assignment_empty',409)
        for row in selected:
            conn.execute("""INSERT INTO ledger_assignment_events(entry_id,workspace_id,previous_member_id,member_id,actor_id,reason)
                VALUES(%s,%s,%s,%s,%s,%s)""",(row['id'],workspace,row['current_member'],member_id,actor.member_id,reason.strip()))
            conn.execute("""INSERT INTO ledger_account_assignments(entry_id,workspace_id,member_id,actor_id,reason)
                VALUES(%s,%s,%s,%s,%s) ON CONFLICT(entry_id) DO UPDATE SET member_id=EXCLUDED.member_id,
                actor_id=EXCLUDED.actor_id,reason=EXCLUDED.reason,version=ledger_account_assignments.version+1,updated_at=now()""",
                (row['id'],workspace,member_id,actor.member_id,reason.strip()))
        az.audit(conn,actor,'billing.assign',canvas_id,workspace,{'target_member':member_id,'records':len(selected),
                 'include_assigned':include_assigned,'reason':reason.strip(),'totals':result['totals']})
        return {'assigned':len(selected)}
