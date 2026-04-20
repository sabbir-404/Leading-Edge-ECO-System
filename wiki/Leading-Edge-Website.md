# Leading-Edge Website

The Leading-Edge Website is the public-facing web application for the furniture business. It serves dual purposes: a customer-facing e-commerce/catalogue storefront and an admin panel for managing website content, orders, and users.

---

## Overview

| Property | Value |
|----------|-------|
| App Name | leading-edge-furniture |
| Version | 1.0.0 |
| Platform | Web (SPA) |
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Express |
| Styling | CSS Modules |

---

## Directory Structure

```
Leading-Edge-Website/
├── pages/                    # All website pages
│   ├── Home.tsx              # Landing/home page
│   ├── About.tsx             # About us page
│   ├── ProductDetails.tsx    # Single product detail view
│   ├── CategoryGallery.tsx   # Browse products by category
│   ├── CatalogueViewer.tsx   # View product catalogues
│   ├── SearchResults.tsx     # Product search results
│   ├── Checkout.tsx          # Shopping cart checkout
│   ├── Shipping.tsx          # Shipping information page
│   ├── Returns.tsx           # Returns & exchange policy page
│   ├── Login.tsx             # Customer login
│   ├── Profile.tsx           # Customer profile/account
│   ├── Admin.tsx             # Admin panel root
│   ├── AdminLogin.tsx        # Admin login
│   ├── AdminDashboard.tsx    # Admin overview dashboard
│   ├── AdminCatalogues.tsx   # Manage catalogues
│   ├── AdminContent.tsx      # Manage website content/pages
│   ├── AdminHeaderFooter.tsx # Edit site header/footer
│   ├── AdminNewsletter.tsx   # Newsletter subscriber management
│   ├── AdminOrders.tsx       # Manage customer orders
│   ├── AdminPages.tsx        # Static page management
│   ├── AdminProductEditor.tsx # Add/edit products
│   ├── AdminShipping.tsx     # Shipping settings
│   └── AdminUsers.tsx        # User management
├── components/               # Shared UI components
├── context/                  # React context (cart, auth, etc.)
├── server/                   # Express.js backend
│   ├── index.js              # Server entry point
│   ├── package.json
│   └── schema.sql            # Database schema
├── src/                      # Additional source files
├── public/                   # Static assets
├── App.tsx                   # Root component with routing
├── index.tsx                 # App entry point
├── types.ts                  # Shared TypeScript types
├── constants.ts              # App-wide constants
├── metadata.json             # Site metadata config
├── package.json
└── vite.config.ts
```

---

## Customer-Facing Pages

### Public Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Home.tsx` | Landing page with featured products and categories |
| `/about` | `About.tsx` | Company story, values, and team |
| `/products/:id` | `ProductDetails.tsx` | Detailed product page with images, specs, pricing |
| `/category/:slug` | `CategoryGallery.tsx` | Browse all products in a category |
| `/catalogue` | `CatalogueViewer.tsx` | Digital product catalogue viewer |
| `/search` | `SearchResults.tsx` | Product search results |
| `/shipping` | `Shipping.tsx` | Delivery information and policies |
| `/returns` | `Returns.tsx` | Return and exchange policy |

### Customer Account Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `Login.tsx` | Customer login / registration |
| `/profile` | `Profile.tsx` | Manage account, view order history |
| `/checkout` | `Checkout.tsx` | Shopping cart and checkout flow |

---

## Admin Panel

The admin panel is accessible at `/admin` and requires admin credentials.

### Admin Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin` | `Admin.tsx` | Admin panel root / layout |
| `/admin/login` | `AdminLogin.tsx` | Admin authentication |
| `/admin/dashboard` | `AdminDashboard.tsx` | Overview: sales, orders, visitors |
| `/admin/products` | `AdminProductEditor.tsx` | Add, edit, and publish products |
| `/admin/catalogues` | `AdminCatalogues.tsx` | Manage digital catalogues |
| `/admin/orders` | `AdminOrders.tsx` | View and process customer orders |
| `/admin/users` | `AdminUsers.tsx` | Manage customer accounts |
| `/admin/content` | `AdminContent.tsx` | Edit website content blocks |
| `/admin/pages` | `AdminPages.tsx` | Create and edit static pages |
| `/admin/header-footer` | `AdminHeaderFooter.tsx` | Customize site header and footer |
| `/admin/newsletter` | `AdminNewsletter.tsx` | Manage newsletter subscribers |
| `/admin/shipping` | `AdminShipping.tsx` | Configure shipping rates and zones |

---

## Backend (Express Server)

The website includes a lightweight Node.js + Express backend (`server/`) that:

- Serves API endpoints for the frontend
- Applies security middleware:
  - **Helmet** — sets secure HTTP response headers
  - **express-rate-limit** — prevents brute-force and DDoS attacks
- Manages database interactions via `schema.sql`

---

## Running the Website

### Prerequisites

- Node.js 18+
- npm

### Development

```bash
cd Leading-Edge-Website

# Install frontend dependencies
npm install

# Start frontend dev server (Vite)
npm run dev

# In a separate terminal, start the backend server
cd server
npm install
node index.js
```

### Production Build

```bash
cd Leading-Edge-Website
npm run build
# Output goes to dist/
```

---

## Integration with LE-SOFT

The **Website Management** module inside LE-SOFT (`src/pages/Website/`) provides a desktop interface to manage the same website content:

- **WebsiteDashboard** — overview panel
- **WebsiteProducts** — manage product listings
- **WebsiteCategories** — manage product categories
- **WebsiteMedia** — upload and manage images
- **WebsitePages** — edit static pages
- **WebsiteProjects** — manage portfolio/project showcases
- **WebsiteOrders** — view and fulfil web orders
- **WebsiteNewsletter** — manage newsletter list
- **WebsiteSettings** — site-wide settings

This means staff can manage the website without leaving the LE-SOFT desktop application.

---

## See Also

- [Home](Home)
- [Modules & Features](Modules-and-Features)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
- [Setup & Installation](Setup-and-Installation)
