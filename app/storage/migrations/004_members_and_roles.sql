-- Identity foundation. No implicit conversion of shared credentials or grants.
ALTER TABLE canvas_cloud.workspaces ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived'));
ALTER TABLE canvas_cloud.workspaces ADD COLUMN description text NOT NULL DEFAULT '';

CREATE TABLE canvas_cloud.members (
    id text PRIMARY KEY,
    username text NOT NULL CHECK (length(username) BETWEEN 1 AND 64),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    avatar text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
    password_salt text,
    password_digest text,
    auth_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((password_salt IS NULL) = (password_digest IS NULL)),
    CHECK (status <> 'active' OR password_digest IS NOT NULL)
);
CREATE UNIQUE INDEX member_username ON canvas_cloud.members (lower(username));

CREATE TABLE canvas_cloud.member_sessions (
    id text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    audience text NOT NULL CHECK (audience IN ('workbench', 'management')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX member_sessions_member ON canvas_cloud.member_sessions(member_id);
CREATE TABLE canvas_cloud.member_activations (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
);
CREATE TABLE canvas_cloud.member_login_attempts (
    key text PRIMARY KEY,
    count integer NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE TABLE canvas_cloud.workspace_members (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, member_id)
);
CREATE TABLE canvas_cloud.permissions (
    id text PRIMARY KEY,
    scope text NOT NULL CHECK (scope IN ('platform', 'workspace')),
    description text NOT NULL,
    UNIQUE (id, scope)
);
CREATE TABLE canvas_cloud.roles (
    id text PRIMARY KEY,
    scope text NOT NULL CHECK (scope IN ('platform', 'workspace')),
    workspace_id text REFERENCES canvas_cloud.workspaces(id),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    builtin_key text,
    active boolean NOT NULL DEFAULT true,
    version bigint NOT NULL DEFAULT 1,
    CHECK ((scope = 'platform' AND workspace_id IS NULL)
        OR (scope = 'workspace' AND workspace_id IS NOT NULL)),
    UNIQUE (id, scope),
    UNIQUE (id, workspace_id)
);
CREATE UNIQUE INDEX roles_name ON canvas_cloud.roles (coalesce(workspace_id, ''), lower(name));
CREATE UNIQUE INDEX roles_builtin ON canvas_cloud.roles (coalesce(workspace_id, ''), builtin_key);
CREATE TABLE canvas_cloud.role_permissions (
    role_id text NOT NULL,
    permission_id text NOT NULL,
    scope text NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id, scope) REFERENCES canvas_cloud.roles(id, scope),
    FOREIGN KEY (permission_id, scope) REFERENCES canvas_cloud.permissions(id, scope)
);
CREATE TABLE canvas_cloud.platform_member_roles (
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    role_id text NOT NULL,
    role_scope text NOT NULL DEFAULT 'platform' CHECK (role_scope = 'platform'),
    PRIMARY KEY (member_id, role_id),
    FOREIGN KEY (role_id, role_scope) REFERENCES canvas_cloud.roles(id, scope)
);
CREATE TABLE canvas_cloud.workspace_member_roles (
    workspace_id text NOT NULL,
    member_id text NOT NULL,
    role_id text NOT NULL,
    PRIMARY KEY (workspace_id, member_id, role_id),
    FOREIGN KEY (workspace_id, member_id)
        REFERENCES canvas_cloud.workspace_members(workspace_id, member_id),
    FOREIGN KEY (role_id, workspace_id) REFERENCES canvas_cloud.roles(id, workspace_id)
);
CREATE TABLE canvas_cloud.management_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id text REFERENCES canvas_cloud.members(id),
    action text NOT NULL,
    workspace_id text REFERENCES canvas_cloud.workspaces(id),
    target_id text,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX management_events_scope ON canvas_cloud.management_events(workspace_id, id DESC);
