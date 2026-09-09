-- ERPNext & Medusa Inspired Stock Ledger Entry (SLE) and General Ledger (GL) Schema

-- 1. Stock Ledger Entry (Immutable Audit Trail for Physical Stock Movements)
CREATE TABLE IF NOT EXISTS stock_ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    posting_date TIMESTAMPTZ DEFAULT NOW(),
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    voucher_type VARCHAR(50) NOT NULL, -- 'Sales Bill', 'Purchase Invoice', 'Stock Transfer', 'Return/Alteration'
    voucher_no VARCHAR(100) NOT NULL,
    actual_qty NUMERIC(12, 2) NOT NULL, -- Negative for sales, Positive for stock in/returns
    qty_after_transaction NUMERIC(12, 2) NOT NULL,
    godown_id BIGINT,
    company_id INT DEFAULT 1,
    created_by VARCHAR(100) DEFAULT 'System'
);

-- Index for fast lookup by product or voucher
CREATE INDEX IF NOT EXISTS idx_sle_product_id ON stock_ledger_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_sle_voucher_no ON stock_ledger_entries(voucher_no);

-- Trigger Function: Auto-sync product.quantity when Stock Ledger Entry is inserted
CREATE OR REPLACE FUNCTION update_product_stock_from_sle()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products 
    SET quantity = NEW.qty_after_transaction
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_ledger_update ON stock_ledger_entries;
CREATE TRIGGER trg_stock_ledger_update
AFTER INSERT ON stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION update_product_stock_from_sle();


-- 2. General Ledger (GL) Entry (Double-Entry Financial Ledger Engine)
CREATE TABLE IF NOT EXISTS gl_entries (
    id BIGSERIAL PRIMARY KEY,
    posting_date TIMESTAMPTZ DEFAULT NOW(),
    account_id BIGINT NOT NULL, -- Ledger Account ID
    account_name VARCHAR(150),
    voucher_type VARCHAR(50) NOT NULL, -- 'Sales Bill', 'Payment', 'Receipt', 'Journal'
    voucher_no VARCHAR(100) NOT NULL,
    debit_amount NUMERIC(15, 2) DEFAULT 0.00,
    credit_amount NUMERIC(15, 2) DEFAULT 0.00,
    against_account VARCHAR(150),
    remarks TEXT,
    company_id INT DEFAULT 1,
    created_by VARCHAR(100) DEFAULT 'System'
);

CREATE INDEX IF NOT EXISTS idx_gl_account_id ON gl_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_gl_voucher_no ON gl_entries(voucher_no);
