-- =============================================================
-- Migration 030: Purchase Requisition Quotes & Invoice Tracking
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================================

-- 1. Create the quotes table for multiple vendor quotes per requisition
CREATE TABLE IF NOT EXISTS purchase_requisition_quotes (
    id SERIAL PRIMARY KEY,
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    supplier_ledger_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
    estimated_price NUMERIC(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add invoice tracking columns to purchase_requisitions
ALTER TABLE purchase_requisitions
    ADD COLUMN IF NOT EXISTS purchase_invoice_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS purchased_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS purchase_remarks TEXT;

-- 3. Drop old status constraint and replace with full workflow statuses
ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;
ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check 
    CHECK (status IN (
        'DRAFT',
        'PENDING_ESTIMATE',
        'PENDING_AUDIT',
        'PENDING_DIRECTOR',
        'APPROVED',
        'REJECTED',
        'PURCHASED',
        'RECEIVED',
        'COMPLETED'
    ));

-- 4. Reload schema cache so PostgREST picks up the new table/columns
NOTIFY pgrst, 'reload schema';
