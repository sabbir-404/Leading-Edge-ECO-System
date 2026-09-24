# MAKE V1.2 Release Checklist & Production Baseline

**Release Version:** MAKE V1.2  
**Baseline Date:** September 24, 2026  
**System:** Leading Edge ERP Software (LE-SOFT) & WordPress Sales Portal  
**Authoritative Operational Master:** NAS PostgreSQL (`100.88.85.6:5432` / `http://100.88.85.6:3001` / `https://db.lenas.me`) — **LIVE & ACTIVE**  
**Secondary / Cloud Failover / Retail Billing:** Supabase Cloud (`ildkkgjrolcjijwfokek.supabase.co`) — **RECONCILED & IN SYNC**  
**Production DB Migration Status:** **EXECUTED & VERIFIED ON BOTH DATABASES**

---

## 1. Release Status Overview

| Component | Status | Validation Method |
| :--- | :--- | :--- |
| **Category Source of Truth** | **READY** | Automated E2E (`[CAT-CRUD]`) + Unit tests (`attributes.test.ts`) + NAS Triggers |
| **Intelligent Search** | **READY** | Automated E2E (`[SEARCH-ALL]`) + Unit tests (`product-search.test.ts`) |
| **8-Step Interactive Tutorial** | **READY** | Automated E2E (`[TUTORIAL-STEP-1..8]`) + State tests (`tutorial.test.ts`) |
| **Optional Customer Phone** | **READY** | Automated E2E (`[ORDER-PHONE]`) + Schema validation + Live NAS verification |
| **Invoice Attachments** | **READY** | Automated E2E (`[TUTORIAL-STEP-5]`) + Unit tests (`invoice-attachments.test.ts`) |
| **8-Stage Production Flow** | **READY** | Automated E2E (`[TUTORIAL-STEP-7]`) + Unit tests (`stage-progression.test.ts`) |
| **Customer Ledger Integration** | **READY** | Automated E2E (`[TUTORIAL-STEP-8]`) + Unit tests (`ledger-integration.test.ts`) |
| **Order Deletion Guard** | **READY** | Unit tests (`delete-order.test.ts`, `security.test.ts`) |
| **Responsive UI (800px - 1000px)**| **READY** | Automated Puppeteer Viewport Tests (`[RESPONSIVE-800..1000]`) |
| **WordPress Sales Portal** | **READY** | Code audit of REST APIs, schemas, and mobile camera capture |
| **TypeScript Compilation** | **PASSED** | `tsc` exit code 0 (0 errors) |
| **Vite Frontend Build** | **PASSED** | Production bundle built cleanly (2455 modules transformed) |
| **Electron Main/Preload Build** | **PASSED** | `node build-electron.cjs` exit code 0 (`main.cjs` 5.5MB, `preload.cjs` 31.7KB) |
| **NAS Production DB Reconciliation** | **EXECUTED** | Migration 061/062 verified on `100.88.85.6` with auto-sync triggers and RLS |
| **Supabase Cloud Reconciliation** | **EXECUTED** | Migration 063 verified on `ildkkgjrolcjijwfokek.supabase.co` |

---

## 2. Detailed Verification Checklist

### Implementation
- [x] Global Category attribute created as first-class entity in `make_product_categories`.
- [x] Authoritative relationship enforced: `make_products.category_id -> make_product_categories.id`.
- [x] Legacy text column `make_products.category` preserved exclusively as synchronized compatibility value.
- [x] Bi-directional sync triggers `trg_sync_make_product_category` and `trg_sync_make_product_category_rename` verified.
- [x] Multi-attribute junction tables (`make_product_size_links`, `make_product_color_links`, `make_product_specification_links`) verified.
- [x] 8-stage sequential production state machine enforced.
- [x] Optional customer phone supported in Place Order while preserving deterministic `MAKE-YYYY-XXXXXX` sequence.
- [x] Secure native file dialog and memory-buffer mobile camera upload paths for invoice attachments.
- [x] Customer Ledger detail view integration showing full manufacturing history without modifying accounting ledger math.

### Unit Tests
- [x] `tests/make/versioning.test.ts`: 4/4 passed
- [x] `tests/make/pricing.test.ts`: 9/9 passed
- [x] `tests/make/tutorial.test.ts`: 10/10 passed
- [x] `tests/make/ledger-integration.test.ts`: 10/10 passed
- [x] `tests/make/security.test.ts`: 23/23 passed (including PostgREST direct mutation guard)
- [x] `tests/make/product-search.test.ts`: 17/17 passed
- [x] `tests/make/invoice-attachments.test.ts`: 8/8 passed
- [x] `tests/make/stage-progression.test.ts`: 14/14 passed
- [x] `tests/make/attributes.test.ts`: 15/15 passed
- [x] `tests/make/delete-order.test.ts`: 8/8 passed
- **Total Unit Tests**: **118 passed / 118 total (100% passing)**

### E2E Tests (`tools/verify-make-v1-2-e2e.mjs`)
- [x] `[CAT-CRUD]`: Category creation, active-product deletion block, rename auto-sync.
- [x] `[SEARCH-ALL]`: 11 whole-catalog multi-attribute search query permutations.
- [x] `[ORDER-PHONE]`: Place Order with null/empty customer phone generating `MAKE-YYYY-XXXXXX`.
- [x] `[TUTORIAL-STATE]`: User A and User B state isolation; replay key consumed once.
- [x] `[TUTORIAL-STEP-1..8]`: Full 8-step interactive tour walking across Dashboard -> Catalog -> Place Order -> Track Orders -> Customer Ledger.
- [x] `[TUTORIAL-BACK-NAV]`: Reverse navigation across routes using "Back" button.
- [x] `[TUTORIAL-FINISH]`: Completion status persistence in localStorage.
- [x] `[RESPONSIVE-800..1000]`: Tooltips and spotlights clamped without horizontal overflow or clipping.
- [x] `[SETTINGS-REPLAY]`: Settings replay button, reload navigation, and key consumption without reload loops.
- **Total E2E Scenarios**: **19 passed / 19 total (100% passing)**

