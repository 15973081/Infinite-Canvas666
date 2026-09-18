"""Workspace-scoped availability checks without downloading object contents."""
import os

from app.storage.database import connection
from app.storage.media import canonical_legacy, id_from_ref
from app.storage.workspace import current_workspace


def existing_references(refs):
    ids = {ref: id_from_ref(ref) for ref in refs}
    aliases = {ref: canonical_legacy(ref) for ref in refs if not ids[ref]}
    workspace = current_workspace()
    with connection() as conn:
        if aliases:
            rows = conn.execute(
                "SELECT legacy_ref,asset_id FROM asset_aliases WHERE workspace_id=%s "
                "AND source_namespace=%s AND legacy_ref=ANY(%s)",
                (workspace, os.getenv("ASSET_SOURCE_NAMESPACE", "local"),
                 sorted(set(aliases.values()) - {""})),
            ).fetchall()
            resolved = {row["legacy_ref"]: row["asset_id"] for row in rows}
            ids.update({ref: resolved.get(alias, "") for ref, alias in aliases.items()})
        wanted = sorted(set(ids.values()) - {""})
        ready = set()
        if wanted:
            ready = {row["id"] for row in conn.execute(
                "SELECT id FROM assets WHERE workspace_id=%s AND id=ANY(%s) "
                "AND status='ready' AND deleted_at IS NULL AND role<>'task-result-source'",
                (workspace, wanted),
            ).fetchall()}
    return {ref: asset_id in ready for ref, asset_id in ids.items()}
