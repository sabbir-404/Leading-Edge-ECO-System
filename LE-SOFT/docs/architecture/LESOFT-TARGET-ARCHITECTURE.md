# LESOFT — Target Architecture Specification

**Document Version**: 2.0.0  
**Status**: Architecture Blueprint & Target Standard  
**Target Environments**: Windows x64, macOS Apple Silicon (`arm64`), macOS Intel (`x64`)  

---

## 1. ARCHITECTURAL OVERVIEW & LAYERED TOPOLOGY

LESOFT is structured as a secured, offline-first desktop ERP system. The fundamental principle is **strict boundary isolation**: the React frontend is treated as an **untrusted client**, and all security-sensitive operations, business calculations, permissions, and database mutations are mediated exclusively by the Electron Main process and domain services.

```text
+-------------------------------------------------------------------------+
|                        REACT RENDERER (UNTRUSTED)                       |
|   - Presentation Components (Make, Inventory, Accounting, Settings)     |
|   - Local View State (Form inputs, UI layout, Filters)                  |
|   - Strictly Typed IPC Client Facade                                    |
+-------------------------------------------------------------------------+
                                    |
                                    | contextBridge / window.electron
                                    | Passes SessionToken + Schema-Conforming Payload
                                    v
+-------------------------------------------------------------------------+
|                      IPC GATEWAY & SECURITY PERIMETER                   |
|   - Runtime Validation Middleware (Zod Schemas)                         |
|   - Main Process Session Authenticator (Cryptographic Token Verifier)   |
|   - Centralized RBAC Authorization Guard (Main Process Ability Matrix)  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                          APPLICATION SERVICES                           |
|   - MakeOrderService, ProductionStageService, PricingService            |
|   - UserService, AuthenticationService, FileStorageService              |
|   - Transaction Orchestration & Deterministic Error Handling            |
+-------------------------------------------------------------------------+
                 |                                      |
                 v                                      v
+---------------------------------+   +-----------------------------------+
|         DOMAIN SERVICES         |   |           INFRASTRUCTURE          |
|  - Furniture Dimension Engine   |   |  - SafeStorage (DPAPI / Keychain) |
|  - Deterministic Pricing Model  |   |  - Controlled Local File Vault    |
|  - Linear Stage State Machine   |   |  - Cryptographic Audit Logger     |
|  - Inventory Costing (FIFO/AVCO)|   |  - Merkle Chain Integrity Engine  |
+---------------------------------+   +-----------------------------------+
                 |                                      |
                 +------------------+-------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       REPOSITORIES & DATA ACCESS                        |
|  - MakeOrderRepository, ProductRepository, UserRepository               |
|  - Abstracted Data Layer (Separating SQL from Business Logic)           |
+-------------------------------------------------------------------------+
         |                                           |
         v                                           v
+-----------------------+                 +-------------------------------+
|  Local SQLite Cache   |                 |   Transactional Outbox Engine |
|  (better-sqlite3)     |                 |   (Reliable Master Sync)      |
+-----------------------+                 +-------------------------------+
                                                          |
                                                          | HTTP / TLS (CF Tunnel)
                                                          v
                                          +-------------------------------+
                                          |   TrueNAS PostgreSQL Master   |
                                          |   (Authoritative Single Master)
                                          +-------------------------------+
                                                          |
                                                          | Asynchronous Replication
                                                          v
                                          +-------------------------------+
                                          |   Supabase Cloud Replica (DR) |
                                          +-------------------------------+
```

---

## 2. RENDERER ARCHITECTURE (UNTRUSTED CLIENT)

1. **Zero Authorization Authority**: The React renderer does not decide whether a user can perform an action. Permissions in React exist solely to hide or show UI buttons for user convenience. The backend verifies permissions unconditionally on every invoke.
2. **No Raw Paths or SQL**: The renderer never constructs file system paths or executes raw SQL queries.
3. **Session Identification**: The renderer holds only an opaque session token received upon authentication. It passes this token with every IPC request. It never passes `role` or `userId` as arguments to claim privileges.

---

## 3. SECURE IPC ARCHITECTURE

### 3.1 Modular IPC Structure
The monolithic `ipc-handlers.ts` is divided into modular domain handlers:
```text
electron/
  ipc/
    handlers/
      auth.ts          # Login, logout, session query, unlock
      make.ts          # Orders, items, specifications, approvals, stages
      users.ts         # User management, role assignment
      inventory.ts     # Stock items, godowns, valuation
      accounting.ts    # Ledgers, vouchers, financial reports
      files.ts         # Secure CAD/photo upload, download, preview
      system.ts        # Health check, device status, auto-update
    middleware/
      authenticate.ts  # Token validation & session resolution
      authorize.ts     # Permission and role checks
      validate.ts      # Zod schema execution & error formatting
    schemas/
      auth.schema.ts
      make.schema.ts
      users.schema.ts
      files.schema.ts
```

### 3.2 Request Pipeline
Every IPC request flows through a 4-stage pipeline:
```text
Renderer Invoke(channel, payload)
  ↓
1. Validate: Payload checked against Zod requestSchema (strips extra keys, enforces types)
  ↓
2. Authenticate: Session token verified against Main Process SessionStore
  ↓
3. Authorize: User permissions checked against required action for the channel
  ↓
4. Execute: Call Application Service method and return validated responseSchema
```

---

## 4. AUTHENTICATION & SESSION MANAGEMENT

