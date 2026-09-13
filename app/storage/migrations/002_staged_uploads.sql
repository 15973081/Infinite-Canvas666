CREATE TABLE canvas_cloud.media_uploads (
    asset_id text PRIMARY KEY REFERENCES canvas_cloud.assets(id),
    idempotency_key text NOT NULL UNIQUE,
    request_sha256 text NOT NULL,
    backend text NOT NULL CHECK (backend IN ('filesystem', 'tos')),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    part_size integer NOT NULL CHECK (part_size > 0),
    part_count integer NOT NULL CHECK (part_count BETWEEN 1 AND 10000),
    upload_id text,
    status text NOT NULL CHECK (status IN ('initiating','uploading','verifying','ready','aborted')),
    lease_token uuid,
    lease_until timestamptz,
    expires_at timestamptz NOT NULL,
    cleaned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_uploads_cleanup ON canvas_cloud.media_uploads(expires_at)
    WHERE cleaned_at IS NULL;
CREATE TABLE canvas_cloud.media_upload_parts (
    asset_id text NOT NULL REFERENCES canvas_cloud.media_uploads(asset_id),
    part_number integer NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    object_version_id text,
    etag text,
    PRIMARY KEY (asset_id, part_number)
);
