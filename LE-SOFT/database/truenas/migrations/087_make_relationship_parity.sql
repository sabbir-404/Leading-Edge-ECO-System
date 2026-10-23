-- Match cloud behavior: deleting a specification preserves colors and sizes.
ALTER TABLE public.make_product_colors
  DROP CONSTRAINT IF EXISTS make_product_colors_spec_id_fkey;
ALTER TABLE public.make_product_colors
  ADD CONSTRAINT make_product_colors_spec_id_fkey
  FOREIGN KEY (spec_id) REFERENCES public.make_product_specifications(id)
  ON DELETE SET NULL;

ALTER TABLE public.make_product_sizes
  DROP CONSTRAINT IF EXISTS make_product_sizes_spec_id_fkey;
ALTER TABLE public.make_product_sizes
  ADD CONSTRAINT make_product_sizes_spec_id_fkey
  FOREIGN KEY (spec_id) REFERENCES public.make_product_specifications(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
