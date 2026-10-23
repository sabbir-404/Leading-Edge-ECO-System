# LE-SOFT v1.8.13-rc.1 — Phase 3.1: Release Blocker Audit and Closure Report

**Date:** 2026-10-21  
**Audit Phase:** Phase 3.1 Release Blocker Audit, Source State Verification & Safety Closure  
**Target Release:** `LE-SOFT v1.8.13-rc.1`  
**Git Branch:** `feat/failover-uploads-buffer`  
**Application Path:** `F:\Code\Leading Edge\LE-SOFT`  
**Repository Root:** `F:\Code\Leading Edge`  
**Supabase Cloud Project:** `ildkkgjrolcjijwfokek` (`https://ildkkgjrolcjijwfokek.supabase.co`)  
**TrueNAS PostgREST:** `http://100.88.85.6:3001` (PostgREST v12.2.0 active)  
**TrueNAS Object Storage:** `http://100.88.85.6:8081`  
**Packaged Installer:** `release/LESOFT-Setup-1.8.13-rc.1.exe` (166.33 MB)  

---

## Executive Summary & Final Release Gate Decision

### Final Release Gate Verdict: 🔴 NO-GO FOR IMMEDIATE PRODUCTION RELEASE

> [!CAUTION]
> **FINAL RELEASE VERDICT: NO-GO FOR PRODUCTION RELEASE (MAINTAIN OPERATIONAL HOLD)**  
> **Status:** All software code defects across Electron, the WordPress Sales Portal, and the NAS Pull Replication Daemon have been **100% remediated, locally verified, and certified regression-free** (682/682 tests passing in `tests/make`, 110/110 tests passing in `tests/security`, 53/53 tests passing in worker replication integration suite, 4/4 installer smoke tests passed, zero TypeScript compilation errors).  
> **Blocker Reason:** The release gate **CANNOT BE LIFTED** until designated production systems administrators execute the four mandatory, irreversible operational prerequisites in the production environment:
> 1. Invalidation and rotation of the previously exposed Supabase service-role secret key.
> 2. Execution of `truenas-security-hardening.sql` on TrueNAS PostgreSQL and restart of PostgREST with verified `TRUENAS_POSTGREST_JWT_SECRET`.
> 3. Execution of Schema Migration `076_reconcile_make_orders_schema.sql` on Supabase Cloud.
> 4. Execution of the Dry-Run Reconciliation Manifest followed by controlled batch execution of `proposed_production_recovery.sql`.

---

## Phase A — Exact Source State & Working Tree Audit

### 1. Git State & Branch Tracking

| Metric | Recorded Value |
|---|---|
| **Repository Root** | `F:\Code\Leading Edge` |
| **Current Branch** | `feat/failover-uploads-buffer` |
| **Local HEAD Commit** | `eba5c84df8c9b786dc9b0074e6b54a02ac06644b` |
| **Remote Tracking Branch** | `origin/feat/failover-uploads-buffer` |
| **Remote HEAD Commit (FETCH_HEAD)** | `5cdc59e91692c8865b0c945d1a997b6c6f28274d` |
| **Branch Divergence** | Ahead by 2 commits (`e17c5ad`, `eba5c84`), behind by 0 commits |
| **Ahead Commit 1** | `e17c5ad` fix(replication): implement identity-safe entity mapping and natural key reconciliation for TrueNAS replication |
| **Ahead Commit 2** | `eba5c84` fix(replication): cache compatible schema projections and suppress repeated discovery warnings |
| **`git diff --check` Result** | Clean — 0 whitespace or formatting errors |
| **Submodule State** | `LE Mail Campaign software` preserved unchanged |

### 2. File-by-File Tracking & Status Matrix

