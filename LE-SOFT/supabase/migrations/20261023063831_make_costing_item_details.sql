-- Requestion per-item details, comments and reference attachments.
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.make_costing_request_items ADD COLUMN IF NOT EXISTS file_urls TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.make_costing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_costing_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS make_costing_requests_authenticated_access ON public.make_costing_requests;
CREATE POLICY make_costing_requests_authenticated_access ON public.make_costing_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS make_costing_items_authenticated_access ON public.make_costing_request_items;
CREATE POLICY make_costing_items_authenticated_access ON public.make_costing_request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_costing_request_items TO authenticated, service_role;
REVOKE ALL ON public.make_costing_request_items FROM PUBLIC, anon;
NOTIFY pgrst, 'reload schema';

