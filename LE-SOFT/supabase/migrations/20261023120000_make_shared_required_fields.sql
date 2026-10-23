-- Match required relationship/snapshot fields across Cloud and NAS. Current
-- data was checked for NULLs on both databases before applying these rules.
ALTER TABLE public.make_order_alteration_log
    ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE public.make_order_parts
    ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE public.make_order_versions
    ALTER COLUMN snapshot SET NOT NULL,
    ALTER COLUMN created_by SET NOT NULL,
    ALTER COLUMN user_role SET NOT NULL;
