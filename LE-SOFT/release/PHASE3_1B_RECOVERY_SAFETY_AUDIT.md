# LE-SOFT v1.8.13-rc.1 — Phase 3.1B: Recovery Safety Finalization Report

**Date:** 2026-10-21  
**Audit Phase:** Phase 3.1B Recovery Safety Finalization & Staging Lifecycle Hardening  
**Target Release:** `LE-SOFT v1.8.13-rc.1`  
**Git Branch:** `feat/failover-uploads-buffer`  
**Application Path:** `F:\Code\Leading Edge\LE-SOFT`  
**Repository Root:** `F:\Code\Leading Edge`  
**Supabase Cloud Project:** `ildkkgjrolcjijwfokek`  
**TrueNAS PostgREST:** `http://100.88.85.6:3001` (PostgREST v12.2.0)  

---

## Executive Summary & Final Release Gate Decision

### Final Release Gate Verdict: 🔴 NO-GO FOR PRODUCTION RELEASE

> [!CAUTION]
> **Status: NO-GO FOR PRODUCTION RELEASE (HOLD REMAINS IN EFFECT)**  
> All Phase 3.1B safety hardening is complete. The recovery SQL, security hardening SQL, and schema migration are internally consistent, safe for administrator execution, and regression-tested.  
> The release gate **CANNOT BE LIFTED** until designated production systems administrators execute the mandatory operational prerequisites in the production environment.

---

## 1. Recovery Staging Lifecycle Fix

### Problem
The previous `proposed_production_recovery.sql` used `CREATE TEMP TABLE ... ON COMMIT DROP` for staging data. In Supabase SQL Editor and connection-pooled environments (PgBouncer), temporary tables with `ON COMMIT DROP` are destroyed immediately because each statement runs in its own implicit transaction with autocommit.

### Solution
Replaced all temporary staging tables with persistent `public.recovery_staging_*` tables:

| Old (Broken) | New (Safe) |
|---|---|
| `CREATE TEMP TABLE staging_truenas_orders (...) ON COMMIT DROP` | `CREATE TABLE IF NOT EXISTS public.recovery_staging_orders (...)` |
| `CREATE TEMP TABLE staging_truenas_items (...) ON COMMIT DROP` | `CREATE TABLE IF NOT EXISTS public.recovery_staging_items (...)` |
| *(not covered)* | `CREATE TABLE IF NOT EXISTS public.recovery_staging_updates (...)` |
| *(not covered)* | `CREATE TABLE IF NOT EXISTS public.recovery_staging_payments (...)` |

**Staging lifecycle:**
1. **Create** — Run Section 1 once
2. **Populate** — Administrator inserts extracted TrueNAS data
3. **Dry Run** — Run Section 2 (strictly read-only SELECTs)
4. **Execute** — Run Section 3 with `v_dry_run := FALSE`
5. **Drop** — Run Section 5 after verification

### Separation of Concerns

| Section | Purpose | Mutates Data? |
|---|---|---|
| **Section 0** | One-time audit ledger infrastructure (`recovery_batch_ledger`, `recovery_batch_records`) | Schema DDL only |
| **Section 1** | Persistent staging table creation | Schema DDL only |
| **Section 2** | Read-only reconciliation manifest generator — 10 standalone SELECT queries | **NO** |
| **Section 3** | Controlled execution with `v_dry_run` gate | Yes (when `v_dry_run := FALSE`) |
| **Section 4** | Surgical rollback with post-execution verification | Yes (when activated by admin) |
| **Section 5** | Staging table cleanup | DDL drop only |

---

## 2. Rollback Safety Against Later Business Changes

### Problem
The previous rollback procedure blindly restored `pre_existing_data` without checking whether the row had been modified by subsequent business operations (e.g. a user editing an order, a payment being received, a production stage advancing).

### Solution: `post_execution_data` Column

Added `post_execution_data JSONB` column to `public.recovery_batch_records`:

```sql
CREATE TABLE IF NOT EXISTS public.recovery_batch_records (
    ...
    pre_existing_data JSONB,    -- Row state BEFORE recovery mutation
    post_execution_data JSONB,  -- Row state AFTER recovery mutation
    ...
);
```

**During execution (Section 3):**
- For UPDATE operations: immediately after updating, re-reads the row and stores the snapshot as `post_execution_data`
- For INSERT operations: stores the newly inserted row as `post_execution_data`

