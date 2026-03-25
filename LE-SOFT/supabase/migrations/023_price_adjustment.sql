-- Migration 023: Price Adjustment
-- Adds price_adjustment column to bills and max_price_adjustment policy to companies

-- Allow a flat price adjustment (positive = markup, negative = discount) per bill
ALTER TABLE bills
    ADD COLUMN IF NOT EXISTS price_adjustment NUMERIC DEFAULT 0;

-- Store the superadmin-configured maximum allowed adjustment in company settings
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS max_price_adjustment NUMERIC DEFAULT 0;
