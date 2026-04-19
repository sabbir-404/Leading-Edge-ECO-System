# Mobile App — Staff

The Staff Mobile App is a React Native (Expo) application designed for field staff including sales representatives, warehouse operators, delivery personnel, and HR managers. It provides on-the-go access to core business operations.

---

## Overview

| Property | Value |
|----------|-------|
| App Name | mobile-staff |
| Version | 1.0.0 |
| Platform | Android (primary), iOS |
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript |
| Styling | NativeWind (Tailwind CSS for React Native) |
| Database | Supabase |
| OTA Updates | Expo Updates |
| Build System | Expo EAS Build |

---

## Directory Structure

```
LE-SOFT/mobile-staff/
├── src/
│   ├── screens/              # All app screens
│   │   ├── AuthScreen.tsx    # Login / authentication
│   │   ├── DashboardScreen.tsx # Main dashboard
│   │   ├── SettingsScreen.tsx  # App settings
│   │   ├── accounting/       # Accounting screens
│   │   ├── billing/          # Billing / invoicing screens
│   │   ├── chat/             # In-app messaging/chat
│   │   ├── crm/              # CRM screens
│   │   ├── hrm/              # HR management screens
│   │   ├── make/             # Production order screens
│   │   ├── quotation/        # Quotation screens
│   │   ├── reports/          # Report screens
│   │   ├── shipping/         # Shipping/delivery screens
│   │   ├── stock/            # Inventory/stock screens
│   │   └── users/            # User management screens
│   ├── components/           # Shared UI components
│   └── lib/                  # Utilities, Supabase client, helpers
├── assets/                   # Images, fonts, icons
├── App.tsx                   # Root navigation container
├── app.json                  # Expo app configuration
├── eas.json                  # EAS Build configuration
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
└── package.json
```

---

## Available Modules

The Staff App mirrors the core modules available in LE-SOFT desktop, optimized for mobile workflows:

| Module | Description |
|--------|-------------|
| **Dashboard** | Summary view of sales, orders, and alerts |
| **CRM** | Customer lookup, ledger, and contact management |
| **Quotations** | Create and view quotations from the field |
| **Billing** | Invoice creation and billing history |
| **Make** | Place and track production orders |
| **Stock** | View inventory levels and stock items |
| **Shipping** | Delivery tracking and dispatch updates |
| **Accounting** | Voucher entry and accounting summaries |
| **HRM** | Employee attendance, leave, and payroll |
| **Reports** | On-the-go business reports |
| **Chat** | In-app messaging between staff |
| **Users** | User account management |
| **Settings** | App configuration and account settings |

---

## Navigation Structure

The app uses **React Navigation v7** with a combination of:

- **Native Stack** — for screen-to-screen navigation
- **Bottom Tabs** — for primary section switching
- **Drawer** — for side-menu navigation to less-frequent sections

---

## Features

### Camera Integration
Uses **Expo Camera** for:
- Barcode/QR code scanning (product lookup, stock counting)
- Document capture

### Printing
Uses **Expo Print** for:
- Printing invoices and delivery notes from the field

### OTA Updates
Uses **Expo Updates** for:
- Over-the-air app updates without requiring app store submissions

### Encryption
Uses **crypto-js** and **asmcrypto.js** for:
- Secure local storage of session credentials
- Field-level encryption of sensitive data

---

## Running the App

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for Android emulator) or a physical Android device with Expo Go

### Development

```bash
cd LE-SOFT/mobile-staff

# Install dependencies
npm install

# Start for Android
npm start   # or: npx expo start --android

# Run on Android emulator / device
npm run android
```

### Building for Production (EAS)

```bash
# Login to Expo
npx eas login

# Build Android APK/AAB
npx eas build --platform android

# Build iOS
npx eas build --platform ios
```

---

## See Also

- [Mobile App — Customer](Mobile-App-Customer)
- [Modules & Features](Modules-and-Features)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
