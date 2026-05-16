-- Migration 041: Damaged goods workflow
-- Tracks damaged stock separately from usable product stock.

CREATE TABLE IF NOT EXISTS damaged_goods (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source_requisition_id UUID REFERENCES purchase_requisitions(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('PURCHASE_RECEIPT', 'MANUAL')),
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'DAMAGED' CHECK (status IN ('DAMAGED', 'IN_REPAIR', 'REPAIRED', 'WRITTEN_OFF')),
    damage_notes TEXT,
    repair_notes TEXT,
    write_off_notes TEXT,
    reported_by_name TEXT,
    repaired_by_name TEXT,
    written_off_by_name TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    repair_started_at TIMESTAMPTZ,
    repaired_at TIMESTAMPTZ,
    written_off_at TIMESTAMPTZ,
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_damaged_goods_product_id ON damaged_goods(product_id);
CREATE INDEX IF NOT EXISTS idx_damaged_goods_status ON damaged_goods(status);
CREATE INDEX IF NOT EXISTS idx_damaged_goods_requisition ON damaged_goods(source_requisition_id);

ALTER TABLE damaged_goods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to damaged_goods" ON damaged_goods;
CREATE POLICY "Allow anon full access to damaged_goods"
    ON damaged_goods
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage damaged_goods" ON damaged_goods;
CREATE POLICY "Service role can manage damaged_goods"
    ON damaged_goods
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
    ('Damaged Goods Access', 'read_damaged_goods', 'View damaged goods records and damaged stock report.', 'manager', TRUE),
    ('Damaged Goods Transfer', 'manage_damaged_goods', 'Transfer stock to damaged goods, move to repair, repair, or write off.', 'manager', TRUE),
    ('Purchase Requisition Alteration', 'alter_purchase_requisition', 'Admin/director can alter requisition product lines and quantities before purchase.', 'admin', TRUE)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    approver_role = EXCLUDED.approver_role,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

UPDATE user_groups
SET permissions = permissions || jsonb_build_object(
    'read_damaged_goods', TRUE,
    'manage_damaged_goods', TRUE,
    'alter_purchase_requisition', TRUE
)
WHERE LOWER(name) IN ('super admin', 'superadmin', 'admin', 'director department', 'inventory department', 'purchase department');

NOTIFY pgrst, 'reload schema';
