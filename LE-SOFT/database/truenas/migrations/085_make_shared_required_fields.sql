-- Match NOT NULL rules used by the Cloud schema. NULL checks confirmed there
-- are no rows to rewrite before applying these constraints.
BEGIN;

ALTER TABLE public.make_orders
    ALTER COLUMN designer_name SET NOT NULL;
ALTER TABLE public.make_product_colors
    ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.make_product_specifications
    ALTER COLUMN updated_at SET NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
