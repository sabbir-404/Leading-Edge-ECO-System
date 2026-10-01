-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 065 — MAKE V1.8.5 Multi-Category, Order Number & Audit Hardening
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create normalized junction table for Product <-> Multiple Categories
CREATE TABLE IF NOT EXISTS make_product_category_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES make_product_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_make_category_links_prod ON make_product_category_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_category_links_cat ON make_product_category_links(category_id);

-- 2. Non-destructive backfill: Seed junction table from existing make_products.category_id
INSERT INTO make_product_category_links (product_id, category_id)
SELECT id, category_id 
FROM make_products 
WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;

-- 3. Row-level security & PostgREST grants for make_product_category_links
ALTER TABLE make_product_category_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to make_product_category_links" ON make_product_category_links;
CREATE POLICY "Allow all access to make_product_category_links" 
    ON make_product_category_links FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON make_product_category_links TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE make_product_category_links_id_seq TO anon, authenticated, service_role;

-- 4. Unique index on make_orders.order_number to protect authoritative database writes
CREATE UNIQUE INDEX IF NOT EXISTS uq_make_orders_order_number ON make_orders(order_number);

-- 5. Hardened fields on make_order_alteration_log for complete audit trail
ALTER TABLE make_order_alteration_log ADD COLUMN IF NOT EXISTS order_number VARCHAR(100);
ALTER TABLE make_order_alteration_log ADD COLUMN IF NOT EXISTS action_type VARCHAR(100) DEFAULT 'field_update';
ALTER TABLE make_order_alteration_log ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_moal_order_id_altered_at ON make_order_alteration_log(order_id, altered_at DESC);
CREATE INDEX IF NOT EXISTS idx_moal_order_number ON make_order_alteration_log(order_number);

-- 6. Grant permissions
GRANT ALL ON make_order_alteration_log TO anon, authenticated, service_role;

-- 7. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
