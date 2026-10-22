-- Roll back the index and referential constraint from migration 071.
-- Keep blueprint_url and size_id columns: after deployment they may contain
-- user data, so dropping them would be destructive and is not a safe rollback.

BEGIN;

ALTER TABLE public.make_products
    DROP CONSTRAINT IF EXISTS make_products_size_id_fkey;

DROP INDEX IF EXISTS public.idx_make_products_size_id;

COMMIT;
