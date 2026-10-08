ALTER TABLE canvas_cloud.members DROP CONSTRAINT members_status_check;
ALTER TABLE canvas_cloud.members ADD CONSTRAINT members_status_check CHECK(status IN ('invited','active','disabled','closed'));
ALTER TABLE canvas_cloud.members ADD COLUMN closed_at timestamptz;
CREATE TABLE canvas_cloud.account_closures (
    member_id text PRIMARY KEY REFERENCES canvas_cloud.members(id),
    completed_at timestamptz NOT NULL DEFAULT now()
);
