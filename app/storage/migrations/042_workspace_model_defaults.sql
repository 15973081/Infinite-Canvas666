CREATE TABLE canvas_cloud.workspace_model_defaults (
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 kind text NOT NULL CHECK(kind IN ('image','video','chat','audio','model')),
 provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
 model text NOT NULL,
 PRIMARY KEY(workspace_id,kind)
);
CREATE TABLE canvas_cloud.workspace_model_default_versions (
 workspace_id text PRIMARY KEY REFERENCES canvas_cloud.workspaces(id),
 version bigint NOT NULL DEFAULT 0
);
