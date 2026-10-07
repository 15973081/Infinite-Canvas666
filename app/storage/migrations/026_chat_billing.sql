-- Keep existing task ownership and amounts intact; add independent chat calls.
CREATE TABLE canvas_cloud.ai_chat_calls (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text REFERENCES canvas_cloud.members(id),
    conversation_id text NOT NULL,
    provider_id text NOT NULL,
    model text NOT NULL,
    started_at bigint NOT NULL,
    completed_at bigint,
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','rejected','uncertain')),
    price_snapshot jsonb NOT NULL,
    raw_usage jsonb,
    entry_id text NOT NULL UNIQUE REFERENCES canvas_cloud.ledger_entries(id)
);
CREATE INDEX ai_chat_calls_workspace_time ON canvas_cloud.ai_chat_calls(workspace_id,started_at DESC,id);
ALTER TABLE canvas_cloud.ledger_owners ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE canvas_cloud.ledger_owners ADD COLUMN chat_call_id text UNIQUE REFERENCES canvas_cloud.ai_chat_calls(id);
ALTER TABLE canvas_cloud.ledger_owners ADD CONSTRAINT ledger_owner_source CHECK(num_nonnulls(task_id,chat_call_id)=1);
