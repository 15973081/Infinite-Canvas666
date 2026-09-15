CREATE TABLE canvas_cloud.canvas_asset_groups (
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 canvas_id text NOT NULL,
 document jsonb NOT NULL,
 items jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,canvas_id)
);
-- Preserve existing active, recycled and purged canvases as independent asset groups.
INSERT INTO canvas_cloud.canvas_asset_groups(workspace_id,canvas_id,document)
SELECT workspace_id,id,(document - 'logs' - 'connections' - 'viewport' - 'settings') ||
 jsonb_build_object('id',id,'title',title,'kind',kind,
 'deleted_at',CASE WHEN deleted_at IS NULL THEN 0 ELSE (extract(epoch FROM deleted_at)*1000)::bigint END,
 'created_at',(extract(epoch FROM created_at)*1000)::bigint,
 'updated_at',(extract(epoch FROM updated_at)*1000)::bigint)
FROM canvas_cloud.canvases;
