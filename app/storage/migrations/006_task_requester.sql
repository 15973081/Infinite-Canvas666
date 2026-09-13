-- Existing task authors remain unknown; do not infer identities from IP/client_id.
ALTER TABLE canvas_cloud.tasks ADD COLUMN requested_by text REFERENCES canvas_cloud.members(id);
CREATE INDEX tasks_requester ON canvas_cloud.tasks(workspace_id, requested_by, created_at DESC);
