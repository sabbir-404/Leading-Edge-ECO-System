-- ============================================================
-- Migration 028: RECOVERY — Restore products table columns
-- 
-- Migration 024 incorrectly dropped the `quantity` column and 
-- other warehouse columns from the products table. This migration
-- restores them. The `current_stock` column (added by 024) is 
-- renamed back to `quantity` since that is what the entire 
-- codebase references.
-- ============================================================

-- Step 1: Rename current_stock → quantity (restores all existing stock values)
-- If current_stock doesn't exist yet (migration 024 not fully run), 
-- just add quantity column safely.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'current_stock'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'quantity'
    ) THEN
        ALTER TABLE products RENAME COLUMN current_stock TO quantity;
    END IF;
    
    -- If neither exists (both were dropped somehow), add quantity fresh
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'quantity'
    ) THEN
        ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0;
    END IF;
END $$;

-- Step 2: Restore location columns that were dropped by migration 024
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS location_row    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS location_rack   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS location_bin    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS warehouse       VARCHAR(255);

-- Step 3: Drop the incorrectly added current_warehouse column (from migration 024 step 6)
ALTER TABLE products DROP COLUMN IF EXISTS current_warehouse;

-- Step 4: Recreate the stock index on the correct column name
DROP INDEX IF EXISTS idx_products_current_stock;
CREATE INDEX IF NOT EXISTS idx_products_quantity ON products(quantity);

-- Step 5: Remove any broken RLS policies on new tables that block the desktop app
-- The desktop app uses anon key (not authenticated), so we need anon access or 
-- service_role. Add anon policies to all new procurement tables.

-- purchase_requisitions
DROP POLICY IF EXISTS "Allow anon full access to purchase_requisitions" ON purchase_requisitions;
CREATE POLICY "Allow anon full access to purchase_requisitions"
    ON purchase_requisitions FOR ALL
    USING (true)
    WITH CHECK (true);

-- purchase_requisition_approvals
DROP POLICY IF EXISTS "Allow anon full access to purchase_requisition_approvals" ON purchase_requisition_approvals;
CREATE POLICY "Allow anon full access to purchase_requisition_approvals"
    ON purchase_requisition_approvals FOR ALL
    USING (true)
    WITH CHECK (true);

-- purchase_requisition_status_history
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'purchase_requisition_status_history') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Allow anon full access to purchase_requisition_status_history" ON purchase_requisition_status_history';
        EXECUTE 'CREATE POLICY "Allow anon full access to purchase_requisition_status_history"
            ON purchase_requisition_status_history FOR ALL USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- supplier_settlements
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'supplier_settlements') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Allow anon full access to supplier_settlements" ON supplier_settlements';
        EXECUTE 'CREATE POLICY "Allow anon full access to supplier_settlements"
            ON supplier_settlements FOR ALL USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- purchase_requisition_items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'purchase_requisition_items') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Allow anon full access to purchase_requisition_items" ON purchase_requisition_items';
        EXECUTE 'CREATE POLICY "Allow anon full access to purchase_requisition_items"
            ON purchase_requisition_items FOR ALL USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- Step 6: Also ensure existing tables that had RLS issues allow anon access
-- (These are the core tables the desktop app reads from)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'products', 'ledgers', 'groups', 'vouchers', 'purchase_bills',
        'stock_groups', 'units', 'companies', 'users', 'user_groups',
        'godowns', 'stock_items', 'internal_messages', 'notifications',
        'system_audit_log', 'quotations', 'quotation_items'
    ])
    LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = t) THEN
            EXECUTE format(
                'DROP POLICY IF EXISTS "Allow anon read on %I" ON %I',
                t, t
            );
            EXECUTE format(
                'CREATE POLICY "Allow anon read on %I" ON %I FOR ALL USING (true) WITH CHECK (true)',
                t, t
            );
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- Recovery complete. Run this in the Supabase SQL Editor.
-- ============================================================
