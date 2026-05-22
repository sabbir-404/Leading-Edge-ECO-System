-- Migration 047: Add product_id and unit_price to purchase_requisition_quotes
ALTER TABLE purchase_requisition_quotes
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2);

-- Migrate existing estimated_price to unit_price (they were the same)
UPDATE purchase_requisition_quotes SET unit_price = estimated_price WHERE unit_price IS NULL;

NOTIFY pgrst, 'reload schema';
