# LE-SOFT v1.8.13-rc.1 Release Candidate Notes

## Overview
LE-SOFT v1.8.13-rc.1 delivers comprehensive reliability, security, and functional enhancements across the MAKE manufacturing module and cloud-failover subsystem. It resolves upload timeouts on large files, eliminates quota identity mismatches, introduces a 3 GB soft buffer target with safe TrueNAS reconciliation and cloud catalog asset preservation, tightens order approval and pricing rules, enforces a single active product size with blueprint uploads, and provides granular user group permissions with server-side field redaction.

---

## Highlights & Key Enhancements

### 1. Upload Reliability, Magic-Byte Validation & Dynamic Timeouts (Phase 1)
* **Dynamic Upload Timeouts**: Replaced static 20-second timeouts with size-based dynamic timeouts:
  $$\text{timeoutMs} = \text{clamp}(30000,\, 300000,\, \lceil \text{bytes} / 200000 \rceil \times 1000 + 30000)$$
  providing 96+ seconds for ~13 MB files (e.g. `SN206279 black and white 2.png` 12.9 MB, `3.png` 13.3 MB) and up to 300 seconds for 50 MB files over Tailscale/WAN connections.
* **Eliminated `CLIENT_IDENTITY_MISMATCH`**: `SupabaseQuotaManager.resolveAuthoritativeClientId()` now derives client identity from active `auth.uid()` authenticated sessions before falling back to local IDs, satisfying Postgres RPC security checks without weakening boundaries.
* **Broadened Supported File Formats**: Extended image support to include `gif`, `bmp`, `tiff`, `tif`, `avif`, `heic`, and `heif` with binary magic byte validation and strict rejection of polyglot scripts/HTML (`<script`, `javascript:`, `#!/`).
* **Upload State Feedback**: Added upload progress indicators (`.upload-spinner`), disabled states, and duplicate-click guards on all file picker and attachment actions.

### 2. 3 GB Soft Buffer Quota Target & Safe TrueNAS Reconciliation (Phase 2)
* **Forward Migration `075_supabase_buffer_quota_3gb.sql`**: Raised the soft buffer target from 1 GB to 3 GB:
  - Hard Ceiling: 3,000,000,000 bytes (3.0 GB)
  - Storage Ceiling: 2,200,000,000 bytes (2.2 GB)
  - Database Ceiling: 500,000,000 bytes (500 MB)
  - Critical Reserve: 300,000,000 bytes (300 MB)
* **Soft Operational Target Policy**: Uploads crossing 3 GB trigger an `accelerated_reconciliation: true` flag rather than failing abruptly, while a 3.5 GB safety ceiling protects against runaway writes.
* **TrueNAS Replication Verification**: `server-reconciliation-daemon.cjs` verifies that objects exist on TrueNAS authoritative storage before pruning temporary cloud buffer objects.
* **Catalog Asset Exception**: Product catalog assets (images, specifications, blueprints) are permanently preserved in Supabase Cloud and exempt from buffer pruning.

### 3. Resilient Catalog Availability (Phase 3)
* Catalog browsing in `electron/ipc/handlers/make.ts` reads from Supabase Cloud first so product catalogs and drawings remain available even during TrueNAS or Tailscale network outages.
* Downstream sync to TrueNAS remains idempotent via `syncProductDownstream` and fallback journaling.

### 4. Order Approval, Admin Review Overrides & Pricing Rules (Phase 4)
* **Salesperson Order Approval**: Direct "Approve / Start Order" is restricted to orders where `amount_due === 0`.
* **Request Admin Review**: For orders with `amount_due > 0`, users can submit a formal review request. Admins can approve or reject the override. Approving releases the production hold while preserving financial integrity (`amount_due` is never marked as paid).
* **Session Salesperson Binding**: Salesperson assignment for non-admins is derived strictly from the active session (`currentUser`). Only Admins/Managers have access to override the salesperson dropdown.
* **Custom Line Item Discount Restrictions**: Custom items without a catalog product cannot receive discounts. The UI hides/disables line discounts with an explanatory badge, and the backend (`MakePricingService` and `MakeOrderItemInputSchema`) strictly rejects non-zero discounts on non-catalog items.

### 5. Single Product Size & Blueprint Management (Phase 5)
* **Single Product Size Architecture**: Added `size_id` to `make_products` with a non-destructive backfill from junction links. The product catalog and Place Order display the product's active size badge directly beside its name, eliminating redundant per-order size dropdowns while retaining custom dimensions.
* **Product Blueprint Upload**: Added blueprint upload support in `ProductCreateModal.tsx` for CAD drawings (PDF, DWG, DXF, STP, STEP, and image formats) and added a "View Blueprint" button on catalog cards and details headers.

### 6. Granular User Group Permissions & Server-Side Redaction (Phase 6)
* **Configurable Permissions**: Added four granular permissions under the MAKE group in `UserGroupCreate.tsx` and `src/utils/permissions.ts`:
  - `view_product_blueprint`
  - `view_product_cost_price`
  - `view_product_sale_price`
  - `view_product_max_discount`
