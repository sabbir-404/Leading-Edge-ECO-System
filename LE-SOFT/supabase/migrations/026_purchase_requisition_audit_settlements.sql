-- ============================================================
-- Migration 026: Requisition audit history and supplier settlements
-- Adds workflow history logging and supplier payment settlement tracking.
-- ============================================================

-- ============================================================
-- 1. Purchase requisition workflow history
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requisition_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    action VARCHAR(80) NOT NULL,
    remarks TEXT,
    old_value JSONB,
    new_value JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255) NOT NULL DEFAULT 'desktop-user',
    performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_history_requisition_id ON purchase_requisition_status_history(requisition_id);
CREATE INDEX IF NOT EXISTS idx_pr_history_performed_at ON purchase_requisition_status_history(performed_at);
CREATE INDEX IF NOT EXISTS idx_pr_history_to_status ON purchase_requisition_status_history(to_status);

-- ============================================================
-- 2. Supplier settlement tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_ledger_id INTEGER NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    purchase_bill_id INTEGER REFERENCES purchase_bills(id) ON DELETE SET NULL,
    settlement_date TIMESTAMP NOT NULL DEFAULT NOW(),
    settlement_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    settlement_status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (settlement_status IN ('POSTED', 'PARTIAL', 'SETTLED', 'VOID')),
    remarks TEXT,
    company_id INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255) NOT NULL DEFAULT 'desktop-user',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_name VARCHAR(255) NOT NULL DEFAULT 'desktop-user',
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_settlements_supplier_ledger_id ON supplier_settlements(supplier_ledger_id);
CREATE INDEX IF NOT EXISTS idx_supplier_settlements_purchase_bill_id ON supplier_settlements(purchase_bill_id);
CREATE INDEX IF NOT EXISTS idx_supplier_settlements_settlement_date ON supplier_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_supplier_settlements_status ON supplier_settlements(settlement_status);

ALTER TABLE supplier_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE purchase_requisitions
    ADD COLUMN IF NOT EXISTS store_head_notes TEXT,
    ADD COLUMN IF NOT EXISTS audit_status VARCHAR(20) DEFAULT 'PENDING' CHECK (audit_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    ADD COLUMN IF NOT EXISTS audit_notes TEXT,
    ADD COLUMN IF NOT EXISTS audit_reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS audit_reviewed_by_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS director_status VARCHAR(20) DEFAULT 'PENDING' CHECK (director_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    ADD COLUMN IF NOT EXISTS director_notes TEXT,
    ADD COLUMN IF NOT EXISTS director_reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS director_reviewed_by_name VARCHAR(255);

CREATE POLICY "Allow authenticated full access to supplier_settlements"
    ON supplier_settlements FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage supplier_settlements"
    ON supplier_settlements FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
