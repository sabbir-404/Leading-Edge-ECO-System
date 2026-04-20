# Architecture & Tech Stack

This page describes the overall system architecture and the technologies used across all components of the Leading-Edge ECO System.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE (Cloud)                      │
│          PostgreSQL · Auth · Realtime · Storage          │
└──────────────────────┬──────────────────────────────────┘
                       │  REST / Realtime
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌─────▼─────┐  ┌────▼────────┐
   │LE-SOFT  │   │  Website  │  │ Mobile Apps │
   │Desktop  │   │ (Web App) │  │Staff/Customer│
   │(Electron│   │(React+Vite│  │(React Native│
   │  + React│   │+ Express) │  │  + Expo)    │
   └─────────┘   └───────────┘  └─────────────┘
```

All components share a **single Supabase (PostgreSQL) database** as the source of truth. There is no separate REST API server for LE-SOFT — the desktop app communicates directly with Supabase through the Electron main process IPC layer.

---

## Tech Stack by Component

### LE-SOFT — Desktop Application

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript |
| Desktop Shell | Electron 29 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS + CSS Modules |
| Animation | Framer Motion |
| Icons | Lucide React |
| Routing | React Router DOM v6 |
| Database | Supabase (PostgreSQL via `@supabase/supabase-js`) |
| Local Backup | SQLite (`better-sqlite3`) |
| PDF Generation | jsPDF + jspdf-autotable |
| Excel Export | XLSX |
| Barcode | JsBarcode |
| AI Integration | Google Gemini (`@google/genai`) |
| Security | bcryptjs, asmcrypto.js, field encryption |
| Auto-Update | electron-updater |
| Bundler (main process) | esbuild |
| Installer | NSIS (Windows), DMG (macOS) |

### Leading-Edge Website

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | CSS Modules |
| Animation | Framer Motion |
| Icons | Lucide React |
| Routing | React Router DOM v6 |
| Backend | Node.js + Express |
| Security | Helmet, express-rate-limit |

### Mobile App — Staff

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 (Expo SDK 54) |
| Language | TypeScript |
| Styling | NativeWind (Tailwind for React Native) |
| Navigation | React Navigation v7 (Stack + Bottom Tabs + Drawer) |
| Database | Supabase (`@supabase/supabase-js`) |
| Camera | Expo Camera |
| Printing | Expo Print |
| OTA Updates | Expo Updates |
| Icons | Lucide React Native |

### Mobile App — Customer

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo) |
| Language | TypeScript |
| Styling | NativeWind (Tailwind for React Native) |

---

## Data Architecture

### Database (Supabase / PostgreSQL)

Supabase is the **single source of truth** for all components. Key design decisions:

- **Multi-company support** — all data is scoped by company ID
- **Row-Level Security (RLS)** — Supabase RLS policies enforce data isolation per company/user
- **Realtime** — Supabase Realtime used for live updates (e.g., order status, dashboard widgets)
- **File Storage** — Supabase Storage used for product images, media assets

### License System (LE-SOFT)

LE-SOFT uses a **hardware-bound offline license key** system:
- Generates a unique Machine ID from CPU model, hostname, OS platform, memory, and architecture
- License keys are validated using HMAC-SHA256
- License stored in the user data directory (not in source code)
- License validation happens before any module loads (`LicenseGate` component)

### Offline / Backup

- LE-SOFT supports an optional **local SQLite backup** that can be enabled per device from **Settings → Device Monitoring**
- Supabase remains the primary database even when the backup is enabled

---

## Security Architecture

| Feature | Implementation |
|---------|---------------|
| Authentication | Supabase Auth (email/password) |
| Session Management | Session vault with encryption |
| Field Encryption | asmcrypto.js for sensitive data fields |
| Password Hashing | bcryptjs |
| License Verification | HMAC-SHA256, hardware-bound |
| Role-Based Access | User groups with granular permission levels |
| Code Obfuscation | javascript-obfuscator (build time) |
| Rate Limiting | express-rate-limit (Website) |
| HTTP Security Headers | Helmet (Website) |

---

## CI/CD & Distribution

| Task | Tool |
|------|------|
| Windows installer | electron-builder + NSIS |
| macOS installer | electron-builder + DMG |
| Auto-update hosting | GitHub Releases |
| Update delivery | electron-updater |
| Mobile builds | Expo EAS Build |

See [Auto-Update & Deployment](Auto-Update-and-Deployment) for full deployment instructions.
