-- Preserve the staff identity that created a MAKE order. This is used to
-- notify the requester when an administrator decides a production hold.
ALTER TABLE public.make_orders
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_make_orders_created_by
    ON public.make_orders(created_by) WHERE created_by IS NOT NULL;

NOTIFY pgrst, 'reload schema';
