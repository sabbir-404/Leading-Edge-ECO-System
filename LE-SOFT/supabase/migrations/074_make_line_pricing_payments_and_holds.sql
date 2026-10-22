-- ============================================================================
-- Migration 074: Line Pricing, Line Discounts, Payment Holds & Production Authorization
-- Additive, safe, backward-compatible migration for MAKE orders, items, and payments.
-- ============================================================================

-- 1. Ensure order-level discount and final pricing columns exist on make_orders
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_price NUMERIC(14, 2) DEFAULT NULL;

-- 2. Add payment tracking, amount due, and production hold columns to make_orders
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS money_received NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS amount_due NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid',
    ADD COLUMN IF NOT EXISTS production_hold BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hold_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS admin_approval_status VARCHAR(50) DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS admin_approval_requested_by VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS admin_approval_requested_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS admin_approval_decision_by VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS admin_approval_decision_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS admin_approval_notes TEXT NULL;

-- 3. Add line-level discount and pricing snapshot columns to make_order_items
ALTER TABLE public.make_order_items
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_item_price NUMERIC(14, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS max_discount_type VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14, 2) DEFAULT NULL;

-- 4. Create make_order_payments table for auditable payment transaction history
CREATE TABLE IF NOT EXISTS public.make_order_payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.make_orders(id) ON DELETE CASCADE,
    amount NUMERIC(14, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    reference VARCHAR(100) NULL,
    notes TEXT NULL,
    received_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_make_order_payments_order_id ON public.make_order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_payment_status ON public.make_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_make_orders_production_hold ON public.make_orders(production_hold);
CREATE INDEX IF NOT EXISTS idx_make_orders_admin_approval ON public.make_orders(admin_approval_status);

-- 5. Grant permissions consistent with existing RLS design
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_orders TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_order_items TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_order_payments TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE make_order_payments_id_seq TO anon, authenticated, service_role;

-- 6. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
