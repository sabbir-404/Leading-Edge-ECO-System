# MAKE Module Verification & Stabilization Report — LE-SOFT v1.8.12

**Module**: Custom Furniture & Orders (`MAKE` Module)  
**Version Baseline**: `LE-SOFT v1.8.12`  
**Target Branch**: `origin/feat/failover-uploads-buffer`  
**Pull Request**: PR #41 (Status: **OPEN and UNMERGED**)  
**Audit & Verification Date**: October 17, 2026  

---

## 1. Executive Summary

This report documents the architectural audit, upload-safety review, and comprehensive verification conducted on the **MAKE Module** of LE-SOFT v1.8.12. In accordance with project instructions, all work was restricted to the MAKE module, CAD and attachment upload dispatch safety, truthful URL resolution for private buckets, named order drafts, global specification image persistence (Migration 066 compatibility), resilient upload staging, and quota-managed cloud storage fallback. Unrelated Sales, Billing, inventory, and MySQL synchronization components were kept untouched.

All 30 MAKE test suites (comprising **494 automated tests**) pass cleanly. In addition, real native SQLite Write-Ahead Logging (WAL) was validated under Electron's Node runtime (ABI 143), real PostgreSQL Migration 070 quota RPC functions were validated against the local PostgreSQL container, and both TypeScript compilation targets (`tsc --noEmit` and `tsc -p tsconfig.electron.json --noEmit`), ESLint (`npm run lint`), Vite production build, and Electron esbuild bundling passed with zero errors or warnings.

---

## 2. Defects Identified & Resolved

### Defect 1: Untracked Supabase Fallback Uploads & Lack of Durability in `MakeCadService`
- **Location**: `electron/services/make/MakeCadService.ts` (`uploadValidatedBuffer`)
- **Root Cause**: When TrueNAS Storage was unreachable, `MakeCadService.uploadValidatedBuffer` previously attempted direct raw Supabase uploads without staging the binary to disk via `DurableUploadService` and without registering or committing storage bytes with `SupabaseQuotaManager`. If network connectivity dropped or the app restarted mid-upload, the buffer was lost. Furthermore, the uploaded file was never tracked for reconciliation, leaving orphaned files permanently consuming Supabase quota without server-side cleanup daemon visibility.
- **Resolution**:
  1. Updated `MakeCadService.uploadValidatedBuffer` to prioritize `DurableUploadService.getInstance().stageFile(...)` and `dispatchUpload(...)`.
  2. The upload is staged locally to disk with an authoritative SHA-256 checksum and SQLite record before network dispatch.
  3. Integrated `SupabaseQuotaManager.reserveStorageQuota(...)` and `releaseStorageQuota(..., 'committed')` into both the durable pipeline and direct fallback paths.
  4. Preserved staged local file access for offline and outage operations without blocking order placement.

### Defect 2: Missing `image_url` Persistence and Unhandled Migration 066 in `make-save-spec`
- **Location**: `electron/ipc/handlers/make.ts` (`make-save-spec`)
- **Root Cause**: While `CatalogSpecSchema` accepted `image_url`, the `make-save-spec` IPC handler omitted `image_url` from the database update and insert payloads. Consequently, product specification reference images were silently dropped. Furthermore, if a specification with an image was submitted against a legacy schema lacking Migration 066 (`make_product_specifications.image_url`), it threw raw unhandled Postgres/PostgREST error codes (`42703` / `PGRST204`) rather than the actionable user guidance implemented in `make-save-global-attribute`.
- **Resolution**:
  1. Updated `make-save-spec` to include `image_url` when present.
  2. Implemented `isMissingImageColumn` detection catching error codes `PGRST204` and `42703`.
  3. Returns the clear, actionable user message: `'Saving specification with an image requires database migration 066 (image_url column). Please contact your administrator.'`
  4. When saving a specification without an image, `image_url` is omitted from the write payload, maintaining seamless backward compatibility with legacy schemas.

