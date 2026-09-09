-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 052 — MAKE WordPress Sales Portal & Customized Product Database
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. MAKE Customized Product Catalog
CREATE TABLE IF NOT EXISTS make_products (
    id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    main_image TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_products_code ON make_products(product_code);
CREATE INDEX IF NOT EXISTS idx_make_products_active ON make_products(is_active);

-- 2. Product Specifications (Multiple specs per product)
CREATE TABLE IF NOT EXISTS make_product_specifications (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    spec_code VARCHAR(50),
    spec_name VARCHAR(255) NOT NULL,
    spec_details TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_specs_product_id ON make_product_specifications(product_id);

-- 3. Product Sizes & Dimensions (Supports Rectangular L/W/H or Round Diameter)
CREATE TABLE IF NOT EXISTS make_product_sizes (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES make_products(id) ON DELETE CASCADE,
    spec_id BIGINT REFERENCES make_product_specifications(id) ON DELETE SET NULL,
    size_label VARCHAR(255) NULL,
    length NUMERIC(10,2) NULL,
    width NUMERIC(10,2) NULL,
    height NUMERIC(10,2) NULL,
    diameter NUMERIC(10,2) NULL,
    unit VARCHAR(20) DEFAULT 'mm',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_sizes_product_id ON make_product_sizes(product_id);
CREATE INDEX IF NOT EXISTS idx_make_sizes_spec_id ON make_product_sizes(spec_id);

-- 4. Product Colors & Finishes
CREATE TABLE IF NOT EXISTS make_product_colors (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES make_products(id) ON DELETE CASCADE,
    spec_id BIGINT REFERENCES make_product_specifications(id) ON DELETE SET NULL,
    color_name VARCHAR(100) NOT NULL,
    color_code VARCHAR(50),
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_colors_product_id ON make_product_colors(product_id);
CREATE INDEX IF NOT EXISTS idx_make_colors_spec_id ON make_product_colors(spec_id);

-- 5. Product Image Gallery
CREATE TABLE IF NOT EXISTS make_product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES make_products(id) ON DELETE CASCADE,
    spec_id BIGINT REFERENCES make_product_specifications(id) ON DELETE SET NULL,
    color_id BIGINT REFERENCES make_product_colors(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_make_images_product_id ON make_product_images(product_id);

-- 6. Enhanced MAKE Orders Table
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50) UNIQUE;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS delivery_city TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS location_landmark TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS receiver_phone TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2) NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_version INT DEFAULT 1;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'awaiting_designer';
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_version INT NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100) NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS salesperson_wp_id BIGINT NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(100) NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_make_orders_salesperson_wp_id ON make_orders(salesperson_wp_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_approval_status ON make_orders(approval_status);

-- 7. MAKE Order Items (Multi-Product Orders)
CREATE TABLE IF NOT EXISTS make_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES make_products(id) ON DELETE SET NULL,
    spec_id BIGINT REFERENCES make_product_specifications(id) ON DELETE SET NULL,
    size_id BIGINT REFERENCES make_product_sizes(id) ON DELETE SET NULL,
    color_id BIGINT REFERENCES make_product_colors(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    spec_name VARCHAR(255),
    size_label VARCHAR(255),
    color_name VARCHAR(100),
    quantity NUMERIC(10,2) DEFAULT 1,
    salesperson_note TEXT,
    item_cost_price NUMERIC(14,2) DEFAULT 0.00,
    item_sale_price NUMERIC(14,2) NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_order_items_order_id ON make_order_items(order_id);

-- 8. Order Versions (Full Snapshots for Diff & Re-Approval)
CREATE TABLE IF NOT EXISTS make_order_versions (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    snapshot JSONB NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_order_versions_order_id ON make_order_versions(order_id);

-- 9. Order Approvals Audit Log
CREATE TABLE IF NOT EXISTS make_order_approvals (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'approved', 'rejected'
    acted_by VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    notes_or_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_order_approvals_order_id ON make_order_approvals(order_id);

-- 10. Update & Seed Standard User Groups & Permissions
INSERT INTO user_groups (name, description, permissions)
VALUES 
(
  'Furniture Designer', 
  'Responsible for reviewing custom specifications, setting cost prices, and engineering drawings',
  '{"masters":true,"vouchers":false,"inventory":true,"users":false,"settings":false,"website":false,"reports":true,"read_make":true,"write_make":true,"alter_make":true,"read_make_catalog":true,"write_make_catalog":true,"set_make_cost_price":true,"set_make_sale_price":true}'
),
(
  'Salesperson', 
  'Showroom and field sales personnel with WordPress Sales Portal access',
  '{"masters":false,"vouchers":false,"inventory":false,"users":false,"settings":false,"website":false,"reports":false,"read_make":true,"write_make":true,"access_make_sales_portal":true,"approve_make_order":true}'
)
ON CONFLICT (name) DO UPDATE SET 
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;
