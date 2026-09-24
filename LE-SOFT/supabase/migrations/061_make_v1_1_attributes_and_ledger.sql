-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 061 — MAKE V1.1 Normalized Attributes, Ledger Integration, Category & Invoice Attachments
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ensure category exists on make_products for intelligent catalog classification & search
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_make_products_category ON make_products(category);

-- 2. Make product_id nullable on attribute tables for global attributes
ALTER TABLE make_product_specifications ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE make_product_sizes ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE make_product_colors ALTER COLUMN product_id DROP NOT NULL;

-- 3. Create normalized junction tables for Product <-> Attribute relationships
CREATE TABLE IF NOT EXISTS make_product_specification_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    spec_id BIGINT NOT NULL REFERENCES make_product_specifications(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, spec_id)
);

CREATE TABLE IF NOT EXISTS make_product_size_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    size_id BIGINT NOT NULL REFERENCES make_product_sizes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, size_id)
);

CREATE TABLE IF NOT EXISTS make_product_color_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    color_id BIGINT NOT NULL REFERENCES make_product_colors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_make_spec_links_prod ON make_product_specification_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_spec_links_spec ON make_product_specification_links(spec_id);
CREATE INDEX IF NOT EXISTS idx_make_size_links_prod ON make_product_size_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_size_links_size ON make_product_size_links(size_id);
CREATE INDEX IF NOT EXISTS idx_make_color_links_prod ON make_product_color_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_color_links_color ON make_product_color_links(color_id);

-- 4. Non-destructive backfill: seed junction tables from existing rows
INSERT INTO make_product_specification_links (product_id, spec_id)
SELECT product_id, id FROM make_product_specifications
WHERE product_id IS NOT NULL
ON CONFLICT (product_id, spec_id) DO NOTHING;

INSERT INTO make_product_size_links (product_id, size_id)
SELECT product_id, id FROM make_product_sizes
WHERE product_id IS NOT NULL
ON CONFLICT (product_id, size_id) DO NOTHING;

INSERT INTO make_product_color_links (product_id, color_id)
SELECT product_id, id FROM make_product_colors
WHERE product_id IS NOT NULL
ON CONFLICT (product_id, color_id) DO NOTHING;

-- 5. Enhance make_orders with customer_id and invoice_attachment_urls
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES billing_customers(id) ON DELETE SET NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS invoice_attachment_urls TEXT[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_make_orders_customer_id ON make_orders(customer_id);

-- 6. Backfill customer_id on make_orders where customer_phone matches billing_customers
UPDATE make_orders o
SET customer_id = c.id
FROM billing_customers c
WHERE o.customer_id IS NULL
  AND o.customer_phone IS NOT NULL
  AND o.customer_phone != ''
  AND (
    c.phone = o.customer_phone
    OR c.phone = REPLACE(REPLACE(REPLACE(o.customer_phone, ' ', ''), '-', ''), '+88', '')
  );

-- 7. Grant permissions
GRANT ALL ON make_product_specification_links TO anon, authenticated, service_role;
GRANT ALL ON make_product_size_links TO anon, authenticated, service_role;
GRANT ALL ON make_product_color_links TO anon, authenticated, service_role;
GRANT ALL ON make_orders TO anon, authenticated, service_role;
GRANT ALL ON make_products TO anon, authenticated, service_role;

-- 8. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
