# MAKE Module Verification & Stabilization Report — LE-SOFT v1.8.12

**Module**: Custom Furniture & Orders (`MAKE` Module)  
**Version Baseline**: `LE-SOFT v1.8.12`  
**Target Branch**: `origin/feat/failover-uploads-buffer`  
**Pull Request**: PR #41 (Status: **OPEN and UNMERGED**)  
**Audit & Verification Date**: October 17, 2026  

---

## 1. Executive Summary

This report documents the architectural audit, upload-safety review, and comprehensive verification conducted on the **MAKE Module** of LE-SOFT v1.8.12. In accordance with project instructions, all work was restricted to the MAKE module, CAD and attachment upload dispatch safety, truthful URL resolution for private buckets, named order drafts, global specification image persistence (Migration 066 compatibility), resilient upload staging, failover recovery corrections, durable object key cleanup, and quota-managed cloud storage fallback. Unrelated Sales, Billing, inventory, and MySQL synchronization components were kept untouched.

All 30 MAKE test suites (comprising **521 automated tests**) pass cleanly. In addition, real native SQLite Write-Ahead Logging (WAL) was validated under Electron's Node runtime (ABI 143), real PostgreSQL Migration 070 quota RPC functions were validated against the local PostgreSQL container, and both TypeScript compilation targets (`tsc --noEmit` and `tsc -p tsconfig.electron.json --noEmit`), ESLint (`npm run lint`), Vite production build, and Electron esbuild bundling passed with zero errors or warnings.

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

### Defect 6: Cloud-Object Cleanup for Relative Durable Keys, Retry Safety, & Order Reference Reconciliation
- **Location**: `electron/services/media/DurableUploadService.ts`, `electron/services/make/MakeOrderService.ts`, `electron/ipc/handlers/make.ts`, `src/pages/Make/TrackOrders.tsx`, `src/pages/Make/PlaceOrder.tsx`
- **Root Cause**:
  1. `DurableUploadService.pruneCloudCopy()` passed relative object keys (stored in `remote_url_supabase`) directly to `new URL()`, throwing `TypeError: Invalid URL`.
  2. Entity record updates were executed after cloud deletion, risking orphaned records if updates failed.
  3. Pre-order staged attachments (invoices, custom CAD) lacked an owning `entity_id` at staging time, causing failover recovery workers to skip updating the newly created order record.
  4. TrackOrders UI lacked a distinct `PENDING` badge for offline staged attachments, attempting to open undefined or non-existent URLs.
- **Resolution**:
  1. Made `pruneCloudCopy()` support both relative object keys (`make-order-files/...` or subfolder keys) and legacy absolute URLs without crashing `new URL()`.
  2. Implemented strict multi-step failover recovery ordering: (a) verify TrueNAS persistence, (b) update and verify entity record references (replacing temporary keys and deduplicating array fields), (c) remove cloud object from Supabase, and (d) confirm quota release. If either cleanup or quota release fails, the upload is retained for retry rather than falsely marked fully reconciled.
  3. Added `associateUploadWithEntity(identifier, meta)` to link pre-order staged attachments with the newly created order ID immediately upon order creation.
  4. Added `PENDING` badge to `TrackOrders.tsx` for pending uploads and disabled viewing/downloading until synced. Updated `PlaceOrder.tsx` to retain persistent local attachment keys during offline order placement.

### Defect 7: Separation of Durable Acceptance from Remote Success & Cloud Cleanup Protection
- **Location**: `electron/services/media/DurableUploadService.ts`, `electron/services/make/MakeCadService.ts`, `electron/services/make/MakeOrderService.ts`, `electron/ipc/handlers/make.ts`, `src/pages/Make/PlaceOrder.tsx`
- **Root Cause**:
  1. `MakeCadService.uploadValidatedBuffer()` reported `success: false` during TrueNAS outages even when files were safely staged locally, causing invoice attachment handlers (`make-pick-and-upload-invoice-attachment`, `make-upload-invoice-attachment-buffer`) and `PlaceOrder.tsx` to discard valid attachments.
  2. `PlaceOrder.tsx` dropped offline attachments because it strictly checked `if (res && res.success)`.
  3. `DurableUploadService.updateEntityRecord()` previously returned `true` when missing owner metadata (`!entityType || !entityId || !fieldName`), allowing unassociated temporary cloud copies to be prematurely deleted (`pruneCloudCopy`) before owning orders/items were created.
  4. `MakeOrderService.createOrder()` did not check the boolean return value of `associateUploadWithEntity()`, risking silent association failures.
  5. If an unassociated upload was reconciled by a background worker before order creation, the cloud copy could be pruned before the database reference was updated.
