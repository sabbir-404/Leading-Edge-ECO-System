-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 067 — NAS Client Registry & Make Order Fields Hardening
-- ═══════════════════════════════════════════════════════════════════════════
-- Features:
--   1. nas_client_registry: Durable connection tracking for active LE-SOFT clients.
--   2. make_order_items: Distinct columns for spec_details, custom_size, dimensions_text.
--   3. Idempotent PostgREST grants & schema reload notification.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. NAS Client Registry Table for Heartbeat & Lease Semantics
CREATE TABLE IF NOT EXISTS public.nas_client_registry (
    installation_id VARCHAR(100) PRIMARY KEY,
    app_version VARCHAR(50) NOT NULL,
    session_status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'reconnecting', 'offline', 'exited'
    connection_state VARCHAR(50) NOT NULL DEFAULT 'connected', -- 'connected', 'reconnecting', 'degraded', 'offline'
    client_ip VARCHAR(100),
    protocol_version VARCHAR(20) DEFAULT '1.0',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nas_client_registry_last_seen ON public.nas_client_registry(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_nas_client_registry_status ON public.nas_client_registry(session_status);

-- Enable RLS and grants (Least-Privilege Security Hardening)
ALTER TABLE public.nas_client_registry ENABLE ROW LEVEL SECURITY;

-- Dynamically drop ALL existing policies on public.nas_client_registry
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

-- Secure Policy 1: Service role has full management access (for backend daemons & connection service)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY "Service role full access on nas_client_registry"
            ON public.nas_client_registry FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)';
    END IF;
END $$;

-- Least-Privilege Dedicated Service Role for TrueNAS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nas_connection_service') THEN
        CREATE ROLE nas_connection_service WITH LOGIN NOINHERIT;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nas_connection_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nas_client_registry TO nas_connection_service;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nas_connection_service') THEN
        EXECUTE 'CREATE POLICY "nas_connection_service_management"
            ON public.nas_client_registry FOR ALL
            TO nas_connection_service
            USING (true)
            WITH CHECK (true)';
    END IF;
END $$;

-- Revoke public / anonymous / authenticated client access to prevent arbitrary registry enumeration or tampering
REVOKE ALL ON TABLE public.nas_client_registry FROM PUBLIC;
GRANT ALL ON TABLE public.nas_client_registry TO CURRENT_USER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.nas_client_registry FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.nas_client_registry FROM web_anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.nas_client_registry FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON TABLE public.nas_client_registry TO service_role';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin') THEN
        EXECUTE 'GRANT ALL ON TABLE public.nas_client_registry TO admin';
        EXECUTE 'CREATE POLICY "admin_registry_management" ON public.nas_client_registry FOR ALL TO admin USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- 2. Ensure make_order_items has independent size and specification columns
ALTER TABLE public.make_order_items ADD COLUMN IF NOT EXISTS spec_details TEXT;
ALTER TABLE public.make_order_items ADD COLUMN IF NOT EXISTS custom_size TEXT;
ALTER TABLE public.make_order_items ADD COLUMN IF NOT EXISTS dimensions_text TEXT;

-- Index for searching order items
CREATE INDEX IF NOT EXISTS idx_make_order_items_product_name ON public.make_order_items(product_name);

-- 3. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
