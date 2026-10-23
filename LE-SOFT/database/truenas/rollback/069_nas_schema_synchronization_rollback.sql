-- ============================================================================
-- Migration 069 Rollback: 069_nas_schema_synchronization_rollback.sql
-- ============================================================================
-- ⚠️ CRITICAL DESTRUCTIVE SCRIPT WARNING:
-- DO NOT RUN THIS SCRIPT ON A POPULATED PRODUCTION DATABASE (`lesoft` on port 5432).
--
-- Running this rollback script DROPS data-bearing tables and columns:
--   - `customer_payments` (Permanent loss of customer payment history)
--   - `customer_addresses` (Permanent loss of saved delivery addresses)
--   - `exchange_orders` & `exchange_items` (Permanent loss of exchange order records)
--   - `bills.installation_charge` & `bills.installation_note` (Permanent loss of bill financial fields)
--
-- RECOVERY STRATEGY (Non-Destructive Fix-Forward):
-- If Migration 069 encountered an error or needs repair:
-- 1. DO NOT run this rollback. Keep existing tables and columns intact.
-- 2. Take a pg_dump backup:
--      pg_dump -U postgres -h 100.88.85.6 -p 5432 -d lesoft -F c -b -v -f /backups/lesoft_pre_repair_$(date +%F).dump
-- 3. Re-run `069_nas_schema_synchronization_and_bills.sql` to ensure idempotent table/column creation.
-- 4. Reload PostgREST schema cache:
--      NOTIFY pgrst, 'reload schema';
--
-- This rollback script should ONLY be executed in ephemeral CI test environments
-- or completely unpopulated development staging instances.
-- ============================================================================

DROP TABLE IF EXISTS exchange_items CASCADE;
DROP TABLE IF EXISTS exchange_orders CASCADE;
DROP TABLE IF EXISTS customer_payments CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;

ALTER TABLE bills DROP COLUMN IF EXISTS installation_note;
ALTER TABLE bills DROP COLUMN IF EXISTS installation_charge;

NOTIFY pgrst, 'reload schema';

