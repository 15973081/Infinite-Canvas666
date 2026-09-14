"""Atomic, scoped draft copies with durable retry receipts."""
import copy
import hashlib
import json
import uuid

from app.services import authorization as az
from app.services.maintenance_control import ensure
from app.storage import canvases
from app.storage.workspace import current_workspace

PERMISSIONS = ('canvas.create', 'canvas.read', 'asset.read')
RUNTIME_FIELDS = {'running', 'queued', 'pending', '_pending', 'pendingTasks', '_dom', '_ltxEditor',
                  'runStatus', 'runError', '_cascadeIdx', '_cascadeFailed', 'runStartedAt',
                  'runFinishedAt', 'runElapsedMs', 'runTimerHidden'}


def create(actor, request_id, document):
    workspace = current_workspace()
    # Only editable document fields are accepted by the router. Never inherit
    # identity, lease state, folders, trash metadata, or historical billing logs.
    value = copy.deepcopy(document)
    for node in value['nodes']:
        for field in RUNTIME_FIELDS:
            node.pop(field, None)
    value['title'] = (value['title'].strip() or '未命名画布')[:72] + '（草稿副本）'
    try:
        digest = hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                           separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    except (ValueError, RecursionError):
        az.fail('invalid_draft_document', 400)
    with az.policy_transaction() as conn:
        for action in PERMISSIONS:
            az.require(conn, actor, action, workspace)
        ensure(conn, workspace, 'write')
        key = json.dumps(['canvas-draft-copy', workspace, actor.member_id, str(request_id)])
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 9))', (key,))
        receipt = conn.execute('''SELECT * FROM canvas_draft_copies
            WHERE workspace_id=%s AND member_id=%s AND request_id=%s''',
            (workspace, actor.member_id, request_id)).fetchone()
        if receipt:
            if receipt['document_sha256'] != digest:
                az.fail('draft_copy_request_conflict', 409)
            result = conn.execute('''SELECT id,title,kind,revision,deleted_at FROM canvases
                WHERE workspace_id=%s AND id=%s''', (workspace, receipt['canvas_id'])).fetchone()
            if not result or result['deleted_at']:
                az.fail('draft_copy_unavailable', 409)
            result.pop('deleted_at')
            return {'canvas': result, 'replayed': True}
        value.update(id=uuid.uuid4().hex, logs=[], folder_id='', owner='', pinned=False)
        from app.storage.media import referenced_ids
        ids = sorted(referenced_ids(value))
        if ids:
            ready = conn.execute('''SELECT id FROM assets WHERE workspace_id=%s AND id=ANY(%s)
                AND status='ready' AND deleted_at IS NULL AND role<>'task-result-source' ORDER BY id FOR SHARE''',
                (workspace, ids)).fetchall()
            if {row['id'] for row in ready} != set(ids):
                az.fail('draft_copy_assets_unavailable', 400)
        canvases.save(value)
        conn.execute('''INSERT INTO canvas_draft_copies(workspace_id,member_id,request_id,document_sha256,canvas_id)
            VALUES(%s,%s,%s,%s,%s)''', (workspace, actor.member_id, request_id, digest, value['id']))
        az.audit(conn, actor, 'canvas.draft_copy', value['id'], workspace, {'request_id': str(request_id)})
        return {'canvas': {key: value[key] for key in ('id', 'title', 'kind', 'revision')}, 'replayed': False}
