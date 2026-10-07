-- The canonical cloud URL is /assets/cloud/<asset-id>/<name>, as well as
-- /api/media/<asset-id>/... . Repair legacy backfill without editing migration 027.
UPDATE canvas_cloud.online_works w
SET asset_id=a.id,revision=w.revision+1,updated_at=now()
FROM canvas_cloud.assets a
WHERE w.asset_id IS NULL AND w.workspace_id=a.workspace_id AND a.status='ready'
  AND a.id=substring(w.snapshot->'images'->>0 FROM '^/(?:assets/cloud|api/media)/(ast_[a-f0-9]{32})(?:/|$)');
