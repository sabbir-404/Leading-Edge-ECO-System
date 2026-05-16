-- Migration 040: Dynamic product origins
-- Product origins are now configurable instead of hard-coded to LOCAL/IMPORTED.
-- Imported remains protected through requires_superadmin.

CREATE TABLE IF NOT EXISTS product_origins (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    origin_key TEXT NOT NULL UNIQUE,
    requires_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO product_origins (name, origin_key, requires_superadmin, is_active, company_id)
VALUES
    ('Local', 'LOCAL', FALSE, TRUE, 1),
    ('Imported', 'IMPORTED', TRUE, TRUE, 1)
ON CONFLICT (origin_key) DO UPDATE SET
    name = EXCLUDED.name,
    requires_superadmin = EXCLUDED.requires_superadmin,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_origin_type_check;
ALTER TABLE product_model_rules DROP CONSTRAINT IF EXISTS product_model_rules_origin_type_check;

ALTER TABLE product_origins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to product_origins" ON product_origins;
CREATE POLICY "Allow anon full access to product_origins"
    ON product_origins
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage product_origins" ON product_origins;
CREATE POLICY "Service role can manage product_origins"
    ON product_origins
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

INSERT INTO permission_levels (
    feature_name,
    feature_key,
    description,
    approver_role,
    is_active
)
VALUES
    ('Product Origin Management', 'manage_product_origins', 'Create and update product origin options used by product model rules.', 'admin', TRUE)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    approver_role = EXCLUDED.approver_role,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

UPDATE user_groups
SET permissions = permissions || jsonb_build_object('manage_product_origins', TRUE)
WHERE LOWER(name) IN ('super admin', 'superadmin', 'admin');

NOTIFY pgrst, 'reload schema';
