-- ============================================================================
-- Migration 073: Product Pricing, Maximum Discount Limits & Order Discount Fields
-- Safe, idempotent, backward-compatible migration for MAKE product catalog and orders.
-- ============================================================================

-- 1. Add pricing and maximum discount configuration columns to make_products
ALTER TABLE public.make_products
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS max_discount_type VARCHAR(20) DEFAULT 'percent',
    ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14, 2) DEFAULT 0.00;

-- 2. Add validation check constraints if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'make_products_max_discount_type_check'
    ) THEN
        ALTER TABLE public.make_products
            ADD CONSTRAINT make_products_max_discount_type_check
            CHECK (max_discount_type IS NULL OR max_discount_type IN ('percent', 'amount'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'make_products_pricing_non_negative_check'
    ) THEN
        ALTER TABLE public.make_products
            ADD CONSTRAINT make_products_pricing_non_negative_check
            CHECK (
                (cost_price IS NULL OR cost_price >= 0) AND
                (sale_price IS NULL OR sale_price >= 0) AND
                (max_discount_value IS NULL OR max_discount_value >= 0)
            );
    END IF;
END $$;

-- 3. Add order-level discount and final pricing columns to make_orders
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_price NUMERIC(14, 2) DEFAULT NULL;

-- 4. Add order item max discount configuration snapshot columns
ALTER TABLE public.make_order_items
    ADD COLUMN IF NOT EXISTS max_discount_type VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14, 2) DEFAULT NULL;

-- 5. Grant access permissions consistent with existing RLS design
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_products TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_orders TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_order_items TO anon, authenticated, service_role;
