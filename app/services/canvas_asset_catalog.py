"""Workspace-scoped asset organization; never deletes objects or edits canvas nodes."""
import hashlib
import os
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.storage.media import id_from_ref, canonical_legacy

def key_for(url, aliases):
    asset_id=id_from_ref(url)
    if not asset_id:
        legacy=canonical_legacy(url)
        asset_id=aliases.get(legacy) if legacy else None
    return asset_id or 'url_'+hashlib.sha256(url.encode()).hexdigest()

def aliases_for(conn):
    return {r['legacy_ref']:r['asset_id'] for r in conn.execute('SELECT legacy_ref,asset_id FROM asset_aliases WHERE workspace_id=%s AND source_namespace=%s',(current_workspace(),os.getenv('ASSET_SOURCE_NAMESPACE','local')))}

def decorate(data, trash=False):
    with connection() as conn:
        aliases=aliases_for(conn)
        records={r['asset_key']:r for r in conn.execute('SELECT * FROM canvas_asset_catalog WHERE workspace_id=%s',(current_workspace(),))}
    live_keys=set()
    items=[]
    for original in data['items']:
        item=dict(original); key=key_for(item['url'],aliases); live_keys.add(key)
        record=records.get(key)
        item.update(asset_key=key,catalog_version=record['version'] if record else 0)
        if record:
            item.update(record['metadata']); item['trashed']=bool(record['trashed_at'])
        if bool(item.get('trashed')) == trash: items.append(item)
    for key,record in records.items():
        if key not in live_keys and (bool(record['trashed_at'])==trash):
            item=dict(record['snapshot']); item.update(record['metadata']);item.update(asset_key=key,catalog_version=record['version'],trashed=bool(record['trashed_at']))
            items.append(item)
    data['items']=items
    data['trash_count']=sum(bool(r['trashed_at']) for r in records.values())
    data['catalog_enabled']=True
    from app.services.member_context import current_access
    access=current_access.get()
    data['can_manage']=False
    if access:
        from app.services import authorization as az
        with connection() as conn:
            data['can_manage']='asset.manage' in az.effective_permissions(conn,access.principal.member_id,current_workspace())
    else:
        data['can_manage']=True
    for canvas in data['canvases']:
        canvas['asset_count']=sum(i['canvas_id']==canvas['id'] for i in items)
    for category in data['categories']:
        category['count']=sum(category['id']=='all' or i['canvas_kind']==category['id'] for i in items)
    return data

def references_many(asset_keys):
    keys=set(asset_keys)
    from app.services.canvas import iter_canvas_documents,iter_canvas_asset_values,canvas_node_title
    with connection() as conn:
        aliases=aliases_for(conn)
    results=[]
    for canvas in iter_canvas_documents():
        for node in canvas.get('nodes',[]):
            if not isinstance(node,dict): continue
            matches={}
            for path,raw,url in iter_canvas_asset_values(node):
                key=key_for(url,aliases)
                if key in keys: matches.setdefault(key,set()).add(path)
            for key,paths in matches.items():
                results.append(dict(asset_key=key,canvas_id=canvas['id'],canvas_title=canvas.get('title','未命名画布'),node_id=node.get('id',''),node_title=canvas_node_title(node),canvas_trashed=bool(canvas.get('deleted_at')),paths=sorted(paths)))
    return results

def references(asset_key):
    return references_many([asset_key])

def mutate(payload):
    from app.storage.settings import postgres_enabled
    if not postgres_enabled(): raise HTTPException(409,"素材整理需要 PostgreSQL 存储模式")
    from app.services.canvas import canvas_assets_index
    action=payload['action']; selections=payload['items']
    if action not in {'edit','trash','restore'} or not selections or len(selections)>200:
        raise HTTPException(400,"请选择 1–200 个素材")
    if len({s['key'] for s in selections}) != len(selections): raise HTTPException(400,'素材不能重复')
    metadata=payload.get('metadata') or {}
    if set(metadata)-{'name','category','tags'}: raise HTTPException(400,'无效的整理字段')
    for name in ('name','category'):
        if name in metadata:
            if not isinstance(metadata[name],str) or len(metadata[name].strip())>(240 if name=='name' else 80): raise HTTPException(400,'名称或分类过长')
            metadata[name]=metadata[name].strip()
    if 'name' in metadata and (not metadata['name'] or len(selections)!=1): raise HTTPException(400,'重命名请只选择一个素材')
    if 'tags' in metadata:
        if not isinstance(metadata['tags'],list) or len(metadata['tags'])>20 or any(not isinstance(t,str) or len(t)>40 for t in metadata['tags']): raise HTTPException(400,'标签最多 20 个，每个不超过 40 字')
        metadata['tags']=list(dict.fromkeys(t.strip() for t in metadata['tags'] if t.strip()))
    with connection() as conn:
        from app.services.member_context import current_access
        from app.services import authorization as az
        access=current_access.get()
        if access:
            az.require(conn,access.principal,'asset.manage',current_workspace())
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('canvas-asset-catalog:'+current_workspace(),))
        aliases=aliases_for(conn)
        raw=canvas_assets_index(managed=False)
        live={key_for(i['url'],aliases):i for i in raw['items']}
        rows={r['asset_key']:r for r in conn.execute('SELECT * FROM canvas_asset_catalog WHERE workspace_id=%s FOR UPDATE',(current_workspace(),))}
        for selected in selections:
            key=selected['key']; row=rows.get(key)
            if selected['version']!=(row['version'] if row else 0): raise HTTPException(409,'素材已被修改，请刷新后重试')
            if key not in live and not row: raise HTTPException(404,'当前空间未找到素材')
            snapshot=live.get(key) or row['snapshot']
            merged=dict(row['metadata']) if row else {}
            if action=='edit': merged.update(metadata)
            trashed=(action=='trash') if action!='edit' else bool(row and row['trashed_at'])
            conn.execute('''INSERT INTO canvas_asset_catalog(workspace_id,asset_key,metadata,snapshot,trashed_at)
                VALUES(%s,%s,%s,%s,CASE WHEN %s THEN now() ELSE NULL END)
                ON CONFLICT(workspace_id,asset_key) DO UPDATE SET metadata=EXCLUDED.metadata,snapshot=EXCLUDED.snapshot,
                trashed_at=EXCLUDED.trashed_at,version=canvas_asset_catalog.version+1,updated_at=now()''',
                (current_workspace(),key,Jsonb(merged),Jsonb(snapshot),trashed))
        if access:
            az.audit(conn,access.principal,'canvas.assets.'+action,workspace=current_workspace(),details={'keys':[s['key'] for s in selections]})
    return {'changed':len(selections)}
