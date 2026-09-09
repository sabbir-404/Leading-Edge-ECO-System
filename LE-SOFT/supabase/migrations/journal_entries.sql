-- Akaunting & Tally Inspired Balanced Double-Entry Accounting Tables

-- 1. Journal Entries Header Table
CREATE TABLE IF NOT EXISTS journal_entries (
    id BIGSERIAL PRIMARY KEY,
    entry_number VARCHAR(100) NOT NULL UNIQUE, -- e.g. "JV-202607-0001"
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    voucher_type VARCHAR(50) DEFAULT 'JOURNAL', -- 'SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'
    narration TEXT,
    reference_no VARCHAR(100),
    total_debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_posted INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_balanced_entry CHECK (total_debit = total_credit)
);

-- 2. Journal Line Items Table
CREATE TABLE IF NOT EXISTS journal_items (
    id BIGSERIAL PRIMARY KEY,
    journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    ledger_id BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_items_entry ON journal_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_items_ledger ON journal_items(ledger_id);
