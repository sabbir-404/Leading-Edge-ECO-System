-- Migration 038: Product model/attribute RLS policies
-- The Electron app writes these tables through Supabase, so they need explicit
-- policies just like the older master-data tables.

ALTER TABLE IF EXISTS product_model_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to product_model_rules" ON product_model_rules;
CREATE POLICY "Allow anon full access to product_model_rules"
    ON product_model_rules
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access to product_attributes" ON product_attributes;
CREATE POLICY "Allow anon full access to product_attributes"
    ON product_attributes
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access to product_attribute_values" ON product_attribute_values;
CREATE POLICY "Allow anon full access to product_attribute_values"
    ON product_attribute_values
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage product_model_rules" ON product_model_rules;
CREATE POLICY "Service role can manage product_model_rules"
    ON product_model_rules
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage product_attributes" ON product_attributes;
CREATE POLICY "Service role can manage product_attributes"
    ON product_attributes
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage product_attribute_values" ON product_attribute_values;
CREATE POLICY "Service role can manage product_attribute_values"
    ON product_attribute_values
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
