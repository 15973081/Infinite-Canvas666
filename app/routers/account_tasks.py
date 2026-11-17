from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from app.services import authorization as az

router = APIRouter()


@router.get('/api/account/tasks')
def my_tasks(request: Request, status: str = Query('', max_length=20),
             page: int = Query(1, ge=1, le=2147483647), page_size: int = Query(25, ge=1, le=100)):
    if status not in ('', 'queued', 'running', 'submitting', 'polling', 'finalizing', 'succeeded', 'failed', 'cancelled', 'needs_review', 'pending', 'uncertain', 'rejected'):
        az.fail('invalid_task_query', 400)
    actor = request.scope.get('member_principal')
    with az.policy_transaction() as conn:
        az.active_member(conn, actor)
        if actor.audience != 'workbench':
            az.fail('workbench_entry_required')
        # Account history is bound to the server-recorded requester, not a space
        # selector. Do not return prompts, upstream credentials or result URLs.
        data = conn.execute('''WITH owned AS (
            SELECT t.id,t.kind,t.model,t.status,t.canvas_id,
                (extract(epoch FROM t.created_at)*1000)::bigint AS created_at,
                'canvas_task'::text AS source_type,
                h.id AS credit_hold_id,h.status AS credit_status,h.model_code AS credit_model_code,
                h.quote_version AS credit_quote_version,h.frozen_credits::text AS credit_frozen,
                h.settled_credits::text AS credit_settled,h.released_credits::text AS credit_released
            FROM tasks t LEFT JOIN credit_holds h ON h.source_type='canvas_task' AND h.source_id=t.id
                AND h.member_id=t.requested_by AND h.workspace_id=t.workspace_id
            WHERE t.requested_by=%s
            UNION ALL
            SELECT c.id,'chat',c.model,c.status,NULL::text,c.started_at,'chat_call',
                h.id,h.status,h.model_code,h.quote_version,h.frozen_credits::text,
                h.settled_credits::text,h.released_credits::text
            FROM ai_chat_calls c LEFT JOIN credit_holds h ON h.source_type='chat_call' AND h.source_id=c.id
                AND h.member_id=c.member_id AND h.workspace_id=c.workspace_id
            WHERE c.member_id=%s
        ), filtered AS (SELECT * FROM owned WHERE %s='' OR status=%s
        ), counts AS (SELECT count(*) AS records FROM filtered),
        paging AS (SELECT records,greatest(1,(records+%s-1)/%s) AS pages FROM counts),
        chosen AS (SELECT records,pages,least(%s,pages) AS page FROM paging)
        SELECT *,coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC) FROM
            (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT %s
             OFFSET (SELECT (page-1)*%s FROM chosen)) r),'[]'::jsonb) AS entries FROM chosen''',
            (actor.member_id,actor.member_id,status,status,page_size,page_size,page,page_size,page_size)).fetchone()
        return JSONResponse(dict(data), headers={'Cache-Control':'private, no-store'})
