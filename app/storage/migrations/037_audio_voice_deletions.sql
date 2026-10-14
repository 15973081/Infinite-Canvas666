CREATE TABLE canvas_cloud.audio_voice_deletions (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
    account_ref text NOT NULL,
    voice_id text NOT NULL,
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    task_id text NOT NULL REFERENCES canvas_cloud.tasks(id),
    voice_type text NOT NULL CHECK(voice_type IN ('voice_generation','voice_cloning')),
    operation_id uuid NOT NULL,
    state text NOT NULL CHECK(state IN ('pending','unknown','failed','deleted')),
    dispatched_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    history jsonb NOT NULL DEFAULT '[]',
    PRIMARY KEY(workspace_id,provider_id,account_ref,voice_id)
);
CREATE INDEX audio_voice_deletions_owner ON canvas_cloud.audio_voice_deletions(workspace_id,member_id,provider_id,account_ref);
