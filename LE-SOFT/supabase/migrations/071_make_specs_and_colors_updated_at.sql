-- ============================================================================
-- Migration 071_make_specs_and_colors_updated_at.sql
-- ============================================================================
-- Purpose:
-- Introduces reliable change detection and compound watermark cursors (updated_at, id)
-- for make_product_specifications and make_product_colors.
--
-- Features:
-- 1. Adds updated_at column with NOT NULL DEFAULT NOW() to both catalog tables.
-- 2. Creates compound watermark indexes for efficient, indexed change cursoring:
--      (updated_at ASC, id ASC)
-- 3. Automatic BEFORE UPDATE triggers to guarantee updated_at is refreshed on ANY row edit.
-- 4. Ensures durable replication_tombstones table exists and registers AFTER DELETE triggers
--    to propagate hard deletions to the TrueNAS downstream replica.
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
SET search_path = public, pg_temp
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

-- 6. Trigger Function to Record Deletion Tombstones
CREATE OR REPLACE FUNCTION public.log_make_catalog_deletion_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.replication_tombstones (table_name, record_id, deleted_at)
    VALUES (TG_TABLE_NAME, OLD.id, NOW());
    RETURN OLD;
END;
$$;

-- 7. Apply AFTER DELETE triggers for catalog deletion propagation
DROP TRIGGER IF EXISTS trg_make_specs_deletion_tombstone ON public.make_product_specifications;
CREATE TRIGGER trg_make_specs_deletion_tombstone
AFTER DELETE ON public.make_product_specifications
FOR EACH ROW
EXECUTE FUNCTION public.log_make_catalog_deletion_tombstone();

DROP TRIGGER IF EXISTS trg_make_colors_deletion_tombstone ON public.make_product_colors;
CREATE TRIGGER trg_make_colors_deletion_tombstone
AFTER DELETE ON public.make_product_colors
FOR EACH ROW
EXECUTE FUNCTION public.log_make_catalog_deletion_tombstone();

-- 8. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_product_specifications TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_product_colors TO authenticated, service_role;
GRANT SELECT, INSERT ON public.replication_tombstones TO authenticated, service_role;
