-- Keep the built-in Salesman group aligned with MAKE portal role boundaries.
-- Permissions JSON keys are consumed by LE-SOFT and the WordPress portal.
INSERT INTO public.user_groups (name, description, permissions)
VALUES (
  'Salesman',
  'MAKE Salesman: catalog and customer drawings, own costing requests, order creation/approval, due payment recording, and production-override requests.',
  '{
    "read_make": true,
    "write_make": true,
    "alter_make": false,
    "read_make_catalog": true,
    "write_make_catalog": false,
    "create_product_from_place_order": false,
    "manage_global_product_attributes": false,
    "set_make_cost_price": false,
    "set_make_sale_price": false,
    "view_product_blueprint": false,
    "view_product_drawing": true,
    "view_product_cost_price": false,
    "view_product_sale_price": true,
    "view_product_max_discount": false,
    "approve_make_order": true,
    "make_record_payment": true,
    "request_make_production_approval": true,
    "decide_make_production_approval": false,
    "update_make_production_stage": false,
    "read_make_costing_requests": true,
    "read_all_make_costing_requests": false,
    "create_make_costing_request": true,
    "price_make_costing_request": false,
    "delete_make_costing_request": false,
    "place_order_from_costing_request": true,
    "access_make_sales_portal": true,
    "read_group": false,
    "write_group": false,
    "read_ledger": false,
    "write_ledger": false,
    "read_bill": false,
    "write_bill": false,
    "manage_users": false,
    "manage_groups": false,
    "manage_settings": false
  }'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  permissions = COALESCE(public.user_groups.permissions, '{}'::jsonb) || EXCLUDED.permissions;
