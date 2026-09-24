-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 063 — Supabase Cloud MAKE V1.2 Schema Reconciliation
-- ═══════════════════════════════════════════════════════════════════════════
-- Description: Idempotently reconciles Supabase Cloud schema with the live
--              authoritative NAS MAKE V1.2 schema.
-- Safety:
--   - Non-destructive (no DROP TABLE, no DROP COLUMN, no DELETE).
--   - Preserves all existing billing_customers, bills, and test records.
--   - Does NOT copy any operational NAS production data into Supabase.
-- Execution: Run in Supabase Cloud Dashboard -> SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GLOBAL PRODUCT CATEGORIES & REFERENTIAL INTEGRITY
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Create make_product_categories table
CREATE TABLE IF NOT EXISTS make_product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Add category text and authoritative category_id to make_products
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_make_products_category ON make_products(category);

ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES make_product_categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_make_products_category_id ON make_products(category_id);

-- 1.3 Backfill categories from existing products (if any text categories present)
INSERT INTO make_product_categories (name)
SELECT DISTINCT TRIM(category)
FROM make_products
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE make_products p
SET category_id = c.id
FROM make_product_categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL
  AND TRIM(p.category) = c.name;

-- 1.4 Auto-synchronization Triggers for Category
CREATE OR REPLACE FUNCTION fn_sync_make_product_category()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        SELECT name INTO NEW.category
        FROM make_product_categories
        WHERE id = NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_make_product_category ON make_products;
CREATE TRIGGER trg_sync_make_product_category
    BEFORE INSERT OR UPDATE OF category_id ON make_products
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_make_product_category();

CREATE OR REPLACE FUNCTION fn_sync_make_product_category_rename()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.name IS DISTINCT FROM NEW.name THEN
        UPDATE make_products
        SET category = NEW.name
        WHERE category_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_make_product_category_rename ON make_product_categories;
CREATE TRIGGER trg_sync_make_product_category_rename
    AFTER UPDATE OF name ON make_product_categories
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_make_product_category_rename();

-- 1.5 Row Level Security & Explicit Grants for make_product_categories
ALTER TABLE make_product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow anon read access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authenticated read access to make_product_categories" ON make_product_categories;
CREATE POLICY "Allow read access to make_product_categories" 
    ON make_product_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow service_role write access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authenticated staff write access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authorized admin and manager write access to make_product_categories" ON make_product_categories;
CREATE POLICY "Allow service_role write access to make_product_categories" 
    ON make_product_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON make_product_categories TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON make_product_categories FROM anon, authenticated;
GRANT ALL ON make_product_categories TO service_role;
GRANT USAGE, SELECT ON SEQUENCE make_product_categories_id_seq TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ATTRIBUTE TABLES & NORMALIZED JUNCTION TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1 Allow global attributes (nullable product_id)
ALTER TABLE make_product_specifications ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE make_product_sizes ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE make_product_colors ALTER COLUMN product_id DROP NOT NULL;

-- 2.2 Create junction tables
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

-- 2.3 Indexes on junction tables
CREATE INDEX IF NOT EXISTS idx_make_spec_links_prod ON make_product_specification_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_spec_links_spec ON make_product_specification_links(spec_id);
CREATE INDEX IF NOT EXISTS idx_make_size_links_prod ON make_product_size_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_size_links_size ON make_product_size_links(size_id);
CREATE INDEX IF NOT EXISTS idx_make_color_links_prod ON make_product_color_links(product_id);
CREATE INDEX IF NOT EXISTS idx_make_color_links_color ON make_product_color_links(color_id);

-- 2.4 Backfill junction links from existing Supabase attribute rows
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ORDERS & UPDATES SCHEMA COMPATIBILITY
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 make_orders customer linking, attachments, and stage fields
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES billing_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_make_orders_customer_id ON make_orders(customer_id);

ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS invoice_attachment_urls TEXT[] DEFAULT '{}'::text[];

ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_stage VARCHAR(100);
UPDATE make_orders SET current_stage = status WHERE current_stage IS NULL AND status IS NOT NULL;

-- 3.2 make_order_updates stage and photos fields
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS stage VARCHAR(100);
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}'::text[];


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PERMISSIONS & SCHEMA CACHE RELOAD
-- ─────────────────────────────────────────────────────────────────────────────

GRANT ALL ON make_product_specification_links TO anon, authenticated, service_role;
GRANT ALL ON make_product_size_links TO anon, authenticated, service_role;
GRANT ALL ON make_product_color_links TO anon, authenticated, service_role;
GRANT ALL ON make_orders TO anon, authenticated, service_role;
GRANT ALL ON make_products TO anon, authenticated, service_role;
GRANT ALL ON make_order_updates TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
