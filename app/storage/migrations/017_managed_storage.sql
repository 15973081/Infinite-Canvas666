CREATE TABLE canvas_cloud.managed_storage (
    id integer PRIMARY KEY CHECK (id=1),
    config jsonb NOT NULL,
    secret_ciphertext text NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version>0),
    updated_by text NOT NULL REFERENCES canvas_cloud.members(id),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
