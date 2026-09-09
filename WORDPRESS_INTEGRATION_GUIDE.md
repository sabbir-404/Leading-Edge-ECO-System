# LE-SOFT MAKE — WordPress Sales & Furniture Design Portal
## Complete Integration, Configuration, and User Management Guide

This WordPress plugin provides a connected frontend portal for the **LE-SOFT MAKE Module** and **TrueNAS PostgreSQL / Supabase Database**. It allows **Administrators**, **Furniture Designers**, and **Salespeople** to manage customized furniture orders, configure dimensional sizes, track real-time workshop statuses, analyze past purchase history, and approve versioned technical drawings.

---

## 1. System Architecture & Dual Connectivity

The WordPress plugin communicates with the centralized database using a **multi-tier failover mechanism**:

```
 ┌────────────────────────────────────────────────────────────┐
 │                   WordPress Sales Portal                   │
 │                [make_sales_portal] Shortcode               │
 └─────────────────────────────┬──────────────────────────────┘
                               │
               Auto-resolves fastest online endpoint:
                               │
    ┌──────────────────────────┼──────────────────────────┐
    ▼                          ▼                          ▼
[Tier 1: Local LAN]    [Tier 2: CF Tunnel]     [Tier 3: Tailscale]
http://192.168.1.14:3001  https://db.lenas.me    http://100.88.85.6:3001
    │                          │                          │
    └──────────────────────────┼──────────────────────────┘
                               ▼
            ┌────────────────────────────────────┐
            │   TrueNAS PostgREST + PostgreSQL   │
            └─────────────────┬──────────────────┘
                              │
               (Automatic Real-Time Sync)
                              ▼
            ┌────────────────────────────────────┐
            │        LE-SOFT Desktop App         │
            │  (Billing, Accounting, Production) │
            └────────────────────────────────────┘
```

1. **Tier 1 (Local LAN)**: `http://192.168.1.14:3001` (Fastest for workshop/office local network).
2. **Tier 2 (Cloudflare SSL Tunnel)**: `https://db.lenas.me` (Public HTTPS access for remote sales team).
3. **Tier 3 (Tailscale VPN IP)**: `http://100.88.85.6:3001` (Encrypted mesh VPN fallback).
4. **Tier 4 (Supabase Cloud Backup)**: `https://ildkkgjrolcjijwfokek.supabase.co` (Cloud sink & failover).

---

## 2. User Roles & Database Mapping

There are **3 main user groups**:

| User Group | WordPress Role | Software Group | Capabilities & Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `administrator` | `Super Admin` / `Admin` | Full master access. Can create/modify all orders, enter both Cost & Sale price, approve versions, view purchase history, and configure plugin settings. |
| **Furniture Designer** | `make_designer` | `Furniture Designer` / `Designer` | Reviews production orders, enters CAD specs, inputs Cost Price & Customer Sale Price, sets custom dimensions, and creates new orders. |
| **Salesperson** | `make_salesperson` | `Salesman` | Browses catalog, creates customized orders with custom dimensions, specifies delivery deadlines, inputs location landmark, and approves designer versions. |

---

## 3. Database Migration: Adding the Designer Group

To ensure the **Furniture Designer** user group is active in the software's database, run migration `055_add_designer_user_group.sql`:

```sql
-- Migration 055: Create Furniture Designer User Group
INSERT INTO user_groups (name, description, permissions)
VALUES (
    'Furniture Designer', 
    'Responsible for furniture technical design, 3D modeling, technical drawings, CAD specifications, and cost/sale pricing review.', 
    '{"masters":true,"vouchers":false,"inventory":true,"users":false,"settings":false,"website":false,"reports":true,"make":true,"set_make_cost_price":true,"approve_make_order":true}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
```

*(This migration is located at `LE-SOFT/supabase/migrations/055_add_designer_user_group.sql`).*

---

## 4. Step-by-Step WordPress Installation

### Method A: Direct Upload via WP Admin (ZIP)
1. Zip the folder `wordpress-plugin/le-make-sales-portal` into `le-make-sales-portal.zip`.
2. In your WordPress Admin, go to **Plugins** → **Add New** → **Upload Plugin**.
3. Choose `le-make-sales-portal.zip` and click **Install Now**.
4. Click **Activate Plugin**.

### Method B: Copying via FTP / File Manager
1. Copy the `le-make-sales-portal` folder into your site's `wp-content/plugins/` directory:
   ```
   wp-content/plugins/le-make-sales-portal/
   ├── assets/
   │   ├── css/portal.css
   │   └── js/portal.js
   ├── includes/
   │   ├── class-admin-settings.php
   │   ├── class-api-controller.php
   │   └── class-nas-db-client.php
   ├── templates/
   │   └── sales-portal-template.php
   ├── le-make-sales-portal.php
   └── README.md
   ```
