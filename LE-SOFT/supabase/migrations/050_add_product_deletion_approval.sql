-- Migration 050: Add product stashing and deletion approval fields
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS deletion_status TEXT DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS deletion_requested_by TEXT,
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_approved_by TEXT,
    ADD COLUMN IF NOT EXISTS deletion_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_notes TEXT;

-- Drop constraint if it already exists to allow idempotent re-runs
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_deletion_status_check;

ALTER TABLE products 
    ADD CONSTRAINT products_deletion_status_check 
    CHECK (deletion_status IN ('NONE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
