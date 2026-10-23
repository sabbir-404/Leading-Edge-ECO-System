-- Persist the global product category selected during requestion costing.
ALTER TABLE public.make_costing_request_items
    ADD COLUMN IF NOT EXISTS category_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'make_costing_request_items_category_id_fkey'
          AND conrelid = 'public.make_costing_request_items'::regclass
    ) THEN
        ALTER TABLE public.make_costing_request_items
            ADD CONSTRAINT make_costing_request_items_category_id_fkey
            FOREIGN KEY (category_id)
            REFERENCES public.make_product_categories(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_make_costing_request_items_category_id
    ON public.make_costing_request_items(category_id)
    WHERE category_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.make_costing_request_items TO nas_authenticated;
NOTIFY pgrst, 'reload schema';
