-- Migration 034: Keep Super Admin user group description readable
-- Earlier desktop seeding encrypted this structural description. Store it plainly like
-- the other user group descriptions so the user group page can display and edit it.

UPDATE user_groups
SET description = 'Full administrative access to all features. Super Admin only.'
WHERE name = 'Super Admin';

NOTIFY pgrst, 'reload schema';
