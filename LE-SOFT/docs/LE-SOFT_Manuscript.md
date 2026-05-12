# LE-SOFT Manuscript

## Scope
This manuscript documents the desktop LE-SOFT application from a superadmin perspective. The superadmin role bypasses the route guard in `ProtectedRoute` and also bypasses feature permission checks in the dashboard navigation, so every page in the app is available.

## Access Model
- `ProtectedRoute` returns the requested page immediately when `user_role === 'superadmin'`.
- `DashboardLayout` also treats superadmin as full access for menu visibility.
- This manuscript assumes the superadmin can open, create, edit, approve, delete, preview, and configure any page that exposes those actions.

## Core Shell Pages
- Login: sign in to the application and restore the user session.
- SetupScreen: configure first-run application settings and Supabase connection details.
- LicenseGate: activate or validate the app license before entering the system.
- Dashboard: view the main operational overview, live activity, and shortcuts.
- Masters: entry hub for accounting, inventory, and procurement master data.
- Vouchers: entry hub for accounting vouchers and purchase bills.
- Reports: entry hub for financial, inventory, and market reports.
- Settings: manage app-level preferences, theme, and operational settings.
- Notifications: review system notifications and workflow alerts.
- Email: manage internal or outbound email workflows.
- CreateCompany: create a new company profile and start a new dataset.

## Accounting Masters
- GroupList: view, search, create, edit, and delete ledger groups.
- GroupCreate: create a new group and place it under the correct parent group.
- LedgerList: review all ledgers and their balances.
- LedgerCreate: create or update ledger records used in accounting and billing.
- SupplierManagement: manage supplier ledgers, contact details, and payment settlement status.

## Inventory Masters
- UnitList: manage units of measurement such as piece, kg, box, and liter.
- UnitCreate: create a new unit with symbol and decimal settings.
- StockGroupList: organize stock groups and inventory category structure.
- StockGroupCreate: create new stock group hierarchies.
- StockItemList: browse raw materials and stock item records.
- StockItemCreate: create stock items and assign groups and units.
- ProductList: browse the product catalog with search and filters.
- ProductCreate: create or update products, pricing, and inventory metadata.
- PurchaseRequisitions: create multi-line purchase requisitions, track approval states, and view requisition history.

## Inventory Stubs
- VoucherTypes: define voucher type templates used by accounting entries.
- Currencies: manage currencies and exchange rate settings.
- Godowns: manage warehouse, store, or storage-location records.

## Vouchers and Purchases
- VoucherList: browse accounting vouchers and open them for review.
- VoucherEntry: create or edit voucher transactions.
- PurchaseBillList: review purchase bills and supplier-linked entries.
- PurchaseBillCreate: create a purchase bill and add line items.

## Users and Security
- UserList: view, search, edit, enable, disable, and delete users.
- UserCreate: create a new user account and assign a group and role.
- UserGroupList: view, edit, and delete permission groups.
- UserGroupCreate: create a new permission group and assign capabilities.
- ActiveUsers: review active sessions and connected users.
- PermissionLevels: define approval workflows for controlled actions.

## Billing and CRM
- Billing: run the POS/billing screen, search products, and create invoices.
- BillHistory: browse historical bills, print copies, and review bill details.
- AlterBill: modify an existing bill when authorized.
- PendingAlterations: review bills waiting for approval or review.
- CRMDirectory: manage customer and CRM records.
- CRMProgress: track sales or customer progress stages.
- CustomerLedgerList: browse customer ledger accounts.
- CustomerLedgerDetail: inspect an individual customer ledger and transaction history.
- ExchangeOrders: manage exchange and return workflows.
- ExchangeCreate: create a new exchange request.

## Quotation Module
- QuotationList: browse quotations, preview them, and delete stale records.
- QuotationCreate: create a new quotation and add products or services.
- QuotationPreview: preview or print a quotation before sending it.

