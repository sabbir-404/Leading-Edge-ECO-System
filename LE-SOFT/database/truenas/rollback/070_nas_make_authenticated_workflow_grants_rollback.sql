-- Revert only the additional NAS client grants introduced by migration 070.
-- This does not alter table data or grants on other MAKE tables.

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_specification_links FROM nas_authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_size_links FROM nas_authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_product_color_links FROM nas_authenticated;
REVOKE SELECT ON TABLE public.make_product_images FROM nas_authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_parts FROM nas_authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_alteration_log FROM nas_authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.make_order_approvals FROM nas_authenticated;

COMMIT;
