export interface ElectronAPI {
    // Groups
    getGroups: () => Promise<any[]>;
    createGroup: (group: any) => Promise<any>;
    deleteGroup: (id: number) => Promise<any>;

    // Ledgers
    getLedgers: () => Promise<any[]>;
    createLedger: (ledger: any) => Promise<any>;
    deleteLedger: (id: number) => Promise<any>;

    // Vouchers
    getVouchers: () => Promise<any[]>;
    createVoucher: (voucher: any) => Promise<any>;
    deleteVoucher: (id: number) => Promise<any>;

    // Units
    getUnits: () => Promise<any[]>;
    createUnit: (unit: any) => Promise<any>;
    deleteUnit: (id: number) => Promise<any>;

    // Stock Groups
    getStockGroups: () => Promise<any[]>;
    createStockGroup: (group: any) => Promise<any>;
    deleteStockGroup: (id: number) => Promise<any>;

    // Stock Items
    getStockItems: () => Promise<any[]>;
    createStockItem: (item: any) => Promise<any>;
    deleteStockItem: (id: number) => Promise<any>;

    // Products
    getProducts: () => Promise<any[]>;
    createProduct: (product: any) => Promise<any>;
    deleteProduct: (id: number) => Promise<any>;

    // Purchase Bills
    getPurchaseBills: () => Promise<any[]>;
    createPurchaseBill: (bill: any) => Promise<any>;
    deletePurchaseBill: (id: number) => Promise<any>;

    // Users
    getUsers: (opts?: any) => Promise<any[]>;
    createUser: (user: any) => Promise<any>;
    updateUser: (user: any) => Promise<any>;
    deleteUser: (id: number) => Promise<any>;
    authenticateUser: (creds: any) => Promise<any>;

    // User Groups
    getUserGroups: (opts?: any) => Promise<any[]>;
    createUserGroup: (group: any) => Promise<any>;
    updateUserGroup: (group: any) => Promise<any>;
    deleteUserGroup: (id: number) => Promise<any>;

    // Notifications
    getNotifications: (userId: number) => Promise<any[]>;
    sendNotification: (notification: any) => Promise<any>;
    markNotificationRead: (id: number) => Promise<any>;
    markAllNotificationsRead: (userId: number) => Promise<any>;
    deleteNotification: (id: number) => Promise<any>;

    // Image Picker
    pickImage: () => Promise<string | null>;

    // Companies
    getCompanies: () => Promise<any[]>;
    createCompany: (company: any) => Promise<any>;

    // Dashboard
    getDashboardStats: () => Promise<any>;

    // Settings
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<any>;

    // Website (MySQL)
    websiteGetProducts: () => Promise<any[]>;
    websiteGetOrders: () => Promise<any[]>;
    websiteUpdateOrder: (order: any) => Promise<any>;
    websiteGetCategories: () => Promise<any[]>;
    websiteGetStats: () => Promise<any>;
    websiteGetDashboardData: () => Promise<any>;

    // Website Products
    websiteCreateProduct: (product: any) => Promise<any>;
    websiteUpdateProduct: (product: any) => Promise<any>;
    websiteDeleteProduct: (id: string) => Promise<any>;
    websiteDeleteProductsBulk: (ids: string[]) => Promise<any>;
    websiteUpdateProductStatusBulk: (ids: string[], isVisible: boolean) => Promise<any>;

    // Website Orders
    websiteCreateOrder: (order: any) => Promise<any>;
    websiteGetUsers: () => Promise<any[]>;

    // Reports
    reportTrialBalance: () => Promise<any>;
    reportBalanceSheet: () => Promise<any>;
    reportProfitAndLoss: () => Promise<any>;
    reportStockSummary: () => Promise<any>;
    reportDayBook: (params: any) => Promise<any>;

    // Billing / POS
    searchBillingCustomers: (query: string) => Promise<any[]>;
    createBillingCustomer: (customer: any) => Promise<any>;
    deleteBillingCustomer: (id: number) => Promise<any>;
    createBill: (bill: any) => Promise<any>;
    getBills: (opts?: any) => Promise<any[]>;
    getBillDetails: (id: number) => Promise<any>;
    updateBill: (bill: any) => Promise<any>;
    deleteBill: (data: any) => Promise<any>;
    getBillAudit: (billId: number) => Promise<any[]>;
    getCustomerBills: (customerId: number) => Promise<any[]>;
    changePassword: (data: any) => Promise<any>;

    // Customer Ledger & Payments
    getCustomerLedgerList: (opts?: any) => Promise<any[]>;
    getCustomerLedgerDetail: (id: number) => Promise<any>;
    addCustomerPayment: (payment: any) => Promise<any>;
    addCustomerAddress: (address: any) => Promise<any>;