- **Resolution**:
  1. Defined distinct outcomes: remote success (`status: 'synced_nas'`), cloud-buffered success (`status: 'buffered_supabase'`), and locally staged/pending upload (`status: 'staged_local'`, `isPendingUpload: true`, `publicUrl: undefined`, `durableKey: ...`). Staged local attachments are never reported as remotely available.
  2. Updated invoice and drawing IPC handlers and `PlaceOrder.tsx` to accept `isPendingUpload: true`, retaining persistent durable keys without discarding offline files.
  3. Added `PENDING UPLOAD` badge in `PlaceOrder.tsx` invoice attachment list for immediate visual transparency.
  4. Made `DurableUploadService.updateEntityRecord()` return `false` if owner metadata is missing. Missing owner metadata never counts as a confirmed database update.
  5. Added durable state `'awaiting_association'` in `DurableUploadService`: if TrueNAS upload succeeds while an upload has a temporary cloud copy but no confirmed owner, destructive cleanup (`pruneCloudCopy`) is deferred, preserving the cloud copy and quota until confirmed.
  6. In `MakeOrderService.createOrder()`, checked the boolean result of every `associateUploadWithEntity()` call, logged observable warnings for failures, queued pending associations, and returned `unassociatedUploads`.
  7. Covered the background worker race condition: unassociated uploads remain in `'awaiting_association'` until the order-creation process associates them, at which point reconciliation updates the entity and prunes the cloud copy.
  8. Made dispatch retry idempotent: already `synced_nas` records return early without redundant NAS transfers or quota calls, and `remote_url_supabase` is set to `NULL` upon verified cloud pruning.

### Defect 8: Final Data-Integrity Gate: Durable Reference Persistence, Verified Atomic Updates, and Read-Time URL Resolution
- **Location**: `electron/services/make/MakeCadService.ts`, `electron/services/make/MakeOrderService.ts`, `electron/services/media/DurableUploadService.ts`, `electron/ipc/handlers/make.ts`, `src/utils/placeOrderDraft.ts`, `src/pages/Make/PlaceOrder.tsx`, `src/pages/Make/TrackOrders.tsx`
- **Root Cause**:
  1. Place Order and draft persistence previously accepted temporary Supabase signed URLs (containing ephemeral `?token=...` query parameters), which expired after 3600 seconds and broke subsequent attachment viewing.
  2. `DurableUploadService.updateEntityRecord()` did not assert the row-count of database updates (`rowsAffected === 0`), risking unconfirmed updates permitting premature cloud cleanup if a referenced order or item record did not exist.
  3. Invoice attachment readers in `TrackOrders.tsx` lacked on-demand signed URL generation via IPC and did not clearly distinguish pending TrueNAS sync from confirmed persistent files.
- **Resolution**:
  1. **Durable References Enforced**: Added `normalizeAttachmentReference()` to `MakeOrderService.ts` and updated `getPersistentAttachmentReference()` in `placeOrderDraft.ts` to strip Supabase hostnames, signed URL endpoints (`/storage/v1/object/sign/`), and tokens (`?token=...`), persisting only durable object keys (`make-order-files/...`) or confirmed TrueNAS URLs (`https://storage.lenas.me/...`).
  2. **Draft & UI Protection**: Updated `PlaceOrder.tsx` to strictly prefer `res.durableKey` over ephemeral signed URLs, ensuring order records and local drafts remain permanently valid even after temporary tokens expire.
  3. **Atomic Owner Update Verification**: In `DurableUploadService.updateEntityRecord()`, added a pre-update `select('id')` check and chained `.select('id')` to `.update()`, asserting `rowsAffected > 0`. Updates affecting 0 rows strictly return `false`, preventing destructive cloud removal or quota prune.
  4. **Strict Reconciliation Sequence**: Verified the exact execution sequence: `db_update_order_reference` -> `cloud_storage_remove` -> `quota_prune_release`. Cloud cleanup and quota release are strictly blocked if order reference updates fail.
  5. **Read-Time Signed URL Resolution**: Registered `make-resolve-attachment-url` IPC handler (exposed via `preload.ts` and typed in `electron.d.ts`). Expired signed URLs passed to `resolveAttachmentUrl()` are automatically parsed back to clean storage keys and issued fresh, authorized 3600-second tokens on demand without storing tokens in the database.
  6. **Track Orders Transparency**: Added a `PENDING SYNC` badge in `TrackOrders.tsx` for attachments awaiting TrueNAS confirmation. On-click view and download operations dynamically re-resolve fresh signed URLs via IPC.

