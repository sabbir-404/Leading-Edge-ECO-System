-- 051_add_customizable_orders.sql
-- Add customization fields to product_model_rules, bill_items, and make_orders

-- 1. Add is_customizable column to product_model_rules
ALTER TABLE product_model_rules ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE;

-- 2. Add customization column to bill_items
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS customization JSONB DEFAULT '{}'::jsonb;

-- 3. Add bill_id, bill_item_id, custom_price, and custom_details to make_orders
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS bill_item_id INTEGER REFERENCES bill_items(id) ON DELETE SET NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS custom_price NUMERIC DEFAULT 0;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS custom_details JSONB DEFAULT '{}'::jsonb;
