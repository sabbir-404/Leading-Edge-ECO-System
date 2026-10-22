/**
 * permissions.ts — Central permission helper for LE-SOFT
 *
 * Usage: import { isSuperadmin, hasPerm, getCallerContext } from '../utils/permissions';
 *
 * All helpers read from localStorage['user'] which is set at login.
 * Superadmin bypasses ALL permission checks.
 */

/** Parse the stored user once. Returns {} if not logged in. */
export const getUser = (): Record<string, any> => {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
        return {};
    }
};

/** True if logged-in user is superadmin (bypasses all checks). */
export const isSuperadmin = (roleOverride?: string): boolean => {
    const u = getUser();
    const roleFromUser = (roleOverride || u.role || '').toLowerCase();
    const roleFromStorage = (roleOverride || localStorage.getItem('user_role') || '').toLowerCase();
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
export const isAdmin = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride)) return true;
    const u = getUser();
    const roleFromUser = (roleOverride || u.role || '').toLowerCase();
    const roleFromStorage = (roleOverride || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (roleOverride || u.user_group_name || u.user_groups?.name || '').toLowerCase();

    // Explicitly exclude non-admin roles even if they have "manager" in title (e.g. factory manager)
    if (
        roleFromUser === 'factory_manager' || roleFromUser === 'factory manager' || roleFromUser === 'factory' ||
        roleFromStorage === 'factory_manager' || roleFromStorage === 'factory manager' || roleFromStorage === 'factory' ||
        roleFromUser === 'designer' || roleFromUser === 'furniture_designer' || roleFromUser === 'furniture designer' ||
        roleFromStorage === 'designer' || roleFromStorage === 'furniture_designer' || roleFromStorage === 'furniture designer' ||
        roleFromUser === 'salesperson' || roleFromUser === 'salesman' ||
        roleFromStorage === 'salesperson' || roleFromStorage === 'salesman'
    ) {
        return false;
    }

    return (
        roleFromUser === 'admin' ||
        roleFromUser === 'manager' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'manager' ||
        groupName.includes('admin') ||
        (groupName.includes('manager') && !groupName.includes('factory'))
    );
};

/** True if user belongs to the Furniture Designer group. */
export const isFurnitureDesigner = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return false;
    const u = getUser();
    const role = (roleOverride || u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (roleOverride || u.user_group_name || u.user_groups?.name || '').toLowerCase();
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
export const isSalesperson = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return false;
    const u = getUser();
    const role = (roleOverride || u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (roleOverride || u.user_group_name || u.user_groups?.name || '').toLowerCase();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    return (
        role === 'salesperson' ||
        role === 'salesman' ||
        role === 'sales' ||
        groupName.includes('salesperson') ||
        groupName.includes('salesman') ||
        !!perms.access_make_sales_portal ||
        (!!perms.approve_make_order && !perms.set_make_sale_price)
    );
};

/** True if user belongs to the Factory Manager group. */
export const isFactoryManager = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return false;
    const u = getUser();
    const role = (roleOverride || u.role || localStorage.getItem('user_role') || '').toLowerCase();
    const groupName = (roleOverride || u.user_group_name || u.user_groups?.name || '').toLowerCase();
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
 * Superadmin and Admin always retain access.
 * Cost is visible to designers, salespersons, and factory managers by workflow policy.
 */
export const canViewCostPrice = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    if (isSalesperson(roleOverride) || isFurnitureDesigner(roleOverride) || isFactoryManager(roleOverride)) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    if (perms['view_product_cost_price'] !== undefined) {
        return !!perms['view_product_cost_price'];
    }
    return hasPerm('set_make_cost_price') || hasPerm('view_cost_price');
};

/** Alias for canViewCostPrice */
export const canViewProductCostPrice = canViewCostPrice;

/**
 * True if the current user can enter/edit the Cost Price:
 * Strictly Superadmin, Admin, and Furniture Designer.
 * Factory Manager and Salespersons cannot edit cost prices.
 */
export const canEditCostPrice = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    if (isSalesperson(roleOverride) || isFactoryManager(roleOverride)) return false;
    return isFurnitureDesigner(roleOverride) || hasPerm('set_make_cost_price');
};

/**
 * Sale price is restricted to designers and administrators. Sales and factory roles
 * must not gain visibility from incidental permission flags.
 */
export const canViewSalePrice = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    if (isSalesperson(roleOverride) || isFactoryManager(roleOverride)) return false;
    if (isFurnitureDesigner(roleOverride)) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    if (perms['view_product_sale_price'] !== undefined) {
        return !!perms['view_product_sale_price'];
    }
    return false;
};

/** Alias for canViewSalePrice */
export const canViewProductSalePrice = canViewSalePrice;

/**
 * True if the current user can view product blueprints and technical CAD drawings:
 * Superadmin, Admin, and Furniture Designer retain access by default.
 * Other roles require 'view_product_blueprint' permission.
 */
export const canViewProductBlueprint = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    if (perms['view_product_blueprint'] !== undefined) {
        return !!perms['view_product_blueprint'];
    }
    if (isFurnitureDesigner(roleOverride)) return true;
    return false;
};

/**
 * True if the current user can view maximum permitted discount limits on products:
 * Configurable via 'view_product_max_discount'.
 */
export const canViewProductMaxDiscount = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? (u.permissions || {}) : {};
    if (perms['view_product_max_discount'] !== undefined) {
        return !!perms['view_product_max_discount'];
    }
    if (isFactoryManager(roleOverride)) return false;
    return true;
};

/**
 * True if the current user can enter/edit the Sale Price (Selling Price / Unit Price):
 * Furniture Designer, Admin, and Superadmin can enter sale price.
 * Factory Manager and Salespersons cannot set sale prices directly.
 */
export const canEditSalePrice = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    if (isSalesperson(roleOverride) || isFactoryManager(roleOverride)) return false;
    return isFurnitureDesigner(roleOverride) || hasPerm('set_make_sale_price');
};

/**
 * True if the user can enter an initial payment (Money Received) when placing an order:
 * Furniture Designer, Salesperson, Admin, and Superadmin.
 * Factory Manager and unauthorized roles cannot enter initial payments.
 */
export const canEnterInitialPayment = (roleOverride?: string): boolean => {
    if (isSuperadmin(roleOverride) || isAdmin(roleOverride)) return true;
    if (isFactoryManager(roleOverride)) return false;
    return isFurnitureDesigner(roleOverride) || isSalesperson(roleOverride);
};

/** Helper to get comprehensive user role and pricing permissions snapshot */
export const getUserPricingPermissions = (roleOverride?: string) => {
    const isSuper = isSuperadmin(roleOverride);
    const admin = isAdmin(roleOverride);
    const designer = isFurnitureDesigner(roleOverride);
    const sales = isSalesperson(roleOverride);
    const factory = isFactoryManager(roleOverride);
    const modifyAll = canModifyAllInfo();
    const viewCost = canViewCostPrice(roleOverride);
    const editCost = canEditCostPrice(roleOverride);
    const viewSale = canViewSalePrice(roleOverride);
    const editSale = canEditSalePrice(roleOverride);
    const viewBlueprint = canViewProductBlueprint(roleOverride);
    const viewMaxDiscount = canViewProductMaxDiscount(roleOverride);
    const canEnterPayment = canEnterInitialPayment(roleOverride);

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
        canViewBlueprint: viewBlueprint,
        canViewProductBlueprint: viewBlueprint,
        canViewMaxDiscount: viewMaxDiscount,
        canViewProductMaxDiscount: viewMaxDiscount,
        canEnterInitialPayment: canEnterPayment,
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


