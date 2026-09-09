-- PostgreSQL pgvector AI Semantic Vector Search Migration

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS description_embedding vector(1536);

-- 3. Create Cosine Distance Vector Index
CREATE INDEX IF NOT EXISTS idx_products_embedding 
ON products USING ivfflat (description_embedding vector_cosine_ops) 
WITH (lists = 100);

-- 4. RPC Function for AI Semantic Product Matching
CREATE OR REPLACE FUNCTION match_products_semantically(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id bigint,
    name varchar,
    sku varchar,
    selling_price numeric,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        p.selling_price,
        1 - (p.description_embedding <=> query_embedding) AS similarity
    FROM products p
    WHERE p.description_embedding IS NOT NULL
      AND 1 - (p.description_embedding <=> query_embedding) >= match_threshold
    ORDER BY p.description_embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
