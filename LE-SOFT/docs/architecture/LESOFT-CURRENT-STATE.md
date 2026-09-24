# LESOFT — Current State Architecture Report (Phase 0 Reconnaissance)

**Date**: 2026-09-20  
**Status**: Read-Only Reconnaissance Baseline  
**Scope**: Electron Main, Preload Bridge, React Renderer, Database Engines, Security Subsystems, Make Module, WordPress Integration  

---

## 1. APPLICATION STACK & RUNTIME ENVIRONMENT

* **Core Desktop Runtime**: Electron `^40.10.0`
* **Frontend Framework**: React `^18.2.0` / React DOM `^18.2.0`
* **Bundler & Dev Server**: Vite `^6.4.2` (in `devDependencies`), esbuild (`node18` target for main/preload)
* **Language & Type System**: TypeScript `^5.2.2`, strict mode partially configured
* **Recommended Node Version**: Node.js `22.x` (LTS)
* **Package Manager**: npm (`package-lock.json` present, lockfile version 3)
* **Build Tools**:
  * Frontend: `vite build` (outputs to `resource/`, `emptyOutDir: true`, `base: './'`)
  * Electron Main/Preload: `build-electron.cjs` invoking `esbuild` to compile `electron/main.ts` $\rightarrow$ `core/main.cjs` and `electron/preload.ts` $\rightarrow$ `core/preload.cjs`
  * Packaging: `electron-builder ^26.8.1` targeting Windows (`nsis`) and macOS (`dmg`, `zip`)
  * Post-pack Hook: `afterPack.cjs` for ensuring native SQLite module placement

---

## 2. FRONTEND ARCHITECTURE (REACT RENDERER)

### 2.1 Page Structure & Navigation
Navigation is centralized in `src/App.tsx`. The application does not use URL-based routing (e.g. `react-router-dom` is in dependencies but `App.tsx` controls navigation via top-level `activeTab` state and sub-navigation states).
Views include:
* **Make Module**: `src/pages/Make/` (`MakeDashboard.tsx`, `PlaceOrder.tsx`, `TrackOrders.tsx`, `AlterOrder.tsx`, `MakeProductCatalog.tsx`)
* **Accounting**: `src/pages/Accounting/` (Ledgers, Vouchers, Journal entries)
* **Inventory**: `src/pages/Inventory/` (Stock items, Stock groups, Godowns/Warehouses, Damaged goods)
* **Billing / Sales**: `src/pages/Billing/`, `src/pages/Quotation/`
* **User Management**: `src/pages/Users/` (User CRUD, Roles, Permission levels)
* **System Settings**: `src/pages/Settings/` (Hardware, Network, Database setup)
* **Authentication**: `src/pages/Auth/Login.tsx`

### 2.2 State Management & IPC Bridge
* **State**: Primarily local component state (`useState`, `useEffect`), custom contexts (`NetworkContext`, `ThemeContext`, `ToastContext`), and `@tanstack/react-query` (`^5.101.4`) for asynchronous server data fetching.
* **Bridge Invocation**: Components invoke the Electron main process via `window.electron.*` methods typed in `src/electron.d.ts` and exposed by `electron/preload.ts`.

### 2.3 Authentication & Permissions in React
* When authenticated, user records are stored directly in `localStorage.setItem('user', JSON.stringify(user))`.
* CASL (`@casl/ability` `^7.0.1`, `@casl/react` `^7.0.1`) is configured in `src/security/ability.ts` using role and permission arrays passed from the user profile.
* Permission utilities in `src/utils/permissions.ts` provide helper functions (`canManageUsers`, `canApproveOrders`, etc.) which read from `localStorage.getItem('user')`.

---

## 3. ELECTRON MAIN PROCESS & IPC SUBSYSTEMS