| Component File | Local Repository Path | Git Tracking Status | Remote (origin) Status | Discrepancy & Resolution |
|---|---|---|---|---|
| **Replication Daemon** | `LE-SOFT/scripts/nas-pull-replication-worker.cjs` | Tracked, modified | Exists on origin (earlier v1) | Remote lacked natural key reconciliation and identity collision re-mapping. Local contains complete collision safety. |
| **Worker Integration Suite** | `LE-SOFT/tests/integration/nas-pull-replication-worker.test.ts` | Tracked, modified | Exists on origin (earlier v1) | Remote lacked test coverage for Order 15 collision resolution and product natural key reconciliation. Local covers 53 tests. |
| **TrueNAS Compose** | `LE-SOFT/docker-compose-truenas.yml` | Tracked, modified | Exists on origin (unhardened) | Remote binds to `0.0.0.0:3001` with `admin` anon role and no JWT. Local configures `127.0.0.1:3001`, `web_anon`, and `PGRST_JWT_SECRET`. |
| **Security Hardening SQL** | `LE-SOFT/scripts/truenas-security-hardening.sql` | Untracked (`??`) | Absent from origin | Staged locally. Must be committed before release promotion. |
| **Recovery SQL** | `LE-SOFT/scripts/proposed_production_recovery.sql` | Untracked (`??`) | Absent from origin | Staged locally with batch ledger and surgical rollback. Must be committed before release. |
| **Schema Migration 076** | `LE-SOFT/supabase/migrations/076_reconcile_make_orders_schema.sql` | Untracked (`??`) | Absent from origin | Staged locally. Idempotent DDL. Must be committed before release. |
| **Release Closure Report** | `LE-SOFT/release/PHASE3_1_RELEASE_BLOCKER_CLOSURE.md` | Tracked after `.gitignore` fix | Absent from origin | `LE-SOFT/.gitignore` had `release/*` which masked markdown reports. Resolved by adding `!release/*.md`. |

---

## Phase B — Replication & Order Identity Safety Audit

### 1. Cryptographic File Integrity & Checksums

| File | Relative Workspace Path | SHA-256 Checksum |
|---|---|---|
| **Replication Worker** | `LE-SOFT/scripts/nas-pull-replication-worker.cjs` | `3042363b543dd6245d3a59cc1eff0f9ad6826372c8511c038ddb331face7d46c` |
| **Security Hardening SQL** | `LE-SOFT/scripts/truenas-security-hardening.sql` | `34e806a467ad01baf6e50ac4ad55322b5026d6fad8de04c141709c5d0a9fbdcc` |
| **Recovery SQL** | `LE-SOFT/scripts/proposed_production_recovery.sql` | `b24ddf945142aa0a8703bc8bfdf20cfe499283c50f3bcb5a6f0218b45a6bc9f6` |
| **Schema Migration 076** | `LE-SOFT/supabase/migrations/076_reconcile_make_orders_schema.sql` | `acb9b3edce21e8bc45ca5f9a13b552f56bf7ca871093b121ce7a08c2e3614e87` |
| **TrueNAS Compose** | `LE-SOFT/docker-compose-truenas.yml` | `ae811aa43b69657a3a82d89e5911b428a682a7faba043833a02d21bd3e91016a` |
| **WordPress DB Client** | `wordpress-plugin/.../class-nas-db-client.php` | `4893bc9753891923764b6232ea07e897a36bd74f6f62d2fe964432843c69163d` |
| **Installer Setup** | `LE-SOFT/release/LESOFT-Setup-1.8.13-rc.1.exe` | `50a7df39e17467c1e793c44cd1da7363928401dcc3c2648112a157c12a665fb0` |

### 2. Identity Collision & Cross-Database Order Protection
- **Forensic Conflict Verified:** Order ID 15 on Supabase Cloud is a synthetic test order (`LE-ORD-20260909-JTYN`, customer "test", created 2026-09-09), whereas Order ID 15 on TrueNAS is customer "Right Way" (`MAKE-2026-613437`, created 2026-09-15).
- **Collision Resolution Engine:** In `scripts/nas-pull-replication-worker.cjs`:
  - When pulling source order `15`, the worker checks `SELECT id, order_number FROM make_orders WHERE id = 15`.
  - It detects that target row 15 has `order_number = 'MAKE-2026-613437'` while source order has `LE-ORD-20260909-JTYN`.
  - It **DOES NOT** overwrite target ID 15. Instead, it queries the database sequence (`RETURNING id`), allocates a clean new integer target ID, and logs the mapping in `nas_replication_id_map` (`entity_type='make_orders', source_id='15', target_id=<NEW_ID>, natural_key='LE-ORD-20260909-JTYN'`).
  - Child records (`make_order_items`, `make_order_updates`) resolve `order_id` dynamically via `resolveTargetOrderId`.
