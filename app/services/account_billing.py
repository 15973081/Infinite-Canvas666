"""Account expense read models; ownership comes from server tasks/chat calls."""
from fastapi import HTTPException
from app.services import authorization as az
from app.storage.workspace import current_workspace


def bind_entry(conn, entry_id, canvas_id, task_id):
    if not task_id:
        return
    conn.execute('''INSERT INTO ledger_owners(entry_id,workspace_id,task_id,member_id,username,display_name,attribution)
        SELECT %s,t.workspace_id,t.id,t.requested_by,
            coalesce(t.requester_snapshot->>'username',''),coalesce(t.requester_snapshot->>'display_name',''),'server_task'
        FROM tasks t WHERE t.workspace_id=%s AND t.id=%s
          AND (coalesce(t.canvas_id,nullif(t.legacy_metadata->>'canvas_id',''),'__account_tasks__')=%s
            OR (t.canvas_id IS NULL AND EXISTS(SELECT 1 FROM ledger_aliases a
                WHERE a.workspace_id=t.workspace_id AND a.entry_id=%s
                AND (a.alias='local-task:'||t.id OR a.alias='upstream:'||t.provider_id||':'||t.upstream_task_id))))
        ON CONFLICT DO NOTHING''', (entry_id,current_workspace(),task_id,canvas_id,entry_id))


BASE = ''' FROM ledger_entries e
 LEFT JOIN ledger_owners o ON o.entry_id=e.id AND o.workspace_id=e.workspace_id
 LEFT JOIN ledger_account_assignments a ON a.entry_id=e.id AND a.workspace_id=e.workspace_id
 LEFT JOIN members m ON m.id=coalesce(a.member_id,o.member_id)
 JOIN workspaces w ON w.id=e.workspace_id
 LEFT JOIN canvas_asset_groups g ON g.workspace_id=e.workspace_id AND g.canvas_id=e.canvas_id'''


