ALTER TABLE canvas_cloud.tasks ADD COLUMN requester_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE canvas_cloud.tasks t SET requester_snapshot=jsonb_build_object('username',m.username,'display_name',m.display_name)
FROM canvas_cloud.members m WHERE t.requested_by=m.id;
CREATE TABLE canvas_cloud.ledger_owners (
 entry_id text PRIMARY KEY REFERENCES canvas_cloud.ledger_entries(id),
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 task_id text NOT NULL REFERENCES canvas_cloud.tasks(id),
 member_id text REFERENCES canvas_cloud.members(id),
 username text NOT NULL DEFAULT '', display_name text NOT NULL DEFAULT '',
 attribution text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,task_id)
);
CREATE INDEX ledger_owners_member ON canvas_cloud.ledger_owners(member_id,workspace_id,entry_id);
CREATE INDEX ledger_workspace_time ON canvas_cloud.ledger_entries(workspace_id,created_at DESC,id DESC);
-- Only server task records with an unambiguous, same-space, same-canvas task match.
WITH candidates AS (
 SELECT e.id,e.workspace_id,t.id AS task_id,t.requested_by,t.requester_snapshot,
 count(*) OVER(PARTITION BY e.id) AS entry_matches, count(*) OVER(PARTITION BY t.id) AS task_matches
 FROM canvas_cloud.ledger_entries e JOIN canvas_cloud.tasks t ON t.workspace_id=e.workspace_id
 AND t.id=e.log_json->>'canvas_task_id'
 AND coalesce(t.canvas_id,nullif(t.legacy_metadata->>'canvas_id',''),'__account_tasks__')=e.canvas_id
 WHERE e.source='task'
) INSERT INTO canvas_cloud.ledger_owners(entry_id,workspace_id,task_id,member_id,username,display_name,attribution)
SELECT id,workspace_id,task_id,requested_by,coalesce(requester_snapshot->>'username',''),coalesce(requester_snapshot->>'display_name',''),'historical_task'
FROM candidates WHERE entry_matches=1 AND task_matches=1;
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'billing.platform','platform','查看平台账号费用' WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'billing.read','workspace','查看本空间账号费用' WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'billing.platform','platform' FROM canvas_cloud.roles WHERE builtin_key='superadmin';
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'billing.read','workspace' FROM canvas_cloud.roles WHERE builtin_key='admin';
