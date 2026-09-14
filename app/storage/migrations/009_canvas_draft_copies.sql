-- Keep receipts even when a canvas becomes a tombstone: retries never recreate it.
CREATE TABLE canvas_cloud.canvas_draft_copies (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    request_id uuid NOT NULL,
    document_sha256 text NOT NULL CHECK (length(document_sha256)=64),
    canvas_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(workspace_id,member_id,request_id),
    FOREIGN KEY(workspace_id,canvas_id) REFERENCES canvas_cloud.canvases(workspace_id,id)
);
