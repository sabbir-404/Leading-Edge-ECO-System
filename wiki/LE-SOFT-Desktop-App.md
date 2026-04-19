# LE-SOFT Desktop Application

LE-SOFT is the primary desktop application of the Leading-Edge ECO System. It is a Windows and macOS Electron application built with React, TypeScript, and Vite that provides full access to all business modules.

---

## Overview

| Property | Value |
|----------|-------|
| App Name | LESOFT |
| Version | 1.3.1 |
| App ID | `com.leadingedge.lesoft` |
| Platform | Windows (primary), macOS |
| Architecture | Electron + React (Vite) + TypeScript |
| Database | Supabase (PostgreSQL) |
| Local Backup | SQLite (`better-sqlite3`) |

---

## Directory Structure

```
LE-SOFT/
├── src/                        # React frontend
│   ├── App.tsx                 # Root component with routing
│   ├── pages/
│   │   ├── Auth/               # Login, Setup, License Gate
│   │   ├── Dashboard/          # Main dashboard
│   │   ├── CRM/                # Customer management
│   │   ├── Quotation/          # Quotation create/list/preview
│   │   ├── Billing/            # Invoicing
│   │   ├── Make/               # Production/workshop orders
│   │   ├── Inventory/          # Stock and product masters
│   │   ├── Shipping/           # Delivery management
│   │   ├── Accounting/         # Ledgers, vouchers, purchase bills
│   │   ├── HRM/                # HR management
│   │   ├── Reports/            # Business reports
│   │   ├── Users/              # User and permission management
│   │   ├── Website/            # Website content management
│   │   ├── Email/              # Email module
│   │   ├── Notifications/      # Notification center
│   │   ├── Settings/           # App settings
│   │   └── Vouchers.tsx        # Voucher shortcuts
│   ├── components/             # Shared UI components
│   ├── context/                # React context providers
│   ├── hooks/                  # Custom React hooks
│   └── utils/                  # Utility functions
├── electron/                   # Electron main process
│   ├── main.ts                 # App entry point
│   ├── preload.ts              # Context bridge (IPC)
│   ├── ipc-handlers.ts         # All IPC event handlers
│   ├── database.ts             # Supabase database layer
│   ├── supabase.ts             # Supabase client initialization
│   ├── license-manager.ts      # Hardware-bound license validation
│   ├── session-vault.ts        # Encrypted session storage
│   ├── offline-db.ts           # SQLite local backup
│   ├── ai-agent.ts             # Google Gemini AI integration
│   ├── cache-manager.ts        # In-process data cache
│   ├── device-monitor.ts       # Device health monitoring
│   ├── field-encryption.ts     # Field-level data encryption
│   └── write-queue.ts          # Write queue for database operations
├── mobile-staff/               # Staff mobile app (sub-project)
├── mobile-customer/            # Customer mobile app (sub-project)
├── supabase/                   # Database migrations
│   └── migrations/
├── docs/                       # Developer documentation
│   ├── AUTO-UPDATE-SETUP.md
│   └── MAC_DISTRIBUTION.md
├── build/                      # Windows installer assets (NSIS)
├── Logo/                       # App icons
├── core/                       # Compiled Electron bundles (generated)
├── dist-electron/              # Vite output (generated)
├── release/                    # Packaged installers (generated)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.electron.json
```

---

## Authentication & License Flow

On startup, LE-SOFT goes through the following sequence:

```
App Launch
    ↓
License Gate (LicenseGate.tsx)
    → Validates hardware-bound license key
    → If invalid: shows Machine ID + license entry screen
    → If valid: proceed
    ↓
Login Screen (Login.tsx)
    → Supabase email/password authentication
    → Session stored in encrypted session vault
    ↓
Setup Screen (SetupScreen.tsx)
    → First-time company setup (if no company linked)
    ↓
Dashboard
```

### Machine ID & License

- The **Machine ID** is derived from: CPU model, CPU count, hostname, OS platform, architecture, and total RAM (rounded to GB)
- This produces a deterministic hardware fingerprint
- License keys are verified using HMAC-SHA256
- License file is stored in the OS user data directory (not in source code or the database)

---

## IPC Architecture (Electron ↔ React)

LE-SOFT uses Electron's **contextBridge + ipcRenderer** pattern to securely communicate between the renderer (React) and main process (Node.js):

```
React (Renderer)
    ↓  window.electronAPI.someMethod()
preload.ts (contextBridge)
    ↓  ipcRenderer.invoke('channel-name', args)
ipc-handlers.ts (Main Process)
    ↓  Supabase / SQLite / OS calls
    ↑  return result
React receives response
```

All sensitive operations (database queries, file system access, license checks) happen in the main process — the renderer has no direct Node.js access.

---

## Available Scripts

```bash
# Start in development mode (Vite + Electron)
npm run electron:dev

# Production build (Windows installer)
npm run dist

# Production build (macOS)
npm run dist:mac

# Publish release to GitHub (triggers auto-update)
npm run dist:publish

# Rebuild native modules (after Node.js version change)
npm run rebuild
```

---

## Building the Application

### Prerequisites

- Node.js 18+
- npm
- For Windows builds: Windows OS (or Windows VM)
- For macOS builds: macOS (required for code signing)

### Steps

```bash
# 1. Install dependencies
cd LE-SOFT
npm install

# 2. Configure environment
# Set your Supabase URL and anon key in the Electron config
# (see electron/supabase.ts)

# 3. Build for Windows
npm run dist

# Installers appear in:
# LE-SOFT/release/
```

---

## Key Technologies In-Depth

### AI Agent (Google Gemini)

LE-SOFT integrates Google Gemini AI (`@google/genai`) for intelligent assistance within the application, accessible through the AI agent module (`electron/ai-agent.ts`).

### PDF & Export

- **jsPDF + jspdf-autotable** — generates printable quotations, invoices, reports
- **XLSX** — exports tabular reports to Excel spreadsheets
- **JsBarcode** — generates product barcodes for labels

### Local Backup (SQLite)

When enabled via **Settings → Device Monitoring**, LE-SOFT maintains a local SQLite copy of critical data using `better-sqlite3`. This provides:
- Offline read capability
- A local audit trail
- Recovery option if cloud connectivity is lost

---

## See Also

- [Modules & Features](Modules-and-Features)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
- [Auto-Update & Deployment](Auto-Update-and-Deployment)
- [Setup & Installation](Setup-and-Installation)
