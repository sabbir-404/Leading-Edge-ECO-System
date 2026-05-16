-- Migration 035: User group active flag
-- Allows administrators to temporarily disable a user group without deleting it.

ALTER TABLE user_groups
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

UPDATE user_groups
SET is_active = TRUE
WHERE is_active IS NULL;

ALTER TABLE user_groups
    ALTER COLUMN is_active SET DEFAULT TRUE,
    ALTER COLUMN is_active SET NOT NULL;

NOTIFY pgrst, 'reload schema';
