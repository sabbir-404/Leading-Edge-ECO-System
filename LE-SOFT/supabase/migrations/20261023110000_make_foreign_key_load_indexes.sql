-- Add the child-side indexes that PostgreSQL does not create automatically
-- for foreign keys. This keeps relationship reads and parent deletes bounded
-- as MAKE catalog and order tables grow. All changes are additive/idempotent.
CREATE INDEX IF NOT EXISTS idx_make_costing_request_items_product_id
    ON public.make_costing_request_items (product_id);
CREATE INDEX IF NOT EXISTS idx_make_product_images_color_id
    ON public.make_product_images (color_id);
CREATE INDEX IF NOT EXISTS idx_make_product_images_spec_id
    ON public.make_product_images (spec_id);
CREATE INDEX IF NOT EXISTS idx_make_product_sizes_product_id
    ON public.make_product_sizes (product_id);
CREATE INDEX IF NOT EXISTS idx_make_product_sizes_spec_id
    ON public.make_product_sizes (spec_id);
CREATE INDEX IF NOT EXISTS idx_make_product_colors_product_id
    ON public.make_product_colors (product_id);
CREATE INDEX IF NOT EXISTS idx_make_product_colors_spec_id
    ON public.make_product_colors (spec_id);
CREATE INDEX IF NOT EXISTS idx_make_product_specifications_product_id
    ON public.make_product_specifications (product_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_bill_id
    ON public.make_orders (bill_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_bill_item_id
    ON public.make_orders (bill_item_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_salesman_id
    ON public.make_orders (salesman_id);
