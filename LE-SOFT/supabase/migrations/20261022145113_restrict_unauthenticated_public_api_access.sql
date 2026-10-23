-- Restrict the public PostgREST surface to authenticated application sessions.
-- The desktop app signs in through Supabase Auth before reading application data;
-- the WordPress portal uses its server-side service role for its database calls.
-- The publishable key alone must not grant access to business or user records.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

-- Preserve the app's existing authenticated CRUD behavior and trusted backend access.
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Remove default public RPC exposure while retaining functions for authenticated
-- application clients and the privileged server-side integrations.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Trigger-only functions should not be callable as public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.generate_employee_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_exchange_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_quote_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_requisition_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_session() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_make_product_category() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_make_product_category_rename() FROM anon, authenticated;

-- Prevent future public-schema objects from automatically inheriting public access.
REVOKE CREATE ON SCHEMA public FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- Pin search paths for functions that previously relied on the caller's path.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_employee_code() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_exchange_number() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_quote_number() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_requisition_number() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_user_session() SET search_path = pg_catalog, public, pg_temp;
