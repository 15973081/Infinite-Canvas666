-- Diagnostic reports, never editing credentials or a database-stop guarantee.
CREATE TABLE canvas_cloud.canvas_page_reports (
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    member_id text NOT NULL,
    login_session_id text NOT NULL,
    page_id uuid NOT NULL,
    sequence bigint NOT NULL CHECK(sequence>0),
    member_auth_version bigint NOT NULL,
    dirty boolean NOT NULL,
    closed boolean NOT NULL DEFAULT false,
    seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(workspace_id,canvas_id,member_id,login_session_id,page_id),
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvases(workspace_id,id),
    FOREIGN KEY(login_session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id)
);
CREATE INDEX canvas_page_reports_activity ON canvas_cloud.canvas_page_reports(workspace_id,seen_at)
    WHERE NOT closed OR dirty;
