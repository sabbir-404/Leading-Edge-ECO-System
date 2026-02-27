"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  // Groups
  getGroups: () => import_electron.ipcRenderer.invoke("get-groups"),
  createGroup: (group) => import_electron.ipcRenderer.invoke("create-group", group),
  deleteGroup: (id) => import_electron.ipcRenderer.invoke("delete-group", id),
  // Ledgers
  getLedgers: () => import_electron.ipcRenderer.invoke("get-ledgers"),
  createLedger: (ledger) => import_electron.ipcRenderer.invoke("create-ledger", ledger),
  deleteLedger: (id) => import_electron.ipcRenderer.invoke("delete-ledger", id),
  // Vouchers
  getVouchers: () => import_electron.ipcRenderer.invoke("get-vouchers"),
  createVoucher: (voucher) => import_electron.ipcRenderer.invoke("create-voucher", voucher),
  deleteVoucher: (id) => import_electron.ipcRenderer.invoke("delete-voucher", id),
  // Units
  getUnits: () => import_electron.ipcRenderer.invoke("get-units"),
  createUnit: (unit) => import_electron.ipcRenderer.invoke("create-unit", unit),
  deleteUnit: (id) => import_electron.ipcRenderer.invoke("delete-unit", id),
  // Stock Groups
  getStockGroups: () => import_electron.ipcRenderer.invoke("get-stock-groups"),
  createStockGroup: (group) => import_electron.ipcRenderer.invoke("create-stock-group", group),
  deleteStockGroup: (id) => import_electron.ipcRenderer.invoke("delete-stock-group", id),
  // Stock Items
  getStockItems: () => import_electron.ipcRenderer.invoke("get-stock-items"),
  createStockItem: (item) => import_electron.ipcRenderer.invoke("create-stock-item", item),
  deleteStockItem: (id) => import_electron.ipcRenderer.invoke("delete-stock-item", id),
  // Products
  getProducts: () => import_electron.ipcRenderer.invoke("get-products"),
  getProduct: (id) => import_electron.ipcRenderer.invoke("get-product", id),
  createProduct: (product) => import_electron.ipcRenderer.invoke("create-product", product),
  updateProduct: (product) => import_electron.ipcRenderer.invoke("update-product", product),
  deleteProduct: (id) => import_electron.ipcRenderer.invoke("delete-product", id),
  // Purchase Bills
  getPurchaseBills: () => import_electron.ipcRenderer.invoke("get-purchase-bills"),
  createPurchaseBill: (bill) => import_electron.ipcRenderer.invoke("create-purchase-bill", bill),
  deletePurchaseBill: (id) => import_electron.ipcRenderer.invoke("delete-purchase-bill", id),
  // Users
  getUsers: () => import_electron.ipcRenderer.invoke("get-users"),
  createUser: (user) => import_electron.ipcRenderer.invoke("create-user", user),
  updateUser: (user) => import_electron.ipcRenderer.invoke("update-user", user),
  deleteUser: (id) => import_electron.ipcRenderer.invoke("delete-user", id),
  authenticateUser: (creds) => import_electron.ipcRenderer.invoke("authenticate-user", creds),
  // User Groups
  getUserGroups: () => import_electron.ipcRenderer.invoke("get-user-groups"),
  createUserGroup: (group) => import_electron.ipcRenderer.invoke("create-user-group", group),
  updateUserGroup: (group) => import_electron.ipcRenderer.invoke("update-user-group", group),
  deleteUserGroup: (id) => import_electron.ipcRenderer.invoke("delete-user-group", id),
  // Notifications
  getNotifications: (userId) => import_electron.ipcRenderer.invoke("get-notifications", userId),
  sendNotification: (notification) => import_electron.ipcRenderer.invoke("send-notification", notification),
  markNotificationRead: (id) => import_electron.ipcRenderer.invoke("mark-notification-read", id),
  markAllNotificationsRead: (userId) => import_electron.ipcRenderer.invoke("mark-all-notifications-read", userId),
  deleteNotification: (id) => import_electron.ipcRenderer.invoke("delete-notification", id),
  // Image Picker
  pickImage: () => import_electron.ipcRenderer.invoke("pick-image"),
  // Companies
  getCompanies: () => import_electron.ipcRenderer.invoke("get-companies"),
  createCompany: (company) => import_electron.ipcRenderer.invoke("create-company", company),
  // Dashboard
  getDashboardStats: () => import_electron.ipcRenderer.invoke("get-dashboard-stats"),
  // Settings
  getSettings: () => import_electron.ipcRenderer.invoke("get-settings"),
  updateSettings: (settings) => import_electron.ipcRenderer.invoke("update-settings", settings),
  // Website (MySQL)
  websiteGetProducts: () => import_electron.ipcRenderer.invoke("website-get-products"),
  websiteGetOrders: () => import_electron.ipcRenderer.invoke("website-get-orders"),
  websiteUpdateOrder: (order) => import_electron.ipcRenderer.invoke("website-update-order", order),
  websiteGetCategories: () => import_electron.ipcRenderer.invoke("website-get-categories"),
  websiteGetStats: () => import_electron.ipcRenderer.invoke("website-get-stats"),
  // Legacy, can keep or remove if unused
  websiteGetDashboardData: () => import_electron.ipcRenderer.invoke("website-get-dashboard-data"),
  // Website Products
  websiteCreateProduct: (product) => import_electron.ipcRenderer.invoke("website-create-product", product),
  websiteUpdateProduct: (product) => import_electron.ipcRenderer.invoke("website-update-product", product),
  websiteDeleteProduct: (id) => import_electron.ipcRenderer.invoke("website-delete-product", id),
  websiteDeleteProductsBulk: (ids) => import_electron.ipcRenderer.invoke("website-delete-products-bulk", ids),
  websiteUpdateProductStatusBulk: (ids, isVisible) => import_electron.ipcRenderer.invoke("website-update-product-status-bulk", { ids, isVisible }),
  // Website Orders
  websiteCreateOrder: (order) => import_electron.ipcRenderer.invoke("website-create-order", order),
  // Website Users
  websiteGetUsers: () => import_electron.ipcRenderer.invoke("website-get-users"),
  // Reports
  reportTrialBalance: () => import_electron.ipcRenderer.invoke("report-trial-balance"),
  reportBalanceSheet: () => import_electron.ipcRenderer.invoke("report-balance-sheet"),
  reportProfitAndLoss: () => import_electron.ipcRenderer.invoke("report-profit-and-loss"),
  reportStockSummary: () => import_electron.ipcRenderer.invoke("report-stock-summary"),
  reportDayBook: (params) => import_electron.ipcRenderer.invoke("report-day-book", params),
  // Billing / POS
  searchBillingCustomers: (query) => import_electron.ipcRenderer.invoke("search-billing-customers", query),
  createBillingCustomer: (customer) => import_electron.ipcRenderer.invoke("create-billing-customer", customer),
  createBill: (bill) => import_electron.ipcRenderer.invoke("create-bill", bill),
  getBills: () => import_electron.ipcRenderer.invoke("get-bills"),
  getBillDetails: (id) => import_electron.ipcRenderer.invoke("get-bill-details", id),
  updateBill: (bill) => import_electron.ipcRenderer.invoke("update-bill", bill),
  getBillAudit: (billId) => import_electron.ipcRenderer.invoke("get-bill-audit", billId),
  changePassword: (data) => import_electron.ipcRenderer.invoke("change-password", data),
  // --- PHASE 2: Website Expansion ---
  // Categories
  websiteCreateCategory: (cat) => import_electron.ipcRenderer.invoke("website-create-category", cat),
  websiteUpdateCategory: (cat) => import_electron.ipcRenderer.invoke("website-update-category", cat),
  websiteDeleteCategory: (id) => import_electron.ipcRenderer.invoke("website-delete-category", id),
  // Projects
  websiteGetProjects: () => import_electron.ipcRenderer.invoke("website-get-projects"),
  websiteCreateProject: (p) => import_electron.ipcRenderer.invoke("website-create-project", p),
  websiteUpdateProject: (p) => import_electron.ipcRenderer.invoke("website-update-project", p),
  websiteDeleteProject: (id) => import_electron.ipcRenderer.invoke("website-delete-project", id),
  // Pages
  websiteGetPages: () => import_electron.ipcRenderer.invoke("website-get-pages"),
  websiteCreatePage: (p) => import_electron.ipcRenderer.invoke("website-create-page", p),
  websiteUpdatePage: (p) => import_electron.ipcRenderer.invoke("website-update-page", p),
  websiteDeletePage: (id) => import_electron.ipcRenderer.invoke("website-delete-page", id),
  // Media
  websiteGetMedia: () => import_electron.ipcRenderer.invoke("website-get-media"),
  // Shipping
  websiteGetShippingAreas: () => import_electron.ipcRenderer.invoke("website-get-shipping-areas"),
  websiteCreateShippingArea: (a) => import_electron.ipcRenderer.invoke("website-create-shipping-area", a),
  websiteDeleteShippingArea: (id) => import_electron.ipcRenderer.invoke("website-delete-shipping-area", id),
  websiteGetShippingMethods: () => import_electron.ipcRenderer.invoke("website-get-shipping-methods"),
  websiteCreateShippingMethod: (m) => import_electron.ipcRenderer.invoke("website-create-shipping-method", m),
  websiteUpdateShippingMethod: (m) => import_electron.ipcRenderer.invoke("website-update-shipping-method", m),
  websiteDeleteShippingMethod: (id) => import_electron.ipcRenderer.invoke("website-delete-shipping-method", id),
  // Newsletter
  websiteGetNewsletters: () => import_electron.ipcRenderer.invoke("website-get-newsletters"),
  // Config
  websiteGetConfig: () => import_electron.ipcRenderer.invoke("website-get-config"),
  websiteUpdateConfig: (config) => import_electron.ipcRenderer.invoke("website-update-config", config),
  saveSupabaseConfig: (config) => import_electron.ipcRenderer.invoke("save-supabase-config", config),
  // Internal Chat
  getChatMessages: (params) => import_electron.ipcRenderer.invoke("get-chat-messages", params),
  sendChatMessage: (msg) => import_electron.ipcRenderer.invoke("send-chat-message", msg),
  pickChatFile: () => import_electron.ipcRenderer.invoke("pick-chat-file"),
  // Product Search
  searchProductsDetailed: (query) => import_electron.ipcRenderer.invoke("search-products-detailed", query),
  // User Presence & Typing
  updateUserPresence: (userId) => import_electron.ipcRenderer.invoke("update-user-presence", userId),
  getOnlineUsers: () => import_electron.ipcRenderer.invoke("get-online-users"),
  setTypingStatus: (params) => import_electron.ipcRenderer.invoke("set-typing-status", params),
  getTypingStatus: (params) => import_electron.ipcRenderer.invoke("get-typing-status", params),
  // WooCommerce CSV Import
  importWooCommerceCSV: (csvFilePath) => import_electron.ipcRenderer.invoke("import-woocommerce-csv", csvFilePath),
  // Product Sync
  syncProductsToWebsite: () => import_electron.ipcRenderer.invoke("sync-products-to-website"),
  // Auto-Update
  checkForUpdate: () => import_electron.ipcRenderer.invoke("check-for-update"),
  downloadUpdate: () => import_electron.ipcRenderer.invoke("download-update"),
  installUpdate: () => import_electron.ipcRenderer.invoke("install-update"),
  getAppVersion: () => import_electron.ipcRenderer.invoke("get-app-version"),
  onUpdateStatus: (callback) => {
    import_electron.ipcRenderer.on("update-status", (_event, data) => callback(data));
    return () => {
      import_electron.ipcRenderer.removeAllListeners("update-status");
    };
  },
  // Network Setup
  getNetworkConfig: () => import_electron.ipcRenderer.invoke("get-network-config"),
  saveNetworkConfig: (config) => import_electron.ipcRenderer.invoke("save-network-config", config),
  testServerConnection: (data) => import_electron.ipcRenderer.invoke("test-server-connection", data),
  getLocalIp: () => import_electron.ipcRenderer.invoke("get-local-ip"),
  restartApp: () => import_electron.ipcRenderer.invoke("restart-app"),
  onRedirect: (callback) => {
    import_electron.ipcRenderer.on("redirect-to", (_event, path) => callback(path));
    return () => {
      import_electron.ipcRenderer.removeAllListeners("redirect-to");
    };
  },
  // Database Health
  pingSupabase: () => import_electron.ipcRenderer.invoke("ping-supabase"),
  // ─── EMAIL ───
  emailGetInbox: (userId) => import_electron.ipcRenderer.invoke("email-get-inbox", userId),
  emailGetSent: (userId) => import_electron.ipcRenderer.invoke("email-get-sent", userId),
  emailSend: (data) => import_electron.ipcRenderer.invoke("email-send", data),
  emailMarkRead: (emailId) => import_electron.ipcRenderer.invoke("email-mark-read", emailId),
  emailDelete: (data) => import_electron.ipcRenderer.invoke("email-delete", data),
  // MAKE Module — Metal Furniture Orders
  getMakeOrders: () => import_electron.ipcRenderer.invoke("get-make-orders"),
  createMakeOrder: (order) => import_electron.ipcRenderer.invoke("create-make-order", order),
  updateMakeOrderStatus: (data) => import_electron.ipcRenderer.invoke("update-make-order-status", data),
  getMakeOrderUpdates: (orderId) => import_electron.ipcRenderer.invoke("get-make-order-updates", orderId),
  deleteMakeOrder: (id) => import_electron.ipcRenderer.invoke("delete-make-order", id),
  getMakeFurnitureNames: () => import_electron.ipcRenderer.invoke("get-make-furniture-names"),
  // Make — PDF Attachments
  makeUploadPdf: (data) => import_electron.ipcRenderer.invoke("make-upload-pdf", data),
  makeGetPdfUrls: (orderId) => import_electron.ipcRenderer.invoke("make-get-pdf-urls", orderId),
  makeDeletePdf: (data) => import_electron.ipcRenderer.invoke("make-delete-pdf", data),
  makeDownloadPdf: (data) => import_electron.ipcRenderer.invoke("make-download-pdf", data),
  // Make — Parts / Dimensions
  makeGetOrderParts: (orderId) => import_electron.ipcRenderer.invoke("make-get-order-parts", orderId),
  makeUpsertPart: (part) => import_electron.ipcRenderer.invoke("make-upsert-part", part),
  makeDeletePart: (partId) => import_electron.ipcRenderer.invoke("make-delete-part", partId),
  // Make — Alteration
  makeAlterOrder: (data) => import_electron.ipcRenderer.invoke("make-alter-order", data),
  makeGetAlterationLog: (orderId) => import_electron.ipcRenderer.invoke("make-get-alteration-log", orderId),
  // Make — Dashboard
  makeGetDashboardStats: () => import_electron.ipcRenderer.invoke("make-get-dashboard-stats"),
  // License — Cloud
  checkLicenseCloud: () => import_electron.ipcRenderer.invoke("check-license-cloud"),
  activateLicenseCloud: (data) => import_electron.ipcRenderer.invoke("activate-license-cloud", data),
  // Printing
  getPrinters: () => import_electron.ipcRenderer.invoke("get-printers"),
  // System Audit Log
  getAuditLog: (params) => import_electron.ipcRenderer.invoke("get-audit-log", params),
  // Bill Alter Approval
  stageBillAlteration: (data) => import_electron.ipcRenderer.invoke("stage-bill-alteration", data),
  getPendingAlterations: () => import_electron.ipcRenderer.invoke("get-pending-alterations"),
  approveAlteration: (data) => import_electron.ipcRenderer.invoke("approve-alteration", data),
  rejectAlteration: (data) => import_electron.ipcRenderer.invoke("reject-alteration", data),
  // Shipping
  addBillShipping: (data) => import_electron.ipcRenderer.invoke("add-bill-shipping", data),
  getBillShipping: (billId) => import_electron.ipcRenderer.invoke("get-bill-shipping", billId),
  getAllShipments: (params) => import_electron.ipcRenderer.invoke("get-all-shipments", params),
  getShipmentHistory: (shipmentId) => import_electron.ipcRenderer.invoke("get-shipment-history", shipmentId),
  updateShipmentStatus: (data) => import_electron.ipcRenderer.invoke("update-shipment-status", data),
  uploadPackagingImage: (data) => import_electron.ipcRenderer.invoke("upload-packaging-image", data),
  // License Key
  getMachineId: () => import_electron.ipcRenderer.invoke("get-machine-id"),
  checkLicense: () => import_electron.ipcRenderer.invoke("check-license"),
  activateLicense: (key) => import_electron.ipcRenderer.invoke("activate-license", key),
  // Database Backup
  createDbBackup: () => import_electron.ipcRenderer.invoke("create-db-backup"),
  listDbBackups: () => import_electron.ipcRenderer.invoke("list-db-backups"),
  restoreDbBackup: (name) => import_electron.ipcRenderer.invoke("restore-db-backup", name),
  // Database Monitoring
  getDbMonitoring: () => import_electron.ipcRenderer.invoke("get-db-monitoring"),
  // ─── HRM MODULE ───
  hrmGetEmployees: () => import_electron.ipcRenderer.invoke("hrm-get-employees"),
  hrmUpsertEmployee: (emp) => import_electron.ipcRenderer.invoke("hrm-upsert-employee", emp),
  hrmDeleteEmployee: (id) => import_electron.ipcRenderer.invoke("hrm-delete-employee", id),
  hrmGetAttendance: (data) => import_electron.ipcRenderer.invoke("hrm-get-attendance", data),
  hrmMarkAttendance: (att) => import_electron.ipcRenderer.invoke("hrm-mark-attendance", att),
  hrmGetLeaves: () => import_electron.ipcRenderer.invoke("hrm-get-leaves"),
  hrmRequestLeave: (leave) => import_electron.ipcRenderer.invoke("hrm-request-leave", leave),
  hrmUpdateLeaveStatus: (data) => import_electron.ipcRenderer.invoke("hrm-update-leave-status", data),
  hrmGetPayroll: (data) => import_electron.ipcRenderer.invoke("hrm-get-payroll", data),
  hrmGeneratePayroll: (pr) => import_electron.ipcRenderer.invoke("hrm-generate-payroll", pr),
  hrmMarkPayrollPaid: (id) => import_electron.ipcRenderer.invoke("hrm-mark-payroll-paid", id),
  // ─── CRM MODULE ───
  crmGetCustomers: () => import_electron.ipcRenderer.invoke("crm-get-customers"),
  crmUpsertCustomer: (cust) => import_electron.ipcRenderer.invoke("crm-upsert-customer", cust),
  crmGetTrackingLogs: (data) => import_electron.ipcRenderer.invoke("crm-get-tracking-logs", data),
  crmAddTrackingLog: (log) => import_electron.ipcRenderer.invoke("crm-add-tracking-log", log)
});
