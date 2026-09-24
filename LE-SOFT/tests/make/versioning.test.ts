import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MakeVersionService, OrderSnapshot } from '../../electron/services/make/MakeVersionService';
import { supabase } from '../../electron/supabase';

// Mock supabase query builder
vi.mock('../../electron/supabase', () => {
    return {
        supabase: {
            from: vi.fn(),
            storage: {
                from: vi.fn()
            }
        }
    };
});

describe('MAKE V1 — Immutable Order Versioning & Audit Trail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create an immutable Version 1 snapshot upon initial approval', async () => {
        const mockOrder = {
            id: 101,
            order_number: 'MAKE-2026-123456',
            furniture_name: 'Walnut Boardroom Table',
            status: 'Approved',
            cost_price: 45000,
            sale_price: 65000
        };

        const mockItems = [
            { id: 1, order_id: 101, product_name: 'Walnut Top Slab', quantity: 1, item_cost_price: 30000, item_sale_price: 45000 },
            { id: 2, order_id: 101, product_name: 'Steel T-Base', quantity: 2, item_cost_price: 7500, item_sale_price: 10000 }
        ];

        let insertedVersionData: any = null;

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_orders') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null })
                };
            }
            if (table === 'make_order_items') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    order: vi.fn().mockResolvedValue({ data: mockItems, error: null })
                };
            }
            if (table === 'make_order_versions') {
                return {
                    insert: vi.fn().mockImplementation((payload: any) => {
                        insertedVersionData = payload;
                        return Promise.resolve({ error: null });
                    })
                };
            }
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis()
            };
        });

        const result = await MakeVersionService.createSnapshot({
            orderId: 101,
            versionNumber: 1,
            changeReason: 'Initial salesperson approval',
            actorName: 'Rahim Ahmed',
            actorRole: 'Salesperson'
        });

        expect(result.success).toBe(true);
        expect(result.versionNumber).toBe(1);
        expect(insertedVersionData).not.toBeNull();
        expect(insertedVersionData.order_id).toBe(101);
        expect(insertedVersionData.version_number).toBe(1);
        expect(insertedVersionData.created_by).toBe('Rahim Ahmed');
        expect(insertedVersionData.user_role).toBe('Salesperson');

        // Verify deep snapshot content
        const snapshot: OrderSnapshot = insertedVersionData.snapshot;
        expect(snapshot.order.furniture_name).toBe('Walnut Boardroom Table');
        expect(snapshot.items).toHaveLength(2);
        expect(snapshot.items[0].product_name).toBe('Walnut Top Slab');
        expect(snapshot.timestamp).toBeDefined();
    });

    it('should create incremented Version 2 snapshot when order is altered', async () => {
        const alteredOrder = {
            id: 101,
            order_number: 'MAKE-2026-123456',
            furniture_name: 'Walnut Boardroom Table (Extended)',
            cost_price: 52000,
            sale_price: 78000
        };

        const alteredItems = [
            { id: 1, order_id: 101, product_name: 'Walnut Top Slab (3.5m)', quantity: 1, item_cost_price: 37000, item_sale_price: 58000 },
            { id: 2, order_id: 101, product_name: 'Heavy Duty Steel Base', quantity: 2, item_cost_price: 7500, item_sale_price: 10000 }
        ];

        let insertedPayload: any = null;

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_orders') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: alteredOrder, error: null })
                };
            }
            if (table === 'make_order_items') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    order: vi.fn().mockResolvedValue({ data: alteredItems, error: null })
                };
            }
            if (table === 'make_order_versions') {
                return {
                    insert: vi.fn().mockImplementation((payload: any) => {
                        insertedPayload = payload;
                        return Promise.resolve({ error: null });
                    })
                };
            }
            return {};
        });

        const result = await MakeVersionService.createSnapshot({
            orderId: 101,
            versionNumber: 2,
            changeReason: 'Client requested slab extension to 3.5m',
            actorName: 'Karim Designer',
            actorRole: 'Designer'
        });

        expect(result.success).toBe(true);
        expect(result.versionNumber).toBe(2);
        expect(insertedPayload.version_number).toBe(2);
        expect(insertedPayload.change_reason).toBe('Client requested slab extension to 3.5m');
        expect(insertedPayload.snapshot.order.sale_price).toBe(78000);
    });

    it('should record an immutable approval audit entry in make_order_approvals', async () => {
        let auditPayload: any = null;

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_order_approvals') {
                return {
                    insert: vi.fn().mockImplementation((payload: any) => {
                        auditPayload = payload;
                        return Promise.resolve({ error: null });
                    })
                };
            }
            return {};
        });

        const result = await MakeVersionService.recordApprovalAudit({
            orderId: 101,
            versionNumber: 1,
            action: 'approved',
            actedBy: 'Nazmul Islam',
            userRole: 'Sales Manager',
            notesOrReason: 'Approved standard specifications and advance deposit verified'
        });

        expect(result.success).toBe(true);
        expect(auditPayload).not.toBeNull();
        expect(auditPayload.order_id).toBe(101);
        expect(auditPayload.version_number).toBe(1);
        expect(auditPayload.action).toBe('approved');
        expect(auditPayload.acted_by).toBe('Nazmul Islam');
        expect(auditPayload.user_role).toBe('Sales Manager');
        expect(auditPayload.notes_or_reason).toContain('advance deposit verified');
    });

    it('should accurately compare versions using getVersionDiff', async () => {
        const v1Snapshot = {
            order: { id: 101, cost_price: 45000, sale_price: 65000 },
            items: [{ id: 1, quantity: 1, item_cost_price: 45000 }],
            timestamp: '2026-09-01T10:00:00Z'
        };

        const v2Snapshot = {
            order: { id: 101, cost_price: 52000, sale_price: 78000 },
            items: [{ id: 1, quantity: 1, item_cost_price: 52000 }],
            timestamp: '2026-09-03T15:00:00Z'
        };

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_order_versions') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    in: vi.fn().mockResolvedValue({
                        data: [
                            { version_number: 1, snapshot: v1Snapshot },
                            { version_number: 2, snapshot: v2Snapshot }
                        ],
                        error: null
                    })
                };
            }
            return {};
        });

        const diff = await MakeVersionService.getVersionDiff(101, 1, 2);
        expect(diff.from).toEqual(v1Snapshot);
        expect(diff.to).toEqual(v2Snapshot);
        expect(diff.from.order.sale_price).toBe(65000);
        expect(diff.to.order.sale_price).toBe(78000);
    });
});
