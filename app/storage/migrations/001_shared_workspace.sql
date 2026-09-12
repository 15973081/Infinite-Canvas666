CREATE TABLE canvas_cloud.workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO canvas_cloud.workspaces (id, name) VALUES ('default', '共享工作区');

CREATE TABLE canvas_cloud.canvases (
    id text PRIMARY KEY,
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    title text NOT NULL DEFAULT '未命名画布',
    kind text NOT NULL DEFAULT 'classic' CHECK (kind IN ('classic', 'smart')),
    document jsonb NOT NULL DEFAULT '{"nodes":[],"connections":[],"viewport":{"x":0,"y":0,"scale":1}}',
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (workspace_id, id),
    CHECK (jsonb_typeof(document) = 'object'),
    CHECK (document ? 'nodes' AND jsonb_typeof(document->'nodes') = 'array'),
    CHECK (document ? 'connections' AND jsonb_typeof(document->'connections') = 'array')
);
CREATE INDEX canvases_list ON canvas_cloud.canvases (workspace_id, updated_at DESC, id)
    WHERE deleted_at IS NULL;

-- One row represents one immutable physical file, including derived previews.
-- Library entry IDs and supplier registration IDs stay in their respective JSON metadata.
CREATE TABLE canvas_cloud.assets (
    id text PRIMARY KEY,
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    parent_asset_id text,
    role text NOT NULL DEFAULT 'original',
    kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'workflow', 'file')),
    status text NOT NULL DEFAULT 'uploading'
        CHECK (status IN ('uploading', 'verifying', 'ready', 'failed', 'deleting', 'deleted')),
    display_name text NOT NULL DEFAULT '',
    bucket text NOT NULL,
    region text NOT NULL,
    object_key text NOT NULL,
    object_version_id text,
    staging_key text,
    staging_version_id text,
    upload_expires_at timestamptz,
    size_bytes bigint CHECK (size_bytes >= 0),
    sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    content_type text,
    width integer CHECK (width > 0),
    height integer CHECK (height > 0),
    duration_ms bigint CHECK (duration_ms >= 0),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (workspace_id, id),
    UNIQUE (bucket, object_key),
    UNIQUE (bucket, staging_key),
    FOREIGN KEY (workspace_id, parent_asset_id)
        REFERENCES canvas_cloud.assets(workspace_id, id),
    CHECK (parent_asset_id IS NULL OR parent_asset_id <> id),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (status <> 'ready' OR
        (size_bytes IS NOT NULL AND sha256 IS NOT NULL AND content_type IS NOT NULL
         AND object_version_id IS NOT NULL))
);
CREATE INDEX assets_list ON canvas_cloud.assets (workspace_id, created_at DESC, id)
    WHERE deleted_at IS NULL;
CREATE INDEX assets_parent ON canvas_cloud.assets (workspace_id, parent_asset_id);
CREATE INDEX assets_reconcile ON canvas_cloud.assets (status, updated_at)
    WHERE status IN ('uploading', 'verifying', 'deleting');

-- Alias keys are canonical complete relative URLs, NOT basenames.
-- Source namespace distinguishes different migration sources.
CREATE TABLE canvas_cloud.asset_aliases (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    source_namespace text NOT NULL,
    legacy_ref text NOT NULL,
    asset_id text NOT NULL,
    source_sha256 text CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, source_namespace, legacy_ref),
    FOREIGN KEY (workspace_id, asset_id) REFERENCES canvas_cloud.assets(workspace_id, id)
);
CREATE INDEX asset_aliases_target ON canvas_cloud.asset_aliases (workspace_id, asset_id);

-- Derived reference index; never the only evidence for physical deletion.
CREATE TABLE canvas_cloud.canvas_assets (
    workspace_id text NOT NULL,
    canvas_id text NOT NULL,
    asset_id text NOT NULL,
    PRIMARY KEY (workspace_id, canvas_id, asset_id),
    FOREIGN KEY (workspace_id, canvas_id) REFERENCES canvas_cloud.canvases(workspace_id, id),
    FOREIGN KEY (workspace_id, asset_id) REFERENCES canvas_cloud.assets(workspace_id, id)
);
CREATE INDEX canvas_assets_reverse ON canvas_cloud.canvas_assets (workspace_id, asset_id);

