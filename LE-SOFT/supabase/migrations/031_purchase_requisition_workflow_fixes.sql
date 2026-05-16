-- Migration 031: Purchase requisition workflow status fixes
-- Keeps database constraints aligned with the application workflow.

ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;

ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check
    CHECK (status IN (
        'DRAFT',
        'PENDING_ESTIMATE',
        'PENDING_AUDIT',
        'PENDING_DIRECTOR',
        'APPROVED',
        'PURCHASED',
        'RECEIVED',
        'COMPLETED',
        'REJECTED'
    ));

ALTER TABLE purchase_requisition_quotes
    ALTER COLUMN estimated_price TYPE NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS idx_purchase_requisition_quotes_requisition_id
    ON purchase_requisition_quotes(requisition_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_audit_status
    ON purchase_requisitions(audit_status);

CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_director_status
    ON purchase_requisitions(director_status);

NOTIFY pgrst, 'reload schema';
