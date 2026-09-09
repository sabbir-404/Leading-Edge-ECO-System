-- Akeneo PIM & Saleor Inspired Furniture Catalog Expansion Schema

-- 1. Product Variants (Wood Finish, Fabric Color, Dimensions, SKU, Stock)
CREATE TABLE IF NOT EXISTS product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    variant_title VARCHAR(150) NOT NULL, -- e.g. "Oak / 6ft / Blue Fabric"
    wood_finish VARCHAR(50),            -- e.g. "Natural Oak", "Dark Walnut"
    fabric_color VARCHAR(50),           -- e.g. "Mermaid Blue", "Charcoal Gray"
    size_dimensions VARCHAR(50),        -- e.g. "6ft", "8ft", "King Size"
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Product Documents & Technical Drawings (CAD, Manuals, Warranties)
CREATE TABLE IF NOT EXISTS product_documents (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL, -- 'CAD_DRAWING', 'ASSEMBLY_MANUAL', 'WARRANTY_PDF'
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Product Relationships (Cross-Selling & Recommendations)
CREATE TABLE IF NOT EXISTS product_relationships (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    related_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) DEFAULT 'COMPATIBLE_SET', -- 'COMPATIBLE_SET', 'MATCHING_SIDEBOARD', 'SIMILAR'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variant_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_doc_product ON product_documents(product_id);