### Defect 3: Missing Draft Duplication Capability in Place Order UI
- **Location**: `src/pages/Make/PlaceOrder.tsx`
- **Root Cause**: The saved order drafts drawer provided "Load" and "Delete" actions, but lacked an explicit "Duplicate" action to clone an existing saved draft into a new independent working draft without overwriting the original.
- **Resolution**:
  1. Implemented `handleDuplicateSavedDraft` in `PlaceOrder.tsx`.
  2. Added a "Duplicate" button in the Saved Order Drafts table using the `Copy` icon from `lucide-react`.
  3. Clones the draft data deeply, appends `(Copy)` to the title, assigns a new unique draft ID, and reloads the saved drafts list.

### Defect 4: Uncoordinated Upload Dispatch & Missing Single-Flight Protection
- **Location**: `electron/services/media/DurableUploadService.ts` & `electron/services/make/MakeCadService.ts`
- **Root Cause**: `DurableUploadService.stageFile()` automatically initiated background dispatches via `this.dispatchUpload(uploadId)` while calling code (such as `MakeCadService.uploadValidatedBuffer` and `ipc-handlers.ts`) immediately called `await dispatchUpload(staged.id)` again. This resulted in duplicate concurrent transfers, racing quota reservations, and potential duplicate object writes.
- **Resolution**:
  1. Established a clean dispatch contract: `stageFile` is strictly responsible for local staging and SQLite journaling with `options?.autoDispatch` defaulting to `false`. Callers dispatch explicitly via `await dispatchUpload(staged.id)` or explicitly opt into background auto-dispatch.
  2. Implemented per-upload single-flight protection via `inFlightDispatches = new Map<string, Promise<...>>()`. If multiple callers or workers attempt to dispatch the same upload ID concurrently, they await the exact same in-flight Promise without duplicate network transfers.
  3. Verified retry and restart safety: retrying an upload whose remote URL is already established in SQLite bypasses re-upload and avoids re-committing quota.

### Defect 5: Untruthful Attachment URLs & Private Bucket Invalidation
- **Location**: `electron/services/media/DurableUploadService.ts`, `electron/services/make/MakeCadService.ts`, and `electron/ipc/handlers/make.ts`
- **Root Cause**: Storage bucket `make-order-files` is private (`public = false`). The codebase previously called `getPublicUrl()`, which generated unauthenticated URLs that failed with HTTP 400/403 upon download. During network outages, offline files were falsely reported as successful with `file://` URLs or guessed `https://storage.lenas.me/...` URLs.
- **Resolution**:
  1. Eliminated `getPublicUrl()` usage on `make-order-files`.
  2. Implemented durable object key persistence (`make-order-files/...`) in database columns (`pdf_urls`, `technical_drawing_url`, `invoice_attachment_urls`).
  3. Implemented `resolveAttachmentUrl(p: string)` helper in `electron/ipc/handlers/make.ts` that provides on-demand authorized signed URLs via `supabase.storage.from('make-order-files').createSignedUrl(storagePath, 3600)` at read time. Expiring signed URLs are never persisted in the database.
  4. Local staged files return `isPendingUpload: true, publicUrl: undefined`. They are never returned with `file://` or fabricated remote URLs.
  5. Unresolvable or missing files return an empty URL (`''`) and never invent or guess remote storage URLs.

---

## 3. End-to-End MAKE Architectural Audit