## HRM Module
- HRMDashboard: view human-resources metrics and shortcuts.
- HRMEmployees: manage employee records and profiles.
- HRMAttendance: review and adjust attendance data.
- HRMLeaves: process leave requests and approval actions.
- HRMPayroll: generate and review payroll records.

## MAKE Module
- MakeDashboard: monitor manufacturing or production activity.
- PlaceOrder: place a new MAKE order.
- TrackOrders: monitor the status of production orders.
- AlterOrder: adjust an existing MAKE order when required.

## Shipping Module
- ShippingDashboard: manage shipment tracking and shipping-status updates.

## Website Admin Module
- WebsiteDashboard: view website commerce metrics and live activity.
- WebsiteProducts: manage products exposed to the website.
- WebsiteOrders: review and process website orders.
- WebsiteCategories: manage website category structure.
- WebsiteProjects: manage project or portfolio-style website content.
- WebsitePages: create and edit website pages.
- WebsiteMedia: manage uploaded website media assets.
- WebsiteNewsletter: manage newsletter subscriptions and campaign data.
- WebsiteSettings: configure website behavior and integration settings.

## Reports Module
- TrialBalance: review trial balance totals.
- BalanceSheet: inspect balance sheet structure and totals.
- ProfitAndLoss: view income, expense, and profit analysis.
- StockSummary: review current stock summary and movement.
- DayBook: inspect day-by-day voucher entries.
- MarketAnalysis: analyze product and competitor market data.
- ProductHistoryReport: review product price and history trends.

## Other Application Pages
- Gateway: routing or landing entry used by the app for access flow.
- Auth pages are superadmin accessible through the login and setup flow, but they mainly control onboarding and licensing rather than business operations.

## Superadmin Usage Summary
A superadmin can use the application to manage the full cycle of operations: company setup, accounting masters, inventory masters, requisitions, vouchers, billing, quotations, CRM, HRM, shipping, website content, email, notifications, user administration, and reporting.

## Page Index
The following application pages are included in this manuscript and are intended to be reachable under superadmin access:
- Login
- SetupScreen
- LicenseGate
- Dashboard
- Masters
- Vouchers
- Reports
- Settings
- Notifications
- Email
- CreateCompany
- GroupList
- GroupCreate
- LedgerList
- LedgerCreate
- SupplierManagement
- UnitList
- UnitCreate
- StockGroupList
- StockGroupCreate
- StockItemList
- StockItemCreate
- ProductList
- ProductCreate
- PurchaseRequisitions
- VoucherTypes
- Currencies
- Godowns
- VoucherList
- VoucherEntry
- PurchaseBillList
- PurchaseBillCreate
- UserList
- UserCreate
- UserGroupList
- UserGroupCreate
- ActiveUsers
- PermissionLevels
- Billing
- BillHistory
- AlterBill
- PendingAlterations
- CRMDirectory
- CRMProgress
- CustomerLedgerList
- CustomerLedgerDetail
- ExchangeOrders
- ExchangeCreate
- QuotationList
- QuotationCreate
- QuotationPreview
- HRMDashboard
- HRMEmployees
- HRMAttendance
- HRMLeaves
- HRMPayroll
- MakeDashboard
- PlaceOrder
- TrackOrders
- AlterOrder
- ShippingDashboard
- WebsiteDashboard
- WebsiteProducts
- WebsiteOrders
- WebsiteCategories
- WebsiteProjects
- WebsitePages
- WebsiteMedia
- WebsiteNewsletter
- WebsiteSettings
- TrialBalance
- BalanceSheet
- ProfitAndLoss
- StockSummary
- DayBook
- MarketAnalysis
- ProductHistoryReport

## Notes
- This manuscript is intentionally written for superadmin access, because superadmin bypasses protected-route and menu permission checks.
- If the product team wants a customer-facing version later, the content should be split into role-specific manuscripts for admin, manager, operator, and superadmin.
