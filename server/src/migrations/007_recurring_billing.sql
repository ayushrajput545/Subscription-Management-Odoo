ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS next_billing_date DATE,
    ADD COLUMN IF NOT EXISTS last_billed_period_start DATE,
    ADD COLUMN IF NOT EXISTS last_billed_period_end DATE;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS billing_period_start DATE,
    ADD COLUMN IF NOT EXISTS billing_period_end DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'invoices'::regclass
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS key(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
          ) = ARRAY['billing_period_end', 'billing_period_start', 'subscription_id']::name[]
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM invoices
            GROUP BY subscription_id, billing_period_start, billing_period_end
            HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION 'Duplicate subscription billing periods exist; resolve them before recurring billing migration';
        END IF;

        ALTER TABLE invoices
            ADD CONSTRAINT invoices_subscription_billing_period_unique
            UNIQUE (subscription_id, billing_period_start, billing_period_end);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_due_billing
    ON subscriptions (next_billing_date, id)
    WHERE status = 'ACTIVE' AND next_billing_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_expiry
    ON subscriptions (expiry_date)
    WHERE status = 'ACTIVE';