### Defect 9: Attachment URL Resolution Security Gate & Durable Association Recovery Across Process Restarts
- **Location**: `electron/ipc/handlers/make.ts`, `electron/services/media/DurableUploadService.ts`, `tests/setup.ts`, `tests/make/make-module-stability.integration.test.ts`
- **Root Cause**:
  1. `make-resolve-attachment-url` previously lacked main-process `requireSession()` authentication and role authorization checks.
  2. `make-get-pdf-urls`, `make-download-pdf`, and `make-get-order-items` lacked explicit session enforcement and role checks.
  3. Renderer-supplied URLs and storage keys could theoretically be requested without verifying that the attachment belongs to an order or item the session is authorized to access. In early iterations, authorization matched loosely if a parsed upload ID appeared anywhere in a SQLite row, even if combined with an unauthorized or spoofed object path.
  4. TrueNAS storage endpoints were validated via string-prefix matching rather than strict hostname and port parsing, risking lookalike domain prefix bypasses (e.g. `https://storage.lenas.me.attacker.com`).
  5. Association retries were stored in an in-memory `Map` (`pendingAssociations`), meaning if the Electron process restarted before the association occurred, the retry metadata was lost, leaving unassociated uploads in SQLite without durable context.
  6. Uploads in `awaiting_association` state needed durable metrics tracking.
- **Resolution**:
  1. **Main-Process Session Enforcement**: Added `requireSession()` and `canViewMakeOrders(session)` to `make-resolve-attachment-url`, `make-get-pdf-urls`, `make-download-pdf`, and `make-get-order-items`.
  2. **Canonical Object-Key Authorization**: Implemented `isAuthorizedAttachment(rawRef, session)` in `electron/ipc/handlers/make.ts`. Does NOT authorize an object merely because its parsed upload ID matches a SQLite row. Instead:
     - Canonicalizes requested references via `extractCanonicalSupabaseKey()` and `isTrustedNasUrl()`.
     - Cross-checks against exact recorded Supabase keys (`remote_url_supabase`) or recorded TrueNAS URLs (`remote_url_nas`) in SQLite.
     - Requires valid owner metadata (`entity_type IN ('make_orders', 'make_order_items') AND entity_id IS NOT NULL`) for normal access. Unassociated buffered uploads cannot be signed.
     - Cross-checks remote `make_orders` and `make_order_items` against exact canonical keys.
     - Guarantees that the resolved key passed to `createSignedUrl()` is the same canonical object key that was authorized.
     - Fails closed with `'Forbidden: Attachment is unassociated or access is unauthorized.'` on any unauthorized, malformed, or unassociated reference.
  3. **Exact Hostname NAS Validation**: Implemented `isTrustedNasUrl(rawUrl)` enforcing exact hostname matching (`storage.lenas.me` strictly on HTTPS:443; approved Tailscale/LAN IPs strictly on HTTP:8080/8081/80). String-prefix checks and lookalike domain prefixes are strictly rejected.
  4. **Persisted Association Metadata (`pending_associations` SQLite table)**: Replaced process-local-only `pendingAssociations` fallback with durable SQLite table `pending_associations (identifier TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_name TEXT NOT NULL, retry_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`.
  5. **Startup & Worker Reconciliation**: Added `reconcilePendingAssociations()` executed on `initDatabase()` and before `processNextBatch()`, reloading persisted pending associations from SQLite and linking them to `durable_uploads`.
  6. **Durable Metrics & Quota Retention**: Updated `getPendingUploadStats()` to return `{ stagedCount, bufferedCount, awaitingAssociationCount, totalPendingBytes }`, including `awaiting_association` bytes in `totalPendingBytes` so cloud copy and quota remain preserved.
  7. **Genuinely Tested Pending-Association Recovery vs. Ordinary Upload Retry**:
     - *Ordinary upload retry*: Verifies that a known, already-associated upload whose cloud prune fails will preserve its cloud copy and quota accounting for subsequent retry (verified in Test 7).
     - *Genuine pending-association recovery across restart*: Distinctly verified in Test 8:
       (a) A real upload is staged WITHOUT owner metadata (`entity_type: null, entity_id: null`).
       (b) A pending association is persisted in SQLite `pending_associations` for that exact upload identifier.
       (c) The upload is confirmed to remain unassociated in `durable_uploads` before reset (no pre-association beforehand).
       (d) The service instance is reset and recreated against the same SQLite database (`resetInstanceForTesting()` + `getInstance()`).
       (e) Startup reconciliation (`reconcilePendingAssociations()`) automatically resolves the persisted association, links the unassociated upload to its owner entity (`make_orders` 999), and consumes the pending association record.
       (f) Remote database entity update failure (e.g. 0 rows affected) strictly retains the cloud copy and quota accounting for retry.
       (g) Upon restoring the owner entity, the database owner-reference update strictly precedes cloud removal and quota release (`db_update_order_reference` -> `cloud_storage_remove` -> `quota_prune_release`).
  8. **Comprehensive IPC Security Gate Tests**:
     - Test 11: Rejection of malformed references and path traversal attempts (`..`, `\0`).
     - Test 12: Fail-closed rejection of unassociated object keys.
     - Test 13: Authorized resolution of legitimate owned attachments.
     - Test 14: Enforced session authentication and authorization on `make-get-pdf-urls` and `make-download-pdf`.
     - Test 15: Rejection when an existing valid upload ID is combined with an unauthorized/different object path.
     - Test 16: Rejection preventing unassociated buffered uploads from being signed.
     - Test 17: Strict rejection of lookalike NAS domain prefix bypasses (e.g. `storage.lenas.me.attacker.com`).

