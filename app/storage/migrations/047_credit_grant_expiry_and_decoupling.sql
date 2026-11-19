ALTER TABLE canvas_cloud.credit_grants
    ADD COLUMN expires_at timestamptz,
    DROP CONSTRAINT credit_grants_validity_check,
    DROP CONSTRAINT credit_grants_check1,
    ADD CONSTRAINT credit_grants_validity_check CHECK (validity IN ('PERMANENT','FIXED_EXPIRY')),
    ADD CONSTRAINT credit_grants_expiry_check CHECK (
        (validity='PERMANENT' AND expires_at IS NULL) OR
        (validity='FIXED_EXPIRY' AND expires_at IS NOT NULL)),
    ADD CONSTRAINT credit_grants_source_category_check CHECK (
        (source='RECHARGE' AND category='recharge') OR
        (source='RECHARGE_GIFT' AND category='gift') OR source='PLATFORM_GIFT');

ALTER TABLE canvas_cloud.credit_transactions
    DROP CONSTRAINT credit_transactions_type_check,
    DROP CONSTRAINT credit_transactions_check,
    ADD CONSTRAINT credit_transactions_type_check CHECK (type IN ('ADD','SPEND','EXPIRE')),
    ADD CONSTRAINT credit_transactions_check CHECK (
        (type='ADD' AND grant_id IS NOT NULL AND hold_id IS NULL AND balance_after >= amount) OR
        (type='SPEND' AND grant_id IS NULL AND hold_id IS NOT NULL AND balance_after >= 0) OR
        (type='EXPIRE' AND grant_id IS NOT NULL AND hold_id IS NULL AND balance_after >= 0));

CREATE INDEX credit_grants_member_expiry ON canvas_cloud.credit_grants(member_id,expires_at)
    WHERE expires_at IS NOT NULL AND remaining_amount>frozen_amount;
