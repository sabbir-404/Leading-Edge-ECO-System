# MAKE Production 8-Stage Canonical Workflow & Audit Specification

**Document Version**: 1.1.0  
**Status**: Canonical Standard & Sequential State Machine Specification  

---

## 1. CANONICAL 8-STAGE PHYSICAL FACTORY WORKFLOW

All custom furniture manufacturing orders in LESOFT MAKE advance strictly through the following **8 canonical physical stages**:

```text
[Stage 1] Work in process
   ↓
[Stage 2] Production On Going
   ↓
[Stage 3] Primary QC
   ↓
[Stage 4] Color Ongoing (oven)
   ↓
[Stage 5] QC Final
   ↓
[Stage 6] Packaging
   ↓
[Stage 7] Ready to Ship
   ↓
[Stage 8] Delivered
```

---

## 2. STATE MACHINE & SEQUENTIAL TRANSITION RULES

The state machine is authoritative in `MakeProductionService.validateTransition` and strictly enforced on the backend:

1. **Strictly Sequential Progression**:
   * Initial orders must start at `Work in process`. Skipping directly to `Production On Going` or subsequent stages is rejected.
   * Progression occurs exclusively from Stage $N$ to Stage $N+1$ (`Work in process` → `Production On Going` → `Primary QC` → `Color Ongoing (oven)` → `QC Final` → `Packaging` → `Ready to Ship` → `Delivered`).
   * No stage may be skipped.
2. **Post-Delivery Immutability**:
   * Once an order reaches `Delivered` (Stage 8), it cannot be re-advanced or transitioned back through the standard factory progression pipeline.
3. **Mandatory Audit Trail**:
   Every state update records:
   * **Stage**: Current canonical stage name.
   * **Actor**: Logged-in user's full name, username, and role (derived from Main process `SessionManager`).
   * **Timestamp**: High-precision ISO timestamp (`new Date().toISOString()`).
   * **Remarks / Notes**: Operator or QC notes documenting progress, inspection results, or rework reasons.
   * **Photographic Evidence**: Uploaded stage photo URL (stored in TrueNAS / Supabase storage bucket).
4. **Historical Backward Compatibility**:
   * Historical stage label `Color Ongoing` is deterministically normalized to index 3 (`Color Ongoing (oven)`), allowing older orders to smoothly progress to Stage 5 (`QC Final`).
