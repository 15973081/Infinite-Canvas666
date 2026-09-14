-- Every task mutation, including worker lease updates, invalidates stale review forms.
ALTER TABLE canvas_cloud.tasks ADD COLUMN review_version bigint NOT NULL DEFAULT 1;
CREATE FUNCTION canvas_cloud.bump_task_review_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.review_version := OLD.review_version + 1;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_review_version BEFORE UPDATE ON canvas_cloud.tasks
    FOR EACH ROW EXECUTE FUNCTION canvas_cloud.bump_task_review_version();

CREATE TABLE canvas_cloud.task_reviews (
    request_id uuid PRIMARY KEY,
    task_id text NOT NULL,
    workspace_id text NOT NULL,
    member_id text NOT NULL,
    session_id text NOT NULL,
    action text NOT NULL CHECK(action IN ('retry_finalization','resume_polling','cancel_unsubmitted','confirm_failed')),
    expected_version bigint NOT NULL,
    note text NOT NULL,
    upstream_verified boolean NOT NULL DEFAULT false,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(task_id,workspace_id) REFERENCES canvas_cloud.tasks(id,workspace_id),
    FOREIGN KEY(session_id,member_id) REFERENCES canvas_cloud.member_sessions(id,member_id)
);
CREATE INDEX task_reviews_space ON canvas_cloud.task_reviews(workspace_id,created_at);
