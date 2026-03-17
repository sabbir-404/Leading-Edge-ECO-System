-- ═══════════════════════════════════════════════════════════════
--  Migration 020 — MAKE Salesman Approval Workflow
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure 'Salesman' group exists
INSERT INTO user_groups (name, description, permissions)
VALUES ('Salesman', 'Responsible for approving and managing sales orders', '{"masters":false,"vouchers":false,"inventory":false,"users":false,"settings":false,"website":false,"reports":true}')
ON CONFLICT (name) DO NOTHING;

-- 2. Add salesman_id and is_approved to make_orders
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS salesman_id INTEGER REFERENCES users(id);
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- 3. Update existing orders to be auto-approved (optional, but good for consistency)
UPDATE make_orders SET is_approved = TRUE WHERE status != 'Pending Approval' AND is_approved = FALSE;
