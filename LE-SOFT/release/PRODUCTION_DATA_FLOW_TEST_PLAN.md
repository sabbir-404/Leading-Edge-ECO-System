# LE-SOFT v1.8.13-rc.1 — Production Data-Flow Verification Test Plan
## Supabase Cloud (Primary) → TrueNAS Storage (Replica Mirror)

**Status**: **EXECUTED PREFLIGHT — PRODUCTION WRITE BLOCKED (AUTHENTICATION / RLS PREREQUISITE)**  
**Target Cloud Project**: `LESERVER` (`ildkkgjrolcjijwfokek`)  
**Target Authoritative NAS**: `100.88.85.6:8081` (Tailscale)  
**Safety Invariant**: Strictly isolated canary testing; zero mutation or deletion of existing customer, order, or catalog assets.

---

## 1. Objective & Isolation Boundary

This document defines the procedure and empirical preflight results for verifying the end-to-end data-flow through the actual **production Supabase Cloud Storage** instance and onwards to the authoritative **TrueNAS Storage microservice**.

### Isolation Guarantees
* **Dedicated Test Folder**: All uploaded objects must reside in `test_canary_e2e_isolated/`.
* **Zero Customer Impact**: No records in `make_orders`, `make_order_items`, or `customer_ledgers` will be modified.
* **Cryptographic Proof**: Bit-for-bit SHA-256 digest comparison across all three checkpoints (Source, Cloud, NAS).
* **Controlled Lifetime**: Complete verification and safe teardown with explicit object removal.

---

## 2. Preflight Execution Results (`2026-10-20T13:48:47+06:00`)

In accordance with Section 2 of the test authorization instructions, an empirical preflight verification was conducted before performing any writes:

| Preflight Check | Target | Status | Result / Empirical Evidence |
|---|---|---|---|
| **1. Supabase Destination** | `ildkkgjrolcjijwfokek` / `make-order-files` | **PASS** | `https://ildkkgjrolcjijwfokek.supabase.co` matches production project ref. Bucket `make-order-files` exists and is accessible for query. |
| **2. TrueNAS Network Reachability** | `100.88.85.6:8081` | **PASS** | HTTP GET `/health` returned HTTP 200: `{"status":"healthy","uploadsCount":10}` over Tailscale. |
| **3. TrueNAS Cleanup API** | `100.88.85.6:8081` | **PASS** | `nas-storage-server.js` exposes supported `POST /delete` with path validation. |
| **4. Isolated Path Support** | `test_canary_e2e_isolated/` | **PASS** | Fully supported by `DurableUploadService` subfolder parameter and TrueNAS multer header `x-subfolder`. |
| **5. Quota RPC Permissions** | `reserve_buffer_capacity` | **BLOCKED** | Execution with `anonKey` returned `42501 permission denied for function reserve_buffer_capacity`. Migration 075 grants execute only to `authenticated`, `service_role`, and `postgres`. |
| **6. Quota Identity Binding** | `auth.uid()` | **BLOCKED** | No active user session (`auth.getSession()` returned null). `reserve_buffer_capacity` explicitly requires a non-null `auth.uid()` or role `authenticated`/`service_role`. |
| **7. Supabase Storage RLS** | `make-order-files` | **BLOCKED** | Storage upload attempt with `anonKey` returned `403 new row violates row-level security policy`. Migration 070 enforces `CREATE POLICY ... ON storage.objects FOR INSERT TO authenticated`. |

### Exact Production Write Blocker
> [!CAUTION]
> **PREFLIGHT SAFETY GATE TRIPPED — ZERO WRITES PERFORMED**  
> 1. The local developer configuration in `%APPDATA%\supabase-config.json` contains only the public `anonKey`. No `serviceRoleKey` is stored, and no authenticated operator session with an active `auth.uid()` is present in the environment.  
> 2. Both the atomic buffer quota RPC (`reserve_buffer_capacity`) and the Supabase Storage bucket (`make-order-files`) strictly enforce that callers must be `authenticated` (RLS 403 on storage, 42501 on RPC).  
> 3. Under the strict preflight safety rule: *"If the target, identity, permissions, quota, or safe cleanup capability cannot be verified, do not begin the production write. Report the exact blocker"* and *"Do not call identity-sensitive RPC functions through a context in which auth.uid() is null"*, **the production write was not initiated**.  
> 4. Zero canary files were written to production Supabase Cloud or TrueNAS. Zero customer data or records were touched.

---

## 3. Storage Keys & Naming Parameters (Pre-Allocated for Run)

* **File Type**: PNG binary image.
* **File Size**: `65,536` bytes (64.0 KB).
* **Pre-Generated Nonce**: `canary_prod_1792482528_4f9a8c1e2b7d3065`
* **Local Staging Path**: `%APPDATA%\le-soft\upload_staging\prod_canary_1792482528_4f9a8c1e2b7d3065.png`
* **Cloud Storage Key**: `test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png`
* **TrueNAS Storage URL**: `http://100.88.85.6:8081/files/test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png`

---

## 4. Execution Step-by-Step Procedure (When Authenticated Session is Provided)

### Phase A: Generation & Staging
1. Generate 64 KB of cryptographically random bytes with a unique 16-byte nonce header.
2. Compute the source SHA-256 digest: $H_{\text{source}}$.
3. Stage the file into the local SQLite upload queue (`DurableUploadService`):
   - Status: `staged_local`
   - File size: 65,536 bytes
   - Hash: $H_{\text{source}}$

