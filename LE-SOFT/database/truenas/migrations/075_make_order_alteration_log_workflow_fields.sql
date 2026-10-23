-- Keep the NAS order alteration audit schema aligned with the Track Orders UI.
ALTER TABLE public.make_order_alteration_log
    ADD COLUMN IF NOT EXISTS order_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS action_type VARCHAR(100) DEFAULT 'field_update',
    ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_moal_order_id_altered_at
    ON public.make_order_alteration_log(order_id, altered_at DESC);
CREATE INDEX IF NOT EXISTS idx_moal_order_number
    ON public.make_order_alteration_log(order_number);

NOTIFY pgrst, 'reload schema';
