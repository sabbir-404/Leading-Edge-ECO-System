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

/** True if logged-in user has an explicit permission key. Superadmin always returns true. */
export const hasPerm = (key: string): boolean => {
    if (isSuperadmin()) return true;
    const u = getUser();
    const perms: Record<string, any> = typeof u.permissions === 'object' ? u.permissions : {};
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
    // Use `user_name` (set by Billing.tsx via localStorage.getItem('user_name'))
    // Fall back to full_name or username for compatibility
    const callerUsername =
        localStorage.getItem('user_name') ||
        u.full_name ||
        u.username ||
        '';
    const perms: Record<string, any> = typeof u.permissions === 'object' ? u.permissions : {};
    return {
        callerUsername,
        isSuperadmin: sa,
        canSeeAllBills: sa || !!perms.see_all_bills,
        canSeeAllCustomers: sa || !!perms.see_all_customers,
        canViewCustomerContact: sa || !!perms.view_customer_contact,
        canViewCustomerFinancials: sa || !!perms.view_customer_financials,
    };
};