* **IPC Data Redaction**: Handlers (`make-get-catalog-products`, `make-get-order-items`, `get-make-orders`) redact unauthorized fields before returning data across the IPC boundary to renderer processes.

---

## Migration & Deployment Instructions

### Database Migration: `075_supabase_buffer_quota_3gb.sql`
1. **Production Status**: **ALREADY APPLIED AND VERIFIED — DO NOT REAPPLY**.
   - Verified via read-only SQL check (`MIGRATION_075_READ_ONLY_CHECK.sql`) against production Supabase Cloud (`ildkkgjrolcjijwfokek`). All 22 assertions (quota limits, schema columns, indexes, and execution privileges) passed.
   - **DO NOT** run `npx supabase db push` or reapply this migration script to production.
2. **Local Staging / Docker**:
   For fresh local developer environments only:
   ```bash
   docker exec -i supabase_db_LE-SOFT psql -U postgres -d postgres < supabase/migrations/075_supabase_buffer_quota_3gb.sql
   ```

### Rollback Plan
If an unexpected defect requires rollback:
1. **Client Application Rollback**: Uninstall v1.8.13-rc.1 and reinstall v1.8.12. The NSIS uninstaller preserves user settings, local databases, and credentials. Older v1.8.12 clients do not call the new quota RPCs and operate normally.
2. **Reconciliation Daemon Rollback**: If daemon issues occur on TrueNAS, stop the daemon container (`docker compose stop reconciliation-daemon`) or revert its image. Clients detect daemon unavailability, trip their circuit breaker to `DEGRADED_FALLBACK`, stage uploads locally, and upload to the Supabase Cloud buffer until the daemon is restored.
3. **Database Rollback Guidance**: A database rollback is **not recommended** or required for application rollback because Migration 075 is fully backward-compatible (the added columns `blueprint_url` and `size_id` are nullable and ignored by older clients). **Do not blindly reapply older migration scripts (such as `070`)**, as doing so can conflict with newer schema states. If a database-level reversion is ever required, execute a separately reviewed, targeted down-migration.

---

## Verification & Test Results

| Verification Gate | Result | Details |
|---|---|---|
| **Frontend TypeScript** (`tsc --noEmit`) | **PASS** | 0 errors |
| **Electron TypeScript** (`tsc -p tsconfig.electron.json`) | **PASS** | 0 errors |
| **ESLint Check** (`npm run lint`) | **PASS** | 0 warnings, 0 errors |
| **Vitest Full Test Suite** (`TEST_REAL_SQLITE=true`) | **PASS** | 59 test files passed (970 passed, 0 failed, 20 skipped) in 15.72s |
| **Updater SemVer 2.0 Regression Suite** | **PASS** | 38/38 tests passed (`mac-updater-fallback` & `auto-updater`) |
| **Native SQLite Binding Resolution** | **PASS** | Rebuilt for Electron 40.10.2 (`NODE_MODULE_VERSION 143`); packaged SQLite CRUD, WAL mode, and queue recovery verified |
| **Vite Frontend Build** (`npm run build`) | **PASS** | Production bundle compiled |
| **Electron Bundling** (`node build-electron.cjs`) | **PASS** | Automated native rebuild integrated (step 2.5); bundles verified |
| **Windows Installer Build** (`electron-builder --win`) | **PASS** | `LESOFT-Setup-1.8.13-rc.1.exe` (`174,410,414` bytes, SHA-256: `50A7DF39E17467C1E793C44CD1DA7363928401DCC3C2648112A157C12A665FB0`) |
| **Installer Smoke Test Suite** (7A, 7B, 7C, 7D) | **PASS** | 4/4 passed (paths with/without spaces, fresh dir, silent uninstall/reinstall) |
| **Packaged Runtime GUI Launch Probe** | **PASS** | Main process and SQLite queues (`lesoft_durable_uploads.db`, `lesoft_durable_outbox.db`, `lesoft_offline.db`) initialized cleanly |
| **Migration 075 Production Audit** | **VERIFIED** | 22/22 checks PASS in Supabase Dashboard SQL Editor (`ildkkgjrolcjijwfokek`) |
| **Real NAS + Supabase Data-Flow Suite** | **PASS** | 10/10 tests passed (`nas-supabase-data-flow.integration.test.ts`) with SHA-256 bit-for-bit match |
| **Production Cloud → TrueNAS Test** | **BLOCKED** | Safe halt: process isolation prevents session token exposure; zero production mutations executed |
| **Credential Rotation Hygiene** | **ACTION REQUIRED** | Project API key reset required in Supabase Dashboard before public distribution |

---

## MANDATORY RELEASE GATE STATUS

> [!IMPORTANT]
> **RELEASE GATE IS ACTIVE — DEPLOYMENT HALTED (STRICT RELEASE HOLD)**
> Per mandatory release gate instructions:
> - Software update is NOT published, distributed, or deployed.
> - Git branch is NOT pushed, merged, or tagged for public release.
> - Production Supabase Cloud migrations are already active (do NOT re-apply).
> - TrueNAS reconciliation daemon is NOT restarted.
> - Local candidate is verified and held on local workstation awaiting explicit user approval.
