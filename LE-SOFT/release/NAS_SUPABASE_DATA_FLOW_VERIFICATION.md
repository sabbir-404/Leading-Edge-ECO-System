# LE-SOFT v1.8.13-rc.1 — Real NAS & Supabase Data-Flow Verification Report

**Audit Date**: `2026-10-20T01:10:00+06:00`  
**Git Branch**: `feat/failover-uploads-buffer`  
**HEAD Commit**: `eba5c84`  
**Host Environment**: Windows 11 / Tailscale 100.88.85.6  
**Release Gate Status**: **GATED / LOCAL ONLY (RELEASE HOLD ACTIVE)**

---

## 1. Executive Summary & Verification Verdict

| Verification Domain | Result | Empirical Status |
|---|---|---|
| **Local Supabase Storage Upload & Read-Back** | **PASS** | 64 KB canary uploaded, downloaded, and verified bit-for-bit SHA-256 equal. |
| **Actual TrueNAS Storage Write & Read-Back** | **PASS** | 64 KB canary uploaded to `100.88.85.6:8081`, fetched back, and verified bit-for-bit SHA-256 equal. |
| **Cross-Destination Bit-for-Bit Hash Equality** | **PASS** | Source, Supabase, and TrueNAS SHA-256 digests match 100%. |
| **Fault Injection, Retry & Recovery** | **PASS** | Buffered during simulated NAS outage; drained and synced upon recovery. |
| **Idempotent Replay (Zero Duplicate Writes)** | **PASS** | Re-dispatching synced upload returns authoritative URL immediately without duplicate writes. |
| **Production Supabase Migration (075)** | **BLOCKED (GATED)** | Held pending explicit production authorization. |
| **Production TrueNAS Customer Data Writes** | **BLOCKED (GATED)** | Held; all tests strictly confined to isolated `test_canary_e2e_isolated`. |
| **Public Release / Distribution / Git Push** | **BLOCKED (GATED)** | Held under mandatory local release hold. |

---

## 2. Real Canary Execution & Hash Verification

### 2.1 Canary Parameters
* **File Name**: `dual_canary_1792436833726.png`
* **Isolated Subfolder**: `test_canary_e2e_isolated`
* **File Size**: `65,536` bytes (64.0 KB)
* **Generated Digest**: `4C7B53084A9458E8CF505C70EF0C557E06E29EBA58BC1FAAC7987172B94962F0`

### 2.2 Destination Verification Matrix

| Checkpoint | Target Destination | Object Key / URL | Byte Size | SHA-256 Digest | Status |
|---|---|---|---|---|---|
| **1. Source** | Local Staging Queue | `upload_staging/upl_..._dual_canary_...png` | 65,536 | `4C7B53084A9458E8CF505C70EF0C557E06E29EBA58BC1FAAC7987172B94962F0` | Staged |
| **2. Primary Cloud** | Local Supabase Docker | `test_canary_e2e_isolated/upl_..._dual_canary_...png` | 65,536 | `4C7B53084A9458E8CF505C70EF0C557E06E29EBA58BC1FAAC7987172B94962F0` | **CONFIRMED** |
| **3. Authoritative NAS**| TrueNAS (`100.88.85.6:8081`)| `http://100.88.85.6:8081/files/test_canary_e2e_isolated/...` | 65,536 | `4C7B53084A9458E8CF505C70EF0C557E06E29EBA58BC1FAAC7987172B94962F0` | **CONFIRMED** |

* **Dispatch Elapsed Time**: `2,482 ms` (Supabase upload + Quota reservation + TrueNAS write + Read-back digest verification).
* **TrueNAS Transfer Time**: `901 ms`.
* **Bit-for-Bit Match**: **100% IDENTICAL** across all 3 checkpoints.

---

## 3. Discovered Defect & Applied Remediation

### Defect: Legacy Port `8080` in TrueNAS Storage Server Response
* **Root Cause**: The TrueNAS storage microservice listening on `http://100.88.85.6:8081` accepted the multipart upload via `POST /upload`, but formatted its JSON response with an internal/legacy port:
  ```json
  {
    "success": true,
    "filename": "canary_probe.txt",
    "url": "http://100.88.85.6:8080/files/test_canary_e2e_isolated/canary_probe.txt"
  }
  ```
* **Failure Mode**: When `DurableUploadService.ts` called `verifyRemoteObject(url)`, it attempted a GET request against port `8080`. Because port `8080` is not exposed across Tailscale, the read-back failed with `ECONNREFUSED`, falsely marking TrueNAS replication as failed.
* **Remediation**: Added candidate-aware port normalization in `DurableUploadService.ts:1008` (consistent with `MediaProtocolService.ts:397` and `make.ts:332`), safely mapping `:8080` responses to the active candidate base URL (`:8081`).
* **Verification**: Following remediation, real network writes to TrueNAS immediately verified with HTTP 200 OK and matching SHA-256 read-back in 901 ms.

