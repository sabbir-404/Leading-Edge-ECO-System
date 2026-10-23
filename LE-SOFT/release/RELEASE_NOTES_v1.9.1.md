# LE-SOFT 1.9.1

## MAKE costing and ordering

- Costing requests use the shared product categories, sizes, colors, and specifications, support per-product discount limits, and create catalog products with those attributes.
- A fully costed request can be sent to Place Order with its customer details and all priced items.
- The Place Order form now shows the selected catalog image and uses a consistent responsive layout. Product Catalog images open in a full-size preview.
- File upload progress is surfaced while costing and order attachments are saved.

## Production and shipping workflow

- Designer changes save the correct order revision, and salesperson approval records the current revision.
- Factory staff see only eligible approved orders, manufacturing costs, blueprints, and stage controls. Sales staff can follow progress without factory update photos.
- Orders marked ready to ship are handed to Shipping, where logistics can record dispatch and delivery with remarks and image evidence.

## Account access

- Username sign-in supports users whose Supabase Auth account uses the email stored in their profile, while retaining legacy username-based sign-in.

## Verification

- Vitest: 972 passed, 39 skipped across 58 passing test files (3 files skipped).
- ESLint passed.
- TypeScript and production renderer build passed.
- Supabase and TrueNAS accepted read-only PostgREST checks for the costing attributes and shipping order-link columns.
- The tagged GitHub Actions workflow builds and publishes Windows and macOS installers with update metadata.
