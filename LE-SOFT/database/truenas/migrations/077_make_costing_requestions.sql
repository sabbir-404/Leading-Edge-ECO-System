-- Custom furniture costing request workflow. Keep aligned with the Supabase migration.
CREATE TABLE IF NOT EXISTS public.make_costing_requests (
    id BIGSERIAL PRIMARY KEY,
    request_number TEXT UNIQUE,
    requested_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    requester_name TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    remarks TEXT,
    file_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_progress','priced','ordered','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.make_costing_request_items (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES public.make_costing_requests(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    cost_price NUMERIC(14,2),
    sale_price NUMERIC(14,2),
    blueprint_url TEXT,
    product_image TEXT,
    product_id BIGINT REFERENCES public.make_products(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','priced','ordered')),
    designer_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.make_products ADD COLUMN IF NOT EXISTS requestion_item_id BIGINT
    REFERENCES public.make_costing_request_items(id) ON DELETE SET NULL;
ALTER TABLE public.make_order_items ADD COLUMN IF NOT EXISTS requestion_item_id BIGINT
    REFERENCES public.make_costing_request_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_make_costing_requests_owner_status ON public.make_costing_requests(requested_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_make_costing_items_request ON public.make_costing_request_items(request_id, id);
CREATE INDEX IF NOT EXISTS idx_make_products_requestion ON public.make_products(requestion_item_id) WHERE requestion_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_make_order_items_requestion ON public.make_order_items(requestion_item_id) WHERE requestion_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_make_products_requestion_item ON public.make_products(requestion_item_id) WHERE requestion_item_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.make_costing_requests, public.make_costing_request_items TO nas_authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.make_costing_requests_id_seq, public.make_costing_request_items_id_seq TO nas_authenticated;
NOTIFY pgrst, 'reload schema';
