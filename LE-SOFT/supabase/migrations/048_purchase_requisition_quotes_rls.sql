-- Migration 048: Row Level Security for purchase_requisition_quotes
-- Enables RLS and grants full access to anonymous/desktop users to prevent silent insert blocks.

ALTER TABLE purchase_requisition_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to purchase_requisition_quotes" ON purchase_requisition_quotes;

CREATE POLICY "Allow anon full access to purchase_requisition_quotes"
    ON purchase_requisition_quotes FOR ALL
    USING (true)
    WITH CHECK (true);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
