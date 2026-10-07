"""Read-only, workspace-scoped reference filtering; deletion rechecks separately."""
from collections import defaultdict

from app.storage import media
from app.storage.workspace import current_workspace
from app.services.canvas_asset_catalog import aliases_for


def matching_work_ids(conn, wanted):
    from app.services.online_inbox import is_canvas_task

    workspace = current_workspace()
    works = conn.execute("SELECT id,history_id,task_id,asset_id,snapshot FROM online_works WHERE workspace_id=%s AND state<>'purged'", (workspace,)).fetchall()
    if not works:
        return []
    assets = {r['id']: r for r in conn.execute('SELECT id,parent_asset_id,status FROM assets WHERE workspace_id=%s', (workspace,))}
    children = defaultdict(set)
    for asset in assets.values():
        children[asset['parent_asset_id']].add(asset['id'])
    aliases = aliases_for(conn)
    hard_refs = set()
    origins = defaultdict(set)
    resolved = {}

    def refs(value):
        found = set()
        stack = [value]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, str):
                if item not in resolved:
                    resolved[item] = media.id_from_ref(item) or aliases.get(media.canonical_legacy(item))
                if resolved[item]:
                    found.add(resolved[item])
        return found

    def origin(value, source):
        for key in refs(value):
            origins[key].add(source)

    def result_refs(value, source):
        # Only images are releasable outputs. Prompt parameters/inputs remain hard refs.
        if isinstance(value, dict) and isinstance(value.get('images'), list):
            origin(value['images'], source)
            hard_refs.update(refs({k: v for k, v in value.items() if k != 'images'}))
        else:
            hard_refs.update(refs(value))

    histories = {w['history_id'] for w in works}
    task_ids = {w['task_id'] for w in works if w['task_id']}
    for row in conn.execute('SELECT document FROM canvases WHERE workspace_id=%s', (workspace,)):
        # Includes recycled canvases, and references anywhere in their saved documents.
        hard_refs.update(refs(row['document']))
    for row in conn.execute('SELECT kind,id,value FROM workspace_documents WHERE workspace_id=%s', (workspace,)):
        if row['kind'] == 'history' and row['id'] in histories:
            result_refs(row['value'], ('history', row['id']))
        else:
            hard_refs.update(refs(row['value']))
    for task in conn.execute('''SELECT id,kind,status,canvas_id,request,result,input_asset_ids,output_asset_ids,legacy_metadata,
            (lease_until IS NULL OR lease_until<clock_timestamp()) AS lease_expired
            FROM tasks WHERE workspace_id=%s''', (workspace,)):
        eligible = (task['id'] in task_ids and task['kind'] == 'online-image'
                    and task['status'] == 'succeeded' and task['lease_expired'] and not is_canvas_task(task))
        if eligible:
            source = ('task', task['id'])
            hard_refs.update(refs([task['request'], task['input_asset_ids']]))
            result_refs(task['result'], source)
            legacy = dict(task['legacy_metadata'] or {})
            result_refs(legacy.pop('result', None), source)
            hard_refs.update(refs(legacy))
            origin(task['output_asset_ids'], source)
        else:
            hard_refs.update(refs([task['request'], task['result'], task['input_asset_ids'], task['output_asset_ids'], task['legacy_metadata']]))
    for work in works:
        origin([work['asset_id'], work['snapshot']], ('work', work['id']))

    matched = []
    for work in works:
        asset = assets.get(work['asset_id'])
        # Unmapped/external/unready files have unknown status: never call them unreferenced.
        if not asset or asset['status'] != 'ready':
            continue
        family = set()
        pending = [asset['id']]
        while pending:
            key = pending.pop()
            if key in family:
                continue
            family.add(key)
            pending.extend(children[key])
        own = {('work', work['id']), ('history', work['history_id']), ('task', work['task_id'])}
        referenced = bool(family & hard_refs) or any(origins[key] - own for key in family)
        if referenced == (wanted == 'referenced'):
            matched.append(work['id'])
    return matched
