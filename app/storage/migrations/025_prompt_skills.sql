-- Explicitly shared prompt packages. No tools, platform actions or script runtime.
CREATE TABLE canvas_cloud.prompt_skills (
    id text PRIMARY KEY,
    origin_workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    uploader_id text REFERENCES canvas_cloud.members(id),
    uploader_name text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    visibility text NOT NULL CHECK (visibility IN ('workspace','shared')),
    current_version_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE INDEX prompt_skills_catalog ON canvas_cloud.prompt_skills(visibility,updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE canvas_cloud.prompt_skill_versions (
    id text PRIMARY KEY,
    skill_id text NOT NULL REFERENCES canvas_cloud.prompt_skills(id),
    sha256 text NOT NULL,
    content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'),
    source_bytes bytea NOT NULL,
    filename text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(skill_id,id),
    UNIQUE(skill_id,sha256)
);
ALTER TABLE canvas_cloud.prompt_skills ADD CONSTRAINT prompt_skill_current_version
    FOREIGN KEY(id,current_version_id) REFERENCES canvas_cloud.prompt_skill_versions(skill_id,id)
    DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE canvas_cloud.workspace_skill_installs (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    skill_id text NOT NULL REFERENCES canvas_cloud.prompt_skills(id),
    version_id text NOT NULL,
    installed_by text REFERENCES canvas_cloud.members(id),
    installed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(workspace_id,skill_id),
    FOREIGN KEY(skill_id,version_id) REFERENCES canvas_cloud.prompt_skill_versions(skill_id,id)
);
CREATE TABLE canvas_cloud.member_skill_preferences (
    workspace_id text NOT NULL,
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    skill_id text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    PRIMARY KEY(workspace_id,member_id,skill_id),
    FOREIGN KEY(workspace_id,skill_id) REFERENCES canvas_cloud.workspace_skill_installs(workspace_id,skill_id) ON DELETE CASCADE
);
