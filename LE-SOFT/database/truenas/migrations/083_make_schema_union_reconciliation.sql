-- Add the remaining Cloud version snapshot and legacy part-dimension fields
-- to TrueNAS. Existing fields and data are retained.
BEGIN;

ALTER TABLE public.make_order_versions
    ADD COLUMN IF NOT EXISTS status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC,
    ADD COLUMN IF NOT EXISTS changed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS changes_diff JSONB,
    ADD COLUMN IF NOT EXISTS version_notes TEXT;

ALTER TABLE public.make_order_parts
    ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT '{}'::JSONB;

NOTIFY pgrst, 'reload schema';
COMMIT;