CREATE TABLE canvas_cloud.tasks (
    id text PRIMARY KEY,
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'submitting', 'polling', 'finalizing',
                          'succeeded', 'failed', 'cancelled', 'needs_review')),
    provider_id text,
    provider_account_ref text,
    model text,
    upstream_task_id text,
    request jsonb NOT NULL DEFAULT '{}',
    result jsonb,
    legacy_metadata jsonb NOT NULL DEFAULT '{}',
    input_asset_ids jsonb NOT NULL DEFAULT '[]',
    output_asset_ids jsonb NOT NULL DEFAULT '[]',
    idempotency_key text NOT NULL,
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_owner text,
    lease_token uuid,
    lease_until timestamptz,
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (workspace_id, idempotency_key),
    FOREIGN KEY (workspace_id, canvas_id) REFERENCES canvas_cloud.canvases(workspace_id, id),
    CHECK (jsonb_typeof(request) = 'object'),
    CHECK (jsonb_typeof(legacy_metadata) = 'object'),
    CHECK (jsonb_typeof(input_asset_ids) = 'array'),
    CHECK (jsonb_typeof(output_asset_ids) = 'array'),
    CHECK (
        (lease_owner IS NULL AND lease_token IS NULL AND lease_until IS NULL)
        OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    )
);
CREATE INDEX tasks_claim ON canvas_cloud.tasks (available_at, created_at, id)
    WHERE status IN ('queued', 'polling', 'finalizing');
CREATE INDEX tasks_expired ON canvas_cloud.tasks (lease_until)
    WHERE lease_until IS NOT NULL;
CREATE INDEX tasks_canvas ON canvas_cloud.tasks (workspace_id, canvas_id, created_at DESC);
CREATE INDEX tasks_upstream ON canvas_cloud.tasks
    (provider_id, provider_account_ref, upstream_task_id)
    WHERE upstream_task_id IS NOT NULL;

-- Transitional store for folders, prompt libraries, asset catalogs, conversations,
-- provider definitions (WITHOUT secrets), and other existing JSON documents.
-- Split large histories by record/page; do not create a single unlimited JSON row.
CREATE TABLE canvas_cloud.workspace_documents (
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    kind text NOT NULL,
    id text NOT NULL,
    value jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, kind, id)
);

-- Compatibility tables for the EXISTING fee ledger.
-- Preserve amount_micros and millisecond timestamps exactly; do not recalculate
-- historical prices, collapse conflicts, or discard alias/import/version records.
-- Historical canvas IDs intentionally have no FK to live canvases.
CREATE TABLE canvas_cloud.ledger_entries (
    id text PRIMARY KEY,
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text NOT NULL,
    created_at bigint NOT NULL,
    log_json jsonb NOT NULL,
    cost_json jsonb NOT NULL,
    source text NOT NULL,
    cost_status text NOT NULL,
    amount_micros bigint NOT NULL DEFAULT 0,
    currency text NOT NULL,
    kind text NOT NULL,
    estimated integer NOT NULL DEFAULT 0 CHECK (estimated IN (0, 1)),
    status text NOT NULL,
    updated_at bigint NOT NULL
);
CREATE INDEX ledger_canvas_time ON canvas_cloud.ledger_entries
    (workspace_id, canvas_id, created_at DESC, id DESC);
CREATE TABLE canvas_cloud.ledger_aliases (
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text NOT NULL,
    alias text NOT NULL,
    entry_id text NOT NULL,
    PRIMARY KEY (workspace_id, canvas_id, alias)
);
CREATE TABLE canvas_cloud.ledger_conflicts (
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text NOT NULL,
    entry_id text NOT NULL,
    fingerprint text NOT NULL,
    source text NOT NULL,
    incoming_json jsonb NOT NULL,
    reason text NOT NULL,
    created_at bigint NOT NULL,
    PRIMARY KEY (workspace_id, canvas_id, entry_id, fingerprint)
);
CREATE TABLE canvas_cloud.ledger_imports (
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text NOT NULL,
    source text NOT NULL,
    fingerprint text NOT NULL,
    report_json jsonb NOT NULL,
    PRIMARY KEY (workspace_id, canvas_id, source)
);
CREATE TABLE canvas_cloud.ledger_versions (
    workspace_id text NOT NULL DEFAULT 'default' REFERENCES canvas_cloud.workspaces(id),
    canvas_id text NOT NULL,
    revision bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, canvas_id)
);

-- No automatic file deletion, scheduled cleanup, account provisioning, or grants.
-- Application transactions must maintain updated_at, revisions, reference indexes
-- and state transitions. This DDL alone does not enforce those workflows.
