# Leading-Edge ECO System — Wiki

Welcome to the official documentation for the **Leading-Edge ECO System**, a complete end-to-end digital platform built for furniture businesses.

---

## What Is Leading-Edge ECO System?

Leading-Edge ECO System is a unified business management platform that covers every operational touchpoint of a furniture company — from quotation and production to inventory, billing, HR, accounting, and delivery — all connected in a single ecosystem.

The system is made up of **four integrated components**:

| Component | Description |
|-----------|-------------|
| [LE-SOFT (Desktop App)](LE-SOFT-Desktop-App) | Windows/macOS Electron desktop application for office operations |
| [Leading-Edge Website](Leading-Edge-Website) | Public-facing website with full e-commerce and admin panel |
| [Mobile App — Staff](Mobile-App-Staff) | React Native app for field staff (sales, warehouse, delivery, HR) |
| [Mobile App — Customer](Mobile-App-Customer) | React Native app for customers to browse and track orders |

---

## Quick Navigation

- 🏗️ [Architecture & Tech Stack](Architecture-and-Tech-Stack)
- ⚙️ [Setup & Installation](Setup-and-Installation)
- 📦 [Modules & Features](Modules-and-Features)
- 🖥️ [LE-SOFT Desktop App](LE-SOFT-Desktop-App)
- 🌐 [Leading-Edge Website](Leading-Edge-Website)
- 📱 [Mobile App — Staff](Mobile-App-Staff)
- 📱 [Mobile App — Customer](Mobile-App-Customer)
- 🚀 [Auto-Update & Deployment](Auto-Update-and-Deployment)

---

## High-Level Workflow

```
Customer Inquiry
      ↓
Quotation Created
      ↓
Sales Order Confirmed
      ↓
Work Order Sent to Production (Make)
      ↓
Production Tracked & Completed
      ↓
Finished Goods Received in Inventory
      ↓
Invoice Generated → Billing
      ↓
Delivery Note / Shipping Dispatched
      ↓
Payment Collected → Accounting
      ↓
Reports & Dashboard Updated
```

---

## Repository Structure

```
Leading-Edge-ECO-System/
├── LE-SOFT/                  # Desktop application (Electron + React + TypeScript)
│   ├── src/                  # React frontend source
│   │   └── pages/            # All module pages
│   ├── electron/             # Electron main process (IPC, database, license)
│   ├── mobile-staff/         # Staff mobile app (React Native / Expo)
│   ├── mobile-customer/      # Customer mobile app (React Native / Expo)
│   ├── supabase/             # Supabase migrations
│   └── docs/                 # Developer documentation
├── Leading-Edge-Website/     # Public website + admin panel (React + Vite)
│   ├── pages/                # Website pages
│   ├── server/               # Express.js backend server
│   └── src/                  # Shared source files
└── wiki/                     # Project wiki (this folder)
```

---

## Maintainer

**sabbir-404** — [Open a GitHub Issue](https://github.com/sabbir-404/Leading-Edge-ECO-System/issues) for bugs, feature requests, or support.
