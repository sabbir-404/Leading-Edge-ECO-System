-- ═══════════════════════════════════════════════════════════════
--  Migration 019 — Fix Bills Altered Flag
--  Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add is_altered flag to bills (the correct table name)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_altered BOOLEAN DEFAULT FALSE;

-- Cleanup: Drop the incorrectly named table if it was created by mistake (unlikely if it didn't exist, but good to check)
-- DO NOT drop if you are unsure, but here we know 'billing_orders' was a typo in migration 018
-- ALTER TABLE IF EXISTS billing_orders DROP COLUMN IF EXISTS is_altered; 