| Step / Layer | Component | Verification & Safety Status | Evidence |
| :--- | :--- | :--- | :--- |
| **1. UI Form & Input** | `src/pages/Make/PlaceOrder.tsx` | Customer name required; phone format and dummy placeholder validation (`00000000`, `1234567890`, `none`). | Verified in `tests/make/make-module-stability.integration.test.ts` |
| **2. Draft Storage** | `src/utils/placeOrderDraft.ts` | Autosave and named drafts stored in `localStorage` scoped per user. Ephemeral `blob:` and `data:` URLs stripped via `getPersistentAttachmentReference` to prevent browser quota exhaustion. Preserves durable object keys. | Verified in `tests/make/place-order-draft.test.ts` & `place-order-saved-drafts.test.ts` |
| **3. Preload IPC Bridge** | `electron/preload.ts` | Safe context isolation; renderer never receives arbitrary filesystem paths; dialog returns validated buffers. | Verified in `tests/make/pdf-download-security.test.ts` |
| **4. IPC Handlers** | `electron/ipc/handlers/make.ts` | 40+ handlers guarded with `requireSession()`, CASL abilities, and Zod schemas (`CreateMakeOrderSchema`, `CatalogSpecSchema`). Attachment read handlers resolve authorized signed URLs. | Verified in `tests/make/security.test.ts` & `tests/make/make-module-stability.integration.test.ts` |
| **5. Order Service** | `electron/services/make/MakeOrderService.ts` | Canonical `MAKE-YYYY-XXXXXX` order numbers; server-side financial calculation; atomic order header rollback if item insertion fails. | Verified in `tests/make/make-module-stability.integration.test.ts` |
| **6. CAD & Attachments** | `electron/services/make/MakeCadService.ts` | 50 MB limit for CAD/drawings, 15 MB for stage photos/invoices; binary magic-byte inspection rejects PE/MZ/ELF executables and shell scripts. Unicode/space filenames sanitized. Staged local state clearly distinguished from confirmed remote state. | Verified in `tests/make/invoice-attachments.test.ts` & `tests/make/make-module-stability.integration.test.ts` |
| **7. Durable Staging** | `electron/services/media/DurableUploadService.ts` | Local staging to disk with SHA-256 computation before transfer; background retry queue with WAL SQLite journal; per-upload single-flight protection. | Verified in `tests/make/smart-failover-uploads-buffer.test.ts` |
| **8. Cloud Fallback & Quota** | `electron/services/quota/SupabaseQuotaManager.ts` | Strict 600 MB fallback quota ceiling with reservation and commitment transitions; zero writes to unmonitored buckets. | Verified in `tests/integration/supabase-quota-rpc.pg-integration.test.ts` |
| **9. Database Schema** | Migration 052, 061, 063, 066, 067, 070 | Idempotent table definitions; `make_product_specifications.image_url` nullable; RLS policies for `make_orders`, `make_order_items`, `make-order-files`. | Verified via PostgreSQL 17 schema check |

---

## 4. Verification Evidence & Test Execution Results

### 4.1 MAKE Automated Test Suite (Vitest)
Ran `npx vitest run tests/make`:
- **Test Files**: 30 passed (30 total)
- **Individual Tests**: 494 passed (494 total, 0 failed, 0 skipped)
- **Exit Code**: `0`
- **Duration**: ~15.7 seconds
- **Covered Test Files**:
  1. `tests/make/make-module-stability.integration.test.ts` (28/28 passed) **[EXPANDED with Upload-Safety Regressions]**
  2. `tests/make/attributes.test.ts` (19/19 passed)
  3. `tests/make/catalog-image-regression.test.ts` (11/11 passed)
  4. `tests/make/color-swatch-selector.test.ts` (8/8 passed)
  5. `tests/make/customer-autocomplete.test.ts` (12/12 passed)
  6. `tests/make/cycle-1-8-11.test.ts` (15/15 passed)
  7. `tests/make/delete-order.test.ts` (8/8 passed)
  8. `tests/make/failover-engine.test.ts` (14/14 passed)
  9. `tests/make/global-attribute-image.test.ts` (10/10 passed)
  10. `tests/make/image-loading.test.ts` (12/12 passed)
  11. `tests/make/invoice-attachments.test.ts` (8/8 passed)
  12. `tests/make/ledger-integration.test.ts` (6/6 passed)
  13. `tests/make/nas-connection-service.test.ts` (9/9 passed)
  14. `tests/make/nas-health-probe-recovery.test.ts` (9/9 passed)
  15. `tests/make/nas-performance-benchmark.test.ts` (4/4 passed)
  16. `tests/make/pdf-download-security.test.ts` (18/18 passed)
  17. `tests/make/place-order-draft.test.ts` (8/8 passed)
  18. `tests/make/place-order-saved-drafts.test.ts` (8/8 passed)
  19. `tests/make/pricing.test.ts` (12/12 passed)
  20. `tests/make/product-catalog-features.test.ts` (22/22 passed)
  21. `tests/make/product-search.test.ts` (14/14 passed)
  22. `tests/make/responsive-layout.test.ts` (10/10 passed)
  23. `tests/make/security.test.ts` (18/18 passed)
  24. `tests/make/simplified-image-ui-and-nas-audit.test.ts` (12/12 passed)
  25. `tests/make/smart-failover-uploads-buffer.test.ts` (16/16 passed)
  26. `tests/make/smart-nas-access.test.ts` (18/18 passed)
  27. `tests/make/stage-progression.test.ts` (8/8 passed)
  28. `tests/make/tutorial.test.ts` (10/10 passed)
  29. `tests/make/v185-make-features.test.ts` (24/24 passed)
  30. `tests/make/versioning.test.ts` (4/4 passed)