---

## 3. End-to-End MAKE Architectural Audit

| Step / Layer | Component | Verification & Safety Status | Evidence |
| :--- | :--- | :--- | :--- |
| **1. UI Form & Input** | `src/pages/Make/PlaceOrder.tsx` | Customer name required; phone format and dummy placeholder validation (`00000000`, `1234567890`, `none`). Retains pending upload keys with `PENDING UPLOAD` badge. | Verified in `tests/make/make-module-stability.integration.test.ts` |
| **2. Draft Storage** | `src/utils/placeOrderDraft.ts` | Autosave and named drafts stored in `localStorage` scoped per user. Ephemeral `blob:` and `data:` URLs stripped via `getPersistentAttachmentReference` to prevent browser quota exhaustion. Preserves durable object keys. | Verified in `tests/make/place-order-draft.test.ts` & `place-order-saved-drafts.test.ts` |
| **3. Preload IPC Bridge** | `electron/preload.ts` | Safe context isolation; renderer never receives arbitrary filesystem paths; dialog returns validated buffers. | Verified in `tests/make/pdf-download-security.test.ts` |
| **4. IPC Handlers** | `electron/ipc/handlers/make.ts` | 40+ handlers guarded with `requireSession()`, CASL abilities, and Zod schemas (`CreateMakeOrderSchema`, `CatalogSpecSchema`). Attachment read handlers resolve authorized signed URLs. Retains locally staged files (`isPendingUpload: true`). | Verified in `tests/make/security.test.ts` & `tests/make/make-module-stability.integration.test.ts` |
| **5. Order Service** | `electron/services/make/MakeOrderService.ts` | Canonical `MAKE-YYYY-XXXXXX` order numbers; server-side financial calculation; atomic order header rollback if item insertion fails. Checks boolean association results and surfaces unassociated uploads. | Verified in `tests/make/make-module-stability.integration.test.ts` |
| **6. CAD & Attachments** | `electron/services/make/MakeCadService.ts` | 50 MB limit for CAD/drawings, 15 MB for stage photos/invoices; binary magic-byte inspection rejects PE/MZ/ELF executables and shell scripts. Unicode/space filenames sanitized. Staged local state clearly distinguished from confirmed remote state (`isPendingUpload: true`). | Verified in `tests/make/invoice-attachments.test.ts` & `tests/make/make-module-stability.integration.test.ts` |
| **7. Durable Staging** | `electron/services/media/DurableUploadService.ts` | Local staging to disk with SHA-256 computation before transfer; background retry queue with WAL SQLite journal; per-upload single-flight protection. Defers destructive cloud cleanup (`awaiting_association`) until owner association is confirmed. | Verified in `tests/make/smart-failover-uploads-buffer.test.ts` & `tests/make/make-module-stability.integration.test.ts` |
| **8. Cloud Fallback & Quota** | `electron/services/quota/SupabaseQuotaManager.ts` | Strict 600 MB fallback quota ceiling with reservation and commitment transitions; zero writes to unmonitored buckets. | Verified in `tests/integration/supabase-quota-rpc.pg-integration.test.ts` |
| **9. Database Schema** | Migration 052, 061, 063, 066, 067, 070 | Idempotent table definitions; `make_product_specifications.image_url` nullable; RLS policies for `make_orders`, `make_order_items`, `make-order-files`. | Verified via PostgreSQL 17 schema check |

