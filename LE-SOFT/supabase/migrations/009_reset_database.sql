-- =============================================================================
-- LE-SOFT Database Reset Script v3
-- PostgreSQL-compatible: uses a DO block to safely skip missing tables.
--
-- HOW TO USE:
--   Supabase Dashboard → SQL Editor → New Query → paste entire script → Run
-- ⚠️  WARNING: Permanently deletes ALL data. No undo.
-- =============================================================================

-- Disable FK checks
SET session_replication_role = 'replica';

-- Safely truncate every table (skips ones that don't exist)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'bill_alteration_requests',
    'bill_items',
    'bill_audit',
    'shipping_status_log',
    'bill_shipping',
    'bills',
    'billing_customers',
    'make_order_alteration_log',
    'make_order_parts',
    'make_order_updates',
    'make_orders',
    'hrm_payroll',
    'hrm_leaves',
    'hrm_attendance',
    'hrm_employees',
    'crm_tracking',
    'crm_customers',
    'voucher_entries',
    'vouchers',
    'purchase_bill_items',
    'purchase_bills',
    'ledgers',
    'groups',
    'products',
    'stock_items',
    'stock_groups',
    'units',
    'internal_messages',
    'system_emails',
    'notifications',
    'system_audit_log',
    'app_license',
    'device_sessions',
    'users',
    'user_groups',
    'companies'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tbl) || ' CASCADE';
      RAISE NOTICE 'Truncated: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', tbl;
    END IF;
  END LOOP;
END $$;

-- Re-enable FK checks
SET session_replication_role = 'origin';

-- Delete ALL Supabase Auth users
DELETE FROM auth.users;

-- Restore minimal seed data
INSERT INTO companies (id, name, mailing_name, country, base_currency_symbol)
VALUES (1, 'Leading Edge', 'Leading Edge', 'Bangladesh', '৳');

-- =============================================================================
-- Done! Launch the app: npm run electron:dev
-- App auto-creates: username=sabbirsuperadmin  password=123456
-- =============================================================================
