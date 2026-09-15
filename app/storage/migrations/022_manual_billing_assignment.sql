CREATE TABLE canvas_cloud.ledger_account_assignments (
 entry_id text PRIMARY KEY REFERENCES canvas_cloud.ledger_entries(id),
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 member_id text NOT NULL REFERENCES canvas_cloud.members(id),
 actor_id text NOT NULL REFERENCES canvas_cloud.members(id),
 reason text NOT NULL, version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_assignment_member ON canvas_cloud.ledger_account_assignments(member_id,workspace_id);
CREATE TABLE canvas_cloud.ledger_assignment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entry_id text NOT NULL REFERENCES canvas_cloud.ledger_entries(id),
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
 previous_member_id text REFERENCES canvas_cloud.members(id),
 member_id text NOT NULL REFERENCES canvas_cloud.members(id),
 actor_id text NOT NULL REFERENCES canvas_cloud.members(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'billing.assign.platform','platform','调整平台费用归属' WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'billing.assign','workspace','调整本空间费用归属' WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'billing.assign.platform','platform' FROM canvas_cloud.roles WHERE builtin_key='superadmin';
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'billing.assign','workspace' FROM canvas_cloud.roles WHERE builtin_key='admin';
