"""Native file-tree placement, with mixed ordering outside canvas documents."""
from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.member_context import current_access
from app.services.maintenance_control import ensure
from app.storage.canvas_directory import lock
from app.storage.database import connection
from app.storage.workspace import current_workspace
from app.storage.settings import postgres_enabled, member_auth_enabled


def ordering(conn):
    row = conn.execute("SELECT value FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_directory_order' AND id='default'", (current_workspace(),)).fetchone()
    return row['value'].get('parents', {}) if row else {}


def catalog():
    from app.services.canvas import canvas_folder_records
    with connection() as conn:
        lock(conn)
        return {'folders': canvas_folder_records(), 'ordering': ordering(conn)}


def move(kind, source_id, payload):
    if not postgres_enabled() or not member_auth_enabled():
        az.fail('member_directory_placement_required', 409)
    access = current_access.get()
    if access is None or access.principal.audience != 'workbench':
        az.fail('workbench_session_required')
    with az.policy_transaction() as conn:
        workspace = current_workspace()
        for action in ('canvas.read', 'canvas.edit'):
            az.require(conn, access.principal, action, workspace)
        ensure(conn, workspace, 'write')
        # No shared-directory lock may precede this exclusive lock in the gateway.
        lock(conn, exclusive=True)
        row = conn.execute("SELECT value FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_folders' AND id='default'", (workspace,)).fetchone()
        folders = row['value'].get('folders', []) if row else []
        canvases = conn.execute("""SELECT id,title,revision,document->>'folder_id' AS folder_id,updated_at
            FROM canvases WHERE workspace_id=%s AND deleted_at IS NULL
            AND coalesce(document->>'purged_at','0') IN ('0','')""", (workspace,)).fetchall()
        entries = {('folder', item['id']): {'parent': item.get('parent_id') or '', 'item': item} for item in folders}
        entries.update({('canvas', item['id']): {'parent': item['folder_id'] or '', 'item': item} for item in canvases})
        source = entries.get((kind, source_id))
        target = entries.get((payload.target_kind, payload.target_id))
        if not source or payload.target_kind != 'root' and not target:
            az.fail('directory_target_not_found', 404)
        if payload.target_kind == 'root' and (payload.target_id or payload.placement != 'into'):
            az.fail('directory_placement_invalid', 400)
        if kind == payload.target_kind and source_id == payload.target_id:
            az.fail('directory_placement_invalid', 400)
        if payload.placement == 'into' and payload.target_kind == 'canvas':
            az.fail('directory_placement_invalid', 400)
        if source['parent'] != payload.source_parent_id or (target['parent'] if target else '') != payload.target_parent_id:
            az.fail('directory_target_changed', 409)
        parent = '' if payload.target_kind == 'root' else payload.target_id if payload.placement == 'into' else target['parent']
        if kind == 'folder':
            cursor, seen = parent, set()
            while cursor:
                if cursor == source_id or cursor in seen:
                    az.fail('directory_placement_cycle', 400)
                seen.add(cursor)
                ancestor = entries.get(('folder', cursor))
                if not ancestor:
                    az.fail('directory_target_changed', 409)
                cursor = ancestor['parent']
        if kind == 'canvas':
            from app.services.canvas_leases import request_write
            request_write(conn, source_id, operation='canvas.write')
        stored = ordering(conn)
        # Drop stale/deleted IDs and rebuild only from current workspace membership.
        groups = {}
        for entry_kind, entry_id in sorted(entries, key=lambda key: (
                0 if key[0] == 'canvas' else 1,
                -entries[key]['item']['updated_at'].timestamp() if key[0] == 'canvas' else entries[key]['item'].get('order', 0), key[1])):
            group = entries[(entry_kind, entry_id)]['parent']
            groups.setdefault(group, []).append(entry_kind + ':' + entry_id)
        for group, keys in groups.items():
            previous = stored.get(group, [])
            rank = {value: index for index, value in enumerate(previous)}
            fallback = {value: len(rank) + index for index, value in enumerate(keys)}
            keys.sort(key=lambda value: rank.get(value, fallback[value]))
        source_key, target_key = kind + ':' + source_id, payload.target_kind + ':' + payload.target_id
        groups[source['parent']].remove(source_key)
        siblings = groups.setdefault(parent, [])
        index = len(siblings) if payload.placement == 'into' else siblings.index(target_key) + (payload.placement == 'below')
        siblings.insert(index, source_key)
        canvas = None
        if kind == 'folder':
            source['item']['parent_id'] = parent
            conn.execute("UPDATE workspace_documents SET value=%s,revision=revision+1,updated_at=now() WHERE workspace_id=%s AND kind='canvas_folders' AND id='default'", (Jsonb({'folders': folders}), workspace))
        else:
            from app.storage.canvases import save_metadata
            from app.services.canvas import canvas_record
            value = {'id': source_id, 'folder_id': parent, 'revision': source['item']['revision']}
            save_metadata(value)
            canvas = {**canvas_record(value), 'revision': value['revision']}
        conn.execute("""INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'canvas_directory_order','default',%s)
            ON CONFLICT(workspace_id,kind,id) DO UPDATE SET value=excluded.value,revision=workspace_documents.revision+1,updated_at=now()""", (workspace, Jsonb({'parents': groups})))
        from app.services.authorization import audit
        audit(conn, access.principal, 'canvas.directory.move', workspace=workspace, target=source_id,
              details={'kind': kind, 'parent_id': parent, 'target_id': payload.target_id, 'placement': payload.placement})
        return {'ok': True, 'folder_id': parent, 'folders': folders, 'ordering': groups, 'canvas': canvas}
