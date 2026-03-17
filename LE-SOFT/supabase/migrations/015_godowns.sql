-- Migration 015_godowns.sql
-- Adds Godowns (Warehouses) and links them to products

CREATE TABLE IF NOT EXISTS godowns (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company_id INTEGER REFERENCES companies(id)
);

-- Link products to godowns
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES godowns(id);
