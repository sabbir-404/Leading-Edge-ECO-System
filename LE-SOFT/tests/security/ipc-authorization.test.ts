import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { SessionManager } from '../../electron/session-manager';
import { isSuperadmin } from '../../src/utils/permissions';

// Capture handlers registered via ipcMain.handle
const ipcHandlers = new Map<string, Function>();

vi.mock('../../electron/supabase', () => {
    const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 99, role: 'staff', username: 'testuser' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 99, role: 'staff', username: 'testuser' }, error: null }),
    };

    return {
        default: {
            from: vi.fn().mockReturnValue(mockQueryBuilder),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
            channel: vi.fn().mockReturnValue({
                send: vi.fn().mockResolvedValue({}),
            }),
            removeChannel: vi.fn(),
        },
        supabase: {
            from: vi.fn().mockReturnValue(mockQueryBuilder),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
            channel: vi.fn().mockReturnValue({
                send: vi.fn().mockResolvedValue({}),
            }),
            removeChannel: vi.fn(),
        },
        supabaseAdmin: {
            from: vi.fn().mockReturnValue(mockQueryBuilder),
            channel: vi.fn().mockReturnValue({
                send: vi.fn().mockResolvedValue({}),
            }),
            removeChannel: vi.fn(),
            auth: {
                signInWithPassword: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
                admin: {
                    updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
                    createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth_123' } }, error: null }),
                    deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
                },
            },
        },
        nasClient: null,
        isNasOnline: vi.fn().mockReturnValue(false),
        decryptEmbeddedCredentials: vi.fn(),
        reinitSupabaseClients: vi.fn(),
        getNasStorageUrl: vi.fn(),
        getCfAccessHeaders: vi.fn(),
    };
});

