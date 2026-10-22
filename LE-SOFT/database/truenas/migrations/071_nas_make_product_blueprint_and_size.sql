-- Add the MAKE catalog fields used by product create/update in LE-SOFT 1.8.13.
-- This is additive and safe to apply more than once.

BEGIN;

ALTER TABLE public.make_products
    ADD COLUMN IF NOT EXISTS blueprint_url TEXT;

ALTER TABLE public.make_products
    ADD COLUMN IF NOT EXISTS size_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.make_products'::regclass
          AND conname = 'make_products_size_id_fkey'
    ) THEN
        ALTER TABLE public.make_products
            ADD CONSTRAINT make_products_size_id_fkey
            FOREIGN KEY (size_id)
            REFERENCES public.make_product_sizes(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_make_products_size_id
    ON public.make_products(size_id);

DO $$
BEGIN
    IF to_regclass('public.make_product_size_links') IS NOT NULL THEN
        UPDATE public.make_products AS p
        SET size_id = (
            SELECT l.size_id
            FROM public.make_product_size_links AS l
            WHERE l.product_id = p.id
            ORDER BY l.id
            LIMIT 1
        )
        WHERE p.size_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM public.make_product_size_links AS l
              WHERE l.product_id = p.id
          );
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
