"""Explicit, retryable physical deletion of unreferenced recycled assets."""
from fastapi import HTTPException
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.storage import media

_INDEXED_REFERENCE_SOURCES = (
    ('canvases','asset_reference_candidates(document)','', 'title', '画布','document'),
    ('workspace_documents','asset_reference_candidates(value)','', 'kind', '素材库或备份','value'),
    ('tasks','(asset_reference_candidates(request) || asset_reference_candidates(result) || asset_reference_candidates(input_asset_ids) || asset_reference_candidates(output_asset_ids) || asset_reference_candidates(legacy_metadata))','', 'id', '任务','jsonb_build_array(request,result,input_asset_ids,output_asset_ids,legacy_metadata)'),
    ('online_works','(ARRAY[asset_id] || asset_reference_candidates(snapshot))'," AND state NOT IN ('purging','purged')", 'name', '在线作品','jsonb_build_array(asset_id,snapshot)'),
)


def contains_ref(value, ids, aliases):
    if isinstance(value, str):
        return value in ids or media.id_from_ref(value) in ids or aliases.get(media.canonical_legacy(value)) in ids
    if isinstance(value, dict):
        return any(contains_ref(v, ids, aliases) for v in value.values())
    if isinstance(value, list):
        return any(contains_ref(v, ids, aliases) for v in value)
    return False


def referenced_asset_ids(conn, asset_ids=None):
    """One inventory per request; match the conservative deletion checks."""
    if asset_ids is not None:
        candidates=sorted(set(asset_ids))
        if not candidates:
            return set()
        # PostgreSQL maintains the candidate indexes atomically. Validate the
        # small matching subset with the original scalar parser, including keys
        # or prose that merely contain an ID but are not references.
        found=set()
        remaining=set(candidates)
        def collect(value):
            if isinstance(value,str):
                asset_id=media.id_from_ref(value)
                if asset_id in remaining: found.add(asset_id);remaining.remove(asset_id)
            elif isinstance(value,dict):
                for child in value.values(): collect(child)
            elif isinstance(value,list):
                for child in value: collect(child)
        for table,expression,extra,_,_,value in _INDEXED_REFERENCE_SOURCES:
            query=f'SELECT {value} AS value FROM {table} WHERE workspace_id=%s AND {expression} && %s::text[]'+extra
            for row in conn.execute(query,(current_workspace(),candidates)):
                collect(row['value'])
                if not remaining:return found
        return found
    found=set()
    def collect(value):
        if isinstance(value,str):
            asset_id=media.id_from_ref(value)
            if asset_id: found.add(asset_id)
        elif isinstance(value,dict):
            for child in value.values(): collect(child)
        elif isinstance(value,list):
            for child in value: collect(child)
    for query in (
        'SELECT document AS value FROM canvases WHERE workspace_id=%s',
        'SELECT value FROM workspace_documents WHERE workspace_id=%s',
        'SELECT jsonb_build_array(request,result,input_asset_ids,output_asset_ids,legacy_metadata) AS value FROM tasks WHERE workspace_id=%s',
        "SELECT jsonb_build_array(asset_id,snapshot) AS value FROM online_works WHERE workspace_id=%s AND state NOT IN ('purging','purged')",
    ):
        for row in conn.execute(query,(current_workspace(),)): collect(row['value'])
    return found


def check_references(conn, ids, aliases, ignored_document_kinds=()):
    if not aliases:
        # New private attachments have canonical IDs, without legacy aliases.
        # Keep the same authoritative deletion guard, using exact source indexes.
        if not ids:
            return
        for table,expression,extra,label,kind,value in _INDEXED_REFERENCE_SOURCES:
            args=[current_workspace(),sorted(ids)]
            if table=='workspace_documents' and ignored_document_kinds:
                extra+=' AND kind<>ALL(%s::text[])';args.append(list(ignored_document_kinds))
            for row in conn.execute(f'SELECT {label} AS label,{value} AS value FROM {table} WHERE workspace_id=%s AND {expression} && %s::text[]'+extra,args):
                if contains_ref(row['value'],ids,{}):
                    raise HTTPException(409,f"素材仍被{kind}「{row['label']}」引用，不能彻底删除")
        return
    # Include recycled/purged canvases and retained backups: they remain recoverable.
    sources = [
        ('SELECT title AS label, document AS value FROM canvases WHERE workspace_id=%s', '画布'),
        ('SELECT kind AS label, value FROM workspace_documents WHERE workspace_id=%s', '素材库或备份'),
        ("SELECT id AS label, jsonb_build_array(request,result,input_asset_ids,output_asset_ids,legacy_metadata) AS value FROM tasks WHERE workspace_id=%s", '任务'),
    ]
    for query, kind in sources:
        for row in conn.execute(query, (current_workspace(),)):
            if kind == '素材库或备份' and row['label'] in ignored_document_kinds:
                continue
            if contains_ref(row['value'], ids, aliases):
                raise HTTPException(409, f"素材仍被{kind}「{row['label']}」引用，不能彻底删除")
    for row in conn.execute("SELECT name,snapshot,asset_id FROM online_works WHERE workspace_id=%s AND state NOT IN ('purging','purged')", (current_workspace(),)):
        if row['asset_id'] in ids or contains_ref(row['snapshot'],ids,aliases):
            raise HTTPException(409, f"素材仍被在线作品「{row['name']}」引用，不能彻底删除")