- **Product & Category Collisions:** Product ID collisions are similarly resolved via `product_code` natural key matching. Categories are reconciled by normalized name matching (`LOWER(TRIM(name))`).
- **Tombstone Source Verification:** When a tombstone row is processed, the worker queries Supabase Cloud before deleting. If the source record still exists or if the query fails, the deletion fails closed and the TrueNAS record is preserved.

---

## Phase C — Security Configuration & Network Audit

### 1. Active TrueNAS Deployment Probe Findings
- **Endpoint Probed:** `http://100.88.85.6:3001/`
- **Active Server Banner:** `Server: postgrest/12.2.0`
- **Vulnerability Confirmed:** `curl.exe -s "http://100.88.85.6:3001/make_orders?select=id&limit=1"` returned `[{"id":77}]` over Tailscale with **ZERO authentication headers**.
- **Root Cause:** In the active production deployment, PostgREST listens on `0.0.0.0:3001` with anonymous access granted to business tables.

### 2. Client Connectivity & Loopback Binding Analysis

```
[WordPress Sales Portal] (Public Cloud Web Server)
         │
         │ HTTPS (Cloudflare Tunnel: https://db.lenas.me)
         ▼
[cloudflared on TrueNAS Host]
         │
         │ Local loopback proxy (http://127.0.0.1:3001)
         ▼
[PostgREST Container (3001)] ──(HMAC-SHA256 JWT Verification: nas_authenticated)──► [TrueNAS PostgreSQL]
         ▲
         │ Internal Docker network (port 5432)
[NAS Pull Replication Worker] (Direct DB credentials: nas_replicator)
```

| Client Consumer | Network Route | Authentication Mechanism | Role Assumed | Compatibility with `127.0.0.1:3001` |
|---|---|---|---|---|
| **Desktop LE-SOFT** | Direct HTTPS to Supabase Cloud (`ildkkgjrolcjijwfokek.supabase.co`) | Supabase User JWT / Anon Key | `authenticated` / `anon` | **COMPATIBLE** — Desktop client writes canonically to Supabase Cloud. Does not require direct PostgREST access. |
| **WordPress Sales Portal** | Cloudflare Tunnel (`https://db.lenas.me`) -> host localhost 3001 | HMAC-SHA256 JWT via `LE_MAKE_NAS_JWT_SECRET` | `nas_authenticated` | **COMPATIBLE** — `cloudflared` forwards from `https://db.lenas.me` to `http://127.0.0.1:3001`. |
| **NAS Replication Daemon** | Docker internal network to TrueNAS PostgreSQL (`5432`) | Direct PostgreSQL user `nas_replicator` | `nas_replicator` | **COMPATIBLE** — Bypasses PostgREST entirely on database port 5432. |
| **Tailscale / LAN Direct Probes** | `http://100.88.85.6:3001` or `http://192.168.1.14:3001` | None | None | **BLOCKED (INTENDED)** — TCP connection refused on loopback; anonymous snooping eliminated. |

> [!NOTE]
> If desktop clients on the LAN (`192.168.1.14:3001`) or Tailscale (`100.88.85.6:3001`) are ever required to query PostgREST directly (e.g. for offline local caching), PostgREST should be bound to the specific interface with `PGRST_JWT_SECRET` enforced and `web_anon` granted 0 table access. In the primary authoritative architecture, desktop clients communicate directly with Supabase Cloud.

---

## Phase D — Schema Migration & Recovery Procedure Audit

### 1. Schema Migration 076 Audit
- **File:** `supabase/migrations/076_reconcile_make_orders_schema.sql`
- **Columns Added:** `factory_manager_id (BIGINT NULL)`, `factory_manager_name (TEXT NULL)`, `current_stage_photo (TEXT NULL)`, `reference_bill_no (TEXT NULL)`, `target_delivery_days (INTEGER NULL)`.
- **Safety Assessment:**
  - Idempotent: Uses `ADD COLUMN IF NOT EXISTS`.
  - Non-blocking: All columns are nullable; existing production rows are untouched.
  - Performance: Adds partial indexes on `reference_bill_no` and `factory_manager_id` (`WHERE column IS NOT NULL`).
  - Cache: Dispatches `NOTIFY pgrst, 'reload schema';`.

