-- =========================================================================
-- Migration: 017_market_analysis
-- Description: Creates tables for tracking competitor product URLs and
--              storing AI-generated market analysis comparisons.
-- =========================================================================

-- 1. Table for storing competitor URLs mapped to our products
CREATE TABLE IF NOT EXISTS product_competitor_urls (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    competitor_name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by product
CREATE INDEX IF NOT EXISTS idx_competitor_urls_product_id ON product_competitor_urls(product_id);

-- Enable RLS (Assuming admin-only access for now, or authenticated users)
ALTER TABLE product_competitor_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read competitor urls"
    ON product_competitor_urls FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert competitor urls"
    ON product_competitor_urls FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update competitor urls"
    ON product_competitor_urls FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete competitor urls"
    ON product_competitor_urls FOR DELETE
    USING (auth.role() = 'authenticated');


-- 2. Table for storing the AI's market analysis history
CREATE TABLE IF NOT EXISTS market_analysis_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    competitor_name TEXT NOT NULL,
    competitor_price NUMERIC NOT NULL,
    competitor_features TEXT,        -- Summary of competitor offerings
    ai_comparison_insights TEXT,     -- The intelligent markdown output from Gemini
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index to fetch history quickly for a specific product
CREATE INDEX IF NOT EXISTS idx_market_analysis_product_id ON market_analysis_history(product_id);

-- Enable RLS
ALTER TABLE market_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read market analysis"
    ON market_analysis_history FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert market analysis"
    ON market_analysis_history FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete market analysis"
    ON market_analysis_history FOR DELETE
    USING (auth.role() = 'authenticated');
