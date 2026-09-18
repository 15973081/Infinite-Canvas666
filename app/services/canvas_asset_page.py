"""Bounded, workspace-scoped catalog queries over durable asset membership."""
import os
from app.storage.database import connection
from app.storage.workspace import current_workspace


def local_page(**options):
    """Filesystem compatibility; cloud requests always use the SQL projection."""
    from app.services.canvas import canvas_assets_index
    data = canvas_assets_index(trash=options['trash'], source_state=options['source_state'])
    query = options['query'].strip().lower()
    items = [i for i in data['items'] if
        (options['category']=='all' or i['canvas_kind']==options['category']) and
        (not options['canvas_id'] or i['canvas_id']==options['canvas_id']) and
        (not query or query in ' '.join(str(i.get(k,'')) for k in
            ('name','url','canvas_title','node_title','node_type','category','tags')).lower())]
    stamp = lambda i: i.get('canvas_updated_at') or i.get('created_at') or 0
    keys = {'canvas_asc': lambda i:(i['canvas_title'].lower(),i['canvas_id'],-stamp(i)),
            'name_asc': lambda i:i['name'].lower(), 'kind': lambda i:(i['kind'],-stamp(i)),
            'updated_asc': stamp, 'updated_desc': lambda i:-stamp(i)}
    items.sort(key=lambda i:(keys[options['sort']](i),i['canvas_id'],i['id']))
    offset,limit = options['offset'],options['limit']
    data.update(total=len(items), offset=offset, limit=limit, has_more=offset+limit<len(items), items=items[offset:offset+limit])
    return data


