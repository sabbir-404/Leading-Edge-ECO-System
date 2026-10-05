-- 066_make_spec_image_url.sql
-- Global Specification images (Product Catalog → Global Attributes → Specifications).
-- The UI and IPC layer support an optional reference image per specification, but
-- make_product_specifications never had a storage column for it
-- (make_product_colors.image_url exists; make_product_images.product_id is NOT NULL,
-- so it cannot hold product-less global specs).
-- Idempotent and non-destructive: adds one nullable column, touches no data.

ALTER TABLE make_product_specifications
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Refresh PostgREST schema cache so the column is usable immediately.
NOTIFY pgrst, 'reload schema';
