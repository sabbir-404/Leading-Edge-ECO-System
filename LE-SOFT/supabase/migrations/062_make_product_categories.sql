-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 062 — MAKE V1.2 Normalized Product Categories & Referential Integrity
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create make_product_categories table
CREATE TABLE IF NOT EXISTS make_product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure category column exists and add category_id foreign key with RESTRICT delete protection
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES make_product_categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_make_products_category_id ON make_products(category_id);
CREATE INDEX IF NOT EXISTS idx_make_products_category ON make_products(category);

-- 3. Non-destructive backfill: Seed make_product_categories from existing distinct category strings
INSERT INTO make_product_categories (name)
SELECT DISTINCT TRIM(category)
FROM make_products
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;

-- 4. Authoritative linking: Update make_products.category_id matching existing category names
UPDATE make_products p
SET category_id = c.id
FROM make_product_categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL
  AND TRIM(p.category) = c.name;

-- 5. Auto-synchronization Triggers: Ensure category_id is authoritative and category text remains in sync
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

-- 6. Row Level Security & Explicit Hardened Grants
ALTER TABLE make_product_categories ENABLE ROW LEVEL SECURITY;

-- Unified Read/Write Access: Open to operational clients (anon, authenticated, service_role)
-- The Electron Main Process / IPC gateway enforces application-level authorization (canManageCatalog)
DROP POLICY IF EXISTS "Allow read access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow anon read access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authenticated read access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow service_role write access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authenticated staff write access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow authorized admin and manager write access to make_product_categories" ON make_product_categories;
DROP POLICY IF EXISTS "Allow all access to make_product_categories" ON make_product_categories;
CREATE POLICY "Allow all access to make_product_categories" 
    ON make_product_categories FOR ALL USING (true) WITH CHECK (true);

-- Explicit SQL Grants:
GRANT ALL ON make_product_categories TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE make_product_categories_id_seq TO anon, authenticated, service_role;

-- 7. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