2. In WordPress Admin, go to **Plugins** → **Installed Plugins** and activate **LE-SOFT MAKE — Sales & Furniture Design Portal**.

---

## 5. Plugin Configuration in WordPress

1. In WordPress Admin, go to **Settings** → **LE MAKE Portal**.
2. Configure your connection settings:
   - **Tailscale NAS URL**: `http://100.88.85.6:3001`
   - **Local LAN NAS URL**: `http://192.168.1.14:3001`
   - **Cloudflare Tunnel URL**: `https://db.lenas.me`
   - **CF Service Token Client ID / Secret**: *(Optional, if tunnel uses Access tokens)*
   - **Supabase Project URL**: `https://ildkkgjrolcjijwfokek.supabase.co`
   - **Supabase Anon Key**: *(Enter your Supabase JWT anon key)*
3. Click **Save Configuration**.
4. Check the **Active Database Target** card at the top to ensure status displays **ONLINE (CONNECTED)**.

---

## 6. User Account Setup & Role Assignment

1. Go to **Users** → **Add New** in WordPress.
2. Fill in username, email, and password.
3. Under **Role**, select the appropriate group:
   - Choose **Administrator** for Admin accounts.
   - Choose **Furniture Designer** (`make_designer`) for Designer accounts.
   - Choose **Salesperson** (`make_salesperson`) for Sales team accounts.
4. Click **Add New User**.

---

## 7. Embedding the Portal on a WordPress Page

1. Create or edit any WordPress page (e.g. `https://yourdomain.com/sales-portal/`).
2. Insert the shortcode block:
   ```
   [make_sales_portal]
   ```
3. Publish or update the page.
4. When authorized users visit this page, they will see the portal with their specific role capabilities.

---

## 8. Key Features & How to Use

### 1. Order Creation & Custom Dimensional Sizing
- **Customer & Delivery Logistics**:
  - Customer Name \* & Phone Number \* (Required).
  - Receiver details.
  - **Full Shipping / Delivery Address** (Multi-line textarea).
  - **Location Landmark**: Positioned directly below the delivery address to prevent lost shipments.
- **Product Customization**:
  - Choose catalog products or switch to **Custom Non-Catalog Item** mode.
  - Standard sizes can be customized by clicking the **`+ Custom Size`** button.
  - Input custom Length, Width, Height (or Diameter for round tables) with unit selection (`mm`, `inch`, `cm`, `feet`).
  - Customized products are highlighted with a prominent **`✨ Customized`** badge in the cart.
- **Clean Pricing Inputs**:
  - Normal, clean form inputs for **Cost Price** and **Sale Price** without visual clutter.
  - Automatically respects permissions (Designer enters Cost & Sale price, Salesperson enters Cost price, Admin modifies all).
- **Delivery Deadlines**:
  - **Target Delivery Date \***: Mandatory production deadline.
  - **Requested Delivery Date**: Optional client-preferred date.

### 2. Product Catalog & Purchase History
- Switch to the **🪑 Catalog** tab to browse products, specifications, and sizes.
- Click **📊 Order History** on any product card to see:
  - Total units ordered across all time.
  - Count of customized vs standard orders.
  - Log of previous client orders, dates, custom dimensions, and quantities.

### 3. Order Tracking & Version Approvals
- Switch to **📦 Orders & Approvals** to view all active production orders.
- Filter by status (`All`, `Awaiting Pricing`, `Pricing Done`, `Pending Approval`, `Placed`, `In Production`, `Delivered`).
- Inspect side-by-side **Version Diffs** when a designer modifies specifications or pricing.
- Click **✔ Approve Version** to initiate workshop manufacturing, or **✕ Request Revision** if modifications are needed.

---

## 9. Troubleshooting & FAQ

### Q1: The portal says "Connecting to database..." and does not load.
- **Check 1**: In **Settings → LE MAKE Portal**, verify that the TrueNAS PostgREST container or Cloudflare tunnel URL is reachable.
- **Check 2**: If testing from outside the office WiFi, ensure the Cloudflare tunnel (`https://db.lenas.me`) or Supabase URL is active.
- **Check 3**: Ensure the PostgREST container is running on TrueNAS (`docker ps`).

### Q2: How do orders sync with the desktop software?
- Both the WordPress plugin and the LE-SOFT desktop software connect directly to the same **PostgreSQL database**. Any order submitted via WordPress is instantly visible in LE-SOFT under **MAKE → Track Orders**, and vice versa.

### Q3: How do designer pricing updates show up on WordPress?
- When a designer sets pricing or technical drawings in LE-SOFT or WordPress, the order status changes to `priced` / `modification_pending_approval`. The salesperson receives an **Action Required** notification on the portal to review and approve.
