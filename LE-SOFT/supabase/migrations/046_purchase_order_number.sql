-- Migration 046: Add purchase_order_number column to purchase_requisitions
ALTER TABLE purchase_requisitions 
    ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(255);

NOTIFY pgrst, 'reload schema';
