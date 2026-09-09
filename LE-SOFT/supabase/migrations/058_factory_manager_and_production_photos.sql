-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 058 — Factory Manager User Group, Stage Photos & Notifications
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create 'Factory Manager' User Group
INSERT INTO user_groups (name, description, permissions)
VALUES (
    'Factory Manager',
    'Responsible for workshop production progress, stage transitions, and stage photo uploads for approved furniture orders.',
    '{"make":true,"read_make":true,"update_production_status":true,"upload_production_photos":true,"access_make_sales_portal":true}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- 2. Enhance make_order_updates with photo_url, photo_urls, and stage
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}'::text[];
ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS stage TEXT;

-- 3. Enhance make_orders with factory manager and current stage photo
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS factory_manager_id BIGINT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS factory_manager_name TEXT;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_stage_photo TEXT;

-- 4. Indexes for fast status history and notification lookups
CREATE INDEX IF NOT EXISTS idx_make_order_updates_order_id ON make_order_updates(order_id);
CREATE INDEX IF NOT EXISTS idx_make_order_updates_created_at ON make_order_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 5. Grant permissions
GRANT ALL ON make_order_updates TO anon, authenticated, service_role;
GRANT ALL ON make_orders TO anon, authenticated, service_role;
GRANT ALL ON notifications TO anon, authenticated, service_role;
GRANT ALL ON user_groups TO anon, authenticated, service_role;
GRANT ALL ON users TO anon, authenticated, service_role;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
