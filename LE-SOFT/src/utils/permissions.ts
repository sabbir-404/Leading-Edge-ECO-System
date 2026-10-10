/**
 * permissions.ts — Central permission helper for LE-SOFT
 *
 * Usage: import { isSuperadmin, hasPerm, getCallerContext } from '../utils/permissions';
 *
 * All helpers read from localStorage['user'] which is set at login.
 * Superadmin bypasses ALL permission checks.
 */

/** Parse the stored user once. Returns {} if not logged in. */
const getUser = (): Record<string, any> => {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
        return {};
    }
};

/** True if logged-in user is superadmin (bypasses all checks). */
export const isSuperadmin = (): boolean => {
    const u = getUser();
    const roleFromUser = (u.role || '').toLowerCase();
    const roleFromStorage = (localStorage.getItem('user_role') || '').toLowerCase();
    return roleFromUser === 'superadmin' || roleFromStorage === 'superadmin';
};

export const hasPerm = (key: string): boolean => {
    if (isSuperadmin()) return true;
    const u = getUser();
    const roleFromUser = (u.role || '').toLowerCase();
    const roleFromStorage = (localStorage.getItem('user_role') || '').toLowerCase();
    if (
        roleFromUser === 'superadmin' || roleFromUser === 'admin' || roleFromUser === 'manager' ||
        roleFromStorage === 'superadmin' || roleFromStorage === 'admin' || roleFromStorage === 'manager'
    ) {
        return true;
    }
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return !!perms[key];
};

// ── Billing shortcuts ─────────────────────────────────────────────────────────

/** Superadmin or has 'see_all_bills' — can view every user's bills. */
export const canSeeAllBills = (): boolean => hasPerm('see_all_bills');

/** Superadmin or has 'alter_bill'. */
export const canAlterBill = (): boolean => hasPerm('alter_bill');

/** Superadmin or has 'delete_bill'. */
export const canDeleteBill = (): boolean => hasPerm('delete_bill');

/** Superadmin or has 'add_bill_items'. */
export const canAddBillItems = (): boolean => hasPerm('add_bill_items');

/** Superadmin or has 'adjust_bill_price' — can apply a price adjustment to a bill. */
export const canAdjustBillPrice = (): boolean => hasPerm('adjust_bill_price');


// ── User Group & Role Identification ────────────────────────────────────────

/** True if user is Admin or Super Admin (can modify all information). */
export const isAdmin = (): boolean => {
    if (isSuperadmin()) return true;
    const u = getUser();
    const roleFromUser = (u.role || '').toLowerCase();
    const roleFromStorage = (localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (u.user_group_name || u.user_groups?.name || '').toLowerCase();
    return (
        roleFromUser === 'admin' ||
        roleFromUser === 'manager' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'manager' ||
        groupName.includes('admin') ||
        groupName.includes('manager')
    );
};

/** True if user belongs to the Furniture Designer group. */
export const isFurnitureDesigner = (): boolean => {
    if (isSuperadmin() || isAdmin()) return false;
    const u = getUser();
    const role = (u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (u.user_group_name || u.user_groups?.name || '').toLowerCase();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return (
        role === 'furniture_designer' ||
        role === 'furniture designer' ||
        role === 'designer' ||
        groupName.includes('furniture designer') ||
        groupName.includes('designer') ||
        (!!perms.set_make_cost_price && !!perms.set_make_sale_price)
    );
};

/** True if user belongs to the Salesperson / Salesman group. */
export const isSalesperson = (): boolean => {
    if (isSuperadmin() || isAdmin()) return false;
    const u = getUser();
    const role = (u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (u.user_group_name || u.user_groups?.name || '').toLowerCase();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return (
        role === 'salesperson' ||
        role === 'salesman' ||
        groupName.includes('salesperson') ||
        groupName.includes('salesman') ||
        !!perms.access_make_sales_portal ||
        (!!perms.approve_make_order && !perms.set_make_sale_price)
    );
};

/** True if user belongs to the Factory Manager group. */
export const isFactoryManager = (): boolean => {
    if (isSuperadmin() || isAdmin()) return false;
    const u = getUser();
    const role = (u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (u.user_group_name || u.user_groups?.name || '').toLowerCase();
    return (
        role === 'factory_manager' ||
        role === 'factory manager' ||
        role === 'factory' ||
        groupName.includes('factory manager') ||
        groupName.includes('factory')
    );
};

/**
 * Superadmin & Admin can modify ALL information as needed
 * (cost price, sale price, discounts, quantities, specifications, customer info, etc.).
 */
export const canModifyAllInfo = (): boolean => {
    return isSuperadmin() || isAdmin();
};

/**
 * True if the current user can view the Cost Price of products/orders:
 * Allowed for Superadmin, Admin, Furniture Designer, and Factory Manager.
 * Salespersons are strictly forbidden from viewing the cost price.
 */
export const canViewCostPrice = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isSalesperson()) return false;
    return isFurnitureDesigner() || isFactoryManager() || hasPerm('set_make_cost_price') || hasPerm('view_cost_price');
};

/**
 * True if the current user can enter/edit the Cost Price:
 * Strictly Superadmin, Admin, and Furniture Designer.
 * Factory Manager and Salespersons cannot edit cost prices.
 */
export const canEditCostPrice = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isSalesperson() || isFactoryManager()) return false;
    return isFurnitureDesigner() || hasPerm('set_make_cost_price');
};

/**
 * True if the current user can view Sale Price:
 * Strictly hidden for Factory Manager everywhere.
 * Visible for Superadmin, Admin, Furniture Designer, and Salesperson.
 */
