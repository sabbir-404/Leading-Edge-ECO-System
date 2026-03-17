-- ═══════════════════════════════════════════════════════════════
--  Migration 018 — MAKE Delivery Date
--  Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add delivery_date column to make_orders
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- Add is_altered flag to bills to facilitate UI highlighting
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_altered BOOLEAN DEFAULT FALSE;
