-- ============================================================================
-- Migration 072_customer_payments_ledger_compat.sql
-- ============================================================================
-- Align the customer payment table with the ledger columns consumed by the app.
-- Migration 012 originally defined payment_mode; current ledger handlers read
-- payment_type and payment_method. Preserve old payment-mode values where
-- possible and keep the existing RLS/policy boundary unchanged.

BEGIN;

DO $guard$
BEGIN
    IF to_regclass('public.customer_payments') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisite missing: public.customer_payments does not exist. Apply migration 012_customer_ledger.sql before migration 072.';
    END IF;
END
$guard$;

ALTER TABLE public.customer_payments
    ADD COLUMN IF NOT EXISTS payment_type TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Backfill legacy payment methods from payment_mode when that legacy column
-- exists; dynamic SQL prevents a missing legacy column from breaking upgrades.
DO $backfill$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'customer_payments'
           AND column_name = 'payment_mode'
    ) THEN
        EXECUTE $sql$
            UPDATE public.customer_payments
               SET payment_method = COALESCE(
                   NULLIF(BTRIM(payment_method), ''),
                   NULLIF(UPPER(BTRIM(payment_mode)), ''),
                   'CASH'
               )
             WHERE payment_method IS NULL OR BTRIM(payment_method) = ''
        $sql$;
    ELSE
        UPDATE public.customer_payments
           SET payment_method = 'CASH'
         WHERE payment_method IS NULL OR BTRIM(payment_method) = '';
    END IF;
END
$backfill$;

-- Legacy customer_payments represented receipts/credits. Current UI defaults
-- new entries to CREDIT; retain any existing non-empty type values.
UPDATE public.customer_payments
   SET payment_type = 'CREDIT'
 WHERE payment_type IS NULL OR BTRIM(payment_type) = '';

UPDATE public.customer_payments
   SET payment_method = 'CASH'
 WHERE payment_method IS NULL OR BTRIM(payment_method) = '';

ALTER TABLE public.customer_payments
    ALTER COLUMN payment_type SET DEFAULT 'CREDIT',
    ALTER COLUMN payment_type SET NOT NULL,
    ALTER COLUMN payment_method SET DEFAULT 'CASH',
    ALTER COLUMN payment_method SET NOT NULL;

-- Ask PostgREST to refresh its schema cache after the new columns exist.
NOTIFY pgrst, 'reload schema';

COMMIT;
