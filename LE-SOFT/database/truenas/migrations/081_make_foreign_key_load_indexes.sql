-- Keep the TrueNAS primary database indexed for growing MAKE relationships.
-- PostgreSQL does not automatically index foreign-key columns on the child.
-- Additive and safe to apply more than once.
CREATE INDEX IF NOT EXISTS idx_make_product_images_spec_id
    ON public.make_product_images (spec_id);
CREATE INDEX IF NOT EXISTS idx_make_product_images_color_id
    ON public.make_product_images (color_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_product_id
    ON public.make_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_spec_id
    ON public.make_order_items (spec_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_size_id
    ON public.make_order_items (size_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_color_id
    ON public.make_order_items (color_id);
CREATE INDEX IF NOT EXISTS idx_make_orders_bill_item_id
    ON public.make_orders (bill_item_id);
CREATE INDEX IF NOT EXISTS idx_make_costing_request_items_product_id
    ON public.make_costing_request_items (product_id);
