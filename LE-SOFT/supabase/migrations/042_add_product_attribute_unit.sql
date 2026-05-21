-- Migration 042: Add unit to product_attributes
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS unit TEXT;
NOTIFY pgrst, 'reload schema';
