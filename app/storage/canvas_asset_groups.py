"""Durable per-canvas asset membership, independent of canvas deletion."""
from psycopg.types.json import Jsonb
from app.storage.database import connection
from app.storage.workspace import current_workspace


def merged_items(previous, current):
    # Existing membership survives removing/replacing nodes in the source canvas.
    result = {item['id']: item for item in previous}
    result.update({item['id']: item for item in current})
    return list(result.values())


def save_group(conn, canvas):
    from app.services.canvas import canvas_record, extract_canvas_assets
    row = conn.execute(
        'SELECT document,items FROM canvas_asset_groups WHERE workspace_id=%s AND canvas_id=%s FOR UPDATE',
        (current_workspace(), canvas['id']),
    ).fetchone()
    previous = []
    if row:
        previous = merged_items(extract_canvas_assets(row['document']), row['items'])
    items = merged_items(previous, extract_canvas_assets(canvas))
    record = canvas_record(canvas)
    record['purged_at'] = canvas.get('purged_at', 0)
    conn.execute('''INSERT INTO canvas_asset_groups(workspace_id,canvas_id,document,items)
        VALUES(%s,%s,%s,%s) ON CONFLICT(workspace_id,canvas_id)
        DO UPDATE SET document=EXCLUDED.document,items=EXCLUDED.items,updated_at=now()''',
        (current_workspace(), canvas['id'], Jsonb(record), Jsonb(items)))


def documents():
    from app.services.canvas import extract_canvas_assets
    after = ''
    while True:
        with connection() as conn:
            rows = conn.execute('''SELECT canvas_id,document,items FROM canvas_asset_groups
                WHERE workspace_id=%s AND canvas_id>%s ORDER BY canvas_id LIMIT 100''',
                (current_workspace(), after)).fetchall()
        if not rows:
            return
        for row in rows:
            doc = dict(row['document'])
            items = merged_items(extract_canvas_assets(doc), row['items'])
            state = 'purged' if doc.get('purged_at') else 'deleted' if doc.get('deleted_at') else 'active'
            for item in items:
                item.update(canvas_title=doc.get('title', '未命名画布'), canvas_state=state,
                            canvas_updated_at=doc.get('updated_at', 0))
            doc['_asset_group_items'] = items
            doc['asset_source_state'] = state
            yield doc
        after = rows[-1]['canvas_id']
