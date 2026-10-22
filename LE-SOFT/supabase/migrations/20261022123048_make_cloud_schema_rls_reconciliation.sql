-- Reconcile Supabase MAKE schema with the desktop client and TrueNAS schema.
-- This migration is additive: legacy version columns are retained, and no
-- business rows are removed.

-- Tables that are used by the current MAKE services but were missing in cloud.
CREATE TABLE IF NOT EXISTS public.make_product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES public.make_products(id) ON DELETE CASCADE,
    spec_id BIGINT REFERENCES public.make_product_specifications(id) ON DELETE SET NULL,
    color_id BIGINT REFERENCES public.make_product_colors(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.make_product_category_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES public.make_products(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES public.make_product_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.make_order_approvals (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.make_orders(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    acted_by VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    notes_or_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restore the snapshot fields used by MakeVersionService while preserving
-- legacy version data and old-client columns.
ALTER TABLE public.make_order_versions
    ADD COLUMN IF NOT EXISTS snapshot JSONB,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS user_role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- The legacy columns have no equivalent input in the current snapshot writer.
-- Keep them for old readers, but allow snapshot-only inserts.
ALTER TABLE public.make_order_versions
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN changed_by DROP NOT NULL,
    ALTER COLUMN changes_diff DROP NOT NULL;

-- Match the local MAKE item schema and preserve existing integer quantities.
ALTER TABLE public.make_order_items
    ALTER COLUMN quantity TYPE NUMERIC(10,2) USING quantity::NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_make_product_images_product_id ON public.make_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_make_category_links_product_id ON public.make_product_category_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_category_links_category_id ON public.make_product_category_links(category_id);
CREATE INDEX IF NOT EXISTS idx_make_order_approvals_order_id ON public.make_order_approvals(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_order_id ON public.make_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_payments_order_id ON public.make_order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_versions_order_id ON public.make_order_versions(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_updates_order_id ON public.make_order_updates(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_parts_order_id ON public.make_order_parts(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_alteration_log_order_id ON public.make_order_alteration_log(order_id);

-- This desktop app authenticates its staff in LE-SOFT, not with Supabase Auth;
-- its database calls therefore carry the Supabase anon role. Keep MAKE API
-- access consistent with the existing make_orders policy until the application
-- moves to per-user Supabase JWTs.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname LIKE 'make\_%' ESCAPE '\'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
        EXECUTE format('DROP POLICY IF EXISTS lesoft_app_access ON public.%I', t.relname);
        EXECUTE format(
            'CREATE POLICY lesoft_app_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
            t.relname
        );
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated, service_role', t.relname);
    END LOOP;

    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'S'
          AND c.relname LIKE 'make\_%' ESCAPE '\'
    LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO anon, authenticated, service_role', t.relname);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