vi.mock('electron-updater', () => ({
    autoUpdater: {
        checkForUpdates: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock('../../electron/field-encryption', () => ({
    encryptObject: vi.fn((x) => x),
    encryptField: vi.fn((x) => x),
    decryptRows: vi.fn((x) => x),
    decryptObject: vi.fn((x) => x),
    decryptField: vi.fn((x) => x),
}));

vi.mock('../../electron/write-queue', () => ({
    enqueue: vi.fn(),
    getQueueStats: vi.fn().mockReturnValue({ queueLength: 0 }),
}));

vi.mock('../../electron/cache-manager', () => ({
    preloadCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({}),
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    del: vi.fn(),
    invalidate: vi.fn(),
}));

vi.mock('../../electron/session-vault', () => ({
    saveSession: vi.fn(),
    loadSession: vi.fn().mockReturnValue(null),
    clearSession: vi.fn(),
}));

vi.mock('../../electron/license-manager', () => ({
    getMachineId: vi.fn().mockReturnValue('LE-TEST-MACHINE-ID'),
    isLicensed: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../electron/device-monitor', () => ({
    getConnectedDevices: vi.fn().mockReturnValue([]),
    setBackupNode: vi.fn(),
    DEVICE_ID: 'dev-1',
}));

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, val: string) => storage.set(key, String(val)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
};

describe('Security Audit Phase 1 — IPC Authentication & Authorization Boundaries', () => {
    beforeAll(async () => {
        // Spy on ipcMain.handle to collect registered handlers
        (ipcMain as any).handle = vi.fn((channel: string, listener: Function) => {
            ipcHandlers.set(channel, listener);
        });

        // Register handlers to test real handlers
        const { registerHandlers } = await import('../../electron/ipc-handlers');
        registerHandlers();
    });

    beforeEach(() => {
        SessionManager.clearSession();
        localStorage.clear();
    });

    // ── 1. PERMISSIONS.TS BACKDOOR REMOVAL ──────────────────────────────────
    describe('1. src/utils/permissions.ts - Superadmin Backdoor Removal', () => {
        it('should NOT grant superadmin to username sabbirsuperadmin if role is not superadmin', () => {
            localStorage.setItem('user_name', 'sabbirsuperadmin');
            localStorage.setItem('user_role', 'operator');

            expect(isSuperadmin()).toBe(false);
        });

        it('should NOT grant superadmin to username containing sabbirsuperadmin if role is staff', () => {
            localStorage.setItem('user_name', 'sabbirsuperadmin_manager');
            localStorage.setItem('user_role', 'staff');

            expect(isSuperadmin()).toBe(false);
        });

        it('should grant superadmin only when role is genuinely superadmin', () => {
            localStorage.setItem('user_name', 'any_user');
            localStorage.setItem('user_role', 'superadmin');

            expect(isSuperadmin()).toBe(true);
        });
    });

    // ── 2. FORGED RENDERER ROLES ON DELETE-PRODUCT ──────────────────────────
    describe('2. Hardened delete-product Handler', () => {
        it('should reject unauthenticated call even if renderer claims userRole: superadmin', async () => {
            const handler = ipcHandlers.get('delete-product');
            expect(handler).toBeDefined();

            // Attacker passes userRole: 'superadmin' without main session
            await expect(handler!({}, 10, 'Attacker', 'superadmin')).rejects.toThrow(
                /Unauthorized: Authentication required/i
            );
        });

        it('should reject call when session is operator even if renderer claims userRole: superadmin', async () => {
            const handler = ipcHandlers.get('delete-product');
            expect(handler).toBeDefined();

            // Establish operator session in Main Process
            SessionManager.setSession({
                id: 5,
                username: 'staff_user',
                full_name: 'Staff Operator',
                role: 'operator'
            });

            // Attacker tries to forge superadmin role in renderer arguments
            await expect(handler!({}, 10, 'Staff Operator', 'superadmin')).rejects.toThrow(
                /Immediate stashing is restricted/i
            );
        });

        it('should authorize call and use verified session name when session is admin', async () => {
            const handler = ipcHandlers.get('delete-product');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 1,
                username: 'admin_user',
                full_name: 'Admin Boss',
                role: 'admin'
            });

            // Even if caller passed fake performedByName, handler uses session name
            const res = await handler!({}, 10, 'ForgedName', 'staff');
            expect(res).toEqual({ success: true });
        });
    });

    // ── 3. FORGED RENDERER ROLES ON USER MANAGEMENT ─────────────────────────
    describe('3. Hardened User Management Handlers (create-user, delete-user)', () => {
        it('should reject create-user when no session is present', async () => {
            const handler = ipcHandlers.get('create-user');
            expect(handler).toBeDefined();

            await expect(handler!({}, {
                username: 'new_staff',
                password: 'password123',
                role: 'staff',
                requestingUserRole: 'superadmin',
                requestingUserName: 'sabbirsuperadmin'
            })).rejects.toThrow(/Unauthorized: Authentication required/i);
        });

        it('should reject create-user when session role is operator despite forged requestingUserRole', async () => {
            const handler = ipcHandlers.get('create-user');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 12,
                username: 'low_staff',
                role: 'operator'
            });

            const res = await handler!({}, {
                username: 'new_staff',
                password: 'password123',
                role: 'staff',
                requestingUserRole: 'superadmin',
                requestingUserName: 'sabbirsuperadmin'
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Unauthorized: You do not have permission to create users');
        });

        it('should prevent admin from creating a superadmin user', async () => {
            const handler = ipcHandlers.get('create-user');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 2,
                username: 'regular_admin',
                role: 'admin'
            });

            const res = await handler!({}, {
                username: 'new_super',
                password: 'password123',
                role: 'superadmin'
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Only Super Administrators can assign the Super Admin role');
        });

        it('should reject delete-user without session', async () => {
            const handler = ipcHandlers.get('delete-user');
            expect(handler).toBeDefined();

            await expect(handler!({}, 99)).rejects.toThrow(/Unauthorized: Authentication required/i);
        });

        it('should reject delete-user when session role is operator', async () => {
            const handler = ipcHandlers.get('delete-user');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 10,
                username: 'operator_1',
                role: 'operator'
            });

            await expect(handler!({}, 99)).rejects.toThrow(/Unauthorized: Only administrators can delete users/i);
        });

        it('should prevent admin from deleting their own active session user', async () => {
            const handler = ipcHandlers.get('delete-user');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 1,
                username: 'admin',
                role: 'admin'
            });

            await expect(handler!({}, 1)).rejects.toThrow(/Cannot delete your own active user account/i);
        });
    });

    // ── 4. FORGED RENDERER ROLES ON LICENSE GENERATION ──────────────────────
    describe('4. Hardened generate-license-key Handler', () => {
        it('should reject unauthenticated call even if requestedBy: superadmin is passed', async () => {
            const handler = ipcHandlers.get('generate-license-key');
            expect(handler).toBeDefined();

            await expect(handler!({}, { machineId: 'LE-VALID-MACHINE-1234', requestedBy: 'superadmin' })).rejects.toThrow(
                /Unauthorized: Authentication required/i
            );
        });

        it('should reject call when session is admin or operator even if requestedBy: superadmin', async () => {
            const handler = ipcHandlers.get('generate-license-key');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 3,
                username: 'admin_user',
                role: 'admin'
            });

            const res = await handler!({}, { machineId: 'LE-VALID-MACHINE-1234', requestedBy: 'superadmin' });
            expect(res.success).toBe(false);
            expect(res.error).toContain('Unauthorized: superadmin access required');
        });

        it('should authorize superadmin session', async () => {
            process.env.LE_GENERATION_SECRET = 'TEST-SECRET-1234567890';
            const handler = ipcHandlers.get('generate-license-key');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 1,
                username: 'super',
                role: 'superadmin'
            });

            const res = await handler!({}, { machineId: 'LE-VALID-MACHINE-1234' });
            expect(res.success).toBe(true);
            expect(res.key).toBeDefined();
        });
    });

    // ── 5. FORGED IDENTITY ON CLEAR-DATABASE & SETTINGS ─────────────────────
    describe('5. Hardened clear-database & Administrative Settings', () => {
        it('should reject clear-database when session is operator despite passing superadmin username in payload', async () => {
            const handler = ipcHandlers.get('clear-database');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 8,
                username: 'operator_bob',
                role: 'operator'
            });

            const res = await handler!({}, { section: 'products', password: 'pw', username: 'superadmin' });
            expect(res.success).toBe(false);
            expect(res.error).toContain('Unauthorized: Only superadmin can perform this action');
        });

        it('should reject get-device-sessions without superadmin session', async () => {
            const handler = ipcHandlers.get('get-device-sessions');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 2,
                username: 'admin',
                role: 'admin'
            });

            const res = await handler!({}, { isSuperadmin: true });
            expect(res.success).toBe(false);
            expect(res.error).toContain('Unauthorized: Superadmin access required');
        });

        it('should reject update-settings without admin/superadmin session', async () => {
            const handler = ipcHandlers.get('update-settings');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 7,
                username: 'clerk',
                role: 'operator'
            });

            await expect(handler!({}, { name: 'Compromised Name' })).rejects.toThrow(
                /Unauthorized: Administrator access required/i
            );
        });
    });

    // ── 6. FORGED PERFORMED-BY IDENTITY IN AUDIT TRAILS ─────────────────────
    describe('6. Hardened Identity in Purchase Requisition Audit Trail', () => {
        it('should use SessionManager user name for PR history rather than forged performedByName', async () => {
            const handler = ipcHandlers.get('approve-purchase-requisition');
            expect(handler).toBeDefined();

            SessionManager.setSession({
                id: 3,
                username: 'real_store_head',
                full_name: 'Real Store Head',
                role: 'admin'
            });

            const res = await handler!({}, 'req-101', 'APPROVED', 'Notes', 'Forged Impersonator');
            expect(res.success).toBe(true);
        });
    });

    // ── 7. PHASE 2A: MUTATOR & DELETION HARDENING & FALLBACK ELIMINATION ──
    describe('7. Phase 2A: Mutator & Deletion Hardening & Fallback Elimination', () => {
        const deleteHandlers = [
            'delete-bill',
            'delete-voucher',
            'delete-ledger',
            'delete-group',
            'delete-purchase-bill',
            'delete-stock-item',
            'delete-godown',
            'delete-billing-customer',
            'hrm-delete-employee',
            'hrm-delete-holiday',
            'delete-quotation',
            'delete-competitor-url',
        ];

        it('should fail closed when unauthenticated for all hardened delete handlers', async () => {
            SessionManager.clearSession();

            for (const ch of deleteHandlers) {
                const handler = ipcHandlers.get(ch);
                expect(handler, `Handler for ${ch} should be registered`).toBeDefined();

                // Call with dummy arguments
                const callPromise = ch === 'delete-bill' 
                    ? handler!({}, { billId: 101, reason: 'test', deletedBy: 'attacker' })
                    : handler!({}, 101);

                await expect(callPromise, `Expected ${ch} to reject without session`).rejects.toThrow(
                    /Unauthorized: Authentication required/i
                );
            }
        });

        it('should reject forged renderer role for all hardened delete handlers when session is operator', async () => {
            SessionManager.setSession({
                id: 15,
                username: 'malicious_operator',
                role: 'operator',
            });

            for (const ch of deleteHandlers) {
                const handler = ipcHandlers.get(ch);
                expect(handler, `Handler for ${ch} should be registered`).toBeDefined();

                const callPromise = ch === 'delete-bill'
                    ? handler!({}, { billId: 101, reason: 'fraud', deletedBy: 'superadmin' })
                    : handler!({}, 101);

                await expect(callPromise, `Expected ${ch} to reject operator role`).rejects.toThrow(
                    /Unauthorized: Admin or Super Admin access required/i
                );
            }
        });

        it('should allow legitimate admin to call delete handlers', async () => {
            SessionManager.setSession({
                id: 2,
                username: 'legit_admin',
                role: 'admin',
                full_name: 'Legit Admin',
            });

            // Test delete-bill specifically
            const billHandler = ipcHandlers.get('delete-bill');
            const res = await billHandler!({}, { billId: 101, reason: 'Legitimate refund' });
            expect(res.success).toBe(true);

            // Test delete-voucher
            const voucherHandler = ipcHandlers.get('delete-voucher');
            const vRes = await voucherHandler!({}, 202);
            expect(vRes.success).toBe(true);

            // Test delete-billing-customer
            const custHandler = ipcHandlers.get('delete-billing-customer');
            const cRes = await custHandler!({}, 303);
            expect(cRes.success).toBe(true);
        });

        describe('Elimination of Renderer Fallbacks in Shipping and Customer Ledger', () => {
            it('should reject update-shipment-status when unauthenticated even if renderer supplies userRole and updatedBy', async () => {
                SessionManager.clearSession();
                const handler = ipcHandlers.get('update-shipment-status');
                expect(handler).toBeDefined();

                await expect(
                    handler!({}, { shipmentId: 1, billId: 1, status: 'shipped', updatedBy: 'superadmin', userRole: 'superadmin' })
                ).rejects.toThrow(/Unauthorized: Authentication required/i);
            });

            it('should reject upload-packaging-image when unauthenticated even if renderer supplies userRole', async () => {
                SessionManager.clearSession();
                const handler = ipcHandlers.get('upload-packaging-image');
                expect(handler).toBeDefined();

                await expect(
                    handler!({}, { shipmentId: 1, billId: 1, imageBase64: 'data:image/png;base64,ZmFrZQ==', updatedBy: 'admin', userRole: 'superadmin' })
                ).rejects.toThrow(/Unauthorized: Authentication required/i);
            });

            it('should reject get-customer-ledger-list when unauthenticated even if renderer supplies isSuperadmin: true', async () => {
                SessionManager.clearSession();
                const handler = ipcHandlers.get('get-customer-ledger-list');
                expect(handler).toBeDefined();

                await expect(
                    handler!({}, { isSuperadmin: true, canSeeAllCustomers: true, callerUsername: 'superadmin' })
                ).rejects.toThrow(/Unauthorized: Authentication required/i);
            });

            it('should enforce session identity over forged renderer opts in get-customer-ledger-list', async () => {
                SessionManager.setSession({
                    id: 9,
                    username: 'sales_user',
                    role: 'operator',
                    permissions: {},
                });

                const handler = ipcHandlers.get('get-customer-ledger-list');
                expect(handler).toBeDefined();

                // Attacker tries to pass isSuperadmin: true in opts
                const res = await handler!({}, { isSuperadmin: true, canSeeAllCustomers: true, callerUsername: 'admin' });
                // Should not throw, but should execute with sales_user session scope, ignoring forged isSuperadmin/callerUsername
                expect(Array.isArray(res)).toBe(true);
            });
        });
    });

    // ── 3. PHASE 2B — SYSTEM-WIDE IPC AUTHORIZATION HARDENING ───────────────
    describe('Security Audit Phase 2B — System-Wide IPC Authorization Hardening', () => {

        // 3.1 Unauthenticated calls must fail closed
        describe('3.1 Unauthenticated Rejection (Fail Closed)', () => {
            it('should reject unauthenticated calls across all financial, inventory, and structural mutators', async () => {
                SessionManager.clearSession();

                const handlersToTest: Array<{ channel: string; payload: any }> = [
                    { channel: 'create-group', payload: { name: 'Test Group' } },
                    { channel: 'update-group', payload: [1, { name: 'Updated' }] },
                    { channel: 'create-ledger', payload: { name: 'Test Ledger' } },
                    { channel: 'create-voucher', payload: { voucher_type: 'Receipt', date: '2026-01-01', total_amount: 100 } },
                    { channel: 'create-voucher-type', payload: { name: 'New Type' } },
                    { channel: 'update-voucher-type', payload: [1, { name: 'Updated Type' }] },
                    { channel: 'delete-voucher-type', payload: 1 },
                    { channel: 'create-unit', payload: { name: 'Boxes', symbol: 'bx' } },
                    { channel: 'delete-unit', payload: 1 },
                    { channel: 'create-stock-group', payload: { name: 'Wood' } },
                    { channel: 'update-stock-group', payload: [1, { name: 'Steel' }] },
                    { channel: 'delete-stock-group', payload: 1 },
                    { channel: 'create-stock-item', payload: { name: 'Item 1' } },
                    { channel: 'create-company', payload: { name: 'Company 1' } },
                    { channel: 'create-godown', payload: { name: 'Godown 1' } },
                    { channel: 'update-godown', payload: [1, { name: 'Godown 2' }] },
                    { channel: 'create-product', payload: { name: 'Prod 1' } },
                    { channel: 'update-product', payload: { id: 1, name: 'Prod 2' } },
                    { channel: 'save-product-origin', payload: { name: 'Origin 1' } },
                    { channel: 'delete-product-origin', payload: 1 },
                    { channel: 'save-product-model-rule', payload: { name: 'Rule 1' } },
                    { channel: 'delete-product-model-rule', payload: 1 },
                    { channel: 'save-product-attribute', payload: { name: 'Attr 1' } },
                    { channel: 'create-bill', payload: { grand_total: 100 } },
                    { channel: 'update-bill', payload: { id: 1, changes: {} } },
                    { channel: 'add-customer-payment', payload: { customer_id: 1, amount: 50 } },
                    { channel: 'add-customer-address', payload: { customer_id: 1, address: 'Test' } },
                    { channel: 'create-exchange-order', payload: { original_bill_id: 1 } },
                    { channel: 'create-purchase-bill', payload: { bill_number: 'PB-1' } },
                ];

                for (const { channel, payload } of handlersToTest) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const args = Array.isArray(payload) ? payload : [payload];
                    await expect(
                        handler!({}, ...args),
                        `Expected unauthenticated call to ${channel} to fail closed`
                    ).rejects.toThrow(/Unauthorized: Authentication required/i);
                }
            });

            it('should reject unauthenticated calls across notifications, alterations, backup, and sync mutators', async () => {
                SessionManager.clearSession();

                const handlersToTest: Array<{ channel: string; payload: any }> = [
                    { channel: 'send-notification', payload: { title: 'Test', message: 'Hi' } },
                    { channel: 'clear-all-notifications', payload: 1 },
                    { channel: 'mark-all-notifications-read', payload: 1 },
                    { channel: 'set-make-order-price', payload: { orderId: 1, customPrice: 1000 } },
                    { channel: 'mark-customization-paid', payload: { orderId: 1 } },
                    { channel: 'update-make-order-status', payload: { orderId: 1, status: 'In Production' } },
                    { channel: 'stage-bill-alteration', payload: { billId: 1, changes: {}, reason: 'Fix' } },
                    { channel: 'approve-alteration', payload: { auditId: 1 } },
                    { channel: 'reject-alteration', payload: { auditId: 1, rejectReason: 'No' } },
                    { channel: 'add-bill-shipping', payload: { bill_id: 1, address: 'Ship Addr' } },
                    { channel: 'create-db-backup', payload: undefined },
                    { channel: 'restore-db-backup', payload: 'backup.json' },
                    { channel: 'import-woocommerce-csv', payload: 'test.csv' },
                    { channel: 'sync-products-to-website', payload: undefined },
                    { channel: 'set-backup-node', payload: true },
                    { channel: 'save-network-config', payload: {} },
                ];

                for (const { channel, payload } of handlersToTest) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const call = payload !== undefined ? handler!({}, payload) : handler!({});
                    await expect(
                        call,
                        `Expected unauthenticated call to ${channel} to fail closed`
                    ).rejects.toThrow(/Unauthorized: Authentication required/i);
                }
            });

            it('should reject unauthenticated calls across HRM, CRM, market analysis, requisitions, and settlements', async () => {
                SessionManager.clearSession();

                const handlersToTest: Array<{ channel: string; payload: any }> = [
                    { channel: 'hrm-upsert-employee', payload: { name: 'John' } },
                    { channel: 'hrm-mark-attendance', payload: { employee_id: 1, date: '2026-01-01', status: 'Present' } },
                    { channel: 'hrm-request-leave', payload: { employee_id: 1, start_date: '2026-01-01' } },
                    { channel: 'hrm-update-leave-status', payload: { id: 1, status: 'Approved' } },
                    { channel: 'hrm-generate-payroll', payload: { employee_id: 1, basic_salary: 1000, month: 'Jan', year: 2026 } },
                    { channel: 'hrm-mark-payroll-paid', payload: 1 },
                    { channel: 'hrm-upsert-holiday', payload: { holiday_date: '2026-01-01', holiday_name: 'New Year' } },
                    { channel: 'crm-upsert-customer', payload: { name: 'Customer A' } },
                    { channel: 'crm-add-tracking-log', payload: { customer_id: 1, note: 'Call' } },
                    { channel: 'create-quotation', payload: { quoteDate: '2026-01-01', grandTotal: 500 } },
                    { channel: 'add-competitor-url', payload: { product_id: 1, url: 'https://comp.com' } },
                    { channel: 'run-auto-price-scan', payload: 1 },
                    { channel: 'verify-bill-payment', payload: { paymentRef: 'ref_1', status: 'verified' } },
                    { channel: 'create-purchase-requisition', payload: { productId: 1, quantity: 5 } },
                    { channel: 'update-purchase-requisition', payload: ['req-1', { productId: 1, quantity: 10 }] },
                    { channel: 'approve-purchase-requisition', payload: ['req-1', 'APPROVED', 'Notes'] },
                    { channel: 'submit-purchase-estimates', payload: ['req-1', [{ supplierId: 1, estimatedPrice: 100 }]] },
                    { channel: 'audit-review-purchase-requisition', payload: ['req-1', 'APPROVED', 'Audit ok'] },
                    { channel: 'director-review-purchase-requisition', payload: ['req-1', 'APPROVED', 'Dir ok'] },
                    { channel: 'purchase-purchase-requisition', payload: ['req-1', { supplierId: 1 }] },
                    { channel: 'receive-purchase-requisition', payload: 'req-1' },
                    { channel: 'complete-purchase-requisition', payload: 'req-1' },
                    { channel: 'delete-purchase-requisition', payload: 'req-1' },
                    { channel: 'create-supplier-settlement', payload: { supplierLedgerId: 1, settlementAmount: 500 } },
                ];

                for (const { channel, payload } of handlersToTest) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const args = Array.isArray(payload) ? payload : [payload];
                    await expect(
                        handler!({}, ...args),
                        `Expected unauthenticated call to ${channel} to fail closed`
                    ).rejects.toThrow(/Unauthorized: Authentication required/i);
                }
            });

            it('should reject unauthenticated calls across chat, email, and presence handlers', async () => {
                SessionManager.clearSession();

                const handlersToTest: Array<{ channel: string; payload: any }> = [
                    { channel: 'update-user-presence', payload: 'online' },
                    { channel: 'get-online-users', payload: undefined },
                    { channel: 'set-typing-status', payload: { recipientId: 2, isTyping: true } },
                    { channel: 'get-chat-messages', payload: 2 },
                    { channel: 'send-chat-message', payload: { receiver_id: 2, message: 'hello' } },
                    { channel: 'email-get-inbox', payload: undefined },
                    { channel: 'email-get-sent', payload: undefined },
                    { channel: 'email-send', payload: { to: 'test@example.com', subject: 'hi', body: 'test' } },
                    { channel: 'email-mark-read', payload: 1 },
                    { channel: 'email-delete', payload: 1 },
                ];

                for (const { channel, payload } of handlersToTest) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const call = payload !== undefined ? handler!({}, payload) : handler!({});
                    await expect(
                        call,
                        `Expected unauthenticated call to ${channel} to fail closed`
                    ).rejects.toThrow(/Unauthorized: Authentication required/i);
                }
            });
        });

        // 3.2 Role and Capability Enforcement
        describe('3.2 Role and Capability Enforcement', () => {
            it('should reject non-admin users from admin-restricted financial, inventory, and master data mutators', async () => {
                SessionManager.setSession({
                    id: 10,
                    username: 'operator_dan',
                    role: 'operator',
                    full_name: 'Dan Operator',
                    permissions: {},
                });

                const adminOnlyHandlers: Array<{ channel: string; payload: any }> = [
                    { channel: 'create-group', payload: { name: 'Test Group' } },
                    { channel: 'update-group', payload: [1, { name: 'Test Group' }] },
                    { channel: 'create-ledger', payload: { name: 'Test Ledger' } },
                    { channel: 'create-voucher', payload: { voucher_type: 'Receipt', date: '2026-01-01', total_amount: 100 } },
                    { channel: 'create-voucher-type', payload: { name: 'Test' } },
                    { channel: 'update-voucher-type', payload: [1, { name: 'Test' }] },
                    { channel: 'delete-voucher-type', payload: 1 },
                    { channel: 'create-unit', payload: { name: 'Pcs', symbol: 'pcs' } },
                    { channel: 'delete-unit', payload: 1 },
                    { channel: 'create-stock-group', payload: { name: 'G1' } },
                    { channel: 'update-stock-group', payload: [1, { name: 'G2' }] },
                    { channel: 'delete-stock-group', payload: 1 },
                    { channel: 'create-stock-item', payload: { name: 'I1' } },
                    { channel: 'create-company', payload: { name: 'Comp' } },
                    { channel: 'create-godown', payload: { name: 'Godown' } },
                    { channel: 'update-godown', payload: [1, { name: 'Godown' }] },
                    { channel: 'create-product', payload: { name: 'Prod' } },
                    { channel: 'update-product', payload: { id: 1, name: 'Prod' } },
                    { channel: 'save-product-model-rule', payload: { name: 'Rule' } },
                    { channel: 'delete-product-model-rule', payload: 1 },
                    { channel: 'save-product-attribute', payload: { name: 'Attr' } },
                    { channel: 'create-purchase-bill', payload: { bill_number: 'PB-1' } },
                    { channel: 'set-make-order-price', payload: { orderId: 1, customPrice: 2000 } },
                    { channel: 'approve-alteration', payload: { auditId: 1 } },
                    { channel: 'reject-alteration', payload: { auditId: 1, rejectReason: 'No' } },
                    { channel: 'import-woocommerce-csv', payload: 'test.csv' },
                    { channel: 'sync-products-to-website', payload: undefined },
                    { channel: 'hrm-upsert-employee', payload: { name: 'Emp' } },
                    { channel: 'hrm-update-leave-status', payload: { id: 1, status: 'Approved' } },
                    { channel: 'hrm-generate-payroll', payload: { employee_id: 1, basic_salary: 1000, month: 'Jan', year: 2026 } },
                    { channel: 'hrm-mark-payroll-paid', payload: 1 },
                    { channel: 'hrm-upsert-holiday', payload: { holiday_date: '2026-01-01', holiday_name: 'Holiday' } },
                    { channel: 'add-competitor-url', payload: { product_id: 1, url: 'https://c.com' } },
                    { channel: 'verify-bill-payment', payload: { paymentRef: 'p1', status: 'verified' } },
                    { channel: 'delete-purchase-requisition', payload: 'req-1' },
                    { channel: 'create-supplier-settlement', payload: { supplierLedgerId: 1, settlementAmount: 500 } },
                ];

                for (const { channel, payload } of adminOnlyHandlers) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const args = Array.isArray(payload) ? payload : (payload !== undefined ? [payload] : []);
                    await expect(
                        handler!({}, ...args),
                        `Expected operator without admin role to be rejected from ${channel}`
                    ).rejects.toThrow(/Unauthorized: Admin or Super Admin access required/i);
                }
            });

            it('should reject non-superadmin users from superadmin-restricted operations', async () => {
                SessionManager.setSession({
                    id: 11,
                    username: 'regular_admin',
                    role: 'admin',
                    full_name: 'Regular Admin',
                    permissions: {},
                });

                const superadminOnlyHandlers: Array<{ channel: string; payload: any }> = [
                    { channel: 'create-db-backup', payload: undefined },
                    { channel: 'restore-db-backup', payload: 'backup.json' },
                    { channel: 'set-backup-node', payload: true },
                    { channel: 'save-network-config', payload: {} },
                    { channel: 'delete-product-origin', payload: 1 },
                    { channel: 'save-product-origin', payload: { name: 'Origin', requiresSuperadmin: true } },
                ];

                for (const { channel, payload } of superadminOnlyHandlers) {
                    const handler = ipcHandlers.get(channel);
                    expect(handler, `Handler for ${channel} must exist`).toBeDefined();

                    const call = payload !== undefined ? handler!({}, payload) : handler!({});
                    await expect(
                        call,
                        `Expected regular admin to be rejected from superadmin-restricted ${channel}`
                    ).rejects.toThrow(/Unauthorized: Super Admin access required/i);
                }
            });

            it('should enforce specific workflow capabilities for procurement reviews', async () => {
                // Operator without store head / auditor / director role or permissions
                SessionManager.setSession({
                    id: 12,
                    username: 'unprivileged_staff',
                    role: 'staff',
                    full_name: 'Staff Person',
                    permissions: {},
                });

                // Store Head approval
                const approveHandler = ipcHandlers.get('approve-purchase-requisition');
                await expect(
                    approveHandler!({}, 'req-1', 'APPROVED', 'Notes')
                ).rejects.toThrow(/Unauthorized: Admin or Store Head access required/i);

                // Auditor review
                const auditHandler = ipcHandlers.get('audit-review-purchase-requisition');
                await expect(
                    auditHandler!({}, 'req-1', 'APPROVED', 'Notes')
                ).rejects.toThrow(/Unauthorized: Admin or Auditor access required/i);

                // Director review
                const directorHandler = ipcHandlers.get('director-review-purchase-requisition');
                await expect(
                    directorHandler!({}, 'req-1', 'APPROVED', 'Notes')
                ).rejects.toThrow(/Unauthorized: Admin or Director access required/i);

                // Purchasing execution
                const purchaseHandler = ipcHandlers.get('purchase-purchase-requisition');
                await expect(
                    purchaseHandler!({}, 'req-1', { supplierId: 1 })
                ).rejects.toThrow(/Unauthorized: Admin or Purchase access required/i);
            });

            it('should allow users with legitimate capabilities to execute specific workflows', async () => {
                // Test alter_bill capability for non-admin
                SessionManager.setSession({
                    id: 13,
                    username: 'biller_bob',
                    role: 'operator',
                    full_name: 'Bob Biller',
                    permissions: { alter_bill: true },
                });

                const updateBillHandler = ipcHandlers.get('update-bill');
                const updateRes = await updateBillHandler!({}, { id: 1, changes: { grand_total: 500 } });
                expect(updateRes.success).toBe(true);

                // Test Store Head capability
                SessionManager.setSession({
                    id: 14,
                    username: 'store_head_user',
                    role: 'Store Head',
                    full_name: 'Store Head Sam',
                });
                const approveReqHandler = ipcHandlers.get('approve-purchase-requisition');
                const approveRes = await approveReqHandler!({}, 'req-1', 'APPROVED', 'Store head ok');
                expect(approveRes.success).toBe(true);

                // Test Auditor capability
                SessionManager.setSession({
                    id: 15,
                    username: 'auditor_user',
                    role: 'Auditor',
                    full_name: 'Auditor Alice',
                });
                const auditReqHandler = ipcHandlers.get('audit-review-purchase-requisition');
                const auditRes = await auditReqHandler!({}, 'req-1', 'APPROVED', 'Audit ok');
                expect(auditRes.success).toBe(true);

                // Test Director capability
                SessionManager.setSession({
                    id: 16,
                    username: 'director_user',
                    role: 'Director',
                    full_name: 'Director Dave',
                });
                const directorReqHandler = ipcHandlers.get('director-review-purchase-requisition');
                const dirRes = await directorReqHandler!({}, 'req-1', 'APPROVED', 'Director ok');
                expect(dirRes.success).toBe(true);
            });
        });

        // 3.3 Forgery Prevention (Identity strictly derived from SessionManager)
        describe('3.3 Renderer Identity Forgery Prevention', () => {
            it('should ignore forged renderer roles, usernames, or permissions in payloads', async () => {
                // Attacker logged in as operator tries to pass spoofed admin credentials in payload
                SessionManager.setSession({
                    id: 20,
                    username: 'attacker_op',
                    role: 'operator',
                    full_name: 'Malicious Operator',
                    permissions: {},
                });

                // Attempt to create group by passing userRole: 'superadmin'
                const groupHandler = ipcHandlers.get('create-group');
                await expect(
                    groupHandler!({}, { name: 'Hacked Group', userRole: 'superadmin', role: 'admin' })
                ).rejects.toThrow(/Unauthorized: Admin or Super Admin access required/i);

                // Attempt to update bill by passing alter_bill permission in payload
                const billHandler = ipcHandlers.get('update-bill');
                await expect(
                    billHandler!({}, { id: 1, permissions: { alter_bill: true }, userRole: 'superadmin' })
                ).rejects.toThrow(/Unauthorized: Admin access or alter_bill permission required/i);

                // Attempt to create supplier settlement with forged desktop-user or admin name
                const settlementHandler = ipcHandlers.get('create-supplier-settlement');
                await expect(
                    settlementHandler!({}, { supplierLedgerId: 1, created_by_name: 'desktop-user', userRole: 'superadmin' })
                ).rejects.toThrow(/Unauthorized: Admin or Super Admin access required/i);
            });

            it('should bind sender and creator identity exclusively to verified session ID and session name', async () => {
                SessionManager.setSession({
                    id: 77,
                    username: 'verified_user',
                    role: 'operator',
                    full_name: 'Verified Real User',
                });

                // Test send-notification: sender_id must be session.id (77), not spoofed senderId
                const notifyHandler = ipcHandlers.get('send-notification');
                const notifyRes = await notifyHandler!({}, {
                    title: 'Alert',
                    message: 'Msg',
                    senderId: 9999, // attacker tries to spoof senderId 9999 (CEO)
                });
                expect(notifyRes.success).toBe(true);

                // Test crm-add-tracking-log: user_id must be session.id (77)
                const crmLogHandler = ipcHandlers.get('crm-add-tracking-log');
                const logRes = await crmLogHandler!({}, {
                    customer_id: 1,
                    note: 'Followup',
                    user_id: 1, // attacker tries to attribute log to admin user 1
                });
                expect(logRes.success).toBe(true);

                // Test create-quotation: prepared_by must be session user, not spoofed preparedBy
                const quoteHandler = ipcHandlers.get('create-quotation');
                const quoteRes = await quoteHandler!({}, {
                    quoteDate: '2026-01-01',
                    grandTotal: 100,
                    preparedBy: 'Fake CEO',
                    preparedByRole: 'superadmin',
                });
                expect(quoteRes.id).toBeDefined();

                // Test send-chat-message: sender_id must be 77
                const chatHandler = ipcHandlers.get('send-chat-message');
                const chatRes = await chatHandler!({}, {
                    receiver_id: 2,
                    message: 'Hello',
                    sender_id: 1,
                    sender_name: 'Fake Admin',
                });
                expect(chatRes.success).toBe(true);
            });
        });
    });
});

