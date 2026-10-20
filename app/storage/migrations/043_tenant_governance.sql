ALTER TABLE canvas_cloud.tenants ADD COLUMN platform_rules jsonb NOT NULL DEFAULT '{}';
ALTER TABLE canvas_cloud.tenants ADD COLUMN enterprise_rules jsonb NOT NULL DEFAULT '{}';
ALTER TABLE canvas_cloud.tenants ADD COLUMN rules_version bigint NOT NULL DEFAULT 0;
