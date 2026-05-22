-- ============================================================
-- Migration 049: Add purchased_quantity to purchase_requisition_items
-- ============================================================

ALTER TABLE purchase_requisition_items ADD COLUMN IF NOT EXISTS purchased_quantity INTEGER;

-- Set default purchased_quantity to quantity for existing rows
UPDATE purchase_requisition_items SET purchased_quantity = quantity WHERE purchased_quantity IS NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
