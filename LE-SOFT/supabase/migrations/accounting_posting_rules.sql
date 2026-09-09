-- Tally ERP Prime Inspired Accounting Posting Rules & Financial Period Locking Schema

-- 1. Financial Periods Lock Table (Prevents Editing Closed Accounting Periods)
CREATE TABLE IF NOT EXISTS financial_periods (
    id BIGSERIAL PRIMARY KEY,
    period_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tally Voucher Types Registry
CREATE TABLE IF NOT EXISTS voucher_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE, -- 'Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal', 'Debit Note', 'Credit Note'
    affects_inventory BOOLEAN DEFAULT FALSE,
    affects_cash BOOLEAN DEFAULT FALSE,
    affects_tax BOOLEAN DEFAULT FALSE,
    default_debit_account_id BIGINT,
    default_credit_account_id BIGINT
);

-- Seed Standard Tally Voucher Types
INSERT INTO voucher_types (name, affects_inventory, affects_cash, affects_tax)
VALUES 
    ('Sales Invoice', true, false, true),
    ('Purchase Bill', true, false, true),
    ('Payment', false, true, false),
    ('Receipt', false, true, false),
    ('Contra', false, true, false),
    ('Journal', false, false, false),
    ('Debit Note', true, false, false),
    ('Credit Note', true, false, false)
ON CONFLICT (name) DO NOTHING;
