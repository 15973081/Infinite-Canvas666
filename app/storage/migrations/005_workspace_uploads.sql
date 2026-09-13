-- Preserve existing upload IDs, object keys, versions and default ownership.
ALTER TABLE canvas_cloud.media_uploads ADD COLUMN workspace_id text;
UPDATE canvas_cloud.media_uploads u SET workspace_id=a.workspace_id
    FROM canvas_cloud.assets a WHERE a.id=u.asset_id;
ALTER TABLE canvas_cloud.media_uploads ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE canvas_cloud.media_uploads ADD CONSTRAINT media_uploads_workspace_asset
    FOREIGN KEY (workspace_id, asset_id) REFERENCES canvas_cloud.assets(workspace_id, id);
ALTER TABLE canvas_cloud.media_uploads DROP CONSTRAINT media_uploads_idempotency_key_key;
ALTER TABLE canvas_cloud.media_uploads ADD CONSTRAINT media_uploads_workspace_idempotency
    UNIQUE (workspace_id, idempotency_key);
