-- Server-owned provider configuration and explicit workspace grants.
CREATE TABLE canvas_cloud.managed_providers (
    id text PRIMARY KEY,
    config jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version>0),
    secret_ciphertext text,
    secret_fields text[] NOT NULL DEFAULT '{}',
    updated_by text NOT NULL REFERENCES canvas_cloud.members(id),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE canvas_cloud.workspace_provider_sets (
    workspace_id text PRIMARY KEY REFERENCES canvas_cloud.workspaces(id),
    version bigint NOT NULL DEFAULT 1 CHECK(version>0),
    primary_provider_id text REFERENCES canvas_cloud.managed_providers(id)
);
CREATE TABLE canvas_cloud.workspace_provider_grants (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspace_provider_sets(workspace_id),
    provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
    PRIMARY KEY(workspace_id,provider_id)
);
