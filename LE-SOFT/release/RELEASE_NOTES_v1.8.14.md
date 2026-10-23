# LE-SOFT 1.8.14

## MAKE drawing files

- Product records and costing-request items now store separate production-blueprint and customer-facing product-drawing references.
- Furniture designers and administrators can view both drawing types. Sales roles receive product drawings only; factory managers receive production blueprints only. These rules are applied in the desktop IPC responses and WordPress REST responses.
- DXF drawings can be previewed in the desktop catalog/requestion screens and the WordPress product catalog. PDF and common image drawings preview in place; other formats remain downloadable.
- PDF product drawings are stamped with a light, permanent “LEADING EDGE” watermark at upload.
- Added nullable `product_drawing_url` fields to `make_products` and `make_costing_request_items` on Supabase and TrueNAS, preserving existing records.

## CAD format note

The bundled GitHub viewer is `vagran/dxf-viewer` (MPL-2.0) and renders DXF. The available LibreDWG-based DWG parser is GPL-3.0, which is incompatible with the current proprietary desktop license unless the distribution and licensing model changes. DWG files can be downloaded and opened in AutoCAD or another licensed viewer; inline DWG rendering requires a separately licensed parser.
