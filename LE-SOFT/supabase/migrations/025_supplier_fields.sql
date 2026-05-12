-- ============================================================
-- Migration 025: Supplier fields on ledgers
-- Extends the existing ledger-based supplier model used by PC software.
-- ============================================================

ALTER TABLE ledgers
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'OPEN';

CREATE INDEX IF NOT EXISTS idx_ledgers_payment_status ON ledgers(payment_status);
CREATE INDEX IF NOT EXISTS idx_ledgers_contact_number ON ledgers(contact_number);
