-- Keep the cloud item table aligned with the order payload emitted by LE-SOFT.
ALTER TABLE public.make_order_items
    ADD COLUMN IF NOT EXISTS technical_drawing_url TEXT,
    ADD COLUMN IF NOT EXISTS pdf_urls TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS designer_notes TEXT;

NOTIFY pgrst, 'reload schema';
