-- Remove anon/PUBLIC from every policy on application tables while preserving
-- authenticated app access and any explicitly service-role-only policies.
DO $policy_hardening$
DECLARE
    policy_row record;
    target_roles text;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname, roles, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    LOOP
        target_roles := 'authenticated';
        IF 'service_role' = ANY(policy_row.roles)
           OR position('service_role' IN COALESCE(policy_row.qual, '') || COALESCE(policy_row.with_check, '')) > 0 THEN
            target_roles := 'authenticated, service_role';
        END IF;

        EXECUTE format(
            'ALTER POLICY %I ON %I.%I TO %s',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename,
            target_roles
        );
    END LOOP;
END;
$policy_hardening$;