### 2. Statement-by-Statement Recovery SQL Audit ([proposed_production_recovery.sql](file:///F:/Code/Leading%20Edge/LE-SOFT/scripts/proposed_production_recovery.sql))
- **Section 0 (Ledger Infrastructure):** Creates `public.recovery_batch_ledger` and `public.recovery_batch_records`.
- **Section 1 (Staging Tables):** Session temporary tables (`staging_truenas_orders`, `staging_truenas_items`) with `ON COMMIT DROP`.
- **Section 2 (Dry-Run Manifest Generator):**
  - Performs 5 read-only validation queries:
    1. Duplicate `order_number` detection in staging.
    2. Orphaned item detection (items without matching order in staging or destination).
    3. New order count calculation.
    4. Existing order count calculation.
    5. Synthetic Order 15 collision check (`order_number = 'LE-ORD-20260909-JTYN'`).
  - Aborts immediately with `RAISE EXCEPTION` if any conflict is detected.
- **Section 3 (Controlled Execution Block):**
  - Enforces `v_dry_run := TRUE` by default. Accidental execution causes zero writes.
  - When set to `v_dry_run := FALSE` by an administrator:
    - Inserts `batch_id` into `recovery_batch_ledger`.
    - For existing orders: saves full pre-existing row snapshot (`to_jsonb(make_orders.*)`) in `recovery_batch_records` before executing `UPDATE`.
    - For new orders: inserts row and logs generated `target_id` and `order_number`.
    - For line items: resolves `order_id` to exact parent `make_orders.id` via natural key matching.
- **Section 4 (Surgical Rollback Runbook):**
  - **Complete Column Restoration:** Restores all 19 modified fields from `pre_existing_data` JSONB (`reference_bill_no`, `target_delivery_days`, `furniture_name`, `description`, `quantity`, `priority`, `delivery_date`, `target_delivery_date`, `requested_delivery_date`, `salesperson_name`, `status`, `current_stage`, `cost_price`, `sale_price`, `final_price`, `money_received`, `amount_due`, `payment_status`, `invoice_attachment_urls`).
  - Deletes strictly the rows inserted by `v_target_batch`.
  - Zero date-range or ID-range deletions. Order 15 and all unrelated orders are untouched.

---

## Phase E — Credential Rotation Plan (Zero Secret Exposure)

### 1. Consumer Dependency Inventory

| Credential Consumer | Configuration Location | Key Type | Access Scope | Rotation Dependency |
|---|---|---|---|---|
| **TrueNAS Replication Worker** | TrueNAS `.env` / Container Environment | Supabase `service_role` API Key | Full bypass of Supabase RLS | `SUPABASE_REPLICATION_KEY` |
| **WordPress Sales Portal** | WordPress `wp-config.php` | Supabase `service_role` API Key | REST API `/rest/v1/make_orders` | `LE_MAKE_SUPABASE_SERVICE_KEY` |
| **Desktop LE-SOFT (Electron)** | `electron-builder` / app config | Supabase `anon` Public Key | Governed strictly by RLS & user auth | **IMMUNE** — Does not possess or use `service_role` |

### 2. Step-by-Step Rotation Runbook
1. **Generate New Key:** Administrator navigates to **Supabase Dashboard -> Project Settings -> API** and clicks **Generate New Secret Key** for `service_role`.
2. **Update TrueNAS Replication Worker:** Update `SUPABASE_REPLICATION_KEY=<NEW_KEY>` in the TrueNAS environment and restart `lesoft-nas-pull-worker`.
3. **Update WordPress Sales Portal:** Update `define('LE_MAKE_SUPABASE_SERVICE_KEY', '<NEW_KEY>');` in `wp-config.php`.
4. **Validate Consumers:**
   - Execute a test order submission on the WordPress portal.
   - Inspect worker logs to confirm successful read cycle from Supabase Cloud.
5. **Deactivate Legacy Key:** Once both consumers confirm operational health, revoke the old compromised key in the Supabase Dashboard.

> [!WARNING]
> **API Key Rotation vs. JWT Signing Secret:** Do **NOT** rotate the Supabase Project JWT Signing Secret. Rotating the JWT secret invalidates all active user login sessions across the entire organization. The rotation applies strictly to the `service_role` API key.

