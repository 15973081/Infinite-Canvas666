CREATE TABLE canvas_cloud.audio_voice_favorites (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
    account_ref text NOT NULL,
    voice_id text NOT NULL CHECK(length(voice_id) BETWEEN 1 AND 180),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(workspace_id,member_id,provider_id,account_ref,voice_id)
);
CREATE INDEX audio_voice_favorites_member ON canvas_cloud.audio_voice_favorites(member_id,workspace_id);