### Build & Compilation
- [x] `npm run build:check`: `tsc && vite build` succeeded with exit code 0.
- [x] `node build-electron.cjs`: Bundled `core/main.cjs` and `core/preload.cjs` cleanly.
- [x] No runtime circular dependencies or missing exports.

### Database Status & Reconciliation
- [x] **NAS Master (`100.88.85.6:5432`)**:
  - Reconciled with Migration 061 & 062 schema objects.
  - Auto-synchronization triggers `trg_sync_make_product_category` and `trg_sync_make_product_category_rename` verified.
  - Foreign key `ON DELETE RESTRICT` actively guarding categories.
  - Hardened RLS and explicit grants active.
  - 6 products, 24 orders, 12 sizes, 12 colors, 3 specifications preserved without data loss.
- [x] **Supabase Cloud (`ildkkgjrolcjijwfokek.supabase.co`)**:
  - Migration 063 successfully executed via Supabase SQL Editor.
  - Verified live schema: `make_product_categories`, `make_products.category_id`, junction tables, enhanced order columns, RLS.
  - 100% of existing `billing_customers` (2 rows) and `bills` (3 rows) preserved completely intact.

### WordPress Compatibility
- [x] `select=*` on `make_products` returns existing columns including `category` compatibility text.
- [x] 8 canonical production stages match WordPress portal JavaScript dropdown and API controller.
- [x] Mobile camera upload (`capture="environment"`) streams file buffer through memory without requiring local filesystem paths.
- [x] Historical `pdf_urls` and `technical_drawing_url` columns remain readable.

### Security
- [x] Row Level Security (RLS) on `make_product_categories` enabled.
- [x] Anonymous clients: `SELECT` only (read-only catalog viewing).
- [x] Authenticated clients: `SELECT` only. Direct PostgREST mutations (`INSERT`, `UPDATE`, `DELETE`) are denied to all authenticated clients.
- [x] Service role has exclusive write management access for trusted Electron backend IPC.
- [x] Administrative capabilities (`canManageCatalog`) strictly evaluated in Main Process session layer before issuing database writes.
- [x] `(file as any).path` eradicated from frontend; zero renderer-controlled filesystem path vulnerabilities.
- [x] Magic byte verification (PNG, JPEG, WebP) enforced on file buffers before storage upload.

### Tutorial
- [x] Tutorial offered on first entry to MAKE (`status = 'unseen'`).
- [x] `Skip` persists `'skipped'` in localStorage; never interrupts user again.
- [x] `Finish` persists `'completed'` in localStorage.
- [x] Settings -> Replay requests tour; restarts tour from Step 1 on Dashboard; flag consumed once; zero reload loops.
- [x] Tutorial strictly isolated to MAKE routes (`/make/*`) and Customer Ledger (`/crm/ledger`).

### Search Engine
- [x] Searches across product name, model code, description, category, and related attributes (sizes, colors, specs).
- [x] Multi-token search matches terms across different entities (e.g. "Walnut Executive").
- [x] UI displays matched reasons and product-centric metadata cards.
- [x] Debounced by 300ms to eliminate per-keystroke database overhead.

### Attachments & Documents
- [x] Supports `jpg`, `jpeg`, `png`, `webp` (and `pdf` for drawings).
- [x] File size capped at 15 MB.
- [x] Invalid formats and executables rejected at both client and Main process levels.

### Customer Ledger Integration
- [x] Shows MAKE order number, items, dimensions, specs, colors, sale amount, stage, and attachments.
- [x] Clickable order link navigates directly to Track Orders filtered by order number.
- [x] Preserves double-entry accounting integrity without modifying ledger math.

### Responsive UI
- [x] Validated across `800px`, `900px`, and `1000px` viewports in headless Chromium.
- [x] Tooltip cards clamp to viewport boundaries (`Math.max(16, Math.min(idealLeft, vpWidth - cardWidth - 16))`).
- [x] No clipping, overflow, or unreachable buttons.

---

## 3. Release Conclusion & Baseline Approval

MAKE V1.2 is **APPROVED and FROZEN** as the official production baseline.

* **Operational Master Database**: NAS PostgreSQL (`100.88.85.6:5432` / `http://100.88.85.6:3001` / `https://db.lenas.me`) is verified, live, and authoritative for all MAKE manufacturing operations.
* **Secondary / Cloud Failover & Billing**: Supabase Cloud (`ildkkgjrolcjijwfokek.supabase.co`) is reconciled via Migration 063 with zero data loss to retail records.
* **Core Systems Active & Hardened**:
  - Normalized Category architecture with referential integrity (`category_id -> make_product_categories(id)` ON DELETE RESTRICT) and bi-directional auto-sync triggers.
  - Multi-attribute junction tables (`make_product_specification_links`, `make_product_size_links`, `make_product_color_links`).
  - Intelligent whole-catalog multi-entity product search.
  - Canonical 8-stage production flow with synchronized `status` and `current_stage`.
  - Multi-file invoice attachments (`invoice_attachment_urls`) with native desktop and mobile camera support.
  - Non-invasive Customer Ledger manufacturing view.
  - 8-step interactive tour with Settings replay capability.
* **Verification Summary**:
  - Unit Tests: **118 / 118 passed** (100%).
  - E2E Tests: **19 / 19 passed** (100%).
  - Build Pipeline: `tsc`, `vite build`, and `node build-electron.cjs` clean with zero errors.