    // Exchange Orders
    createExchangeOrder: (exchange: any) => Promise<any>;
    getExchangeOrders: () => Promise<any[]>;
    getExchangeDetails: (id: number) => Promise<any>;

    // Quotations
    createQuotation: (payload: any) => Promise<any>;
    getQuotations: () => Promise<any[]>;
    getQuotation: (id: number) => Promise<any>;
    deleteQuotation: (id: number) => Promise<any>;

    // Products (extended)
    getProduct: (id: number) => Promise<any>;
    getProductPriceHistory: () => Promise<any[]>;
    updateProduct: (product: any) => Promise<any>;
    searchProductsDetailed: (query: string) => Promise<any[]>;

    // Godowns / Warehouses
    getGodowns: () => Promise<any[]>;
    createGodown: (godown: any) => Promise<any>;
    updateGodown: (godown: any) => Promise<any>;
    deleteGodown: (id: number) => Promise<any>;

    // Bill Shipping
    addBillShipping: (data: any) => Promise<any>;
    getBillShipping: (billId: number) => Promise<any>;
    getAllShipments: (params?: any) => Promise<any[]>;
    getShipmentHistory: (shipmentId: number) => Promise<any[]>;
    updateShipmentStatus: (data: any) => Promise<any>;
    uploadPackagingImage: (data: any) => Promise<any>;

    // Bill Alter Approval
    stageBillAlteration: (data: any) => Promise<any>;
    getPendingAlterations: () => Promise<any[]>;
    approveAlteration: (data: any) => Promise<any>;
    rejectAlteration: (data: any) => Promise<any>;

    // Payment Methods
    getPaymentMethods: () => Promise<any[]>;
    createPaymentMethod: (method: any) => Promise<any>;
    updatePaymentMethod: (method: any) => Promise<any>;
    deletePaymentMethod: (id: number) => Promise<any>;
    verifyBillPayment: (data: any) => Promise<any>;

    // System Audit
    getAuditLog: (params: any) => Promise<any[]>;

    // Session & Auth extras
    getActiveSessions: () => Promise<any[]>;
    kickUserSession: (userId: number) => Promise<any>;
    verifyAdminPassword: (data: any) => Promise<any>;

    // Permission Levels
    getPermissionLevels: () => Promise<any[]>;
    createPermissionLevel: (payload: any) => Promise<any>;
    updatePermissionLevel: (payload: any) => Promise<any>;
    deletePermissionLevel: (id: number) => Promise<any>;

    // HRM module
    hrmGetEmployees: () => Promise<any[]>;
    hrmUpsertEmployee: (emp: any) => Promise<any>;
    hrmDeleteEmployee: (id: number) => Promise<any>;
    hrmGetAttendance: (data: any) => Promise<any[]>;
    hrmMarkAttendance: (att: any) => Promise<any>;
    hrmGetLeaves: () => Promise<any[]>;
    hrmRequestLeave: (leave: any) => Promise<any>;
    hrmUpdateLeaveStatus: (data: any) => Promise<any>;
    hrmGetPayroll: (data: any) => Promise<any[]>;
    hrmGeneratePayroll: (pr: any) => Promise<any>;
    hrmMarkPayrollPaid: (id: number) => Promise<any>;

    // CRM module
    crmGetCustomers: () => Promise<any[]>;
    crmUpsertCustomer: (cust: any) => Promise<any>;
    crmGetTrackingLogs: (data: any) => Promise<any[]>;
    crmAddTrackingLog: (log: any) => Promise<any>;
    getSalesmen: () => Promise<any[]>;

    // MAKE module
    getMakeOrders: () => Promise<any[]>;
    createMakeOrder: (order: any) => Promise<any>;
    updateMakeOrderStatus: (data: any) => Promise<any>;
    getMakeOrderUpdates: (orderId: number) => Promise<any[]>;
    deleteMakeOrder: (id: number) => Promise<any>;
    getMakeFurnitureNames: () => Promise<any[]>;
    makeUploadPdf: (data: any) => Promise<any>;
    makeGetPdfUrls: (orderId: number) => Promise<any[]>;
    makeDeletePdf: (data: any) => Promise<any>;
    makeDownloadPdf: (data: any) => Promise<any>;
    makeGetOrderParts: (orderId: number) => Promise<any[]>;
    makeUpsertPart: (part: any) => Promise<any>;
    makeDeletePart: (partId: number) => Promise<any>;
    makeAlterOrder: (data: any) => Promise<any>;
    makeGetAlterationLog: (orderId: number) => Promise<any[]>;
    approveMakeOrder: (data: any) => Promise<any>;
    makeGetDashboardStats: () => Promise<any>;

    // Internal Chat
    getChatMessages: (params: any) => Promise<any[]>;
    sendChatMessage: (msg: any) => Promise<any>;
    pickChatFile: () => Promise<any>;

