-- Keep MAKE order-item references protected and inexpensive on cloud fallback.
CREATE INDEX IF NOT EXISTS idx_make_order_items_product_id
  ON public.make_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_spec_id
  ON public.make_order_items(spec_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_size_id
  ON public.make_order_items(size_id);
CREATE INDEX IF NOT EXISTS idx_make_order_items_color_id
  ON public.make_order_items(color_id);

ALTER TABLE public.make_order_items
  ADD CONSTRAINT make_order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.make_products(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.make_order_items VALIDATE CONSTRAINT make_order_items_product_id_fkey;

ALTER TABLE public.make_order_items
  ADD CONSTRAINT make_order_items_spec_id_fkey
  FOREIGN KEY (spec_id) REFERENCES public.make_product_specifications(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.make_order_items VALIDATE CONSTRAINT make_order_items_spec_id_fkey;

ALTER TABLE public.make_order_items
  ADD CONSTRAINT make_order_items_size_id_fkey
  FOREIGN KEY (size_id) REFERENCES public.make_product_sizes(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.make_order_items VALIDATE CONSTRAINT make_order_items_size_id_fkey;

ALTER TABLE public.make_order_items
  ADD CONSTRAINT make_order_items_color_id_fkey
  FOREIGN KEY (color_id) REFERENCES public.make_product_colors(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.make_order_items VALIDATE CONSTRAINT make_order_items_color_id_fkey;
