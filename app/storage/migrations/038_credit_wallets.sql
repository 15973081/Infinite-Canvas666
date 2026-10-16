-- Independent from provider-cost ledgers. No conversion or automatic rewards.
CREATE TABLE canvas_cloud.credit_wallets (
    member_id text PRIMARY KEY REFERENCES canvas_cloud.members(id),
    recharge_balance bigint NOT NULL DEFAULT 0 CHECK (recharge_balance >= 0),
    gift_balance bigint NOT NULL DEFAULT 0 CHECK (gift_balance >= 0),
    CHECK (recharge_balance::numeric + gift_balance::numeric <= 9223372036854775807)
);
CREATE TABLE canvas_cloud.credit_grants (
    id text PRIMARY KEY,
    member_id text NOT NULL REFERENCES canvas_cloud.credit_wallets(member_id),
    reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 160),
    category text NOT NULL CHECK (category IN ('recharge','gift')),
    source text NOT NULL CHECK (source IN ('RECHARGE','RECHARGE_GIFT','PLATFORM_GIFT')),
    amount bigint NOT NULL CHECK (amount > 0),
    remaining_amount bigint NOT NULL CHECK (remaining_amount BETWEEN 0 AND amount),
    validity text NOT NULL CHECK (validity = 'PERMANENT'),
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (member_id,reference),
    UNIQUE (id,member_id),
    CHECK ((source='RECHARGE' AND category='recharge') OR (source<>'RECHARGE' AND category='gift'))
);
CREATE TABLE canvas_cloud.credit_transactions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id text NOT NULL REFERENCES canvas_cloud.credit_wallets(member_id),
    grant_id text NOT NULL UNIQUE,
    type text NOT NULL CHECK (type='ADD'),
    amount bigint NOT NULL CHECK (amount > 0),
    balance_after bigint NOT NULL CHECK (balance_after >= amount),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (grant_id,member_id) REFERENCES canvas_cloud.credit_grants(id,member_id)
);
CREATE INDEX credit_transactions_member_page ON canvas_cloud.credit_transactions(member_id,id DESC);
CREATE INDEX credit_grants_member_category ON canvas_cloud.credit_grants(member_id,category);
