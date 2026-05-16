-- Migration 042: Low stock alerts and actionable notifications
-- Adds per-product low stock thresholds and route metadata for dynamic notification clicks.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(14, 3) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS low_stock_alert_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS action_path TEXT,
    ADD COLUMN IF NOT EXISTS action_label TEXT,
    ADD COLUMN IF NOT EXISTS notification_key TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE notifications
    ALTER COLUMN is_read DROP DEFAULT;

ALTER TABLE notifications
    ALTER COLUMN is_read TYPE BOOLEAN
    USING CASE
        WHEN is_read::TEXT IN ('1', 'true', 't', 'yes', 'y') THEN TRUE
        ELSE FALSE
    END,
    ALTER COLUMN is_read SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_action_path
    ON notifications(action_path);

CREATE INDEX IF NOT EXISTS idx_notifications_key
    ON notifications(notification_key)
    WHERE notification_key IS NOT NULL;

INSERT INTO permission_levels (
    feature_name,
    feature_key,
    description,
    approver_role,
    is_active
)
VALUES
    (
        'Low Stock Alert Management',
        'manage_low_stock_alerts',
        'Set product low-stock thresholds and receive low-stock alerts.',
        'manager',
        TRUE
    )
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    approver_role = EXCLUDED.approver_role,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

UPDATE user_groups
SET permissions = permissions || jsonb_build_object(
    'manage_low_stock_alerts', TRUE
)
WHERE LOWER(name) IN ('super admin', 'superadmin', 'admin', 'inventory department', 'store head');

-- Damaged stock transfer is operational inventory control. Keep broad view access,
-- but remove transfer/update rights from departments that should only inspect records.
UPDATE user_groups
SET permissions = permissions - 'manage_damaged_goods'
WHERE LOWER(name) NOT IN ('super admin', 'superadmin', 'admin', 'inventory department', 'inventory manager', 'store head');

UPDATE user_groups
SET permissions = permissions || jsonb_build_object(
    'read_damaged_goods', TRUE,
    'manage_damaged_goods', TRUE
)
WHERE LOWER(name) IN ('super admin', 'superadmin', 'admin', 'inventory department', 'inventory manager', 'store head');

NOTIFY pgrst, 'reload schema';
