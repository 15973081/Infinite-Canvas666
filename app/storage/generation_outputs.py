"""Exact output provenance, committed with the successful server task.

Only the persisted task requester is an author. Inputs, provider response
metadata, canvas editors and the worker's current principal are not evidence.
"""
from fastapi import HTTPException
from app.storage.media import id_from_ref


def record(conn, task):
    if task['status'] != 'succeeded' or task['kind'] not in {'online-image', 'video', 'audio'}:
        return
    # Existing anonymous/shared-mode tasks have no provable member identity.
    # New member-mode submissions are rejected before insertion if anonymous.
    if not task['requested_by']:
        return
    kind, field = ('image', 'images') if task['kind'] == 'online-image' else ('audio', 'audios') if task['kind'] == 'audio' else ('video', 'videos')
    result = task['result']
    outputs = result.get(field) if isinstance(result, dict) else None
    if not isinstance(outputs, list) or not outputs:
        raise HTTPException(409, {'code': 'generation_outputs_missing'})
    identities = []
    for value in outputs:
        url = value if isinstance(value, str) else value.get('url') if isinstance(value, dict) else None
        asset_id = id_from_ref(url)
        explicit = value.get('media_asset_id') if isinstance(value, dict) else None
        if not asset_id or (explicit is not None and explicit != asset_id):
            raise HTTPException(409, {'code': 'generation_output_identity_invalid'})
        identities.append(asset_id)
    assets = conn.execute('''SELECT id FROM assets WHERE workspace_id=%s AND id=ANY(%s)
        AND status='ready' AND deleted_at IS NULL AND role<>'task-result-source'
        ORDER BY id FOR SHARE''', (task['workspace_id'], identities)).fetchall()
    if {r['id'] for r in assets} != set(identities):
        raise HTTPException(409, {'code': 'generation_output_not_ready'})
    expected = [(index, asset_id, task['requested_by'], kind) for index, asset_id in enumerate(identities)]
    existing = conn.execute('''SELECT output_index,asset_id,member_id,media_kind FROM generation_outputs
        WHERE task_id=%s ORDER BY output_index''', (task['id'],)).fetchall()
    if existing:
        if [(r['output_index'],r['asset_id'],r['member_id'],r['media_kind']) for r in existing] != expected:
            raise HTTPException(409, {'code': 'generation_output_attribution_conflict'})
        return
    # tasks.save holds the task row lock: publication retries cannot duplicate
    # or silently reassign an output slot.
    for index, asset_id, member_id, media_kind in expected:
        conn.execute('''INSERT INTO generation_outputs(task_id,workspace_id,member_id,media_kind,output_index,asset_id)
            VALUES(%s,%s,%s,%s,%s,%s)''',
            (task['id'],task['workspace_id'],member_id,media_kind,index,asset_id))
