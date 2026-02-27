-- Migration 005_rls_security.sql
-- Enables Row Level Security (RLS) on all tables and links Supabase Auth

-- 1. Link public.users to auth.users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE; -- maps to auth.users.id

-- Create an index for fast lookups by auth_id
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- 2. Function to automatically create a public.users record when a new user signs up in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_id, username, full_name, role, email, password_hash)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    COALESCE(new.raw_user_meta_data->>'full_name', ''), 
    COALESCE(new.raw_user_meta_data->>'role', 'operator'), 
    new.email,
    'managed_by_supabase_auth'
  )
  ON CONFLICT (username) DO UPDATE SET auth_id = EXCLUDED.auth_id;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to fire the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 3. ENABLE ROW LEVEL SECURITY RECURSIVELY
-- ==============================================================================

-- Core
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_license ENABLE ROW LEVEL SECURITY;

-- HRM
ALTER TABLE hrm_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrm_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrm_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrm_payroll ENABLE ROW LEVEL SECURITY;

-- CRM
ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tracking ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- 4. RLS POLICIES (Strict Lock Down)
-- ==============================================================================
-- Note: As the admin of this desktop app, we grant authenticated users full CRUD.
-- Mobile app specific granular policies will be applied later based on role.

-- Users Table
CREATE POLICY "Authenticated users can read users" ON users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage users" ON users FOR ALL USING (auth.jwt()->>'role' = 'admin');

-- System Wide Fallback (If logged in, they are trusted staff members for most operational tables)
-- In a real hardened scenario, we would split these by user role ('admin' vs 'operator').
-- For LE-SOFT, any authenticated employee operates the system.

CREATE POLICY "Allow authenticated full access to HRM Employees" ON hrm_employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to HRM Attendance" ON hrm_attendance FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to HRM Leaves" ON hrm_leaves FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to HRM Payroll" ON hrm_payroll FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to CRM Customers" ON crm_customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to CRM Tracking" ON crm_tracking FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read access companies" ON companies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access user_groups" ON user_groups FOR SELECT USING (auth.role() = 'authenticated');
