ALTER TABLE canvas_cloud.tenant_members ADD COLUMN admin_permissions jsonb NOT NULL DEFAULT '[]'
 CHECK (jsonb_typeof(admin_permissions)='array');
ALTER TABLE canvas_cloud.tenant_members ADD COLUMN version bigint NOT NULL DEFAULT 1;
UPDATE canvas_cloud.tenant_members SET admin_permissions='["invite_members","manage_members","edit_profile","create_spaces","archive_spaces","assign_spaces","manage_roles","assign_models","billing_read","audit_read","manage_rules"]'
 WHERE role='admin';
UPDATE canvas_cloud.tenants SET
 platform_rules=platform_rules || jsonb_build_object('assign_spaces',coalesce(platform_rules->'manage_members','true'::jsonb),'manage_roles',coalesce(platform_rules->'manage_members','true'::jsonb)),
 enterprise_rules=enterprise_rules || jsonb_build_object('assign_spaces',coalesce(enterprise_rules->'manage_members','true'::jsonb),'manage_roles',coalesce(enterprise_rules->'manage_members','true'::jsonb));
ALTER TABLE canvas_cloud.tenant_invitations ADD COLUMN admin_permissions jsonb NOT NULL DEFAULT '[]'
 CHECK (jsonb_typeof(admin_permissions)='array');
ALTER TABLE canvas_cloud.tenant_invitations ADD COLUMN space_assignments jsonb NOT NULL DEFAULT '[]'
 CHECK (jsonb_typeof(space_assignments)='array');
