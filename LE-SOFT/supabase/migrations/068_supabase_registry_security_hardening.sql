-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 068 — Supabase Registry Security Hardening (Forward Migration)
-- ═══════════════════════════════════════════════════════════════════════════
-- Target: Supabase Cloud SQL Editor (project ildkkgjrolcjijwfokek)
-- Status: PREPARED / REFERENCE (Matches live verified state; historical preservation)
--
-- Transactional Safety:
-- Wrapped in BEGIN ... COMMIT. If any assertion or statement fails, the entire
-- transaction rolls back, preventing partial security policy states.
--
-- Guards:
-- Explicitly validates that public.nas_client_registry and role service_role exist
-- before proceeding. If missing, raises an exception and aborts.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Pre-condition Check: Confirm table and required role exist before altering security
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'nas_client_registry'
    ) THEN
        RAISE EXCEPTION 'Table public.nas_client_registry does not exist. Migration 067 must be applied first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'service_role'
    ) THEN
        RAISE EXCEPTION 'Role service_role does not exist in target database.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'anon'
    ) THEN
        RAISE EXCEPTION 'Role anon does not exist in target database.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'authenticated'
    ) THEN
        RAISE EXCEPTION 'Role authenticated does not exist in target database.';
    END IF;
END $$;

-- 2. Ensure Row Level Security is active on public.nas_client_registry
ALTER TABLE public.nas_client_registry ENABLE ROW LEVEL SECURITY;

-- 3. Dynamically drop ALL existing policies on public.nas_client_registry
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'nas_client_registry'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.nas_client_registry', pol.policyname);
    END LOOP;
END $$;

-- 4. Revoke all table privileges from PUBLIC, anon, authenticated, and service_role
REVOKE ALL ON TABLE public.nas_client_registry FROM PUBLIC;
REVOKE ALL ON TABLE public.nas_client_registry FROM anon;
REVOKE ALL ON TABLE public.nas_client_registry FROM authenticated;
REVOKE ALL ON TABLE public.nas_client_registry FROM service_role;

-- 5. Grant strictly required CRUD operations to service_role (no TRUNCATE, REFERENCES, TRIGGER)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nas_client_registry TO service_role;

-- 6. Create exactly one service-role policy
CREATE POLICY "service_role_manage_nas_client_registry"
    ON public.nas_client_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 7. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
