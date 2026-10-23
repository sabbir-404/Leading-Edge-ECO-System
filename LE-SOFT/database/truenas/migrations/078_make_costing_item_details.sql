-- Requestion per-item details, comments and reference attachments.
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS file_urls TEXT[] NOT NULL DEFAULT '{}'::text[];
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_costing_request_items TO nas_authenticated;
NOTIFY pgrst, 'reload schema';