def page(*, trash=False, source_state='active', category='smart', canvas_id='', query='',
         sort='canvas_asc', offset=0, limit=60):
    from app.storage.canvas_asset_groups import ensure_index
    from app.services.member_context import current_access
    from app.services import authorization as az
    params = dict(workspace=current_workspace(), namespace=os.getenv('ASSET_SOURCE_NAMESPACE', 'local'),
                  source=source_state, trash=trash, category=category, canvas=canvas_id,
                  query=query.strip().lower(), offset=offset, limit=limit)
    orders = {
        'canvas_asc': "lower(item->>'canvas_title'),item->>'canvas_id',stamp DESC",
        'name_asc': "lower(item->>'name')",
        'updated_asc': 'stamp ASC', 'updated_desc': 'stamp DESC',
        'kind': "item->>'kind',stamp DESC",
    }
    # Metadata joins and filtering happen in PostgreSQL. Only one page of item
    # documents crosses the database connection; navigation contains counts only.
    sql = '''WITH RECURSIVE groups AS MATERIALIZED (
        SELECT canvas_id, document,
          CASE WHEN coalesce(document->>'purged_at','0') NOT IN ('0','') THEN 'purged'
               WHEN coalesce(document->>'deleted_at','0') NOT IN ('0','') THEN 'deleted' ELSE 'active' END AS state
        FROM canvas_asset_groups WHERE workspace_id=%(workspace)s
    ), scoped AS (
        SELECT * FROM groups WHERE %(source)s='all' OR
          (%(source)s='active' AND state='active') OR (%(source)s='deleted' AND state!='active')
    ), live AS MATERIALIZED (
        SELECT coalesce(a.asset_id,i.asset_key) AS key,
          i.document || jsonb_build_object('canvas_title',g.document->>'title',
            'canvas_kind',coalesce(g.document->>'kind','classic'), 'canvas_state',g.state,
            'canvas_updated_at',g.document->'updated_at') AS item
        FROM canvas_asset_items i JOIN scoped g ON g.canvas_id=i.canvas_id
        LEFT JOIN asset_aliases a ON a.workspace_id=i.workspace_id AND a.source_namespace=%(namespace)s
          AND a.legacy_ref=i.legacy_ref AND i.legacy_ref!=''
        WHERE i.workspace_id=%(workspace)s
    ), catalog AS MATERIALIZED (
        SELECT * FROM canvas_asset_catalog WHERE workspace_id=%(workspace)s
    ), family(root_id,id) AS (
        SELECT c.asset_key,a.id FROM catalog c JOIN assets a
          ON a.id=c.asset_key AND a.workspace_id=%(workspace)s
        UNION SELECT f.root_id,a.id FROM family f JOIN assets a ON a.parent_asset_id=f.id
          WHERE a.workspace_id=%(workspace)s
    ), pending AS (
        SELECT f.root_id,bool_or(u.cleanup_state='failed') AS failed FROM family f
        JOIN media_uploads u ON u.asset_id=f.id AND u.workspace_id=%(workspace)s
        WHERE u.cleaned_at IS NULL GROUP BY f.root_id
    ), members AS (
        SELECT key,item FROM live
        UNION ALL SELECT c.asset_key,c.snapshot FROM catalog c
          WHERE EXISTS(SELECT 1 FROM scoped g WHERE g.canvas_id=c.snapshot->>'canvas_id')
          AND NOT EXISTS(SELECT 1 FROM live l WHERE l.key=c.asset_key)
    ), decorated AS MATERIALIZED (
        SELECT m.key, (m.item || coalesce(c.metadata,'{}'::jsonb) ||
          jsonb_build_object('asset_key',m.key,'catalog_version',coalesce(c.version,0),
            'trashed',c.trashed_at IS NOT NULL,'deleting',coalesce(a.status='deleting' OR (a.status='deleted' AND p.root_id IS NOT NULL),false)) ||
          CASE WHEN a.status='deleted' AND p.root_id IS NOT NULL THEN
            jsonb_build_object('staging_pending',true,'cleanup_failed',p.failed,'storage_status','正式文件已删除，暂存清理待完成') ELSE '{}'::jsonb END) AS item
        FROM members m LEFT JOIN catalog c ON c.asset_key=m.key
        LEFT JOIN assets a ON a.id=m.key AND a.workspace_id=%(workspace)s
        LEFT JOIN pending p ON p.root_id=m.key
        WHERE (a.status IS DISTINCT FROM 'deleted' OR p.root_id IS NOT NULL)
          AND (c.trashed_at IS NOT NULL)=%(trash)s
    ), filtered AS MATERIALIZED (
        SELECT item,coalesce(nullif(item->>'canvas_updated_at','')::numeric,
          nullif(item->>'created_at','')::numeric,0) AS stamp FROM decorated
        WHERE (%(category)s='all' OR coalesce(item->>'canvas_kind','classic')=%(category)s)
          AND (%(canvas)s='' OR item->>'canvas_id'=%(canvas)s)
          AND (%(query)s='' OR strpos(lower(concat_ws(' ', item->>'name',item->>'url',
            item->>'canvas_title',item->>'node_title',item->>'node_type',item->>'category',item->>'tags',
            CASE item->>'kind' WHEN 'video' THEN '视频' WHEN 'audio' THEN '音频' WHEN 'text' THEN '文本' ELSE '图片' END,
            CASE item->>'canvas_kind' WHEN 'smart' THEN '智能画布' ELSE '普通画布' END)),%(query)s)>0)
    ), counts AS (
        SELECT item->>'canvas_id' AS canvas_id,count(*) AS n FROM decorated GROUP BY item->>'canvas_id'
    ), selected AS (
        SELECT item FROM filtered ORDER BY ORDER_CLAUSE,item->>'canvas_id',item->>'id',item->>'url'
        LIMIT %(limit)s OFFSET %(offset)s
    ) SELECT (SELECT count(*) FROM filtered) AS total,
        coalesce((SELECT jsonb_agg(item) FROM selected),'[]'::jsonb) AS items,
        coalesce((SELECT jsonb_agg((g.document - 'nodes' - 'logs' - 'connections' - 'settings' - 'viewport') ||
          jsonb_build_object('asset_source_state',g.state,'asset_count',coalesce(c.n,0)) ORDER BY g.canvas_id)
          FROM scoped g LEFT JOIN counts c USING(canvas_id)),'[]'::jsonb) AS canvases,
        (SELECT count(*) FROM catalog c LEFT JOIN assets a ON a.id=c.asset_key AND a.workspace_id=%(workspace)s
          LEFT JOIN pending p ON p.root_id=c.asset_key WHERE c.trashed_at IS NOT NULL
          AND (a.status IS DISTINCT FROM 'deleted' OR p.root_id IS NOT NULL)) AS trash_count
    '''.replace('ORDER_CLAUSE', orders[sort])
    with connection() as conn:
        ensure_index(conn)
        result = dict(conn.execute(sql, params).fetchone())
        access = current_access.get()
        result['can_manage'] = access is None or 'asset.manage' in az.effective_permissions(
            conn, access.principal.member_id, current_workspace())
    result.update(offset=offset, limit=limit, has_more=offset+limit < result['total'], catalog_enabled=True)
    result['categories'] = [dict(id=kind, name=name,
        count=sum(c['asset_count'] for c in result['canvases'] if kind=='all' or c.get('kind','classic')==kind),
        canvas_count=sum(kind=='all' or c.get('kind','classic')==kind for c in result['canvases']))
        for kind,name in [('all','全部画布'),('smart','智能画布'),('classic','普通画布')]]
    return result
