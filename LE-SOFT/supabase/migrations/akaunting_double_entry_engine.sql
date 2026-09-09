-- Akaunting Inspired Double-Entry Balanced Journal Engine Schema

-- 1. Journal Entries (Master Journal Transaction Record)
CREATE TABLE IF NOT EXISTS journal_entries (
    id BIGSERIAL PRIMARY KEY,
    entry_number VARCHAR(100) NOT NULL UNIQUE,
    posting_date TIMESTAMPTZ DEFAULT NOW(),
    reference_no VARCHAR(100),
    voucher_type VARCHAR(50) NOT NULL, -- 'Sales Invoice', 'Purchase Bill', 'Payment', 'Receipt', 'Journal'
    status VARCHAR(30) DEFAULT 'posted', -- 'draft', 'posted', 'cancelled'
    total_debit NUMERIC(15, 2) NOT NULL,
    total_credit NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BDT',
    notes TEXT,
    created_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_balanced_entry CHECK (total_debit = total_credit)
);

-- 2. Journal Items (Debit & Credit Line Breakdown per Ledger Account)
CREATE TABLE IF NOT EXISTS journal_items (
    id BIGSERIAL PRIMARY KEY,
    journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL,
    account_name VARCHAR(150),
    debit NUMERIC(15, 2) DEFAULT 0.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    party_id BIGINT, -- Linked Customer, Supplier, or Employee ID
    description TEXT
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(posting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_vtype ON journal_entries(voucher_type);
CREATE INDEX IF NOT EXISTS idx_journal_items_entry ON journal_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_items_account ON journal_items(account_id);
