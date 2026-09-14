-- Canvas rows are retained tombstones; generation is never reset on release.
ALTER TABLE canvas_cloud.member_sessions ADD CONSTRAINT member_sessions_identity UNIQUE(id,member_id);
ALTER TABLE canvas_cloud.canvases ADD COLUMN created_by text REFERENCES canvas_cloud.members(id);
ALTER TABLE canvas_cloud.canvases ADD COLUMN updated_by text REFERENCES canvas_cloud.members(id);
ALTER TABLE canvas_cloud.tasks ADD COLUMN canvas_revision bigint;
ALTER TABLE canvas_cloud.tasks ADD COLUMN canvas_edit_generation bigint;
CREATE TABLE canvas_cloud.canvas_edit_leases (
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    generation bigint NOT NULL DEFAULT 0 CHECK (generation>=0),
    member_id text REFERENCES canvas_cloud.members(id),
    member_auth_version bigint,
    login_session_id text,
    edit_session_id uuid,
    token_hash text CHECK (length(token_hash)=64),
    acquired_at timestamptz,
    renewed_at timestamptz,
    expires_at timestamptz,
    released_at timestamptz,
    PRIMARY KEY(workspace_id,canvas_id),
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvases(workspace_id,id),
    FOREIGN KEY(login_session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id),
    CHECK ((member_id IS NULL AND login_session_id IS NULL AND token_hash IS NULL AND edit_session_id IS NULL)
        OR (member_id IS NOT NULL AND login_session_id IS NOT NULL AND token_hash IS NOT NULL AND edit_session_id IS NOT NULL))
);
CREATE INDEX canvas_edit_lease_expiry ON canvas_cloud.canvas_edit_leases(workspace_id,expires_at);
CREATE TABLE canvas_cloud.collaboration_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    actor_id text REFERENCES canvas_cloud.members(id),
    action text NOT NULL,
    previous_generation bigint NOT NULL,
    generation bigint NOT NULL,
    revision bigint NOT NULL,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvases(workspace_id,id)
);
CREATE INDEX collaboration_events_canvas ON canvas_cloud.collaboration_events(workspace_id,canvas_id,id);
CREATE TABLE canvas_cloud.canvas_release_snapshots (
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    generation bigint NOT NULL,
    revision bigint NOT NULL,
    document jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(workspace_id,canvas_id,generation),
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvas_edit_leases(workspace_id,canvas_id)
);
CREATE TABLE canvas_cloud.canvas_transfer_requests (
    id uuid PRIMARY KEY,
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    generation bigint NOT NULL,
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    login_session_id text NOT NULL,
    member_auth_version bigint NOT NULL,
    edit_session_id uuid NOT NULL,
    token_hash text NOT NULL CHECK(length(token_hash)=64),
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    resolved_at timestamptz,
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvas_edit_leases(workspace_id,canvas_id),
    FOREIGN KEY(login_session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id)
);
CREATE INDEX canvas_transfer_pending ON canvas_cloud.canvas_transfer_requests(workspace_id,canvas_id,generation) WHERE status='pending';