    // Internal Email
    emailGetInbox: (userId: number) => Promise<any[]>;
    emailGetSent: (userId: number) => Promise<any[]>;
    emailSend: (data: any) => Promise<any>;
    emailMarkRead: (emailId: number) => Promise<any>;
    emailDelete: (data: any) => Promise<any>;

    // User Presence & Typing
    updateUserPresence: (userId: number) => Promise<any>;
    getOnlineUsers: () => Promise<number[]>;
    setTypingStatus: (params: any) => Promise<any>;
    getTypingStatus: (params: any) => Promise<number[]>;

    // Cache & Performance
    preloadCache: () => Promise<any>;
    onCacheProgress: (callback: (data: any) => void) => () => void;
    getCacheStats: () => Promise<any>;
    getQueueStats: () => Promise<any>;
    onWriteQueueStatus: (callback: (data: any) => void) => () => void;
    onDataUpdated: (callback: (table: string) => void) => () => void;

    // Network & Config
    getNetworkConfig: () => Promise<any>;
    saveNetworkConfig: (config: any) => Promise<any>;
    testServerConnection: (data: any) => Promise<any>;
    getLocalIp: () => Promise<string>;
    restartApp: () => Promise<void>;
    onRedirect: (callback: (path: string) => void) => () => void;
    saveSupabaseConfig: (config: any) => Promise<any>;
    getSupabaseConfig: () => Promise<any>;
    getDeviceId: () => Promise<string>;
    activateLicense: (key: string) => Promise<any>;

    // License
    getMachineId: () => Promise<string>;
    checkLicense: () => Promise<any>;
    checkLicenseCloud: () => Promise<any>;
    activateLicenseCloud: (data: any) => Promise<any>;

    // DB Backup & Monitoring
    createDbBackup: () => Promise<any>;
    listDbBackups: () => Promise<any[]>;
    restoreDbBackup: (name: string) => Promise<any>;
    getDbMonitoring: () => Promise<any>;

    // Database Health
    pingSupabase: () => Promise<any>;

    // Printing & Printers
    getPrinters: () => Promise<any[]>;

    // WooCommerce
    importWooCommerceCSV: (csvFilePath: string) => Promise<any>;
    syncProductsToWebsite: () => Promise<any>;

    // Policy
    getPolicy: () => Promise<any>;
    savePolicy: (policy: any) => Promise<any>;

    // --- PHASE 2: Website Expansion ---

    // Categories
    websiteCreateCategory: (cat: any) => Promise<any>;
    websiteUpdateCategory: (cat: any) => Promise<any>;
    websiteDeleteCategory: (id: string) => Promise<any>;

    // Projects
    websiteGetProjects: () => Promise<any[]>;
    websiteCreateProject: (p: any) => Promise<any>;
    websiteUpdateProject: (p: any) => Promise<any>;
    websiteDeleteProject: (id: string) => Promise<any>;

    // Pages
    websiteGetPages: () => Promise<any[]>;
    websiteCreatePage: (p: any) => Promise<any>;
    websiteUpdatePage: (p: any) => Promise<any>;
    websiteDeletePage: (id: string) => Promise<any>;

    // Media
    websiteGetMedia: () => Promise<any[]>;

    // Shipping (Website)
    websiteGetShippingAreas: () => Promise<any[]>;
    websiteCreateShippingArea: (a: any) => Promise<any>;
    websiteDeleteShippingArea: (id: string) => Promise<any>;
    websiteGetShippingMethods: () => Promise<any[]>;
    websiteCreateShippingMethod: (m: any) => Promise<any>;
    websiteUpdateShippingMethod: (m: any) => Promise<any>;
    websiteDeleteShippingMethod: (id: string) => Promise<any>;

    // Newsletter
    websiteGetNewsletters: () => Promise<any[]>;

    // Config
    websiteGetConfig: () => Promise<any>;
    websiteUpdateConfig: (config: any) => Promise<any>;

    // Auto-Update
    checkForUpdate: () => Promise<any>;
    downloadUpdate: () => Promise<any>;
    installUpdate: () => Promise<any>;
    getAppVersion: () => Promise<string>;
    onUpdateStatus: (callback: (data: any) => void) => () => void;

    // AI Market Analysis
    saveAiKey: (key: string) => Promise<any>;
    getAiKey: () => Promise<string>;
    getCompetitorUrls: (productId: number) => Promise<any[]>;
    addCompetitorUrl: (data: any) => Promise<any>;
    deleteCompetitorUrl: (id: number) => Promise<any>;
    runAutoPriceScan: (productId: number) => Promise<any>;
    getMarketAnalysisHistory: (productId?: number) => Promise<any[]>;

    // Window Controls
    setTheme: (theme: string) => Promise<void>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