def delete_object(asset):
    store = media.store()
    version = asset['object_version_id']
    if not version or version == 'null':
        raise HTTPException(409, '缺少对象版本，无法安全删除')
    if isinstance(store, media.TosStore):
        if asset['bucket'] != store.bucket:
            raise HTTPException(409, '素材所属桶与当前配置不一致')
        # Specify the immutable version; never delete an entire key or bucket.
        store.client.delete_object(store.bucket, asset['object_key'], version_id=version)
    else:
        if asset['bucket'] != 'local-simulation':
            raise HTTPException(409, '素材存储后端与当前配置不一致')
        store.path(asset['object_key'], version).unlink(missing_ok=True)


def purge(payload):
    from app.services import canvas_asset_catalog as catalog
    from app.services.member_context import current_access
    from app.services import authorization as az
    selections = payload['items']
    if not payload.get('confirm_permanent'):
        raise HTTPException(400, '请确认彻底删除，删除后无法恢复')
    if not selections or len(selections)>200 or len({s['key'] for s in selections}) != len(selections):
        raise HTTPException(400, '请选择 1–200 个不同素材')
    groups = []
    with connection() as conn:
        access = current_access.get()
        if access:
            az.require(conn, access.principal, 'asset.manage', current_workspace())
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('canvas-asset-catalog:'+current_workspace(),))
        # Serialize reference publication while preflighting and marking deletion.
        conn.execute('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        aliases = catalog.aliases_for(conn)
        for selected in selections:
            row = conn.execute('SELECT * FROM canvas_asset_catalog WHERE workspace_id=%s AND asset_key=%s FOR UPDATE', (current_workspace(),selected['key'])).fetchone()
            if not row or not row['trashed_at']:
                raise HTTPException(409, '请先将素材移入回收站')
            if row['version'] != selected['version']:
                raise HTTPException(409, '素材已被修改，请刷新后重试')
            assets = conn.execute('''WITH RECURSIVE family AS (
                SELECT * FROM assets WHERE workspace_id=%s AND id=%s
                UNION SELECT a.* FROM assets a JOIN family f ON a.parent_asset_id=f.id
                WHERE a.workspace_id=%s)
                SELECT * FROM family ORDER BY id''', (current_workspace(),selected['key'],current_workspace())).fetchall()
            if not assets:
                raise HTTPException(409, '外部链接或未托管素材不能在此彻底删除')
            if any(a['status'] not in ('ready','deleting','deleted') for a in assets):
                raise HTTPException(409, '素材正在处理，请稍后重试')
            check_references(conn, {a['id'] for a in assets}, aliases)
            groups.append((selected['key'],assets))
        ids = sorted({a['id'] for _, assets in groups for a in assets})
        conn.execute("UPDATE assets SET status='deleting',deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE workspace_id=%s AND id=ANY(%s) AND status<>'deleted'", (current_workspace(),ids))
        if access:
            az.audit(conn,access.principal,'canvas.assets.purge_requested',workspace=current_workspace(),details={'keys':[s['key'] for s in selections]})
    # Persist 'deleting' before touching storage. Failures stay retryable and unreadable.
    failures = []; changed = 0; pending = []
    for key, assets in groups:
        try:
            for asset in assets:
                if asset['status'] == 'deleted': continue
                delete_object(asset)
            with connection() as conn:
                conn.execute("UPDATE assets SET status='deleted',updated_at=now() WHERE workspace_id=%s AND id=ANY(%s)", (current_workspace(),[a['id'] for a in assets]))
            # Ready immutable objects and upload staging have different lifetimes.
            # Reuse the maintenance cleaner; never shorten signed PUT expiry.
            from app.storage.uploads import cleanup
            staging = cleanup(apply=True, asset_ids=[a['id'] for a in assets], limit=1000)
            if staging['failed'] or staging['remaining']:
                pending.append({'key':key, 'state':'failed' if staging['failed'] else 'pending',
                                'message':'正式文件已删除，暂存清理待完成', 'uploads':staging['items']})
            else:
                changed += 1
        except Exception:
            failures.append({'key':key,'message':'文件清理未完成，请检查存储删除权限后重试'})
    with connection() as conn:
        if access:
            az.audit(conn,access.principal,'canvas.assets.purge',workspace=current_workspace(),details={'changed':changed,'failed_keys':[f['key'] for f in failures]})
    return {'changed':changed,'failures':failures, **({'pending':pending} if pending else {})}