---

## Phase F — Tests, Versioning & Release Evidence

### 1. Test Suite Results Summary

```
================================================================================
LE-SOFT v1.8.13-rc.1 AUTOMATED VERIFICATION AUDIT
================================================================================
Phase 3 Data Integrity Suite:        8 passed | 0 failed | 8 total     (8ms)
Worker Replication Integration Suite: 53 passed | 0 failed | 53 total   (309ms)
MAKE Module Core Suites:             682 passed | 0 failed | 682 total  (16.56s)
Security & Authorization Suites:     110 passed | 0 failed | 110 total  (8.21s)
Integration Suites:                  105 passed | 29 skipped | 134 total (3.62s)
TypeScript Static Verification:      0 errors   | 0 warnings | Clean     (tsc --noEmit)
Bounded Installer Smoke Tests:       4 passed   | 0 failed | 4 total     (108s)
================================================================================
TOTAL TESTS PASSING:                 958 PASSED | 0 FAILED | 29 SKIPPED (Staging Opt-in)
================================================================================
```

### 2. Installer Smoke Test Evidence ([scripts/installer-smoke-test.cjs](file:///F:/Code/Leading%20Edge/LE-SOFT/scripts/installer-smoke-test.cjs))
- **Executable:** `F:\Code\Leading Edge\LE-SOFT\release\LESOFT-Setup-1.8.13-rc.1.exe`
- **SHA-256:** `50a7df39e17467c1e793c44cd1da7363928401dcc3c2648112a157c12a665fb0`
- **Size:** 166.33 MB (Installer) / 204.41 MB (Installed `LESOFT.exe`) / 176.67 MB (`app.asar`)
- **ProductVersion:** `1.8.13.0` | **FileVersion:** `1.8.13-rc.1`
- **Test 7A (Standard Install):** Exited `code 0` in 24.99s. ASAR integrity verified.
- **Test 7B (Path with Spaces):** Exited `code 0` in 15.73s. Space-handling verified.
- **Test 7C (Fresh Directory):** Exited `code 0` in 16.90s. Clean install verified.
- **Test 7D (Uninstall & Cleanup):** Uninstaller exited `code 0` in 0.82s. Cleaned directory and reinstalled to target in 15.80s.

---

## Production Prerequisites Checklist

The following sequence must be executed by a designated systems administrator before promoting `1.8.13-rc.1` to general availability:

```markdown
- [ ] 1. Rotate Supabase service_role API key in Dashboard (Phase E runbook).
- [ ] 2. Update SUPABASE_REPLICATION_KEY on TrueNAS and LE_MAKE_SUPABASE_SERVICE_KEY in WordPress wp-config.php.
- [ ] 3. Apply scripts/truenas-security-hardening.sql to TrueNAS PostgreSQL (port 5432).
- [ ] 4. Redeploy docker-compose-truenas.yml with TRUENAS_POSTGREST_JWT_SECRET configured.
- [ ] 5. Verify unauthenticated probe to http://100.88.85.6:3001/make_orders is rejected (ECONNREFUSED or HTTP 401).
- [ ] 6. Apply supabase/migrations/076_reconcile_make_orders_schema.sql to Supabase Cloud PostgreSQL.
- [ ] 7. Populate staging_truenas_orders in proposed_production_recovery.sql; run Section 2 DRY RUN.
- [ ] 8. Review output manifest (confirm 0 synthetic conflicts, 0 orphaned items, expected new order count).
- [ ] 9. Set v_dry_run := FALSE and execute controlled recovery batch on Supabase Cloud.
- [ ] 10. Confirm table counts: Supabase Cloud make_orders count matches TrueNAS (35 orders).
- [ ] 11. Start replication daemon: lesoft-nas-pull-worker container.
- [ ] 12. Lift release hold and distribute LESOFT-Setup-1.8.13-rc.1.exe.
```

---

## Conclusion & Certification

The LE-SOFT v1.8.13-rc.1 software code in the current local working tree is **certified complete, robustly tested, cryptographically verified, and technically sound**. The release candidate remains under **NO-GO** status strictly to safeguard production databases during the irreversible administrative steps of secret rotation, security hardening, migration, and data reconciliation.
