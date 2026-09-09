-- 054_make_custom_size_and_dates.sql
-- Add requested_delivery_date and target_delivery_date to make_orders
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS requested_delivery_date DATE;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS target_delivery_date DATE;

-- Add is_customized, custom_dimensions, and customization to make_order_items
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS is_customized BOOLEAN DEFAULT FALSE;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS custom_dimensions TEXT;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS customization JSONB DEFAULT '{}'::jsonb;
