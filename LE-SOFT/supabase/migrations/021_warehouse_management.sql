-- Migration 021_warehouse_management.sql
-- Adds structured location grid to Godowns and storage coordinates to Products

-- Add grid dimensions to godowns
ALTER TABLE godowns 
    ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS racks_per_row INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bins_per_rack INTEGER DEFAULT 0;

-- Add location coordinates to products
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS location_row INTEGER,
    ADD COLUMN IF NOT EXISTS location_rack INTEGER,
    ADD COLUMN IF NOT EXISTS location_bin INTEGER;
