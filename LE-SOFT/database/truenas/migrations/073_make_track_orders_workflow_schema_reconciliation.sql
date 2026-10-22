-- Reconcile the Track Orders production, delivery and photo fields on TrueNAS.
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS factory_manager_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS factory_manager_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_stage_photo TEXT NULL,
    ADD COLUMN IF NOT EXISTS reference_bill_no TEXT NULL,
    ADD COLUMN IF NOT EXISTS target_delivery_days INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_make_orders_factory_manager
    ON public.make_orders(factory_manager_id) WHERE factory_manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_make_orders_ref_bill_no
    ON public.make_orders(reference_bill_no) WHERE reference_bill_no IS NOT NULL;

COMMENT ON COLUMN public.make_orders.current_stage_photo IS
    'URL or durable storage key for the latest production stage photo';

NOTIFY pgrst, 'reload schema';
