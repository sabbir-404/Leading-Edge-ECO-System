# LE-SOFT MAKE — WordPress Sales & Furniture Design Portal Plugin

A fully featured, high-performance WordPress plugin for **LE-SOFT (Leading Edge ERP)** providing an interactive production and sales portal connected directly through **Cloudflare Tunnel (`https://db.lenas.me`)** to the TrueNAS PostgreSQL container with automatic Supabase Cloud failover backup.

---

## 🌟 Key Features

1. **Embedded In-Portal Login Screen**:
   - Guests viewing `[make_sales_portal]` see a sleek, glassmorphic sign-in interface without redirecting to `/wp-login.php`.
   - Direct AJAX authentication loads permissions and dynamically mounts the production dashboard.
   - User profile badge and 1-click **Logout** button in top navigation bar.

2. **WordPress User Role Hierarchy (Admin, Furniture Designer, Salesman)**:
   - Accounts are created directly in **WP Admin → Users → Add New**.
   - **Administrator**: Full master control over products, custom orders, cost/sale prices, version approvals, and Cloudflare connection settings.
   - **Furniture Designer (`make_designer`)**: Reviews technical specifications, configures custom dimensional sizes, and establishes Cost Price and Customer Sale Price.
   - **Salesperson (`make_salesperson`)**: Selects catalog items, enters custom dimensions, logs customer delivery logistics (with landmark), sets target delivery deadlines, and enters cost price.

3. **Customized Sizing & Item Builder**:
   - Custom dimensional sizing for catalog items via `+ Custom Size` toggle (Length, Width, Height, Diameter for round tables, with units: mm, in, cm, ft).
   - Highlighting of customized products with `✨ Customized` badge in cart and order logs.
   - Non-catalog custom item creator.

4. **Customer Delivery Logistics with Landmark**:
   - Full Shipping Address with **Location Landmark** positioned directly below for clear routing.
   - **Target Delivery Date \*** (Mandatory) and **Requested Delivery Date** (Optional).

5. **Product Catalog & Purchase History Analytics**:
   - Catalog browser with specifications, standard sizes, and finishes.
   - **Order History Modal** displaying total units ordered, custom size breakdowns, previous client names, dates, and dimensions.

6. **Version-Tracked Approval & Re-Approval Workflow**:
   - Side-by-Side Version Diff Viewer highlighting modified dimensions, specifications, and prices.
   - One-click **Approve Version** or **Request Revision** with feedback.

7. **Direct Cloudflare Tunnel Connection**:
   - **Primary Routing**: `https://db.lenas.me` (Cloudflare Tunnel to TrueNAS PostgREST).
   - Supports Cloudflare Access Service Tokens (`CF-Access-Client-Id` & `CF-Access-Client-Secret`).
   - **Failover Backup**: Supabase Cloud PostgreSQL.

---

## 🚀 Quick Setup

1. **Upload & Activate**:
   - Copy `le-make-sales-portal` into `wp-content/plugins/le-make-sales-portal` or upload via **WP Admin → Plugins → Add New → Upload Plugin**.
   - Activate the plugin.

2. **Embed on Frontend**:
   - Add shortcode `[make_sales_portal]` to any page (e.g., `/make-portal/`).

3. **Configure Database**:
   - Navigate to **WP Admin → Settings → LE MAKE Portal**.
   - Confirm Cloudflare Tunnel URL (`https://db.lenas.me`) and optional Cloudflare Access Service Token keys.

4. **Create & Assign Users**:
   - In **WP Admin → Users → Add New**, create user accounts and assign them to **Administrator**, **Furniture Designer**, or **Salesperson**.

---

See [WORDPRESS_INTEGRATION_GUIDE.md](../../WORDPRESS_INTEGRATION_GUIDE.md) for the complete manual.