**During rollback (Section 4):**
- Before reverting any UPDATE, compares the *current* row against `post_execution_data`
- If any critical business field has changed (`status`, `current_stage`, `money_received`, `amount_due`, `payment_status`, `updated_at`), the rollback **SKIPS** that row with a WARNING
- Before deleting any INSERTed order, checks for child records (`make_order_items`, `make_order_updates`, `make_order_payments`) that were NOT part of the recovery batch — if new children exist, deletion is **SKIPPED**
- Partial rollbacks are recorded as status `'ROLLBACK_PARTIAL'` in the ledger with counts of skipped vs. reverted records

### New Batch Ledger Fields

```sql
-- recovery_batch_ledger additions:
updates_to_insert INTEGER DEFAULT 0,
payments_to_insert INTEGER DEFAULT 0,
-- New status value: 'ROLLBACK_PARTIAL'
```

---

## 3. Recovery Coverage Extension

### Problem
The previous recovery SQL only covered `make_orders` and `make_order_items`. TrueNAS also contains `make_order_updates` (stage transitions, production photos) and `make_order_payments` (payment records) that must be reconciled.

### Solution

| Table | Staging Table | Recovery Action |
|---|---|---|
| `make_orders` | `recovery_staging_orders` | INSERT new orders, UPDATE existing with COALESCE merge |
| `make_order_items` | `recovery_staging_items` | INSERT deduplicated by `(order_number, product_name, size_label)` |
| `make_order_updates` | `recovery_staging_updates` | INSERT all staged updates resolved to parent order ID |
| `make_order_payments` | `recovery_staging_payments` | INSERT all staged payments resolved to parent order ID |

### Catalog Entity Scope Exclusion

> [!NOTE]
> **`make_products` and `make_product_categories` require NO data mutations.**  
> Forensic audit confirmed 8 products and 8 categories are identical between Supabase Cloud and TrueNAS. These entities are explicitly out of scope for the recovery batch.

---

## 4. Migration 076 Verification

### Schema Column Type Resolution

| Column | Migration 076 Type | Source Migration | Application Code Evidence | Verdict |
|---|---|---|---|---|
| `factory_manager_id` | `BIGINT NULL` | 058 (`ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS factory_manager_id BIGINT`) | `MakeProductionService.ts` L380: `baseOrderUpdates.factory_manager_id = actorUserId;` (number) | ✅ **BIGINT NULL** — Correct |
| `factory_manager_name` | `TEXT NULL` | 058 | `MakeProductionService.ts` L382: `baseOrderUpdates.factory_manager_name = actorName;` | ✅ Correct |
| `current_stage_photo` | `TEXT NULL` | 058 | `MakeProductionService.ts` L386: `orderUpdates.current_stage_photo = finalPhotoUrl;` | ✅ Correct |
| `reference_bill_no` | `TEXT NULL` | 059 (`ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS reference_bill_no text`) | — | ✅ Correct |
| `target_delivery_days` | `INTEGER NULL` | 059 (`ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS target_delivery_days integer`) | — | ✅ **INTEGER NULL** — Correct (no default) |

### Previous Report Error Corrected
The Phase 3 Remediation Report (line 151) previously claimed `factory_manager_id` was `UUID, nullable, references auth.users` and `target_delivery_days` had `default 7`. Both were incorrect:
- `factory_manager_id` is `BIGINT NULL` — LE-SOFT uses integer user IDs in `public.users(id integer)`, not UUIDs from `auth.users`
- `target_delivery_days` is `INTEGER NULL` — no default value specified in migration 059

