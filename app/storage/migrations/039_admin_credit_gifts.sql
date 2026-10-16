-- Administrator attestations, not payment confirmations. No automatic rewards.
CREATE TABLE canvas_cloud.admin_credit_gifts (
    request_id uuid PRIMARY KEY,
    actor_id text NOT NULL REFERENCES canvas_cloud.members(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    grant_id text NOT NULL UNIQUE,
    input jsonb NOT NULL,
    actor_snapshot jsonb NOT NULL,
    target_snapshot jsonb NOT NULL,
    preview_token text NOT NULL CHECK (length(preview_token)=64),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (grant_id,member_id) REFERENCES canvas_cloud.credit_grants(id,member_id)
);
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'credits.gift.platform','platform','赠送并查看平台赠送积分'
WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'credits.gift.platform','platform' FROM canvas_cloud.roles WHERE builtin_key='superadmin';
