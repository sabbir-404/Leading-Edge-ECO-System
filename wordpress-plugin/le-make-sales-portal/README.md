# LE-SOFT MAKE — WordPress Sales & Furniture Design Portal Plugin

A fully featured, high-performance WordPress plugin for **LE-SOFT (Leading Edge ERP)** providing an interactive production and sales portal connected directly through **Cloudflare Tunnel (`https://db.lenas.me`)** to the TrueNAS PostgreSQL container with automatic Supabase Cloud failover backup.

---

## 🌟 Key Features

**Current package version: 1.8.15**

1. **Embedded In-Portal Login Screen**:
   - Guests viewing `[make_sales_portal]` see a sleek, glassmorphic sign-in interface without redirecting to `/wp-login.php`.
   - Direct AJAX authentication loads permissions and dynamically mounts the production dashboard.
   - User profile badge and 1-click **Logout** button in top navigation bar.

2. **WordPress User Role Hierarchy (Admin, Furniture Designer, Salesman)**:
   - Accounts are created directly in **WP Admin → Users → Add New**.
   - **Administrator**: Full master control over products, custom orders, cost/sale prices, version approvals, and Cloudflare connection settings.
   - **Furniture Designer (`make_designer`)**: Reviews technical specifications, configures custom dimensional sizes, and establishes Cost Price and Customer Sale Price.
   - **Salesman (`make_salesperson`)**: Selects catalog items, sees sale prices and customer drawings, creates own costing requests, places/approves orders, records due payments, and requests admin approval to proceed with unpaid orders. Cost prices, production blueprints, and designer pricing controls are withheld.
   - Existing WordPress roles receive new portal capabilities during plugin updates; assigning a role does not require deleting/recreating users.

3. **Custom Furniture Requestion & Costing**:
   - Salesmen can submit multi-item costing requests with optional customer details, quantities, individual and request-level remarks, and reference files.
   - Designers/admins can search and review requests, add required product name/code and cost/sale prices, attach optional product images and drawings, create the linked catalog product, and delete requests.
   - A salesman sees the sale price and can carry a priced item directly into the production order form. Factory managers see cost and production files, while customer drawings and sale prices are hidden.
   - Reference uploads accept furniture-related file formats up to 50 MB per file while rejecting executable and active web content. Media is served through authenticated, private proxy links; offline WordPress staging buffers are encrypted with AES-256-GCM.

4. **Customized Sizing & Item Builder**:
   - Custom dimensional sizing for catalog items via `+ Custom Size` toggle (Length, Width, Height, Diameter for round tables, with units: mm, in, cm, ft).
   - Highlighting of customized products with `✨ Customized` badge in cart and order logs.
   - Non-catalog custom item creator.

5. **Customer Delivery Logistics with Landmark**:
   - Full Shipping Address with **Location Landmark** positioned directly below for clear routing.
   - **Target Delivery Date \*** (Mandatory) and **Requested Delivery Date** (Optional).

6. **Product Catalog & Purchase History Analytics**:
   - Catalog browser with specifications, standard sizes, and finishes.
   - **Order History Modal** displaying total units ordered, custom size breakdowns, previous client names, dates, and dimensions.
   - Separate production-blueprint and customer-facing product-drawing previews with server-side role filtering: designers and administrators see both, sales users see product drawings, and factory managers see production blueprints.
   - DXF, PDF, and common-image previews; product-drawing PDFs uploaded through LE-SOFT or the portal receive a light Leading Edge watermark. DWG remains downloadable and opens in AutoCAD or another licensed viewer.

7. **Version-Tracked Approval & Re-Approval Workflow**:
   - Side-by-Side Version Diff Viewer highlighting modified dimensions, specifications, and prices.
   - One-click **Approve Version** or **Request Revision** with feedback.

8. **Direct Cloudflare Tunnel Connection**:
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
   - In **WP Admin → Users → Add New**, create user accounts and assign them to **Administrator**, **Furniture Designer**, **Salesman**, or **Factory Manager**.

5. **Configure private cloud file access when Supabase failover is used**:
   - Set `LE_MAKE_SUPABASE_SERVICE_KEY` in the WordPress server environment or `wp-config.php`. The service key is used only by the server for private database/storage access and must never be added to page JavaScript or sent to users.
   - NAS remains the first target. If its database credentials are rejected or it is unreachable, protected server-side requests use Supabase. Do not enable anonymous access to costing, order, or private-storage tables.

---

See [WORDPRESS_INTEGRATION_GUIDE.md](../../WORDPRESS_INTEGRATION_GUIDE.md) for the complete manual.
