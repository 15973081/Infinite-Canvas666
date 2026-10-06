"""Workspace media inventory totals; no bucket listing or media downloads."""
from datetime import datetime, timezone

from app.storage.database import connection
from app.storage.workspace import current_workspace


def usage():
    workspace = current_workspace()
    with connection() as conn:
        rows = conn.execute("""SELECT kind,
            coalesce(sum(size_bytes) FILTER (WHERE object_version_id IS NOT NULL),0) AS bytes,
            count(*) FILTER (WHERE object_version_id IS NOT NULL) AS files,
            count(*) FILTER (WHERE object_version_id IS NOT NULL AND size_bytes IS NULL) AS unknown_files,
            coalesce(sum(size_bytes) FILTER (WHERE object_version_id IS NOT NULL AND status<>'ready'),0) AS retained_bytes,
            count(*) FILTER (WHERE object_version_id IS NULL AND status IN ('uploading','verifying')) AS pending_files
            FROM assets WHERE workspace_id=%s AND status<>'deleted' GROUP BY kind""", (workspace,)).fetchall()
    kinds = {row['kind']: {key: int(row[key]) for key in
        ('bytes', 'files', 'unknown_files', 'retained_bytes', 'pending_files')} for row in rows}
    return {'workspace_id': workspace, 'scope': 'registered_media', 'quota_bytes': None,
            **{key: sum(row[key] for row in kinds.values()) for key in
               ('bytes', 'files', 'unknown_files', 'retained_bytes', 'pending_files')},
            'by_kind': kinds, 'updated_at': datetime.now(timezone.utc).isoformat()}
