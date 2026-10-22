-- MAKE business data must not be writable with the public Supabase anon key.
-- Desktop users authenticate through Supabase Auth; trusted server integrations
-- use service_role. The WordPress plugin must have its server-side service key
-- configured for Supabase failover writes.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname LIKE 'make\_%' ESCAPE '\'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS lesoft_app_access ON public.%I', t.relname);
        EXECUTE format(
            'CREATE POLICY lesoft_app_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            t.relname
        );
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t.relname);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t.relname);
    END LOOP;

    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'S'
          AND c.relname LIKE 'make\_%' ESCAPE '\'
    LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon', t.relname);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated, service_role', t.relname);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
