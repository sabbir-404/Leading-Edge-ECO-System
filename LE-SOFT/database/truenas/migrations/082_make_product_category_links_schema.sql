-- The application and Supabase use this normalized join table for product
-- categories. TrueNAS was missing it, so catalog category writes could never
-- be mirrored there. Preserve existing catalog rows; this is additive.
BEGIN;

CREATE TABLE IF NOT EXISTS public.make_product_category_links (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES public.make_products(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES public.make_product_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT make_product_category_links_product_id_category_id_key
        UNIQUE (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_make_category_links_product_id
    ON public.make_product_category_links (product_id);
CREATE INDEX IF NOT EXISTS idx_make_category_links_category_id
    ON public.make_product_category_links (category_id);

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.make_product_category_links TO nas_authenticated;
GRANT USAGE, SELECT
    ON SEQUENCE public.make_product_category_links_id_seq TO nas_authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
