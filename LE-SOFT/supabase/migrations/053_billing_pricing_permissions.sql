-- Migration 053: Billing Pricing Permissions and Custom Line Items
-- Adds cost_price, customization, and notes to bill_items

ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS customization JSONB DEFAULT '{}'::jsonb;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS item_cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS item_sale_price NUMERIC(14,2);

ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2);