---

## 4. Verification Evidence & Test Execution Results

### 4.1 MAKE Automated Test Suite (Vitest)
Ran `npx vitest run tests/make`:
- **Test Files**: 30 passed (30 total)
- **Individual Tests**: 521 passed (521 total, 0 failed, 0 skipped)
- **Exit Code**: `0`
- **Duration**: ~15.8 seconds
- **Covered Test Files**:
  1. `tests/make/make-module-stability.integration.test.ts` (55/55 passed) **[EXPANDED with Process Restart Safety, Persisted Association Recovery, Object-Key Authorization & IPC Security Gate Tests]**
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
  16. `tests/make/pdf-download-security.test.ts` (36/36 passed)
  17. `tests/make/place-order-draft.test.ts` (8/8 passed)
  18. `tests/make/place-order-saved-drafts.test.ts` (8/8 passed)
  19. `tests/make/pricing.test.ts` (12/12 passed)
  20. `tests/make/product-catalog-features.test.ts` (22/22 passed)
  21. `tests/make/product-search.test.ts` (14/14 passed)
  22. `tests/make/responsive-layout.test.ts` (10/10 passed)
  23. `tests/make/security.test.ts` (18/18 passed)
  24. `tests/make/simplified-image-ui-and-nas-audit.test.ts` (12/12 passed)
  25. `tests/make/smart-failover-uploads-buffer.test.ts` (39/39 passed)
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
- **Failover Recovery Verification**:
  1. `DurableUploadService.pruneCloudCopy()` verified against relative keys (`make-order-files/...`), subfolder relative keys, and legacy absolute URLs without `new URL()` runtime crashes.
  2. Multi-step recovery sequencing verified: TrueNAS persistence confirmed -> entity record updated -> update confirmed -> cloud object pruned -> quota release confirmed. Failures at any stage keep upload retryable.
  3. Pre-order staged attachments safely linked to orders/items upon creation via `associateUploadWithEntity()`.
  4. Array fields (`pdf_urls`, `invoice_attachment_urls`) deduplicated during recovery reconciliation.
  5. Offline pending state represented truthfully (`isPendingUpload: true`, `publicUrl: undefined`, `durableKey: ...`) with `PENDING` badge in TrackOrders UI.
  6. Data-Integrity Gate verified: durable keys persisted in drafts and order records without token expiration vulnerability; signed URLs generated on-demand at read-time via `makeResolveAttachmentUrl`; entity updates asserted with `rowsAffected > 0` before cloud cleanup; full lifecycle from offline buffer -> order creation -> association -> TrueNAS recovery -> reference update -> cloud cleanup -> quota release verified.
  7. Final Security & Restart-Safety Gate verified: main-process `requireSession()` and role checks enforced on all attachment read, download, and URL resolution endpoints; strict canonical object-key authorization via `isAuthorizedAttachment()` cross-checking exact recorded keys and requiring valid owner metadata (unassociated buffered uploads cannot be signed, and spoofed object paths with valid upload IDs are rejected); exact hostname/port validation on TrueNAS endpoints (rejecting lookalike domain prefix bypasses); genuine process-restart pending-association recovery tested with `resetInstanceForTesting()` without pre-association, proving startup reconciliation links the upload, failure retains cloud copies and quota, and database update precedes cloud removal and quota release.
- **Quality Gates**: All 6 gates passed (TSC frontend 0 errors, TSC electron 0 errors, ESLint 0 warnings, Vite build exit 0, Electron build exit 0, License verification exit 0).

