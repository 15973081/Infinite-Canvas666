ALTER TABLE canvas_cloud.credit_transactions
    DROP CONSTRAINT credit_transactions_type_check,
    DROP CONSTRAINT credit_transactions_check,
    ADD CONSTRAINT credit_transactions_type_check CHECK (type IN ('ADD','SPEND','EXPIRE','DEDUCT')),
    ADD CONSTRAINT credit_transactions_check CHECK (
        (type='ADD' AND grant_id IS NOT NULL AND hold_id IS NULL AND balance_after >= amount) OR
        (type='SPEND' AND grant_id IS NULL AND hold_id IS NOT NULL AND balance_after >= 0) OR
        (type IN ('EXPIRE','DEDUCT') AND grant_id IS NOT NULL AND hold_id IS NULL AND balance_after >= 0));

CREATE TABLE canvas_cloud.admin_credit_deductions (
    request_id uuid PRIMARY KEY,
    actor_id text NOT NULL REFERENCES canvas_cloud.members(id),
    member_id text NOT NULL REFERENCES canvas_cloud.members(id),
    transaction_id bigint NOT NULL UNIQUE REFERENCES canvas_cloud.credit_transactions(id),
    input jsonb NOT NULL,
    actor_snapshot jsonb NOT NULL,
    target_snapshot jsonb NOT NULL,
    allocations jsonb NOT NULL,
    preview_token text NOT NULL CHECK (length(preview_token)=64),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

UPDATE canvas_cloud.permissions SET description='发放、扣减平台积分并查看相关记录'
    WHERE id='credits.gift.platform';
