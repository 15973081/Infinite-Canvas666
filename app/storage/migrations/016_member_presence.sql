-- Ephemeral per-socket liveness; server IDs never grant canvas editing rights.
CREATE TABLE canvas_cloud.member_presence_sockets (
    id uuid PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL,
    login_session_id text NOT NULL,
    member_auth_version bigint NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(login_session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id)
);
CREATE INDEX member_presence_sockets_workspace ON canvas_cloud.member_presence_sockets(workspace_id,seen_at);
CREATE INDEX member_presence_sockets_expiry ON canvas_cloud.member_presence_sockets(seen_at);
