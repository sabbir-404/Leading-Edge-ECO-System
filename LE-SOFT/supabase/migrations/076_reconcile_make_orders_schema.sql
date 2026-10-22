-- ============================================================================
-- Migration 076: Reconcile make_orders Schema & Visibility (Cloud & Downstream)
-- ============================================================================
-- STATUS: PREPARED FOR ADMINISTRATIVE REVIEW — DO NOT AUTO-APPLY
--
-- Context:
-- Database integrity audit identified that 5 columns added in local migrations
-- 058 and 059 are present on TrueNAS but were absent/unverified on Supabase Cloud:
--   1. factory_manager_id (BIGINT)
--   2. factory_manager_name (TEXT)
--   3. current_stage_photo (TEXT)
--   4. reference_bill_no (TEXT)
--   5. target_delivery_days (INTEGER)
--
-- This migration idempotently reconciles the columns, sets appropriate defaults,
-- creates lookup indexes, and refreshes the PostgREST schema cache.
-- ============================================================================

-- 1. Add missing workflow and tracking columns to make_orders
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS factory_manager_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS factory_manager_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_stage_photo TEXT NULL,
    ADD COLUMN IF NOT EXISTS reference_bill_no TEXT NULL,
    ADD COLUMN IF NOT EXISTS target_delivery_days INTEGER NULL;

-- 2. Add documentation comments
COMMENT ON COLUMN public.make_orders.factory_manager_id IS 'User ID of assigned factory manager managing workshop production';
COMMENT ON COLUMN public.make_orders.factory_manager_name IS 'Cached display name of assigned factory manager';
COMMENT ON COLUMN public.make_orders.current_stage_photo IS 'URL of latest production stage photo uploaded by workshop';
COMMENT ON COLUMN public.make_orders.reference_bill_no IS 'External physical bill or invoice reference number entered at order creation';
COMMENT ON COLUMN public.make_orders.target_delivery_days IS 'Agreed production turnaround days from placement to delivery';

-- 3. Performance indexes for order filtering and bill lookups
CREATE INDEX IF NOT EXISTS idx_make_orders_ref_bill_no
    ON public.make_orders(reference_bill_no)
    WHERE reference_bill_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_make_orders_factory_manager
    ON public.make_orders(factory_manager_id)
    WHERE factory_manager_id IS NOT NULL;

-- 4. Grant table access to standard application roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_orders TO service_role;

-- 5. Signal PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
