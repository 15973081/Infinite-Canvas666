-- New chat uploads store server-assigned owner and sharing flags in assets.metadata.
-- Existing workspace media are deliberately not reclassified without ownership proof.
CREATE INDEX assets_chat_owner ON canvas_cloud.assets
    (workspace_id,(metadata->>'chat_owner'),created_at DESC,id DESC)
    WHERE role='chat-attachment' AND status<>'deleted';
