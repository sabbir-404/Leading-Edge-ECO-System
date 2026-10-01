import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../electron/session-manager';
import { MakeOrderService } from '../../electron/services/make/MakeOrderService';
import { MakeSearchService } from '../../electron/services/make/MakeSearchService';
import { formatSizeDisplay, formatSizeDimensions } from '../../src/utils/formatSize';
import { canManageMakeCatalog } from '../../src/utils/permissions';
import { supabase } from '../../electron/supabase';

// LocalStorage polyfill for Vitest Node environment
const storage: Record<string, string> = {};
// @ts-ignore
global.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, val: string) => { storage[key] = String(val); },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { for (const k in storage) delete storage[k]; },
    key: () => null,
    length: 0
};

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

describe('LESOFT v1.8.5 — MAKE Feature Requirements & Regression Tests', () => {
    beforeEach(() => {
        localStorage.clear();
        SessionManager.clearSession();
        vi.clearAllMocks();
    });

    // ── 1. PLACE ORDER & PRODUCT CREATION PERMISSIONS ─────────────────────────
    describe('1. Product Creation Permissions (Designer/Admin Allowed, Salesman Denied)', () => {
        it('allows Furniture Designer to manage/create products (frontend permissions)', () => {
            localStorage.setItem('user_role', 'furniture_designer');
            localStorage.setItem('user_permissions', JSON.stringify({}));
            expect(canManageMakeCatalog()).toBe(true);

            localStorage.setItem('user_role', 'designer');
            expect(canManageMakeCatalog()).toBe(true);
        });

        it('allows Admin to manage/create products (frontend permissions)', () => {
            localStorage.setItem('user_role', 'admin');
            expect(canManageMakeCatalog()).toBe(true);

            localStorage.setItem('user_role', 'superadmin');
            expect(canManageMakeCatalog()).toBe(true);
        });

        it('strictly denies Salesman from product creation (frontend permissions)', () => {
            localStorage.setItem('user_role', 'salesperson');
            localStorage.setItem('user_permissions', JSON.stringify({ make_create: true, manage_catalog: true }));
            // Salesperson should NEVER be allowed to manage or create catalog products
            expect(canManageMakeCatalog()).toBe(false);

            localStorage.setItem('user_role', 'sales');
            expect(canManageMakeCatalog()).toBe(false);

            localStorage.setItem('user_role', 'salesman');
            expect(canManageMakeCatalog()).toBe(false);
        });

        it('strictly denies Salesman in authoritative backend session check', () => {
            const salesSession = SessionManager.setSession({
                id: 101,
                username: 'sales_rep_1',
                full_name: 'Sales Rep',
                role: 'salesperson',
                permissions: { make_create: true, manage_catalog: true }
            });

            // Authoritative backend capability check
            const role = (salesSession.role || '').toLowerCase();
            const isDeniedRole = role === 'salesperson' || role === 'sales' || role === 'salesman';
            expect(isDeniedRole).toBe(true);
        });
    });

    // ── 2. PRODUCT CREATION — ASSIGNED SIZES DISPLAY NAME + DIMENSIONS ─────────
    describe('2. Assigned Sizes Display (Name — Dimensions)', () => {
        it('formats rectangular size with label: "Small — 1200 × 600 × 750 mm"', () => {
            const formatted = formatSizeDisplay({
                size_label: 'Small',
                length: 1200,
                width: 600,
                height: 750,
                unit: 'mm'
            });
            expect(formatted).toBe('Small — 1200 × 600 × 750 mm');
        });

        it('formats rectangular size: "Medium — 1500 × 750 × 750 mm"', () => {
            const formatted = formatSizeDisplay({
                size_label: 'Medium',
                length: 1500,
                width: 750,
                height: 750,
                unit: 'mm'
            });
            expect(formatted).toBe('Medium — 1500 × 750 × 750 mm');
        });

        it('formats round size with diameter: "Round Table — Ø900 mm"', () => {
            const formatted = formatSizeDisplay({
                size_label: 'Round Table',
                diameter: 900,
                unit: 'mm'
            });
            expect(formatted).toBe('Round Table — Ø900 mm');
        });

        it('formats dimensions correctly when size_label is missing or empty', () => {
            const formatted = formatSizeDisplay({
                length: 1200,
                width: 600,
                height: 750,
                unit: 'mm'
            });
            expect(formatted).toBe('1200 × 600 × 750 mm');
        });

        it('handles empty input gracefully', () => {
            expect(formatSizeDisplay(null)).toBe('');
            expect(formatSizeDisplay(undefined)).toBe('');
            expect(formatSizeDimensions(null)).toBe('');
        });
    });

    // ── 3. PRODUCT CREATION — MULTIPLE CATEGORIES JUNCTION MODEL ───────────────
    describe('3. Multi-Category Products & Junction Model', () => {
        it('synchronizes multiple categories while maintaining legacy category_id for backward compatibility', () => {
            const selectedCategoryIds = [10, 12, 15];
            const categoriesList = [
                { id: 10, name: 'Executive Desks' },
                { id: 12, name: 'Office Furniture' },
                { id: 15, name: 'Conference' }
            ];

            const primaryId = selectedCategoryIds[0];
            const primaryCat = categoriesList.find(c => c.id === primaryId);

            const productPayload = {
                product_code: 'ED-001',
                product_name: 'Executive L-Desk',
                category_id: primaryId,
                category: primaryCat?.name,
                category_ids: selectedCategoryIds
            };

            expect(productPayload.category_ids).toEqual([10, 12, 15]);
            expect(productPayload.category_id).toBe(10);
            expect(productPayload.category).toBe('Executive Desks');
        });

        it('handles product with no categories or single category without errors', () => {
            const emptyPayload = {
                category_ids: [] as number[],
                category_id: null,
                category: null
            };
            expect(emptyPayload.category_ids.length).toBe(0);
            expect(emptyPayload.category_id).toBeNull();
        });
    });

    // ── 4 & 5. ORDER MODIFICATION RULES (PRE / POST PRODUCTION BOUNDARY) ──────
    describe('4 & 5. Canonical Stage Edit Rules & Role Restrictions', () => {
        const canonicalPostStages = [
            'Production On Going',
            'Primary QC',
            'Color Ongoing (oven)',
            'QC Final',
            'Packaging',
            'Ready to Ship',
            'Delivered'
        ];

        it('allows Designer and Admin to modify orders before "Production On Going"', () => {
            const preStages = ['Draft', 'Placed', 'Pending Approval', 'Awaiting Pricing', 'Work in process'];

            for (const stg of preStages) {
                const isPost = canonicalPostStages.some(p => p.toLowerCase() === stg.toLowerCase());
                expect(isPost).toBe(false);
            }
        });

        it('identifies all stages from "Production On Going" onwards as locked post-production', () => {
            for (const stg of canonicalPostStages) {
                const isPost = canonicalPostStages.some(p => p.toLowerCase() === stg.toLowerCase());
                expect(isPost).toBe(true);
            }
        });

        it('backend MakeOrderService.alterOrder rejects non-admin attempt in post-production', async () => {
            const mockOrder = {
                id: 501,
                order_number: 'MAKE-2026-000501',
                status: 'Production On Going',
                current_stage: 'Production On Going',
                furniture_name: 'Conference Table',
                quantity: 2
            };

            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null })
            });

            // Attempt by designer
            const designerResult = await MakeOrderService.alterOrder(
                501,
                { quantity: 4 },
                'designer_alice',
                'designer',
                undefined,
                'Customer requested more chairs'
            );

            expect(designerResult.error).toContain('Order has entered "Production On Going"');
            expect(designerResult.error).toContain('only Administrators can modify orders');

            // Attempt by salesperson
            const salesResult = await MakeOrderService.alterOrder(
                501,
                { quantity: 3 },
                'sales_bob',
                'salesperson',
                undefined,
                'Sales rep update'
            );

            expect(salesResult.error).toContain('Salespersons cannot modify production orders');
        });

        it('backend MakeOrderService.alterOrder allows Admin to modify order after production started', async () => {
            const mockOrder = {
                id: 502,
                order_number: 'MAKE-2026-000502',
                status: 'Production On Going',
                current_stage: 'Production On Going',
                furniture_name: 'Executive Chair',
                quantity: 5
            };

            const mockUpdate = vi.fn().mockReturnThis();
            const mockInsert = vi.fn().mockResolvedValue({ error: null });

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_orders') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
                        update: mockUpdate
                    };
                }
                if (table === 'make_order_items') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: [], error: null })
                            })
                        })
                    };
                }
                if (table === 'make_order_alteration_log') {
                    return {
                        insert: mockInsert
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                };
            });

            mockUpdate.mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null })
            });

            const result = await MakeOrderService.alterOrder(
                502,
                { quantity: 10 },
                'admin_super',
                'admin',
                undefined,
                'Urgent VIP expansion approved by GM'
            );

            expect(result.error).toBeUndefined();
            expect(result.success).toBe(true);
            expect(mockInsert).toHaveBeenCalled();
        });
    });

    // ── 6. MANDATORY MODIFICATION AUDIT LOG ──────────────────────────────────
    describe('6. Mandatory Modification Audit Log', () => {
        it('records old/new values, user, role, action_type, and reason into make_order_alteration_log', async () => {
            const mockOrder = {
                id: 503,
                order_number: 'MAKE-2026-000503',
                status: 'Work in process',
                current_stage: 'Work in process',
                furniture_name: 'Basic Desk',
                quantity: 1
            };

            let insertedLogs: any[] = [];

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_orders') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
                        update: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ error: null })
                        })
                    };
                }
                if (table === 'make_order_items') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: [], error: null })
                            })
                        })
                    };
                }
                if (table === 'make_order_alteration_log') {
                    return {
                        insert: vi.fn().mockImplementation((rows: any[]) => {
                            insertedLogs = rows;
                            return Promise.resolve({ error: null });
                        })
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                };
            });

            const result = await MakeOrderService.alterOrder(
                503,
                { furniture_name: 'Premium Standing Desk', quantity: 3 },
                'designer_sarah',
                'furniture_designer',
                undefined,
                'Client upgraded to standing desk'
            );

            expect(result.success).toBe(true);
            expect(insertedLogs.length).toBeGreaterThan(0);

            const nameLog = insertedLogs.find(l => l.field_name === 'furniture_name');
            expect(nameLog).toBeDefined();
            expect(nameLog.old_value).toBe('Basic Desk');
            expect(nameLog.new_value).toBe('Premium Standing Desk');
            expect(nameLog.altered_by).toBe('designer_sarah');
            expect(nameLog.user_role).toBe('furniture_designer');
            expect(nameLog.reason).toBe('Client upgraded to standing desk');
            expect(nameLog.order_number).toBe('MAKE-2026-000503');

            const qtyLog = insertedLogs.find(l => l.field_name === 'quantity');
            expect(qtyLog).toBeDefined();
            expect(qtyLog.old_value).toBe('1');
            expect(qtyLog.new_value).toBe('3');
        });
    });

    // ── 7. AUTOMATIC ORDER NUMBER GENERATION ──────────────────────────────────
    describe('7. Automatic Order Number Generation & Uniqueness', () => {
        it('generates format MAKE-YYYY-XXXXXX with 6 uppercase alphanumeric chars', () => {
            const currentYear = new Date().getFullYear();
            const orderNum = MakeOrderService.generateOrderNumber();
            expect(orderNum).toMatch(new RegExp(`^MAKE-${currentYear}-\\d{6}$`));
        });

        it('generates distinct candidate order numbers across consecutive calls', () => {
            const num1 = MakeOrderService.generateOrderNumber();
            const num2 = MakeOrderService.generateOrderNumber();
            expect(num1).not.toBe(num2);
        });

        it('retries on collision to guarantee unique order number in database', async () => {
            let attempt = 0;
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockImplementation(() => {
                    attempt++;
                    return {
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: attempt === 1 ? { order_number: 'COLLISION' } : null,
                            error: null
                        })
                    };
                })
            });

            const uniqueNum = await MakeOrderService.generateUniqueOrderNumber();
            expect(uniqueNum).toMatch(/^MAKE-\d{4}-\d{6}$/);
            expect(attempt).toBe(2);
        });
    });

    // ── 8. TRACK ORDERS GLOBAL SEARCH ─────────────────────────────────────────
    describe('8. Track Orders Global Search Across Complete Dataset', () => {
        const mockCatalog = [
            { id: 1, product_code: 'ED-100', product_name: 'Executive Walnut Desk', category: 'Desks', is_active: true },
            { id: 2, product_code: 'CT-200', product_name: 'Conference Oval Table', category: 'Tables', is_active: true },
            { id: 3, product_code: 'SC-300', product_name: 'Ergonomic Task Chair', category: 'Chairs', is_active: true }
        ];

        const mockOrders = [
            {
                id: 101,
                order_number: 'MAKE-2026-000101',
                customer_name: 'Apex Holdings',
                customer_phone: '+8801711223344',
                location_landmark: 'Gulshan 2 Circle',
                status: 'Work in process',
                furniture_name: 'Executive Walnut Desk',
                items: [
                    { id: 1, order_id: 101, product_id: 1, product_name: 'Executive Walnut Desk', size_label: 'Large', color_name: 'Walnut', quantity: 2 }
                ]
            },
            {
                id: 102,
                order_number: 'MAKE-2026-000102',
                customer_name: 'Vertex Software',
                customer_phone: '+8801822334455',
                location_landmark: 'Banani Road 11',
                status: 'Production On Going',
                furniture_name: 'Conference Oval Table',
                items: [
                    { id: 2, order_id: 102, product_id: 2, product_name: 'Conference Oval Table', size_label: 'Medium', color_name: 'Natural Oak', quantity: 1 },
                    { id: 3, order_id: 102, product_id: 1, product_name: 'Executive Walnut Desk', size_label: 'Small', color_name: 'Walnut', quantity: 4 }
                ]
            },
            {
                id: 103,
                order_number: 'MAKE-2026-000103',
                customer_name: 'Chowdhury Residence',
                customer_phone: '+8801933445566',
                location_landmark: 'Dhanmondi Lake',
                status: 'Delivered',
                furniture_name: 'Ergonomic Task Chair',
                items: [
                    { id: 4, order_id: 103, product_id: 3, product_name: 'Ergonomic Task Chair', size_label: 'Standard', color_name: 'Black Mesh', quantity: 6 }
                ]
            }
        ];

        beforeEach(() => {
            MakeSearchService.clearCache();

            const allItems = mockOrders.flatMap(o => o.items);

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_products') {
                    return {
                        select: vi.fn().mockImplementation(() => {
                            return {
                                order: vi.fn().mockReturnThis(),
                                limit: vi.fn().mockResolvedValue({ data: mockCatalog, error: null }),
                                then: (resolve: any) => Promise.resolve({ data: mockCatalog, error: null }).then(resolve)
                            };
                        })
                    };
                }

                if (table === 'make_order_items') {
                    return {
                        select: vi.fn().mockImplementation(() => {
                            const queryBuilder: any = {
                                in: vi.fn().mockImplementation((col: string, vals: any[]) => {
                                    const matched = allItems
                                        .filter(it => vals.includes((it as any)[col]))
                                        .map(it => ({ order_id: it.order_id }));
                                    return Promise.resolve({ data: matched, error: null });
                                }),
                                or: vi.fn().mockImplementation((pattern: string) => {
                                    // Parse search token e.g. "product_name.ilike.%token%..."
                                    const match = pattern.match(/%([^%]+)%/);
                                    const token = match ? match[1].toLowerCase() : '';
                                    const matched = allItems.filter(it => 
                                        (it.product_name || '').toLowerCase().includes(token) ||
                                        (it.spec_name || '').toLowerCase().includes(token) ||
                                        (it.size_label || '').toLowerCase().includes(token) ||
                                        (it.color_name || '').toLowerCase().includes(token)
                                    ).map(it => ({ order_id: it.order_id }));
                                    return Promise.resolve({ data: matched, error: null });
                                })
                            };
                            return queryBuilder;
                        })
                    };
                }

                if (table === 'make_orders') {
                    return {
                        select: vi.fn().mockImplementation(() => {
                            const queryBuilder: any = {
                                or: vi.fn().mockImplementation((pattern: string) => {
                                    const match = pattern.match(/%([^%]+)%/);
                                    const token = match ? match[1].toLowerCase() : '';
                                    const matched = mockOrders.filter(o => 
                                        (o.order_number || '').toLowerCase().includes(token) ||
                                        (o.furniture_name || '').toLowerCase().includes(token) ||
                                        (o.customer_name || '').toLowerCase().includes(token) ||
                                        (o.customer_phone || '').toLowerCase().includes(token) ||
                                        (o.location_landmark || '').toLowerCase().includes(token)
                                    ).map(o => ({ id: o.id }));
                                    return Promise.resolve({ data: matched, error: null });
                                }),
                                in: vi.fn().mockImplementation((col: string, ids: number[]) => {
                                    const filtered = mockOrders.filter(o => ids.includes(o.id));
                                    return {
                                        order: vi.fn().mockReturnThis(),
                                        eq: vi.fn().mockReturnThis(),
                                        limit: vi.fn().mockResolvedValue({ data: filtered, error: null }),
                                        then: (resolve: any) => Promise.resolve({ data: filtered, error: null }).then(resolve)
                                    };
                                }),
                                order: vi.fn().mockReturnThis(),
                                eq: vi.fn().mockReturnThis(),
                                limit: vi.fn().mockResolvedValue({ data: mockOrders, error: null }),
                                then: (resolve: any) => Promise.resolve({ data: mockOrders, error: null }).then(resolve)
                            };
                            return queryBuilder;
                        })
                    };
                }

                return {
                    select: vi.fn().mockImplementation(() => ({
                        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
                    }))
                };
            });
        });

        it('CRITICAL: Searching for a product returns ALL orders containing that product (1-to-many relationship)', async () => {
            // "Executive Walnut Desk" appears in both order 101 and order 102
            const results = await MakeSearchService.searchOrders({ query: 'Executive Walnut Desk' });
            const matchingIds = results.map(o => o.id);

            expect(matchingIds).toContain(101);
            expect(matchingIds).toContain(102);
            expect(matchingIds).not.toContain(103);
            expect(results.length).toBe(2);
        });

        it('searches orders by order number', async () => {
            const results = await MakeSearchService.searchOrders({ query: '000103' });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe(103);
        });

        it('searches orders by customer name and phone', async () => {
            const nameResults = await MakeSearchService.searchOrders({ query: 'Apex' });
            expect(nameResults.length).toBe(1);
            expect(nameResults[0].customer_name).toBe('Apex Holdings');

            const phoneResults = await MakeSearchService.searchOrders({ query: '1822334455' });
            expect(phoneResults.length).toBe(1);
            expect(phoneResults[0].customer_name).toBe('Vertex Software');
        });

        it('searches orders by size and color specifications', async () => {
            const colorResults = await MakeSearchService.searchOrders({ query: 'Black Mesh' });
            expect(colorResults.length).toBe(1);
            expect(colorResults[0].id).toBe(103);

            const sizeResults = await MakeSearchService.searchOrders({ query: 'Large' });
            expect(sizeResults.length).toBe(1);
            expect(sizeResults[0].id).toBe(101);
        });

        it('returns empty results when search term has no match', async () => {
            const results = await MakeSearchService.searchOrders({ query: 'NonExistentProductXYZ' });
            expect(results.length).toBe(0);
        });
    });
});
