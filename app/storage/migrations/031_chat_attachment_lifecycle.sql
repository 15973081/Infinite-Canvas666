CREATE TABLE canvas_cloud.chat_upload_reservations (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    size_bytes bigint NOT NULL CHECK(size_bytes>0),
    expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour'
);
CREATE INDEX chat_upload_reservations_owner ON canvas_cloud.chat_upload_reservations(owner_id,expires_at);

-- Keep completed jobs as deletion records, rather than removing their tombstones.
CREATE TABLE canvas_cloud.chat_attachment_deletions (
    workspace_id text NOT NULL,
    asset_id text NOT NULL,
    owner_id text NOT NULL,
    objects jsonb NOT NULL,
    state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','retrying','succeeded')),
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_token uuid,
    lease_until timestamptz,
    last_error text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    PRIMARY KEY(workspace_id,asset_id)
);
CREATE INDEX chat_attachment_deletions_pending ON canvas_cloud.chat_attachment_deletions(available_at) WHERE state<>'succeeded';