def report(actor, *, personal=False, workspace=None, member_id='', from_ms=0, to_ms=0,
           canvas_query='', account_query='', page=1, page_size=50):
    if from_ms < 0 or to_ms < 0 or (to_ms and to_ms <= from_ms) or page < 1 or not 1 <= page_size <= 100:
        raise HTTPException(400, {'code':'invalid_billing_query'})
    with az.policy_transaction() as conn:
        if personal:
            if actor.audience != 'workbench': az.fail('permission_denied')
            az.active_member(conn, actor)
            member_id = actor.member_id  # Never trust a browser-supplied member selector.
        else:
            if actor.audience != 'management': az.fail('management_entry_required')
            if 'billing.platform' in az.effective_permissions(conn,actor.member_id):
                az.require(conn,actor,'billing.platform')
            else:
                az.require(conn,actor,'billing.read' if workspace else 'billing.platform',workspace)
        clauses, args = ['TRUE'], []
        if workspace:
            clauses.append('e.workspace_id=%s'); args.append(workspace)
        if member_id:
            if member_id == 'unassigned': clauses.append('coalesce(a.member_id,o.member_id) IS NULL')
            else: clauses.append('coalesce(a.member_id,o.member_id)=%s'); args.append(member_id)
        if from_ms: clauses.append('e.created_at>=%s'); args.append(from_ms)
        if to_ms: clauses.append('e.created_at<%s'); args.append(to_ms)
        if canvas_query:
            clauses.append("(e.canvas_id ILIKE %s OR g.document->>'title' ILIKE %s OR e.log_json->>'conversation_title' ILIKE %s OR e.log_json->>'conversation_id' ILIKE %s)")
            args.extend(['%'+canvas_query+'%']*4)
        if account_query and not personal:
            clauses.append("(coalesce(m.username,o.username,'') ILIKE %s OR coalesce(m.display_name,o.display_name,'待归属') ILIKE %s)")
            args.extend(['%'+account_query+'%']*2)
        scope = BASE + ' WHERE ' + ' AND '.join(clauses)
        totals = conn.execute('''SELECT e.currency,count(*) AS records,
            count(*) FILTER(WHERE e.cost_status='unknown') AS unknown,
            count(*) FILTER(WHERE coalesce(a.member_id,o.member_id) IS NULL) AS unassigned,
            coalesce(sum(e.amount_micros) FILTER(WHERE e.cost_status='priced'),0)::text AS amount_micros,
            coalesce(sum(CASE WHEN e.cost_json->>'base_amount_micros' ~ '^[0-9]+$' THEN (e.cost_json->>'base_amount_micros')::numeric ELSE 0 END) FILTER(WHERE e.cost_status='priced'),0)::text AS base_amount_micros,
            coalesce(sum(CASE WHEN e.cost_json->>'discount_amount_micros' ~ '^[0-9]+$' THEN (e.cost_json->>'discount_amount_micros')::numeric ELSE 0 END) FILTER(WHERE e.cost_status='priced'),0)::text AS discount_amount_micros,
            count(*) FILTER(WHERE e.cost_status='priced' AND NOT (e.cost_json ? 'base_amount_micros')) AS missing_breakdown,
            coalesce(sum(e.amount_micros) FILTER(WHERE e.cost_status='priced' AND e.estimated=1),0)::text AS estimated_micros
            ''' + scope + ' GROUP BY e.currency ORDER BY e.currency',args).fetchall()
        count = sum(row['records'] for row in totals)
        pages = max(1,(count+page_size-1)//page_size)
        page = min(page,pages)
        accounts = conn.execute('''SELECT coalesce(a.member_id,o.member_id) AS member_id,
            coalesce(m.username,o.username,'') AS username,
            coalesce(m.display_name,nullif(o.display_name,''),'待归属') AS display_name,
            coalesce(m.status,'unknown') AS member_status,e.currency,count(*) AS records,
            coalesce(sum(e.amount_micros) FILTER(WHERE e.cost_status='priced'),0)::text AS amount_micros,
            count(*) FILTER(WHERE e.cost_status='unknown') AS unknown
            ''' + scope + ''' GROUP BY coalesce(a.member_id,o.member_id),coalesce(m.username,o.username,''),coalesce(m.display_name,nullif(o.display_name,''),'待归属'),coalesce(m.status,'unknown'),e.currency
            ORDER BY member_id NULLS LAST,e.currency LIMIT 201''',args).fetchall()
        rows = conn.execute('''SELECT e.id,e.workspace_id,w.name AS workspace_name,
            CASE WHEN e.canvas_id IN ('__account_tasks__','__account_chats__') THEN NULL ELSE e.canvas_id END AS canvas_id,
            CASE WHEN e.source='chat' THEN coalesce(e.log_json->>'conversation_title','GPT 对话')
                ELSE coalesce(g.document->>'title',nullif(e.canvas_id,'__account_tasks__'),'独立生成任务') END AS canvas_title,
            e.created_at,e.kind,e.status,e.cost_status,e.estimated,e.currency,e.amount_micros::text,
            e.cost_json->>'base_amount_micros' AS base_amount_micros,e.cost_json->>'discount_amount_micros' AS discount_amount_micros,
            e.cost_json->>'discount_rate' AS discount_rate,e.cost_json->'discount_snapshot' AS discount_snapshot,
            e.cost_json->>'unit_price' AS unit_price,e.cost_json->>'quantity' AS quantity,
            e.cost_json->>'resolution' AS resolution,e.cost_json->>'price_effective_from' AS price_effective_from,
            e.cost_json->>'billing_type' AS billing_type,e.cost_json->'usage' AS token_usage,
            e.cost_json->>'input_price' AS input_price,e.cost_json->>'output_price' AS output_price,
            e.cost_json->>'cached_input_price' AS cached_input_price,e.cost_json->>'reason' AS cost_reason,
            e.log_json->>'conversation_id' AS conversation_id,
            coalesce(e.log_json->>'providerId','') AS provider,
            coalesce(e.log_json->>'billingModel',e.log_json->>'model','') AS model,
            o.task_id,o.chat_call_id,coalesce(a.member_id,o.member_id) AS member_id,o.member_id AS original_member_id,a.reason AS assignment_reason,a.actor_id AS assigned_by,o.username AS account_at_creation,o.display_name AS name_at_creation,
            coalesce(m.username,o.username,'') AS username,
            coalesce(m.display_name,nullif(o.display_name,''),'待归属') AS display_name,
            CASE WHEN a.entry_id IS NOT NULL THEN 'manual' ELSE coalesce(o.attribution,'unassigned') END AS attribution
            ''' + scope + ' ORDER BY e.created_at DESC,e.id DESC LIMIT %s OFFSET %s',
            (*args,page_size,(page-1)*page_size)).fetchall()
        spaces = []
        if personal:
            spaces=conn.execute('''SELECT DISTINCT w.id,w.name FROM ledger_entries e
                LEFT JOIN ledger_owners o ON o.entry_id=e.id
                LEFT JOIN ledger_account_assignments a ON a.entry_id=e.id
                JOIN workspaces w ON w.id=e.workspace_id WHERE coalesce(a.member_id,o.member_id)=%s ORDER BY w.name,w.id''',
                (actor.member_id,)).fetchall()
        return {'totals':totals,'accounts':accounts[:200],'accounts_truncated':len(accounts)>200,
                'entries':rows,'page':page,'pages':pages,'page_size':page_size,'records':count,
                'workspaces':spaces,'personal':personal}
