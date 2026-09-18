-- Rebuildable listing projection; original group membership remains authoritative.
ALTER TABLE canvas_cloud.canvas_asset_groups ADD COLUMN asset_indexed boolean NOT NULL DEFAULT false;
CREATE TABLE canvas_cloud.canvas_asset_items (
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    item_id text NOT NULL,
    asset_key text NOT NULL,
    legacy_ref text NOT NULL DEFAULT '',
    document jsonb NOT NULL,
    PRIMARY KEY (workspace_id, canvas_id, item_id),
    FOREIGN KEY (workspace_id, canvas_id) REFERENCES canvas_cloud.canvas_asset_groups(workspace_id, canvas_id) ON DELETE CASCADE
);
CREATE INDEX canvas_asset_items_key ON canvas_cloud.canvas_asset_items(workspace_id, asset_key);
-- Older writers/restore tools can still update groups. Never serve a stale projection.
CREATE FUNCTION canvas_cloud.invalidate_canvas_asset_index() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.items IS DISTINCT FROM OLD.items OR NEW.document->'nodes' IS DISTINCT FROM OLD.document->'nodes' THEN
        NEW.asset_indexed := false;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER canvas_asset_index_invalidated BEFORE UPDATE OF items,document
    ON canvas_cloud.canvas_asset_groups FOR EACH ROW EXECUTE FUNCTION canvas_cloud.invalidate_canvas_asset_index();
