# Leading-Edge ECO System
A complete, end-to-end **Total Solution for a Furniture Company**—delivered as a unified ecosystem with:

- **Website (Web App/Admin Panel)** for management, sales, reporting, and operations
- **PC Software (Desktop App)** for office/front-desk and internal operational use
- **Mobile App** for on-the-go staff (sales, warehouse, delivery, service) and real-time updates

This system is designed to manage the full workflow of a furniture business: **sales → production → inventory → delivery → reporting**.

---

## Product Overview
Furniture businesses often struggle with disconnected tools across departments. Leading-Edge ECO System centralizes everything into one platform:

- Reduce manual paperwork and duplicate data entry
- Improve stock accuracy and production visibility
- Track orders from quotation to delivery
- Enable fast management decisions using dashboards & reports

---

## Key Modules (Typical)
### Sales & Customer Management
- Customer/Dealer management
- Quotations / Estimates
- Sales Orders
- Invoicing
- Returns & adjustments (optional)

### Production / Workshop
- Work orders / job cards
- Production tracking (pending / running / completed)
- Material consumption (optional)
- Finished goods receiving

### Inventory / Warehouse
- Raw materials stock
- Finished goods stock
- Stock in/out, transfers (optional)
- Low-stock alerts (optional)

### Procurement / Supplier
- Supplier management
- Purchase orders
- Goods receiving
- Supplier due tracking (optional)

#### Expanded Purchase Requisition & Procurement Requirements

##### 1) Product Management
- Dedicated product page for creating and managing products.
- Product fields: product name, auto-generated product ID, product type, product group, stock group, and unit of measurement.
- Product type must support local and imported items.

##### 2) Product ID Generation
- Product IDs must be generated automatically from the product group and local/imported category.
- Admin-defined prefixes must be supported per product group and category.
- Example: Hardware + Imported can map to prefix `50`, producing an ID such as `50-1234`.
- Product IDs must be unique and sequential.

##### 3) Purchase Requisition Workflow
- Create a requisition from a dedicated purchase requisition page.
- Requisition fields: requisition ID, product name, created date, quantity requested, priority, and requested by.
- Users must be able to create, view, search, and filter requisitions.

##### 4) Role-Based Workflow
- Store users create requisitions.
- Store Head reviews, edits, approves, or rejects requisitions.
- Purchase Department adds procurement details after Store Head approval.
- Audit users review procurement details and may add remarks only.
- Director gives final approval or disapproval.

##### 5) Supplier Management
- Dedicated supplier page with supplier name, contact person, phone number, address, email, dues, payment status, and product history.
- Supplier details should auto-load when an existing supplier is selected.
- If no supplier exists, the system should allow creating a new one during procurement entry.

##### 6) Purchase Details
- Purchase Department must capture estimated price, supplier contact details, supplier reference, invoice ID, payment status, quantity purchased, and remarks.
- The system should track purchase status from requisition creation through completion.

##### 7) Goods Receiving and Stock Update
- Once goods are received, the system must update inventory automatically.
- Stock movements must be linked to the requisition and invoice.
- Current stock should be updated separately from product master creation.

##### 8) Audit Trail
- Every edit, approval, rejection, supplier change, payment change, and stock update must be logged.
- Audit entries should capture user, action, date/time, old value, and new value.

##### 9) Notifications
- Relevant departments must be notified when Store Head approvals, audit remarks, director approval/disapproval, and goods received events occur.

##### 10) Suggested Extensions
- Role-based access control for Store, Store Head, Purchase Department, Audit, Director, and Admin.
- Dashboards for pending approvals, requisition counts, supplier dues, purchase trends, and inventory levels.
- Attachment upload support for quotations, invoices, and audit files.
- Multi-level approval, budget control, vendor comparison, barcode/QR support, reporting, and accounting integration.

### Delivery / Logistics
- Delivery note / challan
- Delivery status tracking (optional)

### Reports & Dashboard
- Sales summary
- Stock & inventory reports
- Production status reports
- Customer & supplier statements

### Admin & Security
- User & role management
- Permissions (role-based access)
- Audit logs (optional)

---

## Tech Stack (Website + PC Software + Mobile App)
> **Note:** Update the exact technologies below to match your repo (e.g., Laravel vs Node, Flutter vs React Native, etc.).  
> This section is structured for an “all-in-one ecosystem” architecture.

### 1) Website / Web Application
**Purpose:** Admin dashboard, back-office operations, analytics & reporting, multi-user access.

Typical stack options:
- **Frontend:** React / Vue / Angular (or server-rendered UI)
- **Backend/API:** Node.js (Express/Nest) / Laravel / Django / Spring Boot / .NET
- **Database:** MySQL / PostgreSQL / SQL Server
- **Auth:** JWT / Session-based auth, Role-based access control
- **Hosting:** VPS / Docker / Cloud (AWS/Azure/GCP)
- **Web Server:** Nginx / Apache

### 2) PC Software (Desktop Application)
**Purpose:** Office counter operations, faster workflows on Windows PCs, offline-friendly features (optional).

Typical stack options:
- **Windows Desktop:** .NET (WinForms/WPF) or Java (JavaFX)
- **Cross-platform Desktop:** Electron / Tauri
- **Local Storage (optional):** SQLite
- **Sync Model:** Connects to central API (online) and optionally syncs when offline

### 3) Mobile App
**Purpose:** Field operations—sales visits, warehouse scanning, delivery updates, real-time status.

Typical stack options:
- **Cross-platform:** Flutter / React Native
- **Native:** Kotlin (Android), Swift (iOS)
- **API Communication:** REST / GraphQL
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Offline Mode (optional):** Local DB (SQLite/Hive/Room) + sync

### 4) Shared Services (Recommended Architecture)
- **API Layer:** One central REST/GraphQL API used by Web + Desktop + Mobile
- **Database:** Single source of truth for all modules
- **File Storage:** Local server storage or S3-compatible storage
- **CI/CD (optional):** GitHub Actions
- **Monitoring (optional):** Logs + performance monitoring

---

## Setup & Installation
> Replace these placeholders with the actual commands used in your repository.

### Clone the Repository
```bash
git clone https://github.com/sabbir-404/Leading-Edge-ECO-System.git
cd Leading-Edge-ECO-System
```

### Environment Configuration
Create and configure environment variables (example):
- Database credentials
- API base URL
- JWT/secret keys
- Storage settings
- Push notification keys (mobile)

### Run (Examples)
**Web App:**
```bash
# example only
npm install
npm run dev
```

**Desktop App:**
```bash
# example only
# build/run steps depend on framework (.NET/Electron/etc.)
```

**Mobile App:**
```bash
# example only
# flutter pub get
# flutter run
```

---

## High-Level Workflow
1. Add products/materials and configure pricing
2. Create quotation → confirm sales order
3. Generate work order for production
4. Update production status and receive finished goods
5. Manage inventory and dispatch deliveries
6. Track payments/dues (if enabled)
7. View dashboards and export reports

---



---

## Contact / Support
Maintainer: **sabbir-404**  
Please open a GitHub Issue for bugs, feature requests, or support.
