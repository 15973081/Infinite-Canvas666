-- Enterprises are immutable parents of spaces. Existing resources stay in the default enterprise.
CREATE TABLE canvas_cloud.tenants (
 id text PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO canvas_cloud.tenants(id,name) VALUES('default','默认企业');
ALTER TABLE canvas_cloud.workspaces ADD COLUMN tenant_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.tenants(id);
CREATE INDEX workspaces_tenant ON canvas_cloud.workspaces(tenant_id);
CREATE TABLE canvas_cloud.tenant_members (
 tenant_id text NOT NULL REFERENCES canvas_cloud.tenants(id), member_id text NOT NULL REFERENCES canvas_cloud.members(id),
 role text NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,member_id)
);
INSERT INTO canvas_cloud.tenant_members(tenant_id,member_id) SELECT DISTINCT 'default',member_id FROM canvas_cloud.workspace_members;
INSERT INTO canvas_cloud.permissions SELECT 'tenant.manage','platform','管理企业租户' WHERE EXISTS(SELECT 1 FROM canvas_cloud.members);
INSERT INTO canvas_cloud.role_permissions(role_id,permission_id,scope)
 SELECT id,'tenant.manage','platform' FROM canvas_cloud.roles WHERE builtin_key='superadmin';
-- Preserve old default-space provisioning; new enterprises require explicit membership.
CREATE FUNCTION canvas_cloud.guard_tenant_workspace_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text;
BEGIN
 SELECT tenant_id INTO tid FROM canvas_cloud.workspaces WHERE id=NEW.workspace_id;
 IF tid='default' THEN
  INSERT INTO canvas_cloud.tenant_members(tenant_id,member_id) VALUES(tid,NEW.member_id) ON CONFLICT DO NOTHING;
 ELSIF NOT EXISTS(SELECT 1 FROM canvas_cloud.tenant_members WHERE tenant_id=tid AND member_id=NEW.member_id) THEN
  RAISE EXCEPTION 'tenant membership required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_member_tenant BEFORE INSERT OR UPDATE ON canvas_cloud.workspace_members
 FOR EACH ROW EXECUTE FUNCTION canvas_cloud.guard_tenant_workspace_member();
CREATE FUNCTION canvas_cloud.immutable_workspace_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id<>OLD.tenant_id THEN RAISE EXCEPTION 'workspace tenant cannot change' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_tenant_immutable BEFORE UPDATE OF tenant_id ON canvas_cloud.workspaces
 FOR EACH ROW EXECUTE FUNCTION canvas_cloud.immutable_workspace_tenant();
ALTER TABLE canvas_cloud.members ADD COLUMN email text;
ALTER TABLE canvas_cloud.members ADD COLUMN email_verified_at timestamptz;
ALTER TABLE canvas_cloud.members ADD CONSTRAINT verified_email_pair CHECK((email IS NULL)=(email_verified_at IS NULL));
CREATE UNIQUE INDEX members_verified_email ON canvas_cloud.members(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE canvas_cloud.email_challenges (
 id text PRIMARY KEY, member_id text NOT NULL REFERENCES canvas_cloud.members(id), email text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('bind','reset')), code_hash text NOT NULL, auth_version bigint NOT NULL,
 attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX email_challenges_member ON canvas_cloud.email_challenges(member_id,created_at DESC);
CREATE TABLE canvas_cloud.tenant_invitations (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES canvas_cloud.tenants(id), email text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','member')), token_hash text NOT NULL UNIQUE,
 actor_id text NOT NULL REFERENCES canvas_cloud.members(id), expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE canvas_cloud.tenant_models (
 tenant_id text NOT NULL REFERENCES canvas_cloud.tenants(id), provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
 kind text NOT NULL CHECK(kind IN ('image','video','chat','audio','model')), model text NOT NULL,
 PRIMARY KEY(tenant_id,provider_id,kind,model)
);
CREATE TABLE canvas_cloud.tenant_space_models (
 workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),tenant_id text NOT NULL,
 provider_id text NOT NULL,kind text NOT NULL,model text NOT NULL,
 PRIMARY KEY(workspace_id,provider_id,kind,model),
 FOREIGN KEY(tenant_id,provider_id,kind,model) REFERENCES canvas_cloud.tenant_models(tenant_id,provider_id,kind,model) ON DELETE CASCADE
);
ALTER TABLE canvas_cloud.workspaces ADD CONSTRAINT workspace_tenant_pair UNIQUE(id,tenant_id);
ALTER TABLE canvas_cloud.tenant_space_models ADD CONSTRAINT space_model_tenant
 FOREIGN KEY(workspace_id,tenant_id) REFERENCES canvas_cloud.workspaces(id,tenant_id);
