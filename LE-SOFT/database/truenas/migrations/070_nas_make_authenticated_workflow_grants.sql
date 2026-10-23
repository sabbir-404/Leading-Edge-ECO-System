-- Restore the least-privilege NAS role permissions required by MAKE workflows.
-- Apply to the active LE-SOFT PostgreSQL database (not the unused TrueNAS
-- catalog Postgres app). Missing optional tables are skipped safely.

BEGIN;

DO $$
DECLARE
    item RECORD;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('make_product_specification_links', 'SELECT, INSERT, UPDATE, DELETE'),
            ('make_product_size_links', 'SELECT, INSERT, UPDATE, DELETE'),
            ('make_product_color_links', 'SELECT, INSERT, UPDATE, DELETE'),
            ('make_product_images', 'SELECT'),
            ('make_order_parts', 'SELECT, INSERT, UPDATE, DELETE'),
            ('make_order_alteration_log', 'SELECT, INSERT, UPDATE, DELETE'),
            ('make_order_approvals', 'SELECT, INSERT, UPDATE, DELETE')
        ) AS grants(table_name, privileges)
    LOOP
        IF to_regclass(format('public.%I', item.table_name)) IS NOT NULL THEN
            EXECUTE format(
                'GRANT %s ON TABLE public.%I TO nas_authenticated',
                item.privileges,
                item.table_name
            );
        ELSE
            RAISE NOTICE 'Skipping missing MAKE table: public.%', item.table_name;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
