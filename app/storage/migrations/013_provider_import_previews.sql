-- Preview receipts contain only public summaries and opaque source digests.
-- Raw credentials are read at confirmation and encrypted by provider_control.
CREATE TABLE canvas_cloud.provider_import_previews (
    id uuid PRIMARY KEY,
    member_id text NOT NULL,
    session_id text NOT NULL,
    source text NOT NULL CHECK (source IN ('local_file', 'default_workspace')),
    source_digest text NOT NULL CHECK (length(source_digest)=64),
    report jsonb NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '15 minutes',
    completed_at timestamptz,
    selection jsonb,
    result jsonb,
    FOREIGN KEY(session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id),
    CHECK ((completed_at IS NULL AND selection IS NULL AND result IS NULL)
        OR (completed_at IS NOT NULL AND selection IS NOT NULL AND result IS NOT NULL))
);
CREATE INDEX provider_import_previews_actor ON canvas_cloud.provider_import_previews(member_id,created_at);
