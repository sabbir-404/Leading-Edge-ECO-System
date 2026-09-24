import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteMakeOrderSchema } from '../../electron/ipc/schemas/make.schema';
import { MakeOrderService } from '../../electron/services/make/MakeOrderService';
import { supabase } from '../../electron/supabase';

vi.mock('../../electron/supabase', () => ({
    supabase: {
        from: vi.fn()
    }
}));

describe('MAKE V1.1 — Delete Order Authority & Financial Safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should validate DeleteMakeOrderSchema with numeric orderId', () => {
        const parsed = DeleteMakeOrderSchema.safeParse({ orderId: 104, reason: 'Duplicate order' });
        expect(parsed.success).toBe(true);
    });

    it('should validate DeleteMakeOrderSchema with string/UUID orderId', () => {
        const parsed = DeleteMakeOrderSchema.safeParse({ orderId: 'ord_9f8e-4a', reason: 'Customer cancelled' });
        expect(parsed.success).toBe(true);
    });

    it('should reject non-string, non-number orderId', () => {
        const parsed = DeleteMakeOrderSchema.safeParse({ orderId: null });
        expect(parsed.success).toBe(false);
    });

    it('should reject unauthorized user roles from deleting orders', async () => {
        const unauthorizedRoles = ['factory', 'factory_operator', 'salesperson', 'viewer', 'accountant'];

        for (const role of unauthorizedRoles) {
            const result = await MakeOrderService.deleteOrder(101, {
                userId: 1,
                username: 'unauth_user',
                fullName: 'Test Operator',
                role
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Forbidden');
        }
    });

    it('should safely cancel/void instead of hard deleting if order is linked to an active bill', async () => {
        const updateSpy = vi.fn().mockReturnThis();
        const insertSpy = vi.fn().mockResolvedValue({ error: null });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_orders') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockImplementation((col: string, val: any) => {
                        if (col === 'id') {
                            return {
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: {
                                        id: 205,
                                        order_number: 'MK-2026-0205',
                                        status: 'Work in process',
                                        reference_bill_no: 'BILL-8891'
                                    },
                                    error: null
                                })
                            };
                        }
                        return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
                    }),
                    update: updateSpy
                };
            }
            if (table === 'bills') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 8891, invoice_number: 'BILL-8891', grand_total: 75000 },
                            error: null
                        })
                    })
                };
            }
            if (table === 'make_order_updates') {
                return {
                    insert: insertSpy
                };
            }
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis()
            };
        });

        const result = await MakeOrderService.deleteOrder(205, {
            userId: 5,
            username: 'designer_john',
            fullName: 'John Designer',
            role: 'designer'
        });

        expect(result.success).toBe(true);
        expect(result.financiallyProtected).toBe(true);
        expect(result.error).toContain('BILL-8891');
        expect(result.error).toContain('safely set to Cancelled rather than destroyed');
    });

    it('should allow Admin and Superadmin to invoke deleteOrder on unbilled orders', async () => {
        const deleteEqSpy = vi.fn().mockResolvedValue({ error: null });
        const deleteSpy = vi.fn().mockReturnValue({ eq: deleteEqSpy });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_orders') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                id: 300,
                                order_number: 'MK-2026-0300',
                                status: 'Placed',
                                reference_bill_no: null
                            },
                            error: null
                        })
                    }),
                    delete: deleteSpy
                };
            }
            return {
                delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
            };
        });

        const adminResult = await MakeOrderService.deleteOrder(300, {
            userId: 1,
            username: 'admin',
            fullName: 'Admin User',
            role: 'admin'
        });
        expect(adminResult.success).toBe(true);
        expect(adminResult.financiallyProtected).toBeUndefined();

        const superadminResult = await MakeOrderService.deleteOrder(300, {
            userId: 2,
            username: 'superadmin',
            fullName: 'Super User',
            role: 'superadmin'
        });
        expect(superadminResult.success).toBe(true);
    });

    it('should reject unauthenticated deletion request', async () => {
        const result = await MakeOrderService.deleteOrder(300, null as any);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Forbidden');
    });

    it('should allow authorized Designer to delete unbilled order', async () => {
        const deleteEqSpy = vi.fn().mockResolvedValue({ error: null });
        const deleteSpy = vi.fn().mockReturnValue({ eq: deleteEqSpy });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_orders') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                id: 301,
                                order_number: 'MK-2026-0301',
                                status: 'Draft',
                                reference_bill_no: null
                            },
                            error: null
                        })
                    }),
                    delete: deleteSpy
                };
            }
            return {
                delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
            };
        });

        const designerResult = await MakeOrderService.deleteOrder(301, {
            userId: 3,
            username: 'designer_sabbir',
            fullName: 'Sabbir Designer',
            role: 'designer'
        });
        expect(designerResult.success).toBe(true);
    });
});

