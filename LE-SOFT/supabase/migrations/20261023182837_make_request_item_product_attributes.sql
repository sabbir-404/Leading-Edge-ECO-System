-- Keep designer-configured catalog attributes and discount limits on requisitions.
ALTER TABLE public.make_costing_request_items
    ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS colors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS max_discount_type TEXT NOT NULL DEFAULT 'percent',
    ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14,2);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'make_costing_items_max_discount_type_check') THEN
        ALTER TABLE public.make_costing_request_items
            ADD CONSTRAINT make_costing_items_max_discount_type_check
            CHECK (max_discount_type IN ('percent', 'amount'));
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.make_costing_request_items TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
