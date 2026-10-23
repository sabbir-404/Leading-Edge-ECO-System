-- Let logistics manage custom MAKE orders in the existing Shipping workflow.
ALTER TABLE public.bill_shipping
    ALTER COLUMN bill_id DROP NOT NULL,
    ALTER COLUMN ship_to_address DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS make_order_id BIGINT REFERENCES public.make_orders(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_shipping_make_order_id
    ON public.bill_shipping(make_order_id) WHERE make_order_id IS NOT NULL;
ALTER TABLE public.shipping_status_log
    ALTER COLUMN bill_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS make_order_id BIGINT REFERENCES public.make_orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shipping_log_make_order
    ON public.shipping_status_log(make_order_id, created_at DESC) WHERE make_order_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.bill_shipping, public.shipping_status_log TO nas_authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bill_shipping_id_seq, public.shipping_status_log_id_seq TO nas_authenticated;
NOTIFY pgrst, 'reload schema';
