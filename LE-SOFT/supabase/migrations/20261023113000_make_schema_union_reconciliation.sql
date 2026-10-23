-- Bring Supabase Cloud up to the additive column union used by current LE-SOFT
-- and the active TrueNAS schema. Legacy columns remain intact.
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS delivery_city TEXT,
    ADD COLUMN IF NOT EXISTS attachment_url TEXT,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salesperson_wp_id BIGINT;

ALTER TABLE public.make_order_updates
    ADD COLUMN IF NOT EXISTS actor_name TEXT,
    ADD COLUMN IF NOT EXISTS actor_role TEXT;

ALTER TABLE public.make_order_parts
    ADD COLUMN IF NOT EXISTS length TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS width TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS height TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.make_order_parts
    ALTER COLUMN dimensions DROP NOT NULL,
    ALTER COLUMN dimensions SET DEFAULT '{}'::JSONB;
