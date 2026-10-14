CREATE TABLE canvas_cloud.audio_voice_registrations (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    provider_id text NOT NULL REFERENCES canvas_cloud.managed_providers(id),
    account_ref text NOT NULL,
    voice_id text NOT NULL CHECK(length(voice_id) BETWEEN 1 AND 180),
    task_id text NOT NULL REFERENCES canvas_cloud.tasks(id),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
    language text NOT NULL CHECK(length(language) BETWEEN 1 AND 64),
    accent text NOT NULL DEFAULT '',
    gender text NOT NULL CHECK(gender IN ('MALE','FEMALE')),
    age text NOT NULL CHECK(age IN ('CHILD','YOUTH','ADULT','ELDER')),
    description text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(workspace_id,member_id,provider_id,account_ref,voice_id)
);
CREATE INDEX audio_voice_registrations_task ON canvas_cloud.audio_voice_registrations(workspace_id,member_id,task_id);
CREATE INDEX audio_voice_registrations_usage ON canvas_cloud.audio_voice_registrations(workspace_id,provider_id,account_ref,voice_id);
CREATE INDEX audio_voice_design_tasks_scope ON canvas_cloud.tasks
    (workspace_id,requested_by,provider_id,provider_account_ref,canvas_id,((request->'_canvas_binding'->>'source_node_id')),created_at DESC,id DESC)
    WHERE kind='audio' AND (request->>'mode')='design';
