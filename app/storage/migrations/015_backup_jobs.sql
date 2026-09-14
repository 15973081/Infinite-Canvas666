CREATE TABLE canvas_cloud.backup_jobs (
    id uuid PRIMARY KEY,
    workspace_id text REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL,
    session_id text NOT NULL,
    kind text NOT NULL CHECK(kind IN ('platform_backup','workspace_export')),
    status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at timestamptz,
    completed_at timestamptz,
    summary jsonb NOT NULL DEFAULT '{}',
    error_code text,
    FOREIGN KEY(session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id),
    CHECK ((kind='platform_backup') = (workspace_id IS NULL))
);
CREATE UNIQUE INDEX backup_jobs_active_scope ON canvas_cloud.backup_jobs(coalesce(workspace_id,''))
    WHERE status IN ('queued','running');
CREATE INDEX backup_jobs_scope ON canvas_cloud.backup_jobs(workspace_id,created_at);
