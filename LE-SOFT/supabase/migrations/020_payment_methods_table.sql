-- ============================================================
-- 020: Create payment_methods table
-- Stores configurable payment methods shown during billing
-- and on the Settings > Payment Methods page.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'Cash',   -- Cash, bKash, Nagad, Card, Bank, etc.
    type        TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'automated'
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with sensible defaults if the table is empty
INSERT INTO payment_methods (name, provider, type)
SELECT * FROM (VALUES
    ('Cash',  'Cash',  'manual'),
    ('bKash', 'bKash', 'automated'),
    ('Nagad', 'Nagad', 'automated'),
    ('Card',  'Card',  'manual'),
    ('Bank Transfer', 'Bank', 'manual')
) AS v(name, provider, type)
WHERE NOT EXISTS (SELECT 1 FROM payment_methods LIMIT 1);

-- RLS: only authenticated users can read; only admins can modify
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "All authenticated can read payment_methods"
    ON payment_methods FOR SELECT
    USING (auth.role() = 'authenticated');

-- Allow service role to fully manage (desktop app uses service role key)
CREATE POLICY "Service role can manage payment_methods"
    ON payment_methods FOR ALL
    USING ( auth.role() = 'service_role' )
    WITH CHECK ( auth.role() = 'service_role' );
