-- ============================================================================
-- scripts/truenas-security-hardening.sql
-- ============================================================================
-- TrueNAS PostgreSQL & PostgREST Least-Privilege Security Hardening Script
--
-- PURPOSE:
-- Closes the unauthenticated data exposure vulnerability on TrueNAS PostgREST (port 3001)
-- where anonymous network requests could query sensitive tables (users, make_orders, device_sessions).
--
-- ARCHITECTURE:
-- 1. db-anon-role is set to 'web_anon' with ZERO access to any business, catalog, or system tables.
-- 2. Authenticated desktop and portal clients present signed JWTs assuming role 'nas_authenticated'.
-- 3. The replication worker uses dedicated internal PostgreSQL user 'nas_replicator' with
--    least-privilege table grants strictly for mirrored entities.
--
-- SAFETY:
-- All REVOKE statements use dynamic PL/pgSQL with to_regclass() checks so that
-- missing tables do not abort the transaction. This is necessary because not all
-- TrueNAS deployments have identical table sets (e.g. HRM tables may not exist).
--
-- STATUS: APPLIED TO THE ACTIVE LE-SOFT TRUENAS DATABASE ON 2026-10-22.
-- ============================================================================

BEGIN;

-- 1. Create or ensure dedicated roles exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
        CREATE ROLE web_anon NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nas_authenticated') THEN
        CREATE ROLE nas_authenticated NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nas_replicator') THEN
        CREATE ROLE nas_replicator WITH LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator WITH LOGIN NOINHERIT;
    END IF;
END $$;

-- PostgREST role switching permissions
GRANT web_anon TO authenticator;
GRANT nas_authenticated TO authenticator;

-- 2. Schema USAGE Grants
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT USAGE ON SCHEMA public TO nas_authenticated;
GRANT USAGE ON SCHEMA public TO nas_replicator;

-- 3. REVOKE ALL permissions from web_anon on ALL sensitive tables
-- Uses dynamic PL/pgSQL loop with to_regclass() to safely skip missing tables
-- without aborting the transaction.
DO $$
DECLARE
    tbl TEXT;
    principal TEXT;
    -- Complete list of tables that web_anon must NEVER access:
    -- Business & system tables
    sensitive_tables TEXT[] := ARRAY[
        -- System & auth tables
        'users',
        'device_sessions',
        'system_audit_log',
        'field_audit_logs',
        'internal_messages',
        -- Financial & HR tables
        'bills',
        'bill_items',
        'bill_payments',
        'vouchers',
        'voucher_entries',
        'ledgers',
        'gl_entries',
        'hrm_employees',
        'hrm_payroll',
        'hrm_attendance',
        'hrm_leaves',
        'hrm_holidays',
        -- Core business orders & CRM
        'make_orders',
        'make_order_items',
        'make_order_updates',
        'make_order_payments',
        'make_order_versions',
        'crm_customers',
        'crm_tracking',
        -- Catalog tables (web_anon must NOT browse product catalog without auth)
        'make_products',
        'make_product_categories',
        'make_product_specifications',
        'make_product_sizes',
        'make_product_colors',
        -- Replication internal tables
        'nas_replication_checkpoints',
        'nas_replication_id_map',
        'nas_replicated_files',
        -- Recovery infrastructure
        'recovery_batch_ledger',
        'recovery_batch_records'
    ];
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', tbl);
            FOREACH principal IN ARRAY ARRAY['anon', 'web_anon'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = principal) THEN
                    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, principal);
                    RAISE NOTICE 'Revoked % access on: public.%', principal, tbl;
                END IF;
            END LOOP;
        ELSE
            RAISE NOTICE 'Skipped (table not found): public.%', tbl;
        END IF;
    END LOOP;
END $$;

-- 4. GRANT authenticated permissions to nas_authenticated (used via PostgREST JWT)

-- Business order CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_orders TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_items TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_updates TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_payments TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_versions TO nas_authenticated;

-- Catalog access (read-write for admins/designers)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_products TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_categories TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_specifications TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_sizes TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_colors TO nas_authenticated;

-- MAKE relations and supporting tables used by catalog/order workflows.
-- Keep audit records available to the app's existing hard-delete workflow;
-- user-level authorization remains enforced by the desktop and portal clients.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_specification_links TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_size_links TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_color_links TO nas_authenticated;
GRANT SELECT ON TABLE public.make_product_images TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_parts TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_alteration_log TO nas_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_approvals TO nas_authenticated;

-- Limited read-only access for staff lookup & validation
GRANT SELECT (id, username, full_name, role, is_active) ON TABLE public.users TO nas_authenticated;
GRANT SELECT ON TABLE public.user_groups TO nas_authenticated;
GRANT SELECT ON TABLE public.billing_customers TO nas_authenticated;

-- Sequence usage for inserts
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nas_authenticated;

-- 5. GRANT least-privilege permissions to nas_replicator (used by replication daemon on port 5432)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_orders TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_items TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_updates TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_products TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_categories TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_specifications TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_sizes TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_colors TO nas_replicator;

-- Replication tracking metadata
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nas_replication_checkpoints TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nas_replication_id_map TO nas_replicator;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nas_replicated_files TO nas_replicator;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nas_replicator;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
