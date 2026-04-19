# Setup & Installation

This guide covers how to set up and run each component of the Leading-Edge ECO System locally for development.

---

## Prerequisites

Before getting started, ensure you have the following installed:

| Tool | Version | Required For |
|------|---------|-------------|
| Node.js | 18+ | All components |
| npm | 8+ | All components |
| Git | Latest | All components |
| Expo CLI | Latest | Mobile apps |
| Android Studio | Latest | Mobile app (Android) |
| Xcode | Latest (macOS only) | Mobile app (iOS) |

---

## 1. Clone the Repository

```bash
git clone https://github.com/sabbir-404/Leading-Edge-ECO-System.git
cd Leading-Edge-ECO-System
```

---

## 2. Supabase Setup (Required for All Components)

All components share a **Supabase** backend. You need a Supabase project before running any component.

### Steps

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. After the project is created, note your:
   - **Project URL** (e.g., `https://xxxx.supabase.co`)
   - **anon/public API key**
4. Run the database migrations to create the required tables:
   ```bash
   cd LE-SOFT
   # Apply migrations using Supabase CLI or paste migrations/schema into Supabase SQL Editor
   ```

---

## 3. LE-SOFT (Desktop App)

### Install Dependencies

```bash
cd LE-SOFT
npm install
```

> **Note:** `npm install` automatically rebuilds native modules (`better-sqlite3`) via the `postinstall` script.

### Configure Supabase

Edit `electron/supabase.ts` and set your Supabase project URL and anon key:

```typescript
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'your-anon-key';
```

### Run in Development Mode

```bash
npm run electron:dev
```

This concurrently starts Vite (for the React renderer) and compiles + runs the Electron main process.

### Build Windows Installer

```bash
npm run dist
# Output: LE-SOFT/release/
```

### Build macOS Installer

```bash
npm run dist:mac
# Output: LE-SOFT/release/
```

---

## 4. Leading-Edge Website

### Frontend

```bash
cd Leading-Edge-Website
npm install
npm run dev
# Available at: http://localhost:5173
```

### Backend Server

```bash
cd Leading-Edge-Website/server
npm install
node index.js
# API server starts on its configured port
```

### Production Build

```bash
cd Leading-Edge-Website
npm run build
# Output: Leading-Edge-Website/dist/
```

---

## 5. Mobile App — Staff

### Install Dependencies

```bash
cd LE-SOFT/mobile-staff
npm install
```

### Configure Supabase

Edit `src/lib/supabase.ts` (or equivalent) with your Supabase credentials.

### Run on Android

```bash
npm run android
# or
npx expo start --android
```

### Run on iOS (macOS only)

```bash
npx expo run:ios
```

---

## 6. Mobile App — Customer

### Install Dependencies

```bash
cd LE-SOFT/mobile-customer
npm install
```

### Run

```bash
npx expo start
```

---

## Environment Variables Summary

| Component | Variable | Description |
|-----------|----------|-------------|
| LE-SOFT | Supabase URL (in `electron/supabase.ts`) | Supabase project endpoint |
| LE-SOFT | Supabase anon key (in `electron/supabase.ts`) | Public API key |
| Website | (server config) | Server port, DB credentials if applicable |
| Mobile Staff | Supabase URL + key (in `src/lib/`) | Supabase credentials |
| Mobile Customer | Supabase URL + key (in `src/lib/`) | Supabase credentials |

---

## Common Issues

### `better-sqlite3` build error on Windows

Run the rebuild command:
```bash
cd LE-SOFT
npm run rebuild
```

If this fails, ensure you have the Visual Studio C++ build tools installed.

### Electron dev mode not starting

Ensure both Vite and Electron are building correctly:
```bash
# Build Electron manually
npm run electron:build
```

### Native module errors after Node.js upgrade

Rebuild native modules after any Node.js version change:
```bash
cd LE-SOFT
npm run rebuild
```

### Mobile app won't connect to Supabase

- Confirm the Supabase URL and anon key are correctly set
- Check that your Supabase project is active (not paused on the free tier)
- Ensure Row-Level Security (RLS) policies allow your queries

---

## See Also

- [LE-SOFT Desktop App](LE-SOFT-Desktop-App)
- [Auto-Update & Deployment](Auto-Update-and-Deployment)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
