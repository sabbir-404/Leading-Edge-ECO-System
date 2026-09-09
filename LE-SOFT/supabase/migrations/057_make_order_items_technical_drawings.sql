-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 057 — Individual Product Technical Drawings & Designer Pricing
-- Enables individual technical drawing attachments and designer pricing per catalog product
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ensure make_order_items has individual technical drawing and pricing columns
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS technical_drawing_url TEXT;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS pdf_urls TEXT[] DEFAULT '{}'::text[];
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS designer_notes TEXT;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS item_cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS item_sale_price NUMERIC(14,2) NULL;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS is_customized BOOLEAN DEFAULT FALSE;
ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS custom_dimensions TEXT;

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_make_order_items_order_id ON make_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_product_id ON make_order_items(product_id);

-- 3. Grant permissions
GRANT ALL ON make_order_items TO anon, authenticated, service_role;
