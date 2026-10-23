-- ============================================================================
-- Migration 071_make_specs_and_colors_updated_at.sql
-- ============================================================================
-- Purpose:
-- Introduces reliable change detection and compound watermark cursors (updated_at, id)
-- for make_product_specifications and make_product_colors, along with secure,
-- least-privilege replication tombstones for downstream TrueNAS replication.
--
-- Features:
-- 1. Adds updated_at column with NOT NULL DEFAULT NOW() to both catalog tables.
-- 2. Creates compound watermark indexes for efficient, indexed change cursoring:
--      (updated_at ASC, id ASC)
-- 3. Automatic BEFORE UPDATE triggers to guarantee updated_at is refreshed on ANY row edit.
-- 4. Durable, secure replication_tombstones table:
--      - RLS strictly enabled.
--      - Direct INSERT, UPDATE, DELETE, and SELECT revoked from PUBLIC, anon, and authenticated.
--      - Granted solely to service_role (backend replication daemon).
-- 5. Trusted SECURITY DEFINER trigger function with fixed search_path = pg_catalog, public
--    to safely log legitimate hard deletions from make_product_specifications,
--    make_product_colors, make_orders, and make_order_updates.
-- ============================================================================

-- 1. Update make_product_specifications schema
ALTER TABLE public.make_product_specifications
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_make_specs_updated_at_id
ON public.make_product_specifications (updated_at ASC, id ASC);

-- 2. Update make_product_colors schema
ALTER TABLE public.make_product_colors
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_make_colors_updated_at_id
ON public.make_product_colors (updated_at ASC, id ASC);

-- 3. Trigger Function for Automatic Timestamp Refresh
CREATE OR REPLACE FUNCTION public.set_make_catalog_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4. Apply BEFORE UPDATE triggers
DROP TRIGGER IF EXISTS trg_make_specs_updated_at ON public.make_product_specifications;
CREATE TRIGGER trg_make_specs_updated_at
BEFORE UPDATE ON public.make_product_specifications
FOR EACH ROW
EXECUTE FUNCTION public.set_make_catalog_updated_at();

DROP TRIGGER IF EXISTS trg_make_colors_updated_at ON public.make_product_colors;
CREATE TRIGGER trg_make_colors_updated_at
BEFORE UPDATE ON public.make_product_colors
FOR EACH ROW
EXECUTE FUNCTION public.set_make_catalog_updated_at();

-- 5. Ensure replication_tombstones table exists for explicit deletions
CREATE TABLE IF NOT EXISTS public.replication_tombstones (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id BIGINT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replication_tombstones_watermark
ON public.replication_tombstones (deleted_at ASC, id ASC);

-- Enable Row Level Security on replication_tombstones
ALTER TABLE public.replication_tombstones ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy Cleanup on replication_tombstones
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'replication_tombstones'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.replication_tombstones', pol.policyname);
    END LOOP;
END $$;

-- Revoke all permissions on replication_tombstones from PUBLIC, anon, and authenticated
-- Ordinary authenticated users must never create, alter, or forge tombstones directly.
REVOKE ALL ON public.replication_tombstones FROM PUBLIC, anon, authenticated;

-- Grant access ONLY to service_role (backend replication daemon)
GRANT ALL ON public.replication_tombstones TO service_role;

-- Define RLS Policy: Only service_role can access replication_tombstones
CREATE POLICY "Service role only access to replication_tombstones"
ON public.replication_tombstones
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Trigger Function to Record Deletion Tombstones
-- SECURITY DEFINER with fixed search_path = pg_catalog, public
CREATE OR REPLACE FUNCTION public.log_make_deletion_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.replication_tombstones (table_name, record_id, deleted_at)
    VALUES (TG_TABLE_NAME, OLD.id, NOW());
    RETURN OLD;
END;
$$;

-- 7. Apply AFTER DELETE triggers for all replicated tables
DROP TRIGGER IF EXISTS trg_make_specs_deletion_tombstone ON public.make_product_specifications;
CREATE TRIGGER trg_make_specs_deletion_tombstone
AFTER DELETE ON public.make_product_specifications
FOR EACH ROW
EXECUTE FUNCTION public.log_make_deletion_tombstone();

DROP TRIGGER IF EXISTS trg_make_colors_deletion_tombstone ON public.make_product_colors;
CREATE TRIGGER trg_make_colors_deletion_tombstone
AFTER DELETE ON public.make_product_colors
FOR EACH ROW
EXECUTE FUNCTION public.log_make_deletion_tombstone();

-- Conditionally apply to make_orders and make_order_updates if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'make_orders') THEN
        DROP TRIGGER IF EXISTS trg_make_orders_deletion_tombstone ON public.make_orders;
        CREATE TRIGGER trg_make_orders_deletion_tombstone
        AFTER DELETE ON public.make_orders
        FOR EACH ROW
        EXECUTE FUNCTION public.log_make_deletion_tombstone();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'make_order_updates') THEN
        DROP TRIGGER IF EXISTS trg_make_order_updates_deletion_tombstone ON public.make_order_updates;
        CREATE TRIGGER trg_make_order_updates_deletion_tombstone
        AFTER DELETE ON public.make_order_updates
        FOR EACH ROW
        EXECUTE FUNCTION public.log_make_deletion_tombstone();
    END IF;
END $$;

-- 8. Catalog Table Security and Permissions
REVOKE ALL ON public.make_product_specifications FROM PUBLIC, anon;
REVOKE ALL ON public.make_product_colors FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_product_specifications TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_product_colors TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
