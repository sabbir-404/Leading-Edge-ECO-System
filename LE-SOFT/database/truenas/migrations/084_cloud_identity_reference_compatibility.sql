-- LE-SOFT staff identities are owned by Supabase Cloud. The TrueNAS users
-- table is a separate legacy directory (its integer IDs do not match Cloud),
-- so FK checks against that local table reject valid mirrored records.
-- Keep the numeric Cloud identity values intact, but do not require a local
-- users row on the NAS replica. Cloud retains its authoritative user FKs.
BEGIN;

ALTER TABLE public.make_costing_requests
    DROP CONSTRAINT IF EXISTS make_costing_requests_requested_by_fkey;
ALTER TABLE public.make_orders
    DROP CONSTRAINT IF EXISTS make_orders_salesman_id_fkey;
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey,
    DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;

COMMENT ON COLUMN public.make_costing_requests.requested_by IS
    'Supabase Cloud user ID. NAS stores the external identity without a local users FK.';
COMMENT ON COLUMN public.make_orders.salesman_id IS
    'Supabase Cloud user ID. NAS stores the external identity without a local users FK.';
COMMENT ON COLUMN public.notifications.recipient_id IS
    'Supabase Cloud user ID. NAS stores the external identity without a local users FK.';
COMMENT ON COLUMN public.notifications.sender_id IS
    'Supabase Cloud user ID. NAS stores the external identity without a local users FK.';

NOTIFY pgrst, 'reload schema';
COMMIT;
