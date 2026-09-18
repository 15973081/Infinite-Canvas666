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
    index_items(conn, canvas['id'], items)


def index_items(conn, canvas_id, items):
    from app.services.canvas_asset_catalog import key_for
    from app.storage.media import canonical_legacy, id_from_ref
    rows = [dict(item_id=i['id'], asset_key=key_for(i['url'], {}),
                 legacy_ref='' if id_from_ref(i['url']) else canonical_legacy(i['url']), document=i) for i in items]
    conn.execute('''WITH entries AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(%s)
        AS x(item_id text,asset_key text,legacy_ref text,document jsonb)), removed AS (
        DELETE FROM canvas_asset_items i WHERE workspace_id=%s AND canvas_id=%s
          AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.item_id=i.item_id))
        INSERT INTO canvas_asset_items(workspace_id,canvas_id,item_id,asset_key,legacy_ref,document)
        SELECT %s,%s,item_id,asset_key,legacy_ref,document FROM entries
        ON CONFLICT(workspace_id,canvas_id,item_id) DO UPDATE SET
        asset_key=EXCLUDED.asset_key,legacy_ref=EXCLUDED.legacy_ref,document=EXCLUDED.document
        WHERE canvas_asset_items.document IS DISTINCT FROM EXCLUDED.document
          OR canvas_asset_items.legacy_ref IS DISTINCT FROM EXCLUDED.legacy_ref
          OR canvas_asset_items.asset_key IS DISTINCT FROM EXCLUDED.asset_key''',
        (Jsonb(rows), current_workspace(), canvas_id, current_workspace(), canvas_id))
    conn.execute('UPDATE canvas_asset_groups SET asset_indexed=true WHERE workspace_id=%s AND canvas_id=%s',
                 (current_workspace(), canvas_id))


def ensure_index(conn):
    """Upgrade legacy groups once, under the same lock used by canvas saves."""
    from app.services.canvas import extract_canvas_assets
    rows = conn.execute('''SELECT canvas_id,document,items FROM canvas_asset_groups
        WHERE workspace_id=%s AND NOT asset_indexed ORDER BY canvas_id FOR UPDATE''',
        (current_workspace(),)).fetchall()
    for row in rows:
        index_items(conn, row['canvas_id'], merged_items(extract_canvas_assets(row['document']), row['items']))


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