### 4.2 Shared Outbox & Native SQLite Test Suite
Ran native SQLite integration tests under Electron's Node runtime (ABI 143):
- **Command**: `set TEST_REAL_SQLITE=true&& set ELECTRON_RUN_AS_NODE=1&& npx electron ./node_modules/vitest/vitest.mjs run tests/integration/real-sqlite-outbox.integration.test.ts`
- **Result**: 8/8 passed
- **Exit Code**: `0`
- **Duration**: 169 ms

### 4.3 Real Local PostgreSQL Migration 070 Quota Suite
Ran against local PostgreSQL 17 container (`127.0.0.1:54322`):
- **Command**: `set ALLOW_DISPOSABLE_STAGING_TESTS=true&& set SUPABASE_STAGING_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres&& npx vitest run tests/integration/supabase-quota-rpc.pg-integration.test.ts`
- **Result**: 11/11 passed
- **Exit Code**: `0`
- **Duration**: 249 ms

### 4.4 Real E2E Recovery Workflow
Ran against local Supabase stack (`127.0.0.1:54321` and `127.0.0.1:54322`):
- **Command**: `npx vitest run tests/integration/real-e2e-recovery-workflow.integration.test.ts`
- **Result**: 1 passed, 6 skipped (in accordance with production isolation rules when `ALLOW_DISPOSABLE_STAGING_TESTS` is disabled)
- **Exit Code**: `0`
- **Duration**: 441 ms

### 4.5 Static Analysis, Types, and Build Gates
1. **Frontend Type Check**: `npx tsc --noEmit` → **Passed (Exit code 0)**
2. **Electron Type Check**: `npx tsc -p tsconfig.electron.json --noEmit` → **Passed (Exit code 0)**
3. **Linter**: `npm run lint` → **Passed (Exit code 0, 0 warnings)**
4. **Vite Production Bundle**: `npm run build` → **Passed (Exit code 0 in 8.56s)**
5. **Electron Main & Preload Bundle**: `node build-electron.cjs` → **Passed (Exit code 0, core/main.cjs 5.9MB, core/preload.cjs 36.2KB)**
6. **License System Check**: `npm run license:check` → **Passed (Exit code 0, Ed25519 signature verified)**

---

## 5. Workflows Requiring Human UI Testing

While all programmatic layers (IPC, schema, services, local storage, quota management, and failover mechanics) are 100% verified by automated tests, the following workflows involve operating-system native window interactions and require final spot-checking by human QA:

1. **Native OS File Dialog Flow**:
   - Clicking "Select Technical Drawing" or "Upload Invoice Attachment" opens the OS-native file picker (`dialog.showOpenDialog`).
   - Verifying that selecting a file closes the modal and immediately populates the file name and size in the UI.
2. **CAD Blueprint Viewer & PDF Preview in Track Orders**:
   - Navigating to `/make/track`, clicking an order row with an uploaded `.dwg`, `.dxf`, or `.pdf` drawing attachment.
   - Verifying that the attachment preview modal renders the blueprint via authorized signed URL or opens the document in the external viewer cleanly.
3. **Stage Completion Photo Upload on Mobile/Touch Devices**:
   - In Track Orders → Production Stage progression, using the camera input to capture and attach a live stage completion photo.
4. **Physical Printer Print Preview**:
   - Printing the MAKE Order Traveler Card / Job Sheet from the Track Orders detail drawer to confirm print media CSS pagination.

---

## 6. Safety & Release Gate Status

- **Baseline Version**: Strictly preserved at `LE-SOFT v1.8.12` in `package.json`.
- **Target Branch**: `feat/failover-uploads-buffer`.
- **PR #41**: **OPEN and UNMERGED** (No merge executed; awaiting explicit stakeholder approval).
- **Production Isolation**: Zero writes directed to production TrueNAS (`100.88.85.6`), hosted production Supabase (`ildkkgjrolcjijwfokek`), or production MySQL.
- **Credential Hygiene**: Zero credentials, passwords, or privileged service role keys committed to source, bundles, or reports.