export const canViewSalePrice = (): boolean => {
    if (isFactoryManager()) return false;
    return true;
};

/**
 * True if the current user can enter/edit the Sale Price (Selling Price / Unit Price):
 * Furniture Designer, Admin, and Superadmin can enter sale price.
 * Factory Manager and Salespersons cannot set sale prices directly.
 */
export const canEditSalePrice = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isSalesperson() || isFactoryManager()) return false;
    return isFurnitureDesigner() || hasPerm('set_make_sale_price');
};

/** Helper to get comprehensive user role and pricing permissions snapshot */
export const getUserPricingPermissions = () => {
    const isSuper = isSuperadmin();
    const admin = isAdmin();
    const designer = isFurnitureDesigner();
    const sales = isSalesperson();
    const factory = isFactoryManager();
    const modifyAll = canModifyAllInfo();
    const viewCost = canViewCostPrice();
    const editCost = canEditCostPrice();
    const viewSale = canViewSalePrice();
    const editSale = canEditSalePrice();

    let displayRoleName = 'User';
    if (isSuper) displayRoleName = 'Superadmin';
    else if (admin) displayRoleName = 'Admin';
    else if (factory) displayRoleName = 'Factory Manager';
    else if (designer) displayRoleName = 'Furniture Designer';
    else if (sales) displayRoleName = 'Salesperson';

    return {
        isSuperadmin: isSuper,
        isAdmin: admin,
        isFurnitureDesigner: designer,
        isDesigner: designer,
        isSalesperson: sales,
        isFactoryManager: factory,
        canModifyAll: modifyAll,
        canViewCostPrice: viewCost,
        canEditCostPrice: editCost,
        canViewSalePrice: viewSale,
        canEditSalePrice: editSale,
        displayRoleName,
    };
};

// ── Customer Data shortcuts ───────────────────────────────────────────────────

/** Superadmin or has 'see_all_customers'. */
export const canSeeAllCustomers = (): boolean => hasPerm('see_all_customers');

/** Superadmin or has 'view_customer_contact' — can see phone/email. */
export const canViewCustomerContact = (): boolean => hasPerm('view_customer_contact');

/** Superadmin or has 'view_customer_financials' — can see balances/payment history. */
export const canViewCustomerFinancials = (): boolean => hasPerm('view_customer_financials');

/** Superadmin or has 'delete_customer'. */
export const canDeleteCustomer = (): boolean => hasPerm('delete_customer');

// ── Caller context payload sent to IPC handlers ───────────────────────────────

/**
 * Returns an object to pass as the first argument to IPC calls that need
 * user-scoping (e.g. getBills, getCustomerLedgerList).
 */
export interface CallerContext {
    callerUsername: string;
    isSuperadmin: boolean;
    canSeeAllBills: boolean;
    canSeeAllCustomers: boolean;
    canViewCustomerContact: boolean;
    canViewCustomerFinancials: boolean;
}

export const getCallerContext = (): CallerContext => {
    const u = getUser();
    const sa = isSuperadmin();
    const roleFromUser = (u.role || '').toLowerCase();
    const roleFromStorage = (localStorage.getItem('user_role') || '').toLowerCase();
    const isAdminOrManager = sa || roleFromUser === 'admin' || roleFromUser === 'manager' || roleFromStorage === 'admin' || roleFromStorage === 'manager';
    const callerUsername =
        localStorage.getItem('user_name') ||
        u.full_name ||
        u.username ||
        'Admin';
    const perms: Record<string, any> = typeof u.permissions === 'object' ? u.permissions : {};
    return {
        callerUsername,
        isSuperadmin: sa,
        canSeeAllBills: isAdminOrManager || !!perms.see_all_bills,
        canSeeAllCustomers: isAdminOrManager || !!perms.see_all_customers,
        canViewCustomerContact: isAdminOrManager || !!perms.view_customer_contact,
        canViewCustomerFinancials: isAdminOrManager || !!perms.view_customer_financials,
    };
};

// ── MAKE Product Catalog & Global Attribute Permissions ──────────────────────

/**
 * True if the current user has permission to manage global product attributes:
 * - Superadmin and Admin retain access.
 * - Other roles (such as Furniture Designer) require explicit 'manage_global_product_attributes' permission.
 * - Denied by default for other roles unless explicitly granted.
 * - Does NOT infer from generic product edit or billing permissions.
 */
export const canManageGlobalProductAttributes = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isFactoryManager() || isSalesperson()) return false;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return !!perms['manage_global_product_attributes'];
};

/**
 * True if the current user can create or manage products in the MAKE catalog:
 * - Superadmin and Admin retain access.
 * - Factory Manager and Salesperson are strictly denied.
 * - Users with 'write_make_catalog', 'manage_catalog', or 'make_admin' permissions.
 */
export const canManageMakeCatalog = (): boolean => {
    if (isSalesperson() || isFactoryManager()) return false;
    if (isSuperadmin() || isAdmin() || isFurnitureDesigner()) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return !!(perms['write_make_catalog'] || perms['manage_catalog'] || perms['make_admin'] || perms['catalog_manage']);
};

/**
 * True if the current user has permission to create products from Place Order:
 * - Admin and Superadmin: always allowed.
 * - Factory Manager: strictly denied.
 * - Furniture Designer: configurable by permission (defaults true).
 * - Salesperson: denied unless explicitly granted.
 */
export const canCreateProductFromPlaceOrder = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isFactoryManager()) return false;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    if (perms['create_product_from_place_order'] !== undefined) {
        return !!perms['create_product_from_place_order'];
    }
    if (isFurnitureDesigner()) return true;
    if (isSalesperson()) return false;
    return !!perms['create_product_from_place_order'];
};


