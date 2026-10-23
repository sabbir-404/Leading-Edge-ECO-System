-- Support the MAKE production approval notification flow with least privilege.
-- The desktop uses a shared NAS JWT, so avoid granting access to notification
-- contents or the full user directory; only the fields needed to find admin
-- recipients and create notifications are exposed to the main process.
GRANT SELECT (id, role, is_active)
    ON TABLE public.users TO nas_authenticated;
GRANT INSERT
    ON TABLE public.notifications TO nas_authenticated;
GRANT USAGE, SELECT
    ON SEQUENCE public.notifications_id_seq TO nas_authenticated;

NOTIFY pgrst, 'reload schema';