---

## 4. Metadata Consistency & Lifecycle Rules

### 4.1 SQLite Durable Queue Transitions
1. **Initial Staging**: Status is recorded as `'staged_local'` with SHA-256 and byte count.
2. **Supabase Confirmed**: Status transitions to `'buffered_supabase'` with `remote_url_supabase` populated.
3. **TrueNAS Confirmed**: Status transitions to `'synced_nas'` with `remote_url_nas` populated.
4. **Cloud Pruning Safety**:
   - `remote_url_supabase` is pruned only after TrueNAS read-back verification confirms SHA-256 digest match.
   - **Catalog Asset Exception**: If the object belongs to `make_products` or catalog blueprints, the cloud copy is permanently preserved.
   - **Unlinked Attachment Guard**: If the object is not yet associated with an order (`entity_id` is null), `DurableUploadService` transitions status to `'awaiting_association'` and explicitly defers cloud pruning to prevent orphan deletion.

---

## 5. Retry, Recovery & Idempotent Replay Verification

A dedicated fault injection test (`test_retry_and_recovery_flow.ts`) was executed:
1. **Outage Simulation**: First dispatch attempt injected `ECONNREFUSED` on TrueNAS storage.
   - Primary Supabase upload succeeded (`buffered_supabase`).
   - SQLite record preserved file locally with `last_error: ECONNREFUSED ...`.
2. **Recovery / Retry**: Connectivity restored; second dispatch called.
   - File successfully transferred to TrueNAS Storage over Tailscale.
   - Status updated, URL recorded, and bit-for-bit SHA-256 read-back verified (`7EB8B2F1E2...`).
3. **Idempotent Replay**: Third dispatch called on the already-synced upload.
   - Returned the authoritative TrueNAS URL immediately in `0 ms`.
   - Verified that zero duplicate network writes were dispatched and zero duplicate database rows were created.

---

## 6. Comprehensive Audit of All 10 Integration Tests

The test suite in `tests/integration/nas-supabase-data-flow.integration.test.ts` was audited line-by-line:

| Test ID | Test Description | Mocked / Simulated vs Real | Details |
|---|---|---|---|
| **Test A** | Actual Upload to Supabase Storage | **REAL LOCAL SUPABASE** (Partial Mock) | Real network upload and read-back against local Docker Supabase. Quota reservation and TrueNAS upload mocked. |
| **Test B1** | Catalog Preservation Exception | **PURE UNIT TEST** | Checks `isCatalogAsset` and `reconcileReservation` rules without network calls. |
| **Test B2** | TrueNAS Storage Real Write & Read-back | **REAL NETWORK E2E** | Live Tailscale probe, real 32 KB multipart upload to `100.88.85.6:8081`, independent GET read-back, SHA-256 equality. |
| **Test C** | Unidirectional Architecture Verification | **CONTRACT ASSERTION** | Asserts primary-to-replica invariant. |
| **Test D1** | Outage Buffering & App Restart Recovery | **SIMULATED TRANSPORT** | Real SQLite database restart test; NAS outage and recovery simulated via service spy. |
| **Test D2** | Idempotent Replay | **STATE MACHINE TEST** | Validates that pre-existing `synced_nas` records short-circuit duplicate network writes. |
| **Test E1** | Reconciliation Refusal on Unverified NAS | **MOCKED POSTGRES** | Asserts daemon refuses cloud prune when `nas_replicated_files` has 0 rows. |
| **Test E2** | Safe Cloud Pruning on Confirmed NAS | **MOCKED CLIENTS** | Asserts daemon prunes cloud copy when `nas_replicated_files` has 1 row. |
| **Test F1** | 3 GB Soft Quota Constants | **UNIT ASSERTION** | Validates ceiling constants (3 GB, 2.2 GB, 500 MB, 300 MB). |
| **Test F2** | Anti-Spoofing Client ID Derivation | **UNIT TEST** | Asserts `auth.uid()` derivation over client-supplied identifier. |

---

## 7. Mandatory Release Gate Status

> [!IMPORTANT]
> **RELEASE CANDIDATE REMAINS GATED / LOCAL ONLY**
> 1. Real TrueNAS storage replication has been empirically confirmed via isolated canary read-back.
> 2. All production write gates remain active:
>    - Production Supabase Cloud migration `075` is **NOT APPLIED**.
>    - Production TrueNAS PostgreSQL and customer file shares are **UNMODIFIED**.
>    - Git tags, remote pushes, and installer publication are **BLOCKED**.
