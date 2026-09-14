CREATE TABLE canvas_cloud.maintenance_controls (
    scope_key text PRIMARY KEY,
    workspace_id text UNIQUE REFERENCES canvas_cloud.workspaces(id),
    mode text NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','scheduled','draining','read_only','offline','recovering')),
    version bigint NOT NULL DEFAULT 0,
    message text NOT NULL DEFAULT '',
    reason text NOT NULL DEFAULT '',
    planned_at timestamptz,
    drain_started_at timestamptz,
    drain_deadline timestamptz,
    grace_seconds integer NOT NULL DEFAULT 300 CHECK (grace_seconds BETWEEN 0 AND 3600),
    updated_by text REFERENCES canvas_cloud.members(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    restored_at timestamptz,
    CHECK (scope_key=CASE WHEN workspace_id IS NULL THEN 'platform' ELSE 'space:'||workspace_id END),
    CHECK (mode<>'scheduled' OR planned_at IS NOT NULL),
    CHECK (mode<>'draining' OR (drain_started_at IS NOT NULL AND drain_deadline IS NOT NULL))
);
INSERT INTO canvas_cloud.maintenance_controls(scope_key) VALUES ('platform');
-- Preserve an old persisted drain; upgrading never silently restores normal.
INSERT INTO canvas_cloud.maintenance_controls(scope_key,workspace_id,mode,message,drain_started_at,drain_deadline)
SELECT 'space:'||w.id,w.id,
    CASE WHEN d.value->>'mode'='draining' THEN 'draining' ELSE 'normal' END,
    coalesce(d.value->>'message',''),
    CASE WHEN d.value->>'mode'='draining' THEN now() END,
    CASE WHEN d.value->>'mode'='draining' THEN now()+interval '5 minutes' END
FROM canvas_cloud.workspaces w LEFT JOIN canvas_cloud.workspace_documents d
  ON d.workspace_id=w.id AND d.kind='maintenance' AND d.id='default';

CREATE TABLE canvas_cloud.service_heartbeats (
    instance_id text PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('workbench','worker')),
    started_at timestamptz NOT NULL DEFAULT now(),
    seen_at timestamptz NOT NULL DEFAULT now(),
    stopped_at timestamptz
);

ALTER TABLE canvas_cloud.tasks ADD CONSTRAINT tasks_id_workspace UNIQUE (id,workspace_id);
CREATE TABLE canvas_cloud.task_submissions (
    id uuid PRIMARY KEY,
    task_id text NOT NULL,
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at timestamptz,
    outcome text NOT NULL DEFAULT 'admitted' CHECK (outcome IN ('admitted','responded','uncertain')),
    response_status integer,
    FOREIGN KEY (task_id,workspace_id) REFERENCES canvas_cloud.tasks(id,workspace_id)
);
CREATE INDEX task_submissions_task ON canvas_cloud.task_submissions(task_id,admitted_at);