### 3.1 Main Process Architecture (`electron/main.ts`)
* **Lifecycle**: Enforces single-instance lock (`app.requestSingleInstanceLock()`), handles window management (`BrowserWindow`), and intercepts system-level events.
* **Auto-Updater**: Integrates `electron-updater ^6.8.3` pulling from GitHub Releases (`sabbir-404/Leading-Edge-ECO-System`). Includes fallback manual checks for unsigned macOS distributions.
* **Hardware Acceleration**: Explicitly disabled (`app.disableHardwareAcceleration()`) to resolve GPU blank screen anomalies on various display drivers.
* **Header Interceptor**: Configures `session.defaultSession.webRequest.onBeforeSendHeaders` for URLs matching `https://storage.lenas.me/*` to inject Cloudflare Access service tokens (`CF-Access-Client-Id`, `CF-Access-Client-Secret`).
* **Shutdown Sequence**: On `before-quit`, prevents immediate termination to flush pending writes in `write-queue.ts` (up to 15s timeout), clears in-memory encryption keys (`clearEncryptionKey()`), and flushes LRU caches (`clearCache()`).

### 3.2 Preload Bridge (`electron/preload.ts`)
Exposes approximately 250 functions on `window.electron` via `contextBridge.exposeInMainWorld('electron', { ... })`. Each function is a thin wrapper over `ipcRenderer.invoke(channel, ...args)` with no parameter validation or sanitation.

### 3.3 IPC Handlers (`electron/ipc-handlers.ts`)
A monolithic file (~340 KB, 8,000+ lines) registering all `ipcMain.handle` endpoints:
* User & Auth: `authenticate-user`, `get-users`, `create-user`, `update-user`, `delete-user`, `verify-admin-password`, `clear-session`.
* Database & System: `clear-database`, `execute-raw-sql`, `save-settings`, `export-database-backup`.
* Products & Catalog: `get-products`, `create-product`, `update-product`, `delete-product`, `restore-product`.
* Make Module: `create-make-order`, `make-designer-save-specs-and-pricing`, `approve-make-order`, `make-update-production-stage`, `make-alter-order`, `make-upload-pdf`, `make-upload-item-pdf`, `make-delete-pdf`.

### 3.4 Background Services & Workers
* `device-monitor.ts`: Heartbeat monitoring (every 60s), network interface tracking, MAC discovery, and UDP broadcast listener for local peer discovery.
* `lockout.ts`: Anti-tamper monitoring, detects unauthorized debugger flags (`--inspect`, `--remote-debugging-port`), DevTools opening in production, or unexpected file modification; locks system by writing `.system-lock` to `userData`.
* `crypto-audit.ts`: SHA-256 Merkle hash-chain append-only logging to table `crypto_audit_logs`.
* `cache-manager.ts`: In-memory LRU cache with TTL.

---

## 4. DATABASE & DATA ACCESS ARCHITECTURE

### 4.1 Connection Matrix
1. **Local SQLite (`electron/offline-db.ts`)**:
   * Stored in `<userData>/app-db.sqlite` via `better-sqlite3 ^12.9.0`.
   * Serves as local cache, write-queue backing store (`sync_queue`), and offline credential vault backing.
2. **TrueNAS PostgreSQL (`electron/supabase.ts`)**:
   * Hosted on TrueNAS SCALE in local Docker container.
   * Accessible via PostgREST on LAN (`http://192.168.1.14:3001`) or Cloudflare Tunnel (`https://db.lenas.me`).
   * Primary operational database.
3. **Supabase Cloud PostgreSQL (`electron/supabase.ts`)**:
   * Hosted on AWS us-east-1 (`https://ildkkgjrolcjijwfokek.supabase.co`).
   * Used for cloud replication, authentication fallback, and disaster recovery.

### 4.2 Multi-Tier Connection Failover (`electron/supabase.ts`)
Connection failover occurs dynamically across 3 tiers:
1. `nas_local`: Direct LAN IP (`http://192.168.1.14:3001`).
2. `nas_tunnel`: Cloudflare Tunnel (`https://db.lenas.me`) with injected CF-Access client credentials.
3. `supabase`: Supabase Cloud REST API with service-role key.

### 4.3 Write Queue (`electron/write-queue.ts`)
* Captures data modifications via `writeQueue.enqueue({ table, operation, data, matchCriteria })`.
* Persists records to SQLite `sync_queue` table with `status = 'pending'`.
* Asynchronous batch dispatcher flushes up to 10 items every 300ms using `executeWriteOnClient`.
* Operates as an **asynchronous write-behind cache with local SQLite outbox fallback**.

### 4.4 Migration Strategy
* Standalone `.sql` files in `supabase/migrations/` (numbered `001_initial_schema.sql` through `060_*.sql`).
* No automated migration runner exists in the application; migrations are applied manually or via one-off scripts in `scratch/`.

