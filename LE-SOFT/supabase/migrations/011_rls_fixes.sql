-- Migration 011_rls_fixes.sql
-- Fixes overly restrictive RLS policies that block authenticated admins/superadmins
-- from creating users, user groups, and updating their profiles via the desktop app.

-- 1. users table
DROP POLICY IF EXISTS "Admins can manage users" ON users;
CREATE POLICY "Allow authenticated full access to users" ON users FOR ALL USING (auth.role() = 'authenticated');

-- 2. user_groups table (currently only has SELECT)
DROP POLICY IF EXISTS "Allow authenticated read access user_groups" ON user_groups;
CREATE POLICY "Allow authenticated full access to user_groups" ON user_groups FOR ALL USING (auth.role() = 'authenticated');

-- 3. companies table
DROP POLICY IF EXISTS "Allow authenticated read access companies" ON companies;
CREATE POLICY "Allow authenticated full access to companies" ON companies FOR ALL USING (auth.role() = 'authenticated');

-- 4. app_license table (if RLS is enabled, ensure policies exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_license' AND policyname = 'Allow authenticated full access to app_license'
    ) THEN
        CREATE POLICY "Allow authenticated full access to app_license" ON app_license FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END
$$;
