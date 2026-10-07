-- New completed outputs only. Never infer or backfill historical authors.
ALTER TABLE canvas_cloud.tasks ADD CONSTRAINT tasks_attribution_identity
    UNIQUE (id,workspace_id,requested_by);
CREATE TABLE canvas_cloud.generation_outputs (
    task_id text NOT NULL,
    workspace_id text NOT NULL,
    member_id text NOT NULL,
    media_kind text NOT NULL CHECK (media_kind IN ('image','video')),
    output_index integer NOT NULL CHECK (output_index >= 0),
    asset_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id,output_index),
    FOREIGN KEY (task_id,workspace_id,member_id)
        REFERENCES canvas_cloud.tasks(id,workspace_id,requested_by),
    FOREIGN KEY (workspace_id,asset_id)
        REFERENCES canvas_cloud.assets(workspace_id,id)
);
CREATE INDEX generation_outputs_asset ON canvas_cloud.generation_outputs(workspace_id,asset_id);
CREATE INDEX generation_outputs_member ON canvas_cloud.generation_outputs(workspace_id,member_id,created_at DESC);