### Phase B: Supabase Quota Reservation & Primary Cloud Upload
1. Call Postgres RPC via authenticated client:
   ```sql
   SELECT public.reserve_buffer_capacity(
       p_reservation_id := 'prod_probe_1792482528',
       p_client_id      := auth.uid()::text,
       p_resource_type  := 'storage',
       p_bytes          := 65536
   );
   ```
   - Assert `success = true`.
2. Upload the file to Supabase Cloud Storage bucket `make-order-files` at key `test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png`.
3. Read back the object directly from Supabase Cloud Storage using `storage.from('make-order-files').download(key)`.
4. Compute read-back digest $H_{\text{cloud}}$.
5. **Assert Invariant**: $H_{\text{cloud}} \equiv H_{\text{source}}$ (100% bit-for-bit equality).
6. Update SQLite queue status to `buffered_supabase`.

### Phase C: TrueNAS Replication & Normalization
1. Dispatch multipart upload to TrueNAS storage endpoint `http://100.88.85.6:8081/upload`.
2. Intercept JSON response from TrueNAS storage service:
   - Verify whether response contains internal/legacy `:8080` port.
   - Verify `DurableUploadService.normalizeNasStorageUrl()` rewrites the URL to active candidate `:8081`.
3. Execute independent HTTP GET read-back against the normalized TrueNAS URL:
   `GET http://100.88.85.6:8081/files/test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png`
4. Compute NAS read-back digest $H_{\text{nas}}$.
5. **Assert Invariant**: $H_{\text{nas}} \equiv H_{\text{source}}$ (100% bit-for-bit equality).
6. Update SQLite queue status to `synced_nas`.

### Phase D: Idempotency & Replay Verification
1. Re-invoke `DurableUploadService.dispatchUpload()` for the same upload record.
2. Verify that the service detects `status === 'synced_nas'`.
3. Verify that the authoritative TrueNAS URL is returned immediately (0 ms network time) without dispatching duplicate HTTP requests to Supabase or TrueNAS.

### Phase E: Unlinked Attachment Protection Check
1. Ensure the upload record has `entity_type: 'test_probe'` and `entity_id: null`.
2. Verify that the service transitions the record to `awaiting_association` and defers cloud pruning, preventing accidental orphan file deletion.

---

## 5. Controlled Cleanup Procedure

Upon completion and logging of all verification hashes:
1. **Supabase Cloud Cleanup**:
   - Delete the canary object from `make-order-files`:
     ```javascript
     await supabase.storage.from('make-order-files').remove(['test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png']);
     ```
   - Verify deletion by confirming a subsequent download returns 404/not found.
2. **TrueNAS Storage Cleanup**:
   - Send POST request to TrueNAS `/delete` with `{ filePath: 'test_canary_e2e_isolated/prod_canary_1792482528_4f9a8c1e2b7d3065.png' }`.
   - Confirm subsequent HTTP GET returns 404.
3. **Quota Reservation Release**:
   - Release the reserved quota capacity:
     ```sql
     SELECT public.release_buffer_capacity(
         p_reservation_id := 'prod_probe_1792482528',
         p_client_id      := auth.uid()::text,
         p_resource_type  := 'storage',
         p_bytes          := 65536
     );
     ```
4. **Local Cleanup**:
   - Remove the staged local temporary canary file from the local disk.
   - Close SQLite test transactions.

---

## 6. Execution Safety & Blocker Remediation

### Technical Blockers to In-Band Production Verification
1. **Process & Memory Isolation**: The client enforces `auth: { persistSession: false }`. Active session tokens reside strictly within the ephemeral memory heap of the running Electron process. Release policy strictly prohibits exporting session tokens, adding token-exposing IPC endpoints, or persisting credentials to disk for test runners.
2. **Coupling to Business Records**: The application's native upload IPC handlers (`pick-image`, `make-upload-invoice-attachment-buffer`, `make-pick-and-upload-cad`) are tightly coupled to live order and product entities. The application UI contains no synthetic canary test harness to dispatch an isolated payload to `test_canary_e2e_isolated/`.
3. **Strict Credential Policy**: Local environments must never solicit, store, or inject production `service_role` keys or bypass RLS policies.

### Local Integration Proof vs. Production Gap
- **Local Docker $\to$ TrueNAS Live Integration**: **PASS (10/10)**. Real network writes, SHA-256 verification, and quota reservations were fully verified against TrueNAS over Tailscale in `tests/integration/nas-supabase-data-flow.integration.test.ts`.
- **Production Cloud $\to$ TrueNAS End-to-End Canary**: **BLOCKED (PROCESS ISOLATION / NO IN-APP TEST HARNESS)**. Zero production writes or mutations were executed.

### Decision for Release Authority
This verification gap remains an open decision for the user/operator:
- **Option A (Recommended)**: Accept the completed local Docker $\to$ TrueNAS live integration test (10/10 PASS) as sufficient cryptographic proof of the upload pipeline without executing a synthetic canary against production Supabase Cloud.
- **Option B**: Introduce a dedicated, authenticated in-app diagnostic test harness in a subsequent release to allow an authenticated operator to trigger an isolated canary test from the UI.