1. **Main Process Session Store**:
   * Stored in-memory in the Electron Main process (`SessionStore`).
   * Generates a 32-byte cryptographically secure random token (`crypto.randomBytes(32).toString('hex')`) upon successful login.
   * Maps `sessionToken $\rightarrow$ { userId, username, role, permissions, ipAddress, deviceId, expiresAt }`.
2. **Session Expiry & Heartbeat**:
   * Sessions have a configurable sliding TTL (e.g., 8 hours).
   * Renderer requests refresh the session timer. Inactive sessions expire automatically.
3. **Removal of Superadmin Backdoor**:
   * All username substring checks (`username.includes('sabbirsuperadmin')`) are completely excised.
   * Administrative elevation is granted solely via database roles and validated permissions.

---

## 5. DATABASE & SYNCHRONIZATION ARCHITECTURE

### 5.1 Authoritative Master Designation
* **TrueNAS PostgreSQL** is designated as the **sole authoritative master database**.
* All production business data (orders, inventory, accounting) has its source of truth on TrueNAS.
* **Supabase Cloud** functions as an **off-site read replica and disaster recovery mirror**. The application never performs concurrent, uncoordinated dual-writes.

### 5.2 Transactional Outbox Pattern
Mutations are processed using the Transactional Outbox pattern:
1. Mutation occurs locally in SQLite within a local transaction:
   * Target local table updated.
   * Outbox event recorded in `outbox_events` (`id, entity_type, entity_id, operation, payload, created_at, status='pending', version, idempotency_key`).
2. Sync Worker processes `outbox_events` in chronological order:
   * Sends HTTP PATCH/POST to TrueNAS PostgREST with `idempotency_key`.
   * On success, marks outbox event as `delivered`.
   * On failure, enters exponential backoff retry.
3. Asynchronous cloud sync worker mirrors TrueNAS changes to Supabase Cloud without blocking client operations.

---

## 6. FIELD ENCRYPTION & SECRETS MANAGEMENT

### 6.1 Versioned Encryption Scheme (v2)
* **Scheme Format**: `e2:<salt_hex>:<iv_hex>:<tag_hex>:<ciphertext_hex>`
* **Key Derivation**: HKDF-SHA256 or PBKDF2 with **per-record random 16-byte salt**.
* **Compatibility**: Decryption routine checks prefix:
  * If `e1:`, decrypts using v1 legacy algorithm and static salt.
  * If `e2:`, decrypts using v2 algorithm and dynamic per-record salt.
  * Re-encryption on update automatically upgrades `e1:` records to `e2:`.

### 6.2 Desktop Secret Management
* Secrets (database credentials, Cloudflare Access keys) are encrypted using Electron's `safeStorage` API:
  * Windows: Encrypted with Windows Data Protection API (DPAPI).
  * macOS: Encrypted with Apple Keychain Services.
* Plaintext master secrets are stripped from compiled source code.

---

## 7. FILESYSTEM & STORAGE SECURITY

1. **Allowlisted Storage Architecture**:
   * The renderer cannot specify arbitrary disk paths.
   * All local storage operations are confined to an allowlisted directory tree inside `app.getPath('userData')`:
     ```text
     userData/
       storage/
         cad_files/
         stage_photos/
         documents/
         temp/
     ```
2. **File Validation**:
   * Uploads are validated using **file magic bytes** (header signatures) to verify actual MIME types (PDF, JPEG, PNG, STEP, DWG) rather than file extensions.
   * Maximum file size limits enforced (e.g., 50MB for CAD, 15MB for photos).
   * Storage keys are generated as content hashes (SHA-256) or UUIDs, preventing file overwrites and path traversal.

---

## 8. MAKE MODULE TARGET ARCHITECTURE

### 8.1 Domain Entities
* `MakeOrder`: Header containing order number, customer, status, financial totals, lead times, target delivery date.
* `MakeOrderItem`: Individual furniture items, dimensions (L, W, H, Unit), materials, polish, custom specifications, engineering drawing references.
* `MakeProductionStage`: Configurable factory stages with prerequisites, allowed staff roles, and completion checklists.
* `MakeStageUpdate`: Stage logs, employee assignment, duration, notes, and validated completion photo URLs.
* `MakeOrderVersion`: Immutable JSONB snapshots generated upon each approved specification alteration.

### 8.2 Server-Side Pricing Engine
* Pricing calculations reside in `PricingService` in the Main process.
* React sends dimension parameters; `PricingService` deterministically computes:
  $$\text{FinalPrice} = \text{BasePrice} + \text{DimensionSurcharge} + \text{MaterialCost} + \text{FinishCost} + \text{Margin}$$
* Pricing snapshots are locked to the order version upon quotation approval.

---

## 9. WORDPRESS INTEGRATION GATEWAY

Direct database access by WordPress is replaced with an API Gateway pattern:
* WordPress (`le-make-sales-portal`) does **not** receive database credentials or service-role keys.
* Communicates with a dedicated, authenticated REST API endpoint on the TrueNAS host.
* Customer submissions from WordPress are ingested with initial state `WEB_SUBMITTED` and must undergo internal review before becoming active production orders.

---

## 10. CROSS-PLATFORM HARDENING

* **Native Modules**: Maintain prebuilt binaries or automated build workflows for `better-sqlite3` targeting both `win32-x64` and `darwin-arm64` / `darwin-x64`.
* **Path Normalization**: All filesystem operations use Node.js `path` utilities (`path.join`, `path.resolve`) with POSIX/Windows normalization.
* **Code Signing & Notarization**: Configure electron-builder with Apple Developer ID certificates and `hardenedRuntime: true` for macOS Gatekeeper compliance.
