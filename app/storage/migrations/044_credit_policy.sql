-- Credit sales rules are independent of supplier CNY costs and wallet grants.
CREATE TABLE canvas_cloud.credit_policy (
    id integer PRIMARY KEY CHECK (id=1),
    config jsonb NOT NULL CHECK (jsonb_typeof(config)='object'),
    version bigint NOT NULL DEFAULT 1 CHECK (version>0),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO canvas_cloud.permissions(id,scope,description)
SELECT 'credits.configure.platform','platform','配置平台积分规则'
WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
SELECT id,'credits.configure.platform','platform' FROM canvas_cloud.roles WHERE builtin_key='superadmin';
