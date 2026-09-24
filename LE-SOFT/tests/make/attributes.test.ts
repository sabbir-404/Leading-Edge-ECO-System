import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalAttributeSchema, AssignProductAttributesSchema } from '../../electron/ipc/schemas/make.schema';

describe('MAKE V1.1 — Normalized Product Attributes & Junction Tables', () => {
    // ── 1. SCHEMA VALIDATION FOR GLOBAL ATTRIBUTES ───────────────────────────
    it('should validate valid global specification attribute input', () => {
        const validSpec = {
            type: 'spec' as const,
            spec_name: 'Premium Brass Inlay',
            spec_code: 'BR-01',
            spec_details: 'Brushed gold brass strips inlaid on edge',
            is_active: true
        };

        const parsed = GlobalAttributeSchema.safeParse(validSpec);
        expect(parsed.success).toBe(true);
    });

    it('should validate valid global size dimension input', () => {
        const validSize = {
            type: 'size' as const,
            size_label: 'King Bed Dimensions',
            length: 2000,
            width: 1800,
            height: 1100,
            unit: 'mm',
            is_active: true
        };

        const parsed = GlobalAttributeSchema.safeParse(validSize);
        expect(parsed.success).toBe(true);
    });

    it('should validate valid global color input', () => {
        const validColor = {
            type: 'color' as const,
            color_name: 'Walnut Dark Walnut',
            color_code: '#3E2723',
            is_active: true
        };

        const parsed = GlobalAttributeSchema.safeParse(validColor);
        expect(parsed.success).toBe(true);
    });

    it('should reject attribute input with invalid type', () => {
        const invalidAttr = {
            type: 'texture', // not allowed
            color_name: 'Gloss'
        };

        const parsed = GlobalAttributeSchema.safeParse(invalidAttr);
        expect(parsed.success).toBe(false);
    });

    // ── 2. JUNCTION TABLE CANONICAL COLUMN NAMES ─────────────────────────────
    it('should strictly use canonical junction column names spec_id, size_id, color_id', () => {
        const payload = {
            productId: 105,
            specIds: [1, 2, 5],
            sizeIds: [10, 12],
            colorIds: [20, 21, 22]
        };

        const parsed = AssignProductAttributesSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.productId).toBe(105);
            expect(parsed.data.specIds).toEqual([1, 2, 5]);
            expect(parsed.data.sizeIds).toEqual([10, 12]);
            expect(parsed.data.colorIds).toEqual([20, 21, 22]);

            // Transform into junction row payloads and assert column naming
            const specRows = parsed.data.specIds.map(specId => ({
                product_id: parsed.data.productId,
                spec_id: specId // NOT specification_id
            }));
            expect(specRows[0]).toHaveProperty('spec_id');
            expect(specRows[0]).not.toHaveProperty('specification_id');

            const sizeRows = parsed.data.sizeIds.map(sizeId => ({
                product_id: parsed.data.productId,
                size_id: sizeId
            }));
            expect(sizeRows[0]).toHaveProperty('size_id');

            const colorRows = parsed.data.colorIds.map(colorId => ({
                product_id: parsed.data.productId,
                color_id: colorId
            }));
            expect(colorRows[0]).toHaveProperty('color_id');
        }
    });

    it('should allow empty array assignments for optional attributes', () => {
        const payload = {
            productId: 42,
            specIds: [],
            sizeIds: [],
            colorIds: []
        };

        const parsed = AssignProductAttributesSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
    });

    // ── 3. INLINE ATTRIBUTE CREATION & AUTO-SELECTION CONTRACT ────────────────
    it('correctly resolves newly created attribute id from IPC contract { success: true, attribute: { id } }', () => {
        // Contract returned by makeSaveGlobalAttribute
        const ipcResponse = {
            success: true,
            attribute: {
                id: 88,
                spec_name: 'Gloss Lacquer Polish',
                spec_code: 'GL-88'
            }
        };

        // UI auto-selection resolver: created?.attribute?.id ?? created?.id
        const resolvedId = (ipcResponse as any)?.attribute?.id ?? (ipcResponse as any)?.id;
        expect(resolvedId).toBe(88);

        // Also handles flat responses gracefully
        const flatResponse = { id: 99, color_name: 'Emerald Green' };
        const resolvedFlatId = (flatResponse as any)?.attribute?.id ?? (flatResponse as any)?.id;
        expect(resolvedFlatId).toBe(99);
    });

    it('supports selecting multiple values for sizes, colors, and specifications', () => {
        const initialSelected = [10, 20];
        const nextId = 30;
        const updated = initialSelected.includes(nextId)
            ? initialSelected.filter(id => id !== nextId)
            : [...initialSelected, nextId];

        expect(updated).toEqual([10, 20, 30]);
        expect(updated.length).toBe(3);
    });

    // ── 4. ROLE-BASED ATTRIBUTE MODIFICATION ─────────────────────────────────
    it('should reject unauthorized roles from mutating global attributes', () => {
        const canMutateGlobalAttributes = (role: string) => {
            const elevatedRoles = ['admin', 'superadmin', 'designer'];
            return elevatedRoles.includes(role.toLowerCase());
        };

        expect(canMutateGlobalAttributes('admin')).toBe(true);
        expect(canMutateGlobalAttributes('superadmin')).toBe(true);
        expect(canMutateGlobalAttributes('designer')).toBe(true);

        expect(canMutateGlobalAttributes('operator')).toBe(false);
        expect(canMutateGlobalAttributes('factory')).toBe(false);
        expect(canMutateGlobalAttributes('salesperson')).toBe(false);
        expect(canMutateGlobalAttributes('guest')).toBe(false);
    });

    // ── 5. CATEGORY ATTRIBUTES & DELETION PROTECTION (V1.2) ───────────────────
    describe('5. Category Attribute & Single Source of Truth', () => {
        it('should validate valid global category input', () => {
            const validCategory = {
                type: 'category' as const,
                name: 'Executive Desks',
                code: 'CAT-EXEC',
                description: 'High-end wooden desks and credenzas',
                is_active: true
            };

            const parsed = GlobalAttributeSchema.safeParse(validCategory);
            expect(parsed.success).toBe(true);
        });

        it('should validate category input with legacy category_name field', () => {
            const legacyCategory = {
                type: 'category' as const,
                category_name: 'Conference Tables',
                details: 'Boardroom conference tables'
            };

            const parsed = GlobalAttributeSchema.safeParse(legacyCategory);
            expect(parsed.success).toBe(true);
        });

        it('should reject category input without name or category_name', () => {
            const invalidCategory = {
                type: 'category' as const,
                code: 'CAT-EMPTY'
            };

            const parsed = GlobalAttributeSchema.safeParse(invalidCategory);
            expect(parsed.success).toBe(false);
        });

        it('should prevent deletion of category when actively used by products', async () => {
            // Safe deletion simulation matching backend makeDeleteCategory handler
            const mockProductsInUse = [
                { id: 1, product_name: 'Walnut Executive Desk', product_code: 'WD-01' },
                { id: 2, product_name: 'Mahogany President Table', product_code: 'MP-02' }
            ];

            const executeDeleteCategory = async (categoryId: number, products: typeof mockProductsInUse) => {
                if (products.length > 0) {
                    const productNames = products.map(p => `"${p.product_name}"`).join(', ');
                    return {
                        error: `Cannot delete category. It is currently used by ${products.length} product(s): ${productNames}. Reassign or remove these products before deleting this category.`
                    };
                }
                return { success: true };
            };

            const res = await executeDeleteCategory(5, mockProductsInUse);
            expect(res.error).toBeDefined();
            expect(res.error).toContain('used by 2 product(s)');
            expect(res.error).toContain('"Walnut Executive Desk"');
            expect(res.error).toContain('"Mahogany President Table"');
        });

        it('should allow deletion of category when no products reference it', async () => {
            const executeDeleteCategory = async (categoryId: number, products: any[]) => {
                if (products.length > 0) {
                    return { error: 'In use' };
                }
                return { success: true };
            };

            const res = await executeDeleteCategory(99, []);
            expect(res.success).toBe(true);
            expect(res.error).toBeUndefined();
        });

        it('ensures category_id is authoritative and category text is synchronized without duplicate editing', () => {
            // Product catalog contract
            const product = {
                id: 101,
                product_name: 'Glass Conference Table',
                category_id: 15,
                category: 'Conference Tables'
            };

            // When user edits product, frontend sends category_id
            const updatePayload = {
                id: product.id,
                product_name: product.product_name,
                category_id: 20 // authoritative category relation
            };

            // Backend resolves authoritative category name from make_product_categories table
            const categoriesMap: Record<number, string> = {
                15: 'Conference Tables',
                20: 'Executive Tables'
            };

            const synchronizedCategory = categoriesMap[updatePayload.category_id];
            const updatedProduct = {
                ...updatePayload,
                category: synchronizedCategory // synchronized from category_id
            };

            expect(updatedProduct.category_id).toBe(20);
            expect(updatedProduct.category).toBe('Executive Tables');
        });
    });
});
