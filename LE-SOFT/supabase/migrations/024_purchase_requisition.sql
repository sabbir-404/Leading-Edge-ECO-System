-- ============================================================
-- Migration 024: Purchase Requisition Module
-- Creates tables for managing purchase requisitions workflow:
-- Create → Approve → Purchase → Receive → Complete (adds to stock)
-- ============================================================

-- ============================================================
-- 1. Create purchase_requisitions table
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_number VARCHAR(50) UNIQUE NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_unit VARCHAR(50) NOT NULL DEFAULT 'piece', -- 'kg', 'piece', 'box', 'liter', etc.
    priority_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority_level IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PURCHASED', 'RECEIVED', 'COMPLETED')),
    requisition_date TIMESTAMP NOT NULL DEFAULT NOW(),
    required_delivery_date DATE NOT NULL,
    warehouse_location VARCHAR(255), -- Entered when purchased (row/rack/bin format)
    approval_status VARCHAR(50) CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approval_date TIMESTAMP,
    approval_notes TEXT,
    purchased_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    purchase_date TIMESTAMP,
    received_date TIMESTAMP,
    completed_date TIMESTAMP,
    remarks TEXT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_product_id ON purchase_requisitions(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_status ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_approval_status ON purchase_requisitions(approval_status);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_company_id ON purchase_requisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_created_by ON purchase_requisitions(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_approved_by ON purchase_requisitions(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_requisition_number ON purchase_requisitions(requisition_number);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_required_delivery_date ON purchase_requisitions(required_delivery_date);

-- ============================================================
-- 2. Create purchase_requisition_approvals table (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requisition_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    approval_level INTEGER NOT NULL DEFAULT 1, -- 1, 2, 3... for hierarchical approvals
    approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approval_date TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_requisition_id ON purchase_requisition_approvals(requisition_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver_id ON purchase_requisition_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON purchase_requisition_approvals(status);

-- ============================================================
-- 3. Function to generate requisition numbers (auto-increment)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_requisition_number()
RETURNS TRIGGER AS $$
DECLARE
    next_id INT;
    prefix TEXT := 'REQ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-';
BEGIN
    IF NEW.requisition_number IS NULL OR NEW.requisition_number = '' THEN
        -- Get the next ID sequence based on count of records created today
        SELECT COUNT(*) + 1 INTO next_id
        FROM public.purchase_requisitions
        WHERE requisition_number LIKE prefix || '%';
        
        NEW.requisition_number := prefix || LPAD(next_id::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_requisition_number ON purchase_requisitions;
CREATE TRIGGER trg_generate_requisition_number
    BEFORE INSERT ON purchase_requisitions
    FOR EACH ROW
    EXECUTE PROCEDURE generate_requisition_number();

-- ============================================================
-- 4. Enable Row Level Security (RLS)
-- ============================================================
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisition_approvals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (company filtering handled in application)
DROP POLICY IF EXISTS "Allow authenticated full access to purchase_requisitions" ON purchase_requisitions;
CREATE POLICY "Allow authenticated full access to purchase_requisitions"
    ON purchase_requisitions FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated full access to purchase_requisition_approvals" ON purchase_requisition_approvals;
CREATE POLICY "Allow authenticated full access to purchase_requisition_approvals"
    ON purchase_requisition_approvals FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Service role (desktop app) can fully manage
DROP POLICY IF EXISTS "Service role can manage purchase_requisitions" ON purchase_requisitions;
CREATE POLICY "Service role can manage purchase_requisitions"
    ON purchase_requisitions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage purchase_requisition_approvals" ON purchase_requisition_approvals;
CREATE POLICY "Service role can manage purchase_requisition_approvals"
    ON purchase_requisition_approvals FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4.5. Alter created_by column to be nullable (idempotent fix)
-- Required for desktop app where there's no auth context
-- ============================================================
ALTER TABLE purchase_requisitions ALTER COLUMN created_by DROP NOT NULL;

-- ============================================================
-- 5. Modify products table - Remove stock/warehouse columns
-- (These are handled by purchase requisitions now)
-- ============================================================
ALTER TABLE products 
    DROP COLUMN IF EXISTS quantity,
    DROP COLUMN IF EXISTS warehouse,
    DROP COLUMN IF EXISTS location_row,
    DROP COLUMN IF EXISTS location_rack,
    DROP COLUMN IF EXISTS location_bin;

-- ============================================================
-- 6. Update products table to add current_stock (calculated/managed field)
-- This field will be updated when requisitions are completed
-- ============================================================
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS current_stock INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_warehouse VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_products_current_stock ON products(current_stock);

-- ============================================================
-- Migration complete
-- ============================================================
