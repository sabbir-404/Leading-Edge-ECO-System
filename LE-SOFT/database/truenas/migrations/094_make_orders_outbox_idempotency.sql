-- Makes MAKE order inserts idempotent across outbox retries.
-- The same durable local operation ID is written once and protected by a unique index.

ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS outbox_operation_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_make_orders_outbox_operation_id
    ON public.make_orders(outbox_operation_id)
    WHERE outbox_operation_id IS NOT NULL;

COMMENT ON COLUMN public.make_orders.outbox_operation_id IS
    'Durable LE-SOFT outbox operation ID used to deduplicate ambiguous MAKE order insert acknowledgements.';

NOTIFY pgrst, 'reload schema';
