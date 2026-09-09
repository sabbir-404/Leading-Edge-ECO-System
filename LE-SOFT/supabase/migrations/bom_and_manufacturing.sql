-- Bill of Materials (BOM) & Manufacturing Engine Schema

-- 1. Bill of Materials (BOM Master)
CREATE TABLE IF NOT EXISTS bom (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    bom_name VARCHAR(150) NOT NULL,
    estimated_labor_hours NUMERIC(8, 2) DEFAULT 0.00,
    labor_cost_per_hour NUMERIC(12, 2) DEFAULT 0.00,
    overhead_cost NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BOM Item Components (Raw Materials Breakdown)
CREATE TABLE IF NOT EXISTS bom_items (
    id BIGSERIAL PRIMARY KEY,
    bom_id BIGINT NOT NULL REFERENCES bom(id) ON DELETE CASCADE,
    material_product_id BIGINT NOT NULL REFERENCES products(id),
    quantity NUMERIC(12, 2) NOT NULL,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs'
);

CREATE INDEX IF NOT EXISTS idx_bom_product ON bom(product_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_bom ON bom_items(bom_id);
