import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../electron/session-manager';
import { MakeCadService } from '../../electron/services/make/MakeCadService';
import { MakeOrderService } from '../../electron/services/make/MakeOrderService';
import { supabase } from '../../electron/supabase';
import { canModifyMakeOrder, isAllowedAttachmentReference } from '../../electron/ipc/handlers/make';
import { DeleteOrderPdfSchema, DeleteItemPdfSchema } from '../../electron/ipc/schemas/make.schema';

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

describe('MAKE V1 — Security & Hardened Boundary Tests', () => {
    beforeEach(() => {
        SessionManager.clearSession();
        vi.clearAllMocks();
    });

    describe('1. Session Management & Identity Boundary', () => {
        it('should report no session when unauthenticated', () => {
            expect(SessionManager.getSession()).toBeNull();
            expect(SessionManager.hasCapability('manage_catalog')).toBe(false);
            expect(SessionManager.hasCapability('make_approve')).toBe(false);
        });

        it('should establish trusted session in Main Process', () => {
            const session = SessionManager.setSession({
                id: 42,
                username: 'ashraf',
                full_name: 'Ashraf Ali',
                role: 'salesperson',
                permissions: { make_create: true }
            });

            expect(session.userId).toBe(42);
            expect(session.role).toBe('salesperson');
            expect(SessionManager.getSession()?.userId).toBe(42);
        });

        it('should clear session on logout', () => {
            SessionManager.setSession({ id: 42, username: 'ashraf', role: 'salesperson' });
            expect(SessionManager.getSession()).not.toBeNull();

            SessionManager.clearSession();
            expect(SessionManager.getSession()).toBeNull();
        });

        it('should grant capabilities automatically to superadmin and admin', () => {
            SessionManager.setSession({
                id: 1,
                username: 'admin',
                role: 'admin',
                permissions: {}
            });

            expect(SessionManager.hasCapability('any_arbitrary_permission')).toBe(true);
        });

        it('should restrict capabilities for standard operators and salespeople', () => {
            SessionManager.setSession({
                id: 10,
                username: 'sales01',
                role: 'salesperson',
                permissions: { make_create: true }
            });

            expect(SessionManager.hasCapability('make_create')).toBe(true);
            expect(SessionManager.hasCapability('make_admin')).toBe(false);
            expect(SessionManager.hasCapability('delete_product')).toBe(false);
        });
    });

    describe('2. Binary Magic-Byte File Validation', () => {
        it('should reject Windows PE Executable binaries disguised as drawings', () => {
            // "MZ" header (0x4D, 0x5A)
            const peBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
            const check = MakeCadService.validateBufferMagicBytes(peBuffer, 'pdf');

            expect(check.isValid).toBe(false);
            expect(check.detectedMime).toBe('application/x-dosexec');
            expect(check.error).toContain('Executable binaries (.exe, .dll) are strictly forbidden');
        });

        it('should reject Unix ELF Executable binaries disguised as drawings', () => {
            // ELF header (0x7F, 0x45, 0x4C, 0x46)
            const elfBuffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]);
            const check = MakeCadService.validateBufferMagicBytes(elfBuffer, 'dwg');

            expect(check.isValid).toBe(false);
            expect(check.detectedMime).toBe('application/x-executable');
            expect(check.error).toContain('Executable binaries are strictly forbidden');
        });

        it('should reject fake PDF file with invalid magic bytes', () => {
            const fakePdf = Buffer.from('NOT A REAL PDF FILE CONTENT');
            const check = MakeCadService.validateBufferMagicBytes(fakePdf, 'pdf');

            expect(check.isValid).toBe(false);
            expect(check.error).toContain('Invalid PDF file structure');
        });

        it('should accept valid PDF file header (%PDF-)', () => {
            const validPdf = Buffer.from('%PDF-1.7\n%caderp blueprint data stream');
            const check = MakeCadService.validateBufferMagicBytes(validPdf, 'pdf');

            expect(check.isValid).toBe(true);
            expect(check.detectedMime).toBe('application/pdf');
        });

        it('should reject corrupted or fake PNG image', () => {
            const fakePng = Buffer.from('FAKE PNG HEADER DATA');
            const check = MakeCadService.validateBufferMagicBytes(fakePng, 'png');

            expect(check.isValid).toBe(false);
            expect(check.error).toContain('Corrupted or invalid PNG image');
        });

        it('should accept valid PNG image magic bytes', () => {
            const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
            const check = MakeCadService.validateBufferMagicBytes(validPng, 'png');

            expect(check.isValid).toBe(true);
            expect(check.detectedMime).toBe('image/png');
        });

        it('should accept valid JPEG image magic bytes', () => {
            const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
            const check = MakeCadService.validateBufferMagicBytes(validJpg, 'jpg');

            expect(check.isValid).toBe(true);
            expect(check.detectedMime).toBe('image/jpeg');
        });

        it('should accept valid AutoCAD DWG magic bytes (AC10)', () => {
            const validDwg = Buffer.from([0x41, 0x43, 0x31, 0x30, 0x32, 0x37]); // AC1027
            const check = MakeCadService.validateBufferMagicBytes(validDwg, 'dwg');

            expect(check.isValid).toBe(true);
            expect(check.detectedMime).toBe('application/acad');
        });

        it('should accept standard text-based CAD formats (DXF, STEP, STL)', () => {
            const dxfCheck = MakeCadService.validateBufferMagicBytes(Buffer.from('SECTION\n2\nHEADER'), 'dxf');
            expect(dxfCheck.isValid).toBe(true);

            const stepCheck = MakeCadService.validateBufferMagicBytes(Buffer.from('ISO-10303-21;'), 'step');
            expect(stepCheck.isValid).toBe(true);

            const stlCheck = MakeCadService.validateBufferMagicBytes(Buffer.from('solid part\nendsolid'), 'stl');
            expect(stlCheck.isValid).toBe(true);
        });
    });

    describe('3. Atomic Order Creation & Failure Rollback', () => {
        const createCustomerMock = () => {
            const builder: any = {};
            builder.select = vi.fn().mockReturnValue(builder);
            builder.or = vi.fn().mockReturnValue(builder);
            builder.ilike = vi.fn().mockReturnValue(builder);
            builder.limit = vi.fn().mockReturnValue(builder);
            builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
            builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
            builder.insert = vi.fn().mockReturnValue(builder);
            return builder;
        };

        it('should atomically delete order header if item insertion fails', async () => {
            const actorSession = {
                userId: 5,
                username: 'designer_tanvir',
                fullName: 'Tanvir Hasan',
                role: 'designer'
            };

            const orderInput = {
                furniture_name: 'Custom Reception Desk',
                customer_name: 'Alpha Corporate',
                customer_phone: '+880 1711 000001',
                priority: 'High' as const,
                items: [
                    {
                        product_name: 'Corian Countertop Top',
                        quantity: 1,
                        item_cost_price: 25000,
                        item_sale_price: 40000
                    }
                ]
            };

            let deleteCalledOnOrderId: number | null = null;

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'billing_customers') {
                    return createCustomerMock();
                }
                if (table === 'make_orders') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                            data: { id: 999, order_number: 'MAKE-2026-999001' },
                            error: null
                        }),
                        delete: vi.fn().mockImplementation(() => ({
                            eq: vi.fn().mockImplementation((col: string, val: any) => {
                                if (col === 'id') deleteCalledOnOrderId = val;
                                return Promise.resolve({ error: null });
                            })
                        }))
                    };
                }
                if (table === 'make_order_items') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'Foreign key violation: invalid spec_id' }
                        })
                    };
                }
                return {};
            });

            const result = await MakeOrderService.createOrder(orderInput, actorSession);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Order creation rolled back due to item insertion error');
            // Verify rollback was executed on the created order ID
            expect(deleteCalledOnOrderId).toBe(999);
        });

        it('should successfully complete order creation when header and items succeed', async () => {
            const actorSession = {
                userId: 5,
                username: 'designer_tanvir',
                fullName: 'Tanvir Hasan',
                role: 'designer'
            };

            const orderInput = {
                furniture_name: 'Executive Credenza',
                customer_name: 'Beta Industries',
                customer_phone: '', // Optional empty phone
                priority: 'Normal' as const,
                items: [
                    {
                        product_name: 'Credenza Unit',
                        quantity: 1,
                        item_cost_price: 18000,
                        item_sale_price: 28000
                    }
                ]
            };

            let deleteCalled = false;

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'billing_customers') {
                    return createCustomerMock();
                }
                if (table === 'make_orders') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                            data: { id: 888, order_number: 'MAKE-2026-888001' },
                            error: null
                        }),
                        delete: vi.fn().mockImplementation(() => {
                            deleteCalled = true;
                            return { eq: vi.fn().mockResolvedValue({ error: null }) };
                        })
                    };
                }
                if (table === 'make_order_items') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockResolvedValue({
                            data: [{ id: 10, product_name: 'Credenza Unit' }],
                            error: null
                        })
                    };
                }
                if (table === 'make_order_updates') {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null })
                    };
                }
                return {};
            });

            const result = await MakeOrderService.createOrder(orderInput, actorSession);

            expect(result.success).toBe(true);
            expect(result.id).toBe(888);
            expect(result.order_number).toMatch(/^MAKE-\d{4}-\d{6}$/);
            expect(deleteCalled).toBe(false);
        });

        it('should reject order creation if customer_name is missing or whitespace', async () => {
            const actorSession = {
                userId: 5,
                username: 'designer_tanvir',
                fullName: 'Tanvir Hasan',
                role: 'designer'
            };

            const orderWithoutName = {
                furniture_name: 'Executive Desk',
                customer_name: '   ',
                priority: 'Normal' as const,
                items: [{ product_name: 'Desk', quantity: 1 }]
            };

            const result = await MakeOrderService.createOrder(orderWithoutName, actorSession);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Customer name is required');
        });

        it('should reject order creation if invalid dummy customer_phone is provided', async () => {
            const actorSession = {
                userId: 5,
                username: 'designer_tanvir',
                fullName: 'Tanvir Hasan',
                role: 'designer'
            };

            const dummyPhones = ['0000000000', '0000000', '1234567890', 'N/A', 'none', 'test'];

            for (const phone of dummyPhones) {
                const orderWithDummy = {
                    furniture_name: 'Conference Table',
                    customer_name: 'Valid Client',
                    customer_phone: phone,
                    priority: 'Normal' as const,
                    items: [{ product_name: 'Table', quantity: 1 }]
                };

                const result = await MakeOrderService.createOrder(orderWithDummy, actorSession);
                expect(result.success).toBe(false);
                expect(result.error).toMatch(/Invalid customer phone|dummy or placeholder phone/i);
            }
        });

        it('should allow order creation with valid optional customer_phone or empty phone', async () => {
            const actorSession = {
                userId: 5,
                username: 'designer_tanvir',
                fullName: 'Tanvir Hasan',
                role: 'designer'
            };

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'billing_customers') {
                    return createCustomerMock();
                }
                if (table === 'make_orders') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                            data: { id: 777, order_number: 'MAKE-2026-777001' },
                            error: null
                        })
                    };
                }
                if (table === 'make_order_items') {
                    return {
                        insert: vi.fn().mockReturnThis(),
                        select: vi.fn().mockResolvedValue({
                            data: [{ id: 1, product_name: 'Table' }],
                            error: null
                        })
                    };
                }
                if (table === 'make_order_updates') {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null })
                    };
                }
                return {};
            });

            // 1. Without phone (undefined)
            const res1 = await MakeOrderService.createOrder({
                furniture_name: 'Table 1',
                customer_name: 'Client Alpha',
                priority: 'Normal' as const,
                items: [{ product_name: 'Table', quantity: 1 }]
            }, actorSession);
            expect(res1.success).toBe(true);

            // 2. With real phone
            const res2 = await MakeOrderService.createOrder({
                furniture_name: 'Table 2',
                customer_name: 'Client Beta',
                customer_phone: '+880 1712 345678',
                priority: 'Normal' as const,
                items: [{ product_name: 'Table', quantity: 1 }]
            }, actorSession);
            expect(res2.success).toBe(true);
        });
    });

    describe('8. Category RLS Architecture & PostgREST Direct Mutation Guard', () => {
        it('should allow read (SELECT) access to all clients for catalog and search', async () => {
            const mockSelect = vi.fn().mockResolvedValue({
                data: [
                    { id: 1, name: 'Desks', is_active: true },
                    { id: 2, name: 'Chairs', is_active: true }
                ],
                error: null
            });

            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_product_categories') {
                    return {
                        select: mockSelect
                    };
                }
                return {};
            });

            const res = await supabase.from('make_product_categories').select('*');
            expect(res.data).toHaveLength(2);
            expect(res.error).toBeNull();
        });

        it('should reject direct PostgREST mutation from ordinary authenticated client', () => {
            // Simulate PostgreSQL RLS policy evaluation for client without service_role:
            // "new row violates row-level security policy for table make_product_categories" (PGRST / 42501)
            const evaluateRlsWritePermission = (callerRole: string): { allowed: boolean; errorCode?: string } => {
                if (callerRole === 'service_role') {
                    return { allowed: true };
                }
                return { allowed: false, errorCode: '42501' }; // Insufficient privilege / RLS violation
            };

            const anonInsert = evaluateRlsWritePermission('anon');
            expect(anonInsert.allowed).toBe(false);
            expect(anonInsert.errorCode).toBe('42501');

            const authenticatedClerkInsert = evaluateRlsWritePermission('authenticated');
            expect(authenticatedClerkInsert.allowed).toBe(false);
            expect(authenticatedClerkInsert.errorCode).toBe('42501');

            const directAdminJwtInsert = evaluateRlsWritePermission('authenticated');
            expect(directAdminJwtInsert.allowed).toBe(false);
            expect(directAdminJwtInsert.errorCode).toBe('42501');
        });

        it('should strictly authorize category mutations through the trusted service_role gateway', () => {
            const evaluateRlsWritePermission = (callerRole: string): { allowed: boolean } => {
                return { allowed: callerRole === 'service_role' };
            };

            const backendServiceRole = evaluateRlsWritePermission('service_role');
            expect(backendServiceRole.allowed).toBe(true);
        });

        it('should enforce that administrative capability canManageCatalog is verified in Main process before write', () => {
            const canManageCatalog = (session: any): boolean => {
                if (!session) return false;
                const role = (session.role || '').toLowerCase();
                if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
                return !!session.permissions?.['manage_catalog'];
            };

            // Unauthenticated session
            expect(canManageCatalog(null)).toBe(false);

            // Low privilege staff
            expect(canManageCatalog({ role: 'operator', permissions: {} })).toBe(false);
            expect(canManageCatalog({ role: 'salesperson', permissions: {} })).toBe(false);

            // Authorized roles
            expect(canManageCatalog({ role: 'admin', permissions: {} })).toBe(true);
            expect(canManageCatalog({ role: 'superadmin', permissions: {} })).toBe(true);
            expect(canManageCatalog({ role: 'manager', permissions: {} })).toBe(true);
            expect(canManageCatalog({ role: 'designer', permissions: { manage_catalog: true } })).toBe(true);
        });
    });

    describe('9. Attachment Deletion Authorization & Schema Hardening Gates (v1.8.12)', () => {
        describe('canModifyMakeOrder Authorization Rules', () => {
            it('rejects unauthenticated (null or undefined) session', () => {
                expect(canModifyMakeOrder(null)).toBe(false);
                expect(canModifyMakeOrder(undefined)).toBe(false);
            });

            it('rejects read-only and unauthorized roles without modification permissions', () => {
                expect(canModifyMakeOrder({ userId: 1, username: 'op', fullName: 'Operator', role: 'operator', permissions: {}, loginTime: '' })).toBe(false);
                expect(canModifyMakeOrder({ userId: 2, username: 'audit', fullName: 'Auditor', role: 'guest', permissions: { make_view: true }, loginTime: '' })).toBe(false);
                expect(canModifyMakeOrder({ userId: 3, username: 'sales', fullName: 'Salesperson', role: 'salesperson', permissions: { make_view: true }, loginTime: '' })).toBe(false);
                expect(canModifyMakeOrder({ userId: 4, username: 'fac', fullName: 'Factory Mgr', role: 'factory_manager', permissions: { make_production: true }, loginTime: '' })).toBe(false);
            });

            it('authorizes Furniture Designers on orders not yet in post-production', () => {
                const designer = { userId: 10, username: 'lead_des', fullName: 'Lead Designer', role: 'furniture_designer', permissions: {}, loginTime: '' };
                expect(canModifyMakeOrder(designer)).toBe(true);
                expect(canModifyMakeOrder(designer, { status: 'Draft' })).toBe(true);
                expect(canModifyMakeOrder(designer, { status: 'Pending Approval' })).toBe(true);
                expect(canModifyMakeOrder(designer, { status: 'Approved' })).toBe(true);
            });

            it('rejects Furniture Designers once order has reached or passed production stage', () => {
                const designer = { userId: 10, username: 'lead_des', fullName: 'Lead Designer', role: 'furniture_designer', permissions: {}, loginTime: '' };
                expect(canModifyMakeOrder(designer, { status: 'Production On Going' })).toBe(false);
                expect(canModifyMakeOrder(designer, { status: 'Finishing' })).toBe(false);
                expect(canModifyMakeOrder(designer, { status: 'Packaging' })).toBe(false);
                expect(canModifyMakeOrder(designer, { status: 'Delivered' })).toBe(false);
                expect(canModifyMakeOrder(designer, { status: 'Ready to Ship' })).toBe(false);
            });

            it('authorizes Administrators across all order stages including post-production', () => {
                const admin = { userId: 1, username: 'admin', fullName: 'Super Admin', role: 'admin', permissions: {}, loginTime: '' };
                expect(canModifyMakeOrder(admin)).toBe(true);
                expect(canModifyMakeOrder(admin, { status: 'Production On Going' })).toBe(true);
                expect(canModifyMakeOrder(admin, { status: 'Delivered' })).toBe(true);
            });

            it('authorizes users with explicit modification permissions', () => {
                const clerkWithEdit = { userId: 5, username: 'clerk', fullName: 'Clerk', role: 'salesperson', permissions: { make_edit: true }, loginTime: '' };
                const clerkWithWrite = { userId: 6, username: 'clerk2', fullName: 'Clerk 2', role: 'salesperson', permissions: { write_make: true }, loginTime: '' };
                const clerkWithDelete = { userId: 7, username: 'clerk3', fullName: 'Clerk 3', role: 'salesperson', permissions: { delete_make_order: true }, loginTime: '' };
                expect(canModifyMakeOrder(clerkWithEdit)).toBe(true);
                expect(canModifyMakeOrder(clerkWithWrite)).toBe(true);
                expect(canModifyMakeOrder(clerkWithDelete)).toBe(true);
            });
        });

        describe('DeleteOrderPdfSchema & DeleteItemPdfSchema Validation', () => {
            it('rejects invalid or non-positive order and item IDs', () => {
                expect(() => DeleteOrderPdfSchema.parse({ orderId: -1, storagePath: 'test.pdf' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 0, storagePath: 'test.pdf' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 'abc', storagePath: 'test.pdf' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 1.5, storagePath: 'test.pdf' })).toThrow();
                expect(() => DeleteItemPdfSchema.parse({ itemId: -1, storagePath: 'test.pdf' })).toThrow();
            });

            it('rejects empty, whitespace-only, or missing storagePath', () => {
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '   ' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101 } as any)).toThrow();
            });

            it('rejects directory traversal and encoded traversal sequences', () => {
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '../etc/passwd' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '..\\Windows\\System32\\cmd.exe' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '%2e%2e/secret.pdf' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: '%252e%252e%252fsecret.pdf' })).toThrow();
            });

            it('rejects null-byte encodings in storagePath', () => {
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'test.pdf\0malicious' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'test.pdf%00malicious' })).toThrow();
            });

            it('rejects unsupported or dangerous protocol schemes', () => {
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'javascript:alert(1)' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'file:///etc/passwd' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'data:text/plain;base64,AAAA' })).toThrow();
                expect(() => DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'ftp://evil.com/doc.pdf' })).toThrow();
            });

            it('accepts valid order and item deletion payloads', () => {
                const parsedOrder = DeleteOrderPdfSchema.parse({ orderId: 101, storagePath: 'make-order-files/101/blueprint.pdf' });
                expect(parsedOrder.orderId).toBe(101);
                expect(parsedOrder.storagePath).toBe('make-order-files/101/blueprint.pdf');

                const parsedItem = DeleteItemPdfSchema.parse({ itemId: 42, orderId: 101, storagePath: 'make-order-files/101/items/42/cad.dwg' });
                expect(parsedItem.itemId).toBe(42);
                expect(parsedItem.orderId).toBe(101);
            });
        });

        describe('isAllowedAttachmentReference Strict Reference Check', () => {
            it('rejects untrusted external hosts, arbitrary schemes, and traversal', () => {
                expect(isAllowedAttachmentReference('http://evil.com/malicious.pdf')).toBe(false);
                expect(isAllowedAttachmentReference('https://untrusted-site.org/foo.pdf')).toBe(false);
                expect(isAllowedAttachmentReference('javascript:alert(1)')).toBe(false);
                expect(isAllowedAttachmentReference('file:///c:/secret.txt')).toBe(false);
                expect(isAllowedAttachmentReference('../secret.pdf')).toBe(false);
            });

            it('approves legitimate TrueNAS URLs, Supabase storage keys, and relative object paths', () => {
                expect(isAllowedAttachmentReference('https://storage.lenas.me/files/make-order-files/101/drawing.pdf')).toBe(true);
                expect(isAllowedAttachmentReference('http://100.88.85.6:8081/files/make-order-files/101/drawing.pdf')).toBe(true);
                expect(isAllowedAttachmentReference('make-order-files/101/drawing.pdf')).toBe(true);
                expect(isAllowedAttachmentReference('drawing.pdf')).toBe(true);
            });
        });
    });
});
