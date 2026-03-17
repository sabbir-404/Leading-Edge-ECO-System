-- LE-SOFT Phase 15 Enterprise Features Migration

-- 1. License Table Binding
ALTER TABLE app_license 
ADD COLUMN IF NOT EXISTS bound_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 2. User Session Tracking & Access Control
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS device_type VARCHAR(50), -- e.g., 'PC', 'Phone', 'Web'
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS force_logout BOOLEAN DEFAULT FALSE;

-- Update existing user_groups to support the new JSON permissions structure
-- Pre-fill everyone's groups with some default truthy values so existing features don't break immediately
UPDATE user_groups
SET permissions = jsonb_build_object(
    'can_create_user', true,
    'can_delete_user', true,
    'can_edit_user', true,
    'can_edit_groups', true,
    'can_create_bill', true,
    'can_alter_bill', true,
    'can_delete_bill', true,
    'can_create_order', true,
    'can_alter_order', true,
    'can_view_payroll', true,
    'can_approve_leave', true
)
WHERE jsonb_typeof(permissions::jsonb) IS NULL OR permissions::text = '{}';

-- Create a function to auto-update last_active_at whenever is_online changes
CREATE OR REPLACE FUNCTION update_user_session()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_online = TRUE OR NEW.is_online = FALSE THEN
        NEW.last_active_at = timezone('utc'::text, now());
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_user_session ON users;
CREATE TRIGGER trg_update_user_session
    BEFORE UPDATE ON users
    FOR EACH ROW
    WHEN (OLD.is_online IS DISTINCT FROM NEW.is_online)
    EXECUTE FUNCTION update_user_session();
