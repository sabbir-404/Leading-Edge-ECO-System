-- Migration 030: Purchase Requisition Multiple Quotes & Invoice Tracking

CREATE TABLE IF NOT EXISTS purchase_requisition_quotes (
    id SERIAL PRIMARY KEY,
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    supplier_ledger_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
    estimated_price NUMERIC(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add invoice tracking and quantity tracking to the purchase requisitions table
ALTER TABLE purchase_requisitions
    ADD COLUMN IF NOT EXISTS purchase_invoice_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS purchased_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS purchase_remarks TEXT;

-- Update status constraint to include PENDING_ESTIMATE
ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;
ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check 
    CHECK (status IN ('DRAFT', 'PENDING_ESTIMATE', 'PENDING_AUDIT', 'PENDING_DIRECTOR', 'APPROVED', 'PURCHASED', 'RECEIVED', 'COMPLETED'));

-- Notification reload
NOTIFY pgrst, 'reload schema';
