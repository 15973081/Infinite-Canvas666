CREATE TABLE canvas_cloud.canvas_asset_catalog (
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 asset_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 snapshot jsonb NOT NULL,
 trashed_at timestamptz,
 version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,asset_key)
);
