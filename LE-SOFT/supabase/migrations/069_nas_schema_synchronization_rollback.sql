-- ============================================================================
-- Migration 069 Rollback: 069_nas_schema_synchronization_rollback.sql
-- ============================================================================
-- Purpose: Safely rolls back schema additions from migration 069 if needed.
-- Note: Dropping tables will delete customer ledger and exchange order data.
-- Execute only if explicitly rolling back migration 069 on an isolated instance.
-- ============================================================================

DROP TABLE IF EXISTS exchange_items CASCADE;
DROP TABLE IF EXISTS exchange_orders CASCADE;
DROP TABLE IF EXISTS customer_payments CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;

ALTER TABLE bills DROP COLUMN IF EXISTS installation_note;
ALTER TABLE bills DROP COLUMN IF EXISTS installation_charge;

NOTIFY pgrst, 'reload schema';
