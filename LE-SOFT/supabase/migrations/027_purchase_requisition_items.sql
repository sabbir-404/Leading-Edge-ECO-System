-- ============================================================
-- Migration 027: Purchase requisition line items
-- Stores multiple products per requisition.
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL DEFAULT 1,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_unit VARCHAR(50) NOT NULL DEFAULT 'piece',
    remarks TEXT,
    company_id INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_items_requisition_id ON purchase_requisition_items(requisition_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_product_id ON purchase_requisition_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_company_id ON purchase_requisition_items(company_id);

ALTER TABLE purchase_requisition_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to purchase_requisition_items"
    ON purchase_requisition_items FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage purchase_requisition_items"
    ON purchase_requisition_items FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');