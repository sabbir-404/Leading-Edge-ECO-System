-- Trigger-only MAKE functions must not be exposed as client-callable RPCs.
REVOKE ALL ON FUNCTION public.log_make_deletion_tombstone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_make_catalog_updated_at() FROM PUBLIC, anon, authenticated;

-- Pin trigger helper lookup to trusted schemas and qualify referenced tables.
CREATE OR REPLACE FUNCTION public.fn_sync_make_product_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        SELECT c.name INTO NEW.category
        FROM public.make_product_categories AS c
        WHERE c.id = NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_make_product_category_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.name IS DISTINCT FROM NEW.name THEN
        UPDATE public.make_products
        SET category = NEW.name
        WHERE category_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;
