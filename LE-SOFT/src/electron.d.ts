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
    getUsers: () => Promise<any[]>;
    createUser: (user: any) => Promise<any>;
    updateUser: (user: any) => Promise<any>;
    deleteUser: (id: number) => Promise<any>;
    authenticateUser: (creds: any) => Promise<any>;

    // User Groups
    getUserGroups: () => Promise<any[]>;
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

    // Shipping
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
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
