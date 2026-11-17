ALTER TABLE canvas_cloud.credit_wallets
    ADD COLUMN frozen_balance bigint NOT NULL DEFAULT 0 CHECK (frozen_balance >= 0),
    ADD CONSTRAINT credit_wallet_frozen_limit CHECK (frozen_balance <= recharge_balance::numeric + gift_balance);

ALTER TABLE canvas_cloud.credit_grants
    ADD COLUMN frozen_amount bigint NOT NULL DEFAULT 0 CHECK (frozen_amount >= 0),
    ADD CONSTRAINT credit_grant_frozen_limit CHECK (frozen_amount <= remaining_amount),
    ADD CONSTRAINT credit_grant_owner_category UNIQUE (id,member_id,category);

CREATE TABLE canvas_cloud.credit_holds (
    id text PRIMARY KEY,
    member_id text NOT NULL REFERENCES canvas_cloud.credit_wallets(member_id),
    workspace_id text REFERENCES canvas_cloud.workspaces(id),
    source_type text NOT NULL CHECK (source_type IN ('canvas_task','chat_call')),
    source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 240),
    model_code text,
    quote_version bigint NOT NULL CHECK (quote_version >= 0),
    quote_snapshot jsonb NOT NULL CHECK (jsonb_typeof(quote_snapshot)='object'),
    frozen_credits bigint NOT NULL CHECK (frozen_credits > 0),
    settled_credits bigint,
    released_credits bigint,
    status text NOT NULL DEFAULT 'FROZEN' CHECK (status IN ('FROZEN','SETTLED','RELEASED')),
    settlement_note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    settled_at timestamptz,
    UNIQUE (source_type,source_id),
    UNIQUE (id,member_id),
    CHECK (
        (status='FROZEN' AND settled_credits IS NULL AND released_credits IS NULL AND settled_at IS NULL)
        OR
        (status IN ('SETTLED','RELEASED') AND settled_credits IS NOT NULL AND released_credits IS NOT NULL
         AND settled_credits >= 0 AND released_credits >= 0
         AND settled_credits::numeric + released_credits = frozen_credits AND settled_at IS NOT NULL
         AND ((status='SETTLED' AND settled_credits > 0) OR (status='RELEASED' AND settled_credits=0)))
    )
);
CREATE INDEX credit_holds_member ON canvas_cloud.credit_holds(member_id,created_at DESC,id);

CREATE TABLE canvas_cloud.credit_hold_allocations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hold_id text NOT NULL,
    grant_id text NOT NULL,
    member_id text NOT NULL,
    category text NOT NULL CHECK (category IN ('gift','recharge')),
    frozen_amount bigint NOT NULL CHECK (frozen_amount > 0),
    settled_amount bigint NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
    released_amount bigint NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (hold_id,grant_id),
    FOREIGN KEY (hold_id,member_id) REFERENCES canvas_cloud.credit_holds(id,member_id),
    FOREIGN KEY (grant_id,member_id,category) REFERENCES canvas_cloud.credit_grants(id,member_id,category),
    CHECK (settled_amount::numeric + released_amount <= frozen_amount)
);

ALTER TABLE canvas_cloud.credit_transactions
    DROP CONSTRAINT credit_transactions_grant_id_key,
    DROP CONSTRAINT credit_transactions_type_check,
    DROP CONSTRAINT credit_transactions_check,
    ALTER COLUMN grant_id DROP NOT NULL,
    ADD COLUMN hold_id text UNIQUE REFERENCES canvas_cloud.credit_holds(id),
    ADD FOREIGN KEY (hold_id,member_id) REFERENCES canvas_cloud.credit_holds(id,member_id),
    ADD CHECK (type IN ('ADD','SPEND')),
    ADD CHECK ((type='ADD' AND grant_id IS NOT NULL AND hold_id IS NULL AND balance_after >= amount)
            OR (type='SPEND' AND grant_id IS NULL AND hold_id IS NOT NULL AND balance_after >= 0));
CREATE UNIQUE INDEX credit_transactions_add_grant ON canvas_cloud.credit_transactions(grant_id) WHERE type='ADD';