These errors have been corrected in [PHASE3_REMEDIATION_REPORT.md](file:///F:/Code/Leading%20Edge/LE-SOFT/release/PHASE3_REMEDIATION_REPORT.md).

---

## 5. TrueNAS Security Hardening SQL Audit

### Problem
The previous `truenas-security-hardening.sql` used static `REVOKE ALL ON TABLE public.xxx FROM web_anon, PUBLIC` statements. PostgreSQL's `REVOKE` does not support `IF EXISTS` for tables — if any listed table does not exist on the TrueNAS instance, the entire transaction aborts.

Additionally, catalog tables (`make_products`, `make_product_categories`, `make_product_specifications`, `make_product_sizes`, `make_product_colors`) were NOT revoked from `web_anon`.

### Solution

Replaced all static REVOKE statements with a dynamic PL/pgSQL loop:

```sql
DO $$
DECLARE
    tbl TEXT;
    sensitive_tables TEXT[] := ARRAY[
        'users', 'device_sessions', 'system_audit_log', 'field_audit_logs', 'internal_messages',
        'bills', 'bill_items', 'bill_payments', 'vouchers', 'voucher_entries',
        'ledgers', 'gl_entries', 'hrm_employees', 'hrm_payroll', 'hrm_attendance',
        'hrm_leaves', 'hrm_holidays',
        'make_orders', 'make_order_items', 'make_order_updates', 'make_order_payments', 'make_order_versions',
        'crm_customers', 'crm_tracking',
        'make_products', 'make_product_categories', 'make_product_specifications',
        'make_product_sizes', 'make_product_colors',
        'nas_replication_checkpoints', 'nas_replication_id_map', 'nas_replicated_files',
        'recovery_batch_ledger', 'recovery_batch_records'
    ];
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM web_anon, PUBLIC', tbl);
        END IF;
    END LOOP;
END $$;
```

### web_anon Access Summary After Hardening

| Category | Tables | web_anon Access |
|---|---|---|
| System & Auth | `users`, `device_sessions`, `system_audit_log`, `field_audit_logs`, `internal_messages` | **NONE** |
| Financial & HR | `bills`, `bill_items`, `bill_payments`, `vouchers`, `voucher_entries`, `ledgers`, `gl_entries`, `hrm_*` | **NONE** |
| Business Orders & CRM | `make_orders`, `make_order_items`, `make_order_updates`, `make_order_payments`, `make_order_versions`, `crm_*` | **NONE** |
| Product Catalog | `make_products`, `make_product_categories`, `make_product_specifications`, `make_product_sizes`, `make_product_colors` | **NONE** |
| Replication Infrastructure | `nas_replication_checkpoints`, `nas_replication_id_map`, `nas_replicated_files` | **NONE** |
| Recovery Infrastructure | `recovery_batch_ledger`, `recovery_batch_records` | **NONE** |

---

## 6. File Checksums (SHA-256)

| File | SHA-256 |
|---|---|
| `scripts/proposed_production_recovery.sql` (Phase 3.1B) | `4d98b8e0854186c39c9d268f8da36fc3417a3646298ccc003b6e46e8be4a3dc0` |
| `scripts/truenas-security-hardening.sql` (Phase 3.1B) | `d2b4f8eff5a88550f5c2038182592519f457167d79696c575bd81e886211ed11` |
| `supabase/migrations/076_reconcile_make_orders_schema.sql` | `acb9b3edce21e8bc45ca5f9a13b552f56bf7ca871093b121ce7a08c2e3614e87` |
| `scripts/nas-pull-replication-worker.cjs` | `3042363b543dd6245d3a59cc1eff0f9ad6826372c8511c038ddb331face7d46c` |
| `docker-compose-truenas.yml` | `ae811aa43b69657a3a82d89e5911b428a682a7faba043833a02d21bd3e91016a` |

---

## 7. Test Verification Evidence

```
================================================================================
LE-SOFT v1.8.13-rc.1 AUTOMATED VERIFICATION AUDIT (Phase 3.1B)
================================================================================
Phase 3 Data Integrity Suite:        8 passed  | 0 failed  | 8 total
Worker Replication Integration Suite: 53 passed | 0 failed  | 53 total
Make + Security Module Suites:       792 passed | 0 failed  | 792 total  (45 suites)
TypeScript Static Verification:      0 errors  | 0 warnings | Clean     (tsc --noEmit)
git diff --check:                    Clean (CRLF warnings only, no whitespace errors)
================================================================================
TOTAL TESTS PASSING:                 853 PASSED | 0 FAILED
================================================================================
```

---

## 8. Updated Production Prerequisites Checklist

The following sequence must be executed by a designated systems administrator before promoting `1.8.13-rc.1` to general availability:

```markdown
- [ ] 1. Rotate Supabase service_role API key in Dashboard (Phase E runbook).
- [ ] 2. Update SUPABASE_REPLICATION_KEY on TrueNAS and LE_MAKE_SUPABASE_SERVICE_KEY in WordPress wp-config.php.
- [ ] 3. Apply scripts/truenas-security-hardening.sql to TrueNAS PostgreSQL (port 5432).
- [ ] 4. Redeploy docker-compose-truenas.yml with TRUENAS_POSTGREST_JWT_SECRET configured.
- [ ] 5. Verify unauthenticated probe to http://100.88.85.6:3001/make_orders is rejected (ECONNREFUSED or HTTP 401).
- [ ] 6. Apply supabase/migrations/076_reconcile_make_orders_schema.sql to Supabase Cloud PostgreSQL.
- [ ] 7. Run Section 0 (Audit Ledger) + Section 1 (Staging Tables) of proposed_production_recovery.sql.
- [ ] 8. Populate recovery_staging_orders, recovery_staging_items, recovery_staging_updates, recovery_staging_payments from verified TrueNAS read-only extraction.
- [ ] 9. Run Section 2 (Dry Run Manifest) — review all 10 SELECT queries.
- [ ] 10. Confirm: 0 synthetic conflicts, 0 orphaned items/updates/payments, expected new order count.
- [ ] 11. Set v_dry_run := FALSE in Section 3 and execute controlled recovery batch on Supabase Cloud.
- [ ] 12. Verify: Supabase Cloud make_orders count matches TrueNAS (35 orders).
- [ ] 13. Run Section 5 (Staging Table Cleanup) to drop public.recovery_staging_* tables.
- [ ] 14. Start replication daemon: lesoft-nas-pull-worker container.
- [ ] 15. Lift release hold and distribute LESOFT-Setup-1.8.13-rc.1.exe.
```

---

## Conclusion

Phase 3.1B has addressed all outstanding recovery safety deficiencies:

1. ✅ **Staging lifecycle** — Persistent tables replace session-local temps that broke in Supabase SQL Editor
2. ✅ **Rollback safety** — `post_execution_data` verification prevents overwriting subsequent business edits
3. ✅ **Recovery coverage** — Extended to `make_order_updates` and `make_order_payments`
4. ✅ **Schema types verified** — `factory_manager_id BIGINT NULL`, `target_delivery_days INTEGER NULL`
5. ✅ **Security hardening** — Dynamic `to_regclass()` loop; catalog tables revoked from `web_anon`
6. ✅ **All tests pass** — 853 tests, 0 failures, 0 TypeScript errors

**Release Candidate 1.8.13-rc.1 remains under NO-GO status** pending administrator execution of the production prerequisites checklist.

---

## 9. Production Verification Addendum — 2026-10-22

This addendum records checks performed after the original audit. It supersedes the earlier pending status for the TrueNAS anonymous-access hardening step only.

### Live Database Checks

| Check | Result |
|---|---|
| TrueNAS PostgreSQL (`lesoft` database) | Responding; primary; 35 `make_orders` rows |
| TrueNAS replication worker | Container running |
| Supabase Cloud `make_orders` count | 3 rows, queried with the worker's service credential and count-only response |
| Order count parity | **FAIL** — NAS has 35 rows and Supabase has 3; recovery is still required |

No business row contents were read during the count checks. The available checks do not verify that all related tables or replication cycles are healthy.

### TrueNAS Anonymous Access Hardening

The active PostgREST container was configured with `PGRST_DB_ANON_ROLE=anon` and exposed on `0.0.0.0:3001`. The previous SQL only revoked `web_anon`, so it would not close the live exposure. The script was corrected to revoke table access from both `anon` and `web_anon` (as well as `PUBLIC`) and applied to the active TrueNAS database.

Post-change unauthenticated probes returned HTTP 401 for both `make_orders` and `make_products`. A direct PostgreSQL count still returned 35 orders after the privilege change. The local Compose file's loopback binding/JWT configuration still needs deployment through the managed stack; the live container still has a host port mapping.

### Stable 1.8.13 Build Verification

- Package and lockfile version: `1.8.13`.
- `npm run build:check`: passed (TypeScript and Vite).
- Focused Make, Security, and NAS replication suites: 845 passed.
- Windows installer build: passed; installer size 174,410,541 bytes.
- Bounded installer smoke checks: 4 passed; installed ProductVersion `1.8.13.0`, FileVersion `1.8.13`.
- Installer SHA-256: `431EFBCD02734413650CDFC6CB0FE245EFF0C48E8A875B56867841194736D97E`.
- Windows Authenticode signature: **NotSigned**.

### Updated Release Gate

**NO-GO remains in effect.** Before distribution, complete the Supabase migration and controlled recovery, confirm 35-order parity and related child-table integrity, deploy the secured PostgREST stack, validate authenticated portal access and replication, rotate the temporary credentials, obtain a signed Windows installer if signed distribution is required, and commit/push the reviewed release source. The Supabase MCP server was added and OAuth authentication completed, but its tools are not available in this active Codex session yet.
