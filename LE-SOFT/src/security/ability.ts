import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { createContext } from 'react';
import { Can } from '@casl/react';

export type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'alter' | 'approve';
export type Subjects =
    | 'all'
    | 'Bill'
    | 'Product'
    | 'Customer'
    | 'Voucher'
    | 'User'
    | 'Group'
    | 'Stock'
    | 'Report'
    | 'HRM'
    | 'MakeOrder'
    | 'Quotation';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export function defineAbilityFor(userRole: string, permissions: Record<string, any> = {}): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    const role = (userRole || '').toLowerCase();

    if (!role || role === 'superadmin' || role === 'admin' || role === 'manager' || role === 'undefined') {
        can('manage', 'all');
    } else {
        // Base read access for logged in users
        can('read', 'Product');
        can('read', 'Stock');

        if (permissions.write_bill) {
            can('create', 'Bill');
        }
        if (permissions.read_bill) {
            can('read', 'Bill');
        }
        if (permissions.alter_bill) {
            can('alter', 'Bill');
        }
        if (permissions.approve_bill) {
            can('approve', 'Bill');
        }
        if (permissions.read_customer || permissions.write_customer) {
            can('read', 'Customer');
            if (permissions.write_customer) can('create', 'Customer');
        }
        if (permissions.read_accounts) {
            can('read', 'Voucher');
            can('read', 'Report');
        }
        if (permissions.write_accounts) {
            can('create', 'Voucher');
        }
        if (permissions.read_make || permissions.write_make) {
            can('read', 'MakeOrder');
            if (permissions.write_make) can('create', 'MakeOrder');
        }
        if (permissions.read_hrm) {
            can('read', 'HRM');
        }
        if (permissions.manage_users) {
            can('manage', 'User');
        }

        // Explicit security restrictions
        if (!permissions.delete_bill) {
            cannot('delete', 'Bill');
        }
        if (!permissions.delete_customer) {
            cannot('delete', 'Customer');
        }
    }

    return build();
}

export const AbilityContext = createContext<AppAbility>(defineAbilityFor(''));
export { Can };
