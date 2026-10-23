-- Keep TrueNAS PostgREST schemas aligned with Supabase.
ALTER TABLE public.make_products
    ADD COLUMN IF NOT EXISTS product_drawing_url text;

ALTER TABLE public.make_costing_request_items
    ADD COLUMN IF NOT EXISTS product_drawing_url text;

COMMENT ON COLUMN public.make_products.blueprint_url IS
    'Production blueprint / factory drawing. Visible to furniture designers, admins, and factory managers.';
COMMENT ON COLUMN public.make_products.product_drawing_url IS
    'Customer-facing product drawing. Visible to furniture designers, admins, and salespeople.';
COMMENT ON COLUMN public.make_costing_request_items.blueprint_url IS
    'Production blueprint / factory drawing for the priced request item.';
COMMENT ON COLUMN public.make_costing_request_items.product_drawing_url IS
    'Customer-facing product drawing for the priced request item.';
