CREATE INDEX tasks_account_history ON canvas_cloud.tasks(requested_by,created_at DESC,id DESC)
WHERE requested_by IS NOT NULL;
