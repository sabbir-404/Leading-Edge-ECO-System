import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    // Groups
    getGroups: () => ipcRenderer.invoke('get-groups'),
    createGroup: (group: any) => ipcRenderer.invoke('create-group', group),
    deleteGroup: (id: number) => ipcRenderer.invoke('delete-group', id),

    // Ledgers
    getLedgers: () => ipcRenderer.invoke('get-ledgers'),
    createLedger: (ledger: any) => ipcRenderer.invoke('create-ledger', ledger),
    deleteLedger: (id: number) => ipcRenderer.invoke('delete-ledger', id),

    // Vouchers
    getVouchers: () => ipcRenderer.invoke('get-vouchers'),
    createVoucher: (voucher: any) => ipcRenderer.invoke('create-voucher', voucher),
    deleteVoucher: (id: number) => ipcRenderer.invoke('delete-voucher', id),

    // Units
    getUnits: () => ipcRenderer.invoke('get-units'),
    createUnit: (unit: any) => ipcRenderer.invoke('create-unit', unit),
    deleteUnit: (id: number) => ipcRenderer.invoke('delete-unit', id),

    // Stock Groups
    getStockGroups: () => ipcRenderer.invoke('get-stock-groups'),
    createStockGroup: (group: any) => ipcRenderer.invoke('create-stock-group', group),
    deleteStockGroup: (id: number) => ipcRenderer.invoke('delete-stock-group', id),

    // Stock Items
    getStockItems: () => ipcRenderer.invoke('get-stock-items'),
    createStockItem: (item: any) => ipcRenderer.invoke('create-stock-item', item),
    deleteStockItem: (id: number) => ipcRenderer.invoke('delete-stock-item', id),

    // Products
    getProducts: () => ipcRenderer.invoke('get-products'),
    getProduct: (id: number) => ipcRenderer.invoke('get-product', id),
    createProduct: (product: any) => ipcRenderer.invoke('create-product', product),
    updateProduct: (product: any) => ipcRenderer.invoke('update-product', product),
    deleteProduct: (id: number) => ipcRenderer.invoke('delete-product', id),

    // Purchase Bills
    getPurchaseBills: () => ipcRenderer.invoke('get-purchase-bills'),
    createPurchaseBill: (bill: any) => ipcRenderer.invoke('create-purchase-bill', bill),
    deletePurchaseBill: (id: number) => ipcRenderer.invoke('delete-purchase-bill', id),

    // Users
    getUsers: () => ipcRenderer.invoke('get-users'),
    createUser: (user: any) => ipcRenderer.invoke('create-user', user),
    updateUser: (user: any) => ipcRenderer.invoke('update-user', user),
    deleteUser: (id: number) => ipcRenderer.invoke('delete-user', id),
    authenticateUser: (creds: any) => ipcRenderer.invoke('authenticate-user', creds),
    getActiveSessions: () => ipcRenderer.invoke('get-active-sessions'),
    kickUserSession: (userId: number) => ipcRenderer.invoke('kick-user-session', userId),

    // User Groups
    getUserGroups: () => ipcRenderer.invoke('get-user-groups'),
    createUserGroup: (group: any) => ipcRenderer.invoke('create-user-group', group),
    updateUserGroup: (group: any) => ipcRenderer.invoke('update-user-group', group),
    deleteUserGroup: (id: number) => ipcRenderer.invoke('delete-user-group', id),

    // Notifications
    getNotifications: (userId: number) => ipcRenderer.invoke('get-notifications', userId),
    sendNotification: (notification: any) => ipcRenderer.invoke('send-notification', notification),
    markNotificationRead: (id: number) => ipcRenderer.invoke('mark-notification-read', id),
    markAllNotificationsRead: (userId: number) => ipcRenderer.invoke('mark-all-notifications-read', userId),
    deleteNotification: (id: number) => ipcRenderer.invoke('delete-notification', id),

    // Image Picker
    pickImage: () => ipcRenderer.invoke('pick-image'),

    // Companies
    getCompanies: () => ipcRenderer.invoke('get-companies'),
    createCompany: (company: any) => ipcRenderer.invoke('create-company', company),

    // Dashboard
    getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

    // Website (MySQL)
    websiteGetProducts: () => ipcRenderer.invoke('website-get-products'),
    websiteGetOrders: () => ipcRenderer.invoke('website-get-orders'),
    websiteUpdateOrder: (order: any) => ipcRenderer.invoke('website-update-order', order),
    websiteGetCategories: () => ipcRenderer.invoke('website-get-categories'),
    websiteGetStats: () => ipcRenderer.invoke('website-get-stats'), // Legacy, can keep or remove if unused
    websiteGetDashboardData: () => ipcRenderer.invoke('website-get-dashboard-data'),

    // Website Products
    websiteCreateProduct: (product: any) => ipcRenderer.invoke('website-create-product', product),
    websiteUpdateProduct: (product: any) => ipcRenderer.invoke('website-update-product', product),
    websiteDeleteProduct: (id: string) => ipcRenderer.invoke('website-delete-product', id),
    websiteDeleteProductsBulk: (ids: string[]) => ipcRenderer.invoke('website-delete-products-bulk', ids),
    websiteUpdateProductStatusBulk: (ids: string[], isVisible: boolean) => ipcRenderer.invoke('website-update-product-status-bulk', { ids, isVisible }),

    // Website Orders
    websiteCreateOrder: (order: any) => ipcRenderer.invoke('website-create-order', order),

    // Website Users
    websiteGetUsers: () => ipcRenderer.invoke('website-get-users'),

    // Reports
    reportTrialBalance: () => ipcRenderer.invoke('report-trial-balance'),
    reportBalanceSheet: () => ipcRenderer.invoke('report-balance-sheet'),
    reportProfitAndLoss: () => ipcRenderer.invoke('report-profit-and-loss'),
    reportStockSummary: () => ipcRenderer.invoke('report-stock-summary'),
    reportDayBook: (params: any) => ipcRenderer.invoke('report-day-book', params),

    // Billing / POS
    searchBillingCustomers: (query: string) => ipcRenderer.invoke('search-billing-customers', query),
    createBillingCustomer: (customer: any) => ipcRenderer.invoke('create-billing-customer', customer),
    createBill: (bill: any) => ipcRenderer.invoke('create-bill', bill),
    getBills: () => ipcRenderer.invoke('get-bills'),
    getBillDetails: (id: number) => ipcRenderer.invoke('get-bill-details', id),
    updateBill: (bill: any) => ipcRenderer.invoke('update-bill', bill),
    getBillAudit: (billId: number) => ipcRenderer.invoke('get-bill-audit', billId),
    changePassword: (data: any) => ipcRenderer.invoke('change-password', data),

    // --- PHASE 2: Website Expansion ---

    // Categories
    websiteCreateCategory: (cat: any) => ipcRenderer.invoke('website-create-category', cat),
    websiteUpdateCategory: (cat: any) => ipcRenderer.invoke('website-update-category', cat),
    websiteDeleteCategory: (id: string) => ipcRenderer.invoke('website-delete-category', id),

    // Projects
    websiteGetProjects: () => ipcRenderer.invoke('website-get-projects'),
    websiteCreateProject: (p: any) => ipcRenderer.invoke('website-create-project', p),
    websiteUpdateProject: (p: any) => ipcRenderer.invoke('website-update-project', p),
    websiteDeleteProject: (id: string) => ipcRenderer.invoke('website-delete-project', id),

    // Pages
    websiteGetPages: () => ipcRenderer.invoke('website-get-pages'),
    websiteCreatePage: (p: any) => ipcRenderer.invoke('website-create-page', p),
    websiteUpdatePage: (p: any) => ipcRenderer.invoke('website-update-page', p),
    websiteDeletePage: (id: string) => ipcRenderer.invoke('website-delete-page', id),

    // Media
    websiteGetMedia: () => ipcRenderer.invoke('website-get-media'),

    // Shipping
    websiteGetShippingAreas: () => ipcRenderer.invoke('website-get-shipping-areas'),
    websiteCreateShippingArea: (a: any) => ipcRenderer.invoke('website-create-shipping-area', a),
    websiteDeleteShippingArea: (id: string) => ipcRenderer.invoke('website-delete-shipping-area', id),
    websiteGetShippingMethods: () => ipcRenderer.invoke('website-get-shipping-methods'),
    websiteCreateShippingMethod: (m: any) => ipcRenderer.invoke('website-create-shipping-method', m),
    websiteUpdateShippingMethod: (m: any) => ipcRenderer.invoke('website-update-shipping-method', m),
    websiteDeleteShippingMethod: (id: string) => ipcRenderer.invoke('website-delete-shipping-method', id),

    // Newsletter
    websiteGetNewsletters: () => ipcRenderer.invoke('website-get-newsletters'),

    // Config
    websiteGetConfig: () => ipcRenderer.invoke('website-get-config'),
    websiteUpdateConfig: (config: any) => ipcRenderer.invoke('website-update-config', config),
    saveSupabaseConfig: (config: any) => ipcRenderer.invoke('save-supabase-config', config),

    // Internal Chat
    getChatMessages: (params: any) => ipcRenderer.invoke('get-chat-messages', params),
    sendChatMessage: (msg: any) => ipcRenderer.invoke('send-chat-message', msg),
    pickChatFile: () => ipcRenderer.invoke('pick-chat-file'),

    // Product Search
    searchProductsDetailed: (query: string) => ipcRenderer.invoke('search-products-detailed', query),

    // User Presence & Typing
    updateUserPresence: (userId: number) => ipcRenderer.invoke('update-user-presence', userId),
    getOnlineUsers: () => ipcRenderer.invoke('get-online-users'),
    setTypingStatus: (params: any) => ipcRenderer.invoke('set-typing-status', params),
    getTypingStatus: (params: any) => ipcRenderer.invoke('get-typing-status', params),

    // WooCommerce CSV Import
    importWooCommerceCSV: (csvFilePath: string) => ipcRenderer.invoke('import-woocommerce-csv', csvFilePath),

    // Product Sync
    syncProductsToWebsite: () => ipcRenderer.invoke('sync-products-to-website'),

    // Auto-Update
    checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('update-status', (_event, data) => callback(data));
        return () => { ipcRenderer.removeAllListeners('update-status'); };
    },

    // Network Setup
    getNetworkConfig: () => ipcRenderer.invoke('get-network-config'),
    saveNetworkConfig: (config: any) => ipcRenderer.invoke('save-network-config', config),
    testServerConnection: (data: any) => ipcRenderer.invoke('test-server-connection', data),
    getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
    restartApp: () => ipcRenderer.invoke('restart-app'),
    onRedirect: (callback: (path: string) => void) => {
        ipcRenderer.on('redirect-to', (_event, path) => callback(path));
        return () => { ipcRenderer.removeAllListeners('redirect-to'); };
    },

    // Database Health
    pingSupabase: () => ipcRenderer.invoke('ping-supabase'),

    // ─── EMAIL ───
    emailGetInbox: (userId: number) => ipcRenderer.invoke('email-get-inbox', userId),
    emailGetSent: (userId: number) => ipcRenderer.invoke('email-get-sent', userId),
    emailSend: (data: any) => ipcRenderer.invoke('email-send', data),
    emailMarkRead: (emailId: number) => ipcRenderer.invoke('email-mark-read', emailId),
    emailDelete: (data: any) => ipcRenderer.invoke('email-delete', data),

    // MAKE Module — Metal Furniture Orders
    getMakeOrders: () => ipcRenderer.invoke('get-make-orders'),
    createMakeOrder: (order: any) => ipcRenderer.invoke('create-make-order', order),
    updateMakeOrderStatus: (data: any) => ipcRenderer.invoke('update-make-order-status', data),
    getMakeOrderUpdates: (orderId: number) => ipcRenderer.invoke('get-make-order-updates', orderId),
    deleteMakeOrder: (id: number) => ipcRenderer.invoke('delete-make-order', id),
    getMakeFurnitureNames: () => ipcRenderer.invoke('get-make-furniture-names'),
    // Make — PDF Attachments
    makeUploadPdf: (data: any) => ipcRenderer.invoke('make-upload-pdf', data),
    makeGetPdfUrls: (orderId: number) => ipcRenderer.invoke('make-get-pdf-urls', orderId),
    makeDeletePdf: (data: any) => ipcRenderer.invoke('make-delete-pdf', data),
    makeDownloadPdf: (data: any) => ipcRenderer.invoke('make-download-pdf', data),
    // Make — Parts / Dimensions
    makeGetOrderParts: (orderId: number) => ipcRenderer.invoke('make-get-order-parts', orderId),
    makeUpsertPart: (part: any) => ipcRenderer.invoke('make-upsert-part', part),
    makeDeletePart: (partId: number) => ipcRenderer.invoke('make-delete-part', partId),
    // Make — Alteration
    makeAlterOrder: (data: any) => ipcRenderer.invoke('make-alter-order', data),
    makeGetAlterationLog: (orderId: number) => ipcRenderer.invoke('make-get-alteration-log', orderId),
    // Make — Dashboard
    makeGetDashboardStats: () => ipcRenderer.invoke('make-get-dashboard-stats'),
    // License — Cloud
    checkLicenseCloud: () => ipcRenderer.invoke('check-license-cloud'),
    activateLicenseCloud: (data: any) => ipcRenderer.invoke('activate-license-cloud', data),


    // Printing
    getPrinters: () => ipcRenderer.invoke('get-printers'),

    // System Audit Log
    getAuditLog: (params: any) => ipcRenderer.invoke('get-audit-log', params),

    // Bill Alter Approval
    stageBillAlteration: (data: any) => ipcRenderer.invoke('stage-bill-alteration', data),
    getPendingAlterations: () => ipcRenderer.invoke('get-pending-alterations'),
    approveAlteration: (data: any) => ipcRenderer.invoke('approve-alteration', data),
    rejectAlteration: (data: any) => ipcRenderer.invoke('reject-alteration', data),

    // Shipping
    addBillShipping: (data: any) => ipcRenderer.invoke('add-bill-shipping', data),
    getBillShipping: (billId: number) => ipcRenderer.invoke('get-bill-shipping', billId),
    getAllShipments: (params?: any) => ipcRenderer.invoke('get-all-shipments', params),
    getShipmentHistory: (shipmentId: number) => ipcRenderer.invoke('get-shipment-history', shipmentId),
    updateShipmentStatus: (data: any) => ipcRenderer.invoke('update-shipment-status', data),
    uploadPackagingImage: (data: any) => ipcRenderer.invoke('upload-packaging-image', data),

    // License Key
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    checkLicense: () => ipcRenderer.invoke('check-license'),
    activateLicense: (key: string) => ipcRenderer.invoke('activate-license', key),

    // Database Backup
    createDbBackup: () => ipcRenderer.invoke('create-db-backup'),
    listDbBackups: () => ipcRenderer.invoke('list-db-backups'),
    restoreDbBackup: (name: string) => ipcRenderer.invoke('restore-db-backup', name),

    // Database Monitoring
    getDbMonitoring: () => ipcRenderer.invoke('get-db-monitoring'),

    // ─── HRM MODULE ───
    hrmGetEmployees: () => ipcRenderer.invoke('hrm-get-employees'),
    hrmUpsertEmployee: (emp: any) => ipcRenderer.invoke('hrm-upsert-employee', emp),
    hrmDeleteEmployee: (id: number) => ipcRenderer.invoke('hrm-delete-employee', id),

    hrmGetAttendance: (data: any) => ipcRenderer.invoke('hrm-get-attendance', data),
    hrmMarkAttendance: (att: any) => ipcRenderer.invoke('hrm-mark-attendance', att),

    hrmGetLeaves: () => ipcRenderer.invoke('hrm-get-leaves'),
    hrmRequestLeave: (leave: any) => ipcRenderer.invoke('hrm-request-leave', leave),
    hrmUpdateLeaveStatus: (data: any) => ipcRenderer.invoke('hrm-update-leave-status', data),

    hrmGetPayroll: (data: any) => ipcRenderer.invoke('hrm-get-payroll', data),
    hrmGeneratePayroll: (pr: any) => ipcRenderer.invoke('hrm-generate-payroll', pr),
    hrmMarkPayrollPaid: (id: number) => ipcRenderer.invoke('hrm-mark-payroll-paid', id),

    // ─── CRM MODULE ───
    crmGetCustomers: () => ipcRenderer.invoke('crm-get-customers'),
    crmUpsertCustomer: (cust: any) => ipcRenderer.invoke('crm-upsert-customer', cust),
    crmGetTrackingLogs: (data: any) => ipcRenderer.invoke('crm-get-tracking-logs', data),
    crmAddTrackingLog: (log: any) => ipcRenderer.invoke('crm-add-tracking-log', log)
});