---

## 5. SECURITY ARCHITECTURE & VULNERABILITY ANALYSIS

### 5.1 Authentication & Session Handling
* Credentials verified against bcrypt hash on PostgreSQL or via Supabase Auth (`signInWithPassword`).
* Offline login verifies PBKDF2 hash stored in `<userData>/.vault.ledat` (`electron/session-vault.ts`).
* **Vulnerability**: Upon successful login, the user profile is returned to the renderer and saved in `localStorage`. The Main process does NOT maintain an active session token map. Every subsequent IPC call relies on client-supplied arguments.

### 5.2 Authorization
* Authorization is enforced predominantly in React (`src/utils/permissions.ts`, `src/security/ability.ts`).
* **Critical Flaw**: `permissions.ts` line 25 contains a hardcoded backdoor: `username.includes('sabbirsuperadmin')` automatically grants superadmin privileges.
* IPC endpoints accept `userRole` and `performedByName` directly from renderer arguments without server-side validation.

### 5.3 Cryptography & Secrets
* **Field Encryption (`electron/field-encryption.ts`)**: Uses AES-256-GCM with format `e1:<iv>:<tag>:<ciphertext>`. Key is derived using PBKDF2 with 100,000 iterations of SHA-256 using a **static salt** `'lesoft-e2e-salt-v1'`.
* **Hardcoded Master Secret (`electron/credentials.ts`)**: `GENERATION_SECRET = 'LE-SOFT-MASTER-KEY-2026-Pr0duct10n-S3cret!@#'` is hardcoded in source.
* **Embedded Administrative Keys**: `electron/supabase.ts` contains hardcoded Supabase `serviceRoleKey` and Cloudflare Tunnel `cfAccessClientId` / `cfAccessClientSecret`.

### 5.4 File Storage & Path Traversal
* File handlers (`make-upload-pdf`, `make-upload-item-pdf`) accept raw `filePath` strings from the renderer and read them directly using `fs.readFileSync(filePath)` without path sanitization or whitelist validation.

---

## 6. MAKE / CUSTOM MANUFACTURING MODULE

### 6.1 Existing Views
* `PlaceOrder.tsx`: Form for capturing custom dimensions (L, W, H, Dia, Unit), materials, polish colors, and uploading technical drawings.
* `TrackOrders.tsx`: Production tracking board showing orders across 6 stages with approval controls.
* `AlterOrder.tsx`: Modification workflow with snapshot logging into `make_order_versions`.
* `MakeProductCatalog.tsx`: Product templates, dimensions, and specifications.
* `MakeDashboard.tsx`: High-level metrics and stage counts.

### 6.2 Data Model (`make_*` Tables)
* `make_orders`: Header record (`order_number`, `customer_name`, `customer_phone`, `delivery_address`, `status`, `approval_status`, `cost_price`, `sale_price`, `reference_bill_no`, `target_delivery_days`, `current_stage`, `current_version`).
* `make_order_items`: Multi-item configurations (`length`, `width`, `height`, `diameter`, `unit`, `wood_type`, `fabric_type`, `polish_color`, `technical_drawing_url`, `pdf_urls`, `item_cost_price`, `item_sale_price`).
* `make_order_updates`: Production timeline records across the 6 stages (`Cutting & Woodworking`, `Metalwork`, `Polish & Paint`, `Upholstery`, `Packaging & QC`, `Dispatch`) with completion photos.
* `make_order_versions`: JSONB snapshots created upon alteration for diffing and re-approval.

### 6.3 WordPress Integration (`le-make-sales-portal`)
* WordPress plugin communicates directly with TrueNAS PostgREST (`https://db.lenas.me`) and Supabase Cloud using hardcoded `serviceRoleKey`.
* Exposes REST endpoints: `/wp-json/le-make/v1/publish-user`, `/wp-json/le-make/v1/orders`, `/wp-json/le-make/v1/upload-attachment`.
* LESOFT syncs staff users to WordPress via `publish-user`.

---

## 7. TESTING & DISASTER RECOVERY

* **Tests**: Test framework configuration exists (`vitest.config.ts`, `playwright.config.ts`), but unit and integration test coverage is currently `< 3%`.
* **Backups**: `backup-engine.ts` provides manual SQLite export. Production PostgreSQL relies on external TrueNAS ZFS snapshots.
