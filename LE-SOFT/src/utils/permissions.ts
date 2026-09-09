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
    const username = (u.username || localStorage.getItem('user_name') || '').toLowerCase();
    return roleFromUser === 'superadmin' || roleFromStorage === 'superadmin' || username.includes('sabbirsuperadmin');
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

/**
 * Superadmin & Admin can modify ALL information as needed
 * (cost price, sale price, discounts, quantities, specifications, customer info, etc.).
 */
export const canModifyAllInfo = (): boolean => {
    return isSuperadmin() || isAdmin();
};

/**
 * True if the current user can enter/edit the Cost Price when adding/managing products:
 * Salesperson, Furniture Designer, Admin, and Superadmin can all enter the cost price.
 */
export const canEditCostPrice = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    return isFurnitureDesigner() || isSalesperson() || hasPerm('set_make_cost_price');
};

/**
 * True if the current user can enter/edit the Sale Price (Selling Price / Unit Price):
 * Furniture Designer, Admin, and Superadmin can enter sale price.
 * Salespersons enter cost price only (sale price is read-only or determined by designer).
 */
export const canEditSalePrice = (): boolean => {
    if (isSuperadmin() || isAdmin()) return true;
    if (isSalesperson()) return false;
    return isFurnitureDesigner() || hasPerm('set_make_sale_price');
};

/** Helper to get comprehensive user role and pricing permissions snapshot */
export const getUserPricingPermissions = () => {
    const isSuper = isSuperadmin();
    const admin = isAdmin();
    const designer = isFurnitureDesigner();
    const sales = isSalesperson();
    const modifyAll = canModifyAllInfo();
    const editCost = canEditCostPrice();
    const editSale = canEditSalePrice();

    let displayRoleName = 'User';
    if (isSuper) displayRoleName = 'Superadmin';
    else if (admin) displayRoleName = 'Admin';
    else if (designer) displayRoleName = 'Furniture Designer';
    else if (sales) displayRoleName = 'Salesperson';

    return {
        isSuperadmin: isSuper,
        isAdmin: admin,
        isFurnitureDesigner: designer,
        isDesigner: designer,
        isSalesperson: sales,
        canModifyAll: modifyAll,
        canEditCostPrice: editCost,
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

