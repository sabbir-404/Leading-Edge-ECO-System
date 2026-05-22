-- Migration 045: Add product stashing columns
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
