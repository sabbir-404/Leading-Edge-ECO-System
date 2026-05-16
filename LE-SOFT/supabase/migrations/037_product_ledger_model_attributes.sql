-- Migration 037: Product ledger, model rules, and product attributes
-- Adds structured product identity/specification data without replacing existing products.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_code TEXT,
    ADD COLUMN IF NOT EXISTS model_number TEXT,
    ADD COLUMN IF NOT EXISTS origin_type TEXT DEFAULT 'LOCAL',
    ADD COLUMN IF NOT EXISTS import_type_code TEXT,
    ADD COLUMN IF NOT EXISTS model_group_code TEXT,
    ADD COLUMN IF NOT EXISTS batch_code TEXT,
    ADD COLUMN IF NOT EXISTS serial_number INTEGER,
    ADD COLUMN IF NOT EXISTS supplier_ledger_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS imported_supplier_name TEXT,
    ADD COLUMN IF NOT EXISTS import_reference TEXT,
    ADD COLUMN IF NOT EXISTS import_country TEXT,
    ADD COLUMN IF NOT EXISTS image_gallery JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}'::jsonb;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_origin_type_check;
ALTER TABLE products ADD CONSTRAINT products_origin_type_check
    CHECK (origin_type IN ('LOCAL', 'IMPORTED'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code
    ON products(product_code)
    WHERE product_code IS NOT NULL AND product_code <> '';

CREATE TABLE IF NOT EXISTS product_model_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    origin_type TEXT NOT NULL CHECK (origin_type IN ('LOCAL', 'IMPORTED')),
    origin_code TEXT NOT NULL,
    stock_group_id INTEGER REFERENCES stock_groups(id) ON DELETE SET NULL,
    group_code TEXT NOT NULL,
    batch_sequence INTEGER NOT NULL DEFAULT 1,
    serial_padding INTEGER NOT NULL DEFAULT 4,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_model_rules_origin_group
    ON product_model_rules(origin_type, stock_group_id)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS product_attributes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    input_type TEXT NOT NULL DEFAULT 'text' CHECK (input_type IN ('text', 'number', 'select', 'color')),
    options JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_product_id
    ON product_attribute_values(product_id);

ALTER TABLE product_model_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to product_model_rules" ON product_model_rules;
CREATE POLICY "Allow anon full access to product_model_rules"
    ON product_model_rules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access to product_attributes" ON product_attributes;
CREATE POLICY "Allow anon full access to product_attributes"
    ON product_attributes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access to product_attribute_values" ON product_attribute_values;
CREATE POLICY "Allow anon full access to product_attribute_values"
    ON product_attribute_values FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage product_model_rules" ON product_model_rules;
CREATE POLICY "Service role can manage product_model_rules"
    ON product_model_rules FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage product_attributes" ON product_attributes;
CREATE POLICY "Service role can manage product_attributes"
    ON product_attributes FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage product_attribute_values" ON product_attribute_values;
CREATE POLICY "Service role can manage product_attribute_values"
    ON product_attribute_values FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO permission_levels (
    feature_name,
    feature_key,
    description,
    approver_role,
    is_active
)
VALUES
    ('Product Ledger Access', 'read_product_ledger', 'View full product ledger and purchase/supplier details.', 'manager', TRUE),
    ('Product Attribute Management', 'manage_product_attributes', 'Create and update product specification attributes.', 'admin', TRUE),
    ('Product Model Rule Management', 'manage_product_model_rules', 'Configure generated product model number rules.', 'admin', TRUE),
    ('Imported Product Creation', 'create_imported_products', 'Create imported products and import supplier records.', 'superadmin', TRUE),
    ('Product Information Editing', 'edit_product_information', 'Edit product master information and specifications.', 'manager', TRUE)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    approver_role = EXCLUDED.approver_role,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

UPDATE user_groups
SET permissions = permissions || jsonb_build_object(
    'read_product_ledger', TRUE,
    'manage_product_attributes', TRUE,
    'manage_product_model_rules', TRUE,
    'create_imported_products', TRUE,
    'edit_product_information', TRUE
)
WHERE LOWER(name) IN ('super admin', 'superadmin');

UPDATE user_groups
SET permissions = permissions || jsonb_build_object(
    'read_product_ledger', TRUE,
    'edit_product_information', TRUE
)
WHERE LOWER(name) IN ('admin', 'store head', 'store department', 'inventory department');

NOTIFY pgrst, 'reload schema';
