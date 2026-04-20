# Mobile App — Customer

The Customer Mobile App is a React Native (Expo) application designed for end customers of the furniture business. It provides a mobile storefront where customers can browse products, place orders, and track their purchases.

---

## Overview

| Property | Value |
|----------|-------|
| App Name | mobile-customer |
| Platform | Android, iOS |
| Framework | React Native (Expo) |
| Language | TypeScript |
| Styling | NativeWind (Tailwind CSS for React Native) |

---

## Directory Structure

```
LE-SOFT/mobile-customer/
├── src/
│   ├── screens/
│   │   ├── AuthScreen.tsx        # Customer login / registration
│   │   └── StorefrontScreen.tsx  # Product browsing storefront
│   └── lib/                      # Utilities and helpers
├── assets/                       # Images and icons
├── App.tsx                       # Root component
├── app.json                      # Expo configuration
├── babel.config.js
├── tailwind.config.js
└── package.json
```

---

## Available Screens

| Screen | Description |
|--------|-------------|
| **AuthScreen** | Customer login and registration |
| **StorefrontScreen** | Browse the product catalogue and place orders |

---

## Features

- **Product Browsing** — View the furniture product catalogue with images, descriptions, and pricing
- **Order Placement** — Place orders directly through the mobile app
- **Customer Authentication** — Secure login and registration

---

## Running the App

### Prerequisites

- Node.js 18+
- Expo CLI
- Android Studio or a physical Android/iOS device with Expo Go

### Development

```bash
cd LE-SOFT/mobile-customer

# Install dependencies
npm install

# Start with Expo
npx expo start

# Run on Android
npx expo start --android

# Run on iOS
npx expo start --ios
```

### Building for Production (EAS)

```bash
# Login to Expo
npx eas login

# Build Android
npx eas build --platform android

# Build iOS
npx eas build --platform ios
```

---

## See Also

- [Mobile App — Staff](Mobile-App-Staff)
- [Leading-Edge Website](Leading-Edge-Website)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
