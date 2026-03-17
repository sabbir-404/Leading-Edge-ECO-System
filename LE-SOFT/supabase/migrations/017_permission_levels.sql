-- Migration 017: Permission Levels Table
-- Creates the permission_levels table for feature-based approval workflows.
-- Each row defines a feature that requires approval and who must approve.

CREATE TABLE IF NOT EXISTS permission_levels (
    id              SERIAL PRIMARY KEY,
    feature_name    TEXT NOT NULL,
    feature_key     TEXT NOT NULL UNIQUE,
    description     TEXT,
    approver_role   TEXT,       -- e.g. 'admin', 'manager', 'superadmin' (used if approver_user_id is null)
    approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default permission levels for common features
INSERT INTO permission_levels (feature_name, feature_key, description, approver_role, is_active)
VALUES
    ('Bill Alteration', 'bill_alteration', 'When a billing operator alters a finalized bill', 'admin', TRUE),
    ('MAKE Order Placement', 'make_order_placed', 'When a new manufacturing/make order is placed', 'manager', TRUE),
    ('MAKE Order Status Change', 'make_order_status', 'When the status of a MAKE order is updated to a critical stage', 'manager', FALSE),
    ('Discount Override', 'discount_override', 'When a discount exceeds the standard limit during billing', 'admin', FALSE),
    ('Customer Refund / Exchange', 'customer_refund', 'When a refund or product exchange is initiated', 'admin', FALSE),
    ('Payroll Generation', 'payroll_generation', 'When monthly payroll is generated for employees', 'superadmin', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
