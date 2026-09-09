-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 056 — MAKE Portal Supabase Text-Only Backup Schema
-- Safe, idempotent migration to create text-only mirror tables in Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ensure make_orders has all text columns
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(100) UNIQUE;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS location_landmark TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS receiver_phone TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS target_delivery_date DATE;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS requested_delivery_date DATE;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2) NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_version INT DEFAULT 1;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'awaiting_designer';
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_version INT NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100) NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS salesman_id BIGINT NULL;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_make_orders_order_number ON make_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_make_orders_approval_status ON make_orders(approval_status);

-- 2. Text-Only Products Table
CREATE TABLE IF NOT EXISTS make_products (
    id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    main_image TEXT, -- Remote URL reference only, never base64
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_products_code ON make_products(product_code);
CREATE INDEX IF NOT EXISTS idx_make_products_active ON make_products(is_active);

-- 3. Product Specifications
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

-- 4. Product Sizes & Dimensions
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

-- 5. Product Colors & Finishes
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

-- 6. MAKE Order Items (Multi-Product Orders)
CREATE TABLE IF NOT EXISTS make_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    product_id BIGINT NULL,
    spec_id BIGINT NULL,
    size_id BIGINT NULL,
    color_id BIGINT NULL,
    product_name VARCHAR(255) NOT NULL,
    spec_name VARCHAR(255) NULL,
    size_label VARCHAR(255) NULL,
    color_name VARCHAR(100) NULL,
    quantity INT DEFAULT 1,
    salesperson_note TEXT NULL,
    item_cost_price NUMERIC(14,2) DEFAULT 0.00,
    item_sale_price NUMERIC(14,2) NULL,
    is_customized BOOLEAN DEFAULT FALSE,
    custom_dimensions TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_order_items_order_id ON make_order_items(order_id);

-- 7. MAKE Order Versions (Audit Diff Log)
CREATE TABLE IF NOT EXISTS make_order_versions (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    cost_price NUMERIC(14,2) NULL,
    sale_price NUMERIC(14,2) NULL,
    changed_by VARCHAR(100) NOT NULL,
    changes_diff JSONB NOT NULL,
    version_notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_make_order_versions_order_id ON make_order_versions(order_id);

-- Grant full permissions to authenticated and anon roles for Supabase PostgREST
GRANT ALL ON make_orders TO anon, authenticated, service_role;
GRANT ALL ON make_products TO anon, authenticated, service_role;
GRANT ALL ON make_product_specifications TO anon, authenticated, service_role;
GRANT ALL ON make_product_sizes TO anon, authenticated, service_role;
GRANT ALL ON make_product_colors TO anon, authenticated, service_role;
GRANT ALL ON make_order_items TO anon, authenticated, service_role;
GRANT ALL ON make_order_versions TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
