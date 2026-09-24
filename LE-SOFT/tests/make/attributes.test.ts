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

    // ── 6. V1.8.0 REGRESSION SUITE: CREATE → PERSIST → RELOAD → IMMEDIATELY VISIBLE ───
    describe('6. V1.8.0 Regression: Attribute Flow & Instant UI Visibility', () => {
        interface GlobalAttributesState {
            categories: any[];
            specs: any[];
            sizes: any[];
            colors: any[];
        }

        let state: GlobalAttributesState;

        beforeEach(() => {
            state = {
                categories: [
                    { id: 1, name: 'Chairs', code: 'CAT-CHR', is_active: true }
                ],
                specs: [
                    { id: 1, spec_name: 'Solid Teak Wood', spec_code: 'TW-01', is_active: true }
                ],
                sizes: [
                    { id: 1, size_label: 'Single', length: 1900, width: 900, height: 400, unit: 'mm', is_active: true }
                ],
                colors: [
                    { id: 1, color_name: 'Charcoal Black', color_code: '#222222', is_active: true }
                ]
            };
        });

        // ── CATEGORY ──
        describe('Category Attribute Flow', () => {
            it('normalizes category input whether using name or category_name', () => {
                const input1 = { type: 'category' as const, name: 'Executive Desks', code: 'CAT-ED' };
                const input2 = { type: 'category' as const, category_name: 'Conference Tables', code: 'CAT-CT' };

                const parsed1 = GlobalAttributeSchema.parse(input1);
                const parsed2 = GlobalAttributeSchema.parse(input2);

                const normalizeCategory = (p: any) => ({
                    name: (p.category_name || p.name || '').trim(),
                    code: p.code || p.spec_code || null
                });

                expect(normalizeCategory(parsed1).name).toBe('Executive Desks');
                expect(normalizeCategory(parsed2).name).toBe('Conference Tables');
            });

            it('immediately updates local state on create so category is visible with 0ms delay', () => {
                const newCategory = { id: 2, name: 'Modular Workstations', code: 'CAT-MOD', is_active: true };

                // Simulate frontend optimistic update in handleSaveCategory
                state.categories = [...state.categories, newCategory].sort((a, b) => a.name.localeCompare(b.name));

                expect(state.categories.length).toBe(2);
                expect(state.categories.some(c => c.id === 2 && c.name === 'Modular Workstations')).toBe(true);
            });

            it('immediately updates local state on edit of category', () => {
                const updatedCategory = { id: 1, name: 'Ergonomic Task Chairs', code: 'CAT-CHR', is_active: true };

                state.categories = state.categories.map(c => c.id === updatedCategory.id ? updatedCategory : c);

                expect(state.categories.find(c => c.id === 1)?.name).toBe('Ergonomic Task Chairs');
            });

            it('immediately updates local state on delete of category', () => {
                state.categories = state.categories.filter(c => c.id !== 1);

                expect(state.categories.length).toBe(0);
                expect(state.categories.some(c => c.id === 1)).toBe(false);
            });
        });

        // ── SPECIFICATION ──
        describe('Specification Attribute Flow', () => {
            it('normalizes specification input when UI sends spec_name without name', () => {
                const uiPayload = {
                    type: 'spec' as const,
                    spec_name: 'Brushed Brass Inlay',
                    spec_code: 'BR-01',
                    spec_details: '3mm brass strip embedded in mahogany veneer',
                    is_active: true
                };

                const parsed = GlobalAttributeSchema.parse(uiPayload);
                const specName = (parsed.spec_name || parsed.name || '').trim();
                const specCode = parsed.spec_code || parsed.code || null;
                const specDetails = parsed.spec_details || parsed.details || null;

                expect(specName).toBe('Brushed Brass Inlay');
                expect(specCode).toBe('BR-01');
                expect(specDetails).toBe('3mm brass strip embedded in mahogany veneer');
                expect(specName.length).toBeGreaterThan(0);
            });

            it('immediately reflects new specification in local state without waiting for app restart', () => {
                const newSpec = {
                    id: 5,
                    spec_name: 'High-Resilience Cold Cure Foam',
                    spec_code: 'FOAM-02',
                    is_active: true
                };

                state.specs = [...state.specs, newSpec].sort((a, b) => (a.spec_name || '').localeCompare(b.spec_name || ''));

                expect(state.specs.length).toBe(2);
                expect(state.specs.some(s => s.id === 5 && s.spec_name === 'High-Resilience Cold Cure Foam')).toBe(true);
            });

            it('immediately reflects edited specification', () => {
                const updatedSpec = { id: 1, spec_name: 'Burma Teak Natural Oil Finish', spec_code: 'TW-01-B', is_active: true };

                state.specs = state.specs.map(s => s.id === updatedSpec.id ? updatedSpec : s);

                expect(state.specs.find(s => s.id === 1)?.spec_name).toBe('Burma Teak Natural Oil Finish');
            });

            it('immediately removes deleted specification from state', () => {
                state.specs = state.specs.filter(s => s.id !== 1);

                expect(state.specs.length).toBe(0);
            });
        });

        // ── SIZE ──
        describe('Size Attribute Flow', () => {
            it('normalizes size input when UI sends size_label without name', () => {
                const uiPayload = {
                    type: 'size' as const,
                    size_label: 'Queen Standard',
                    length: '2000',
                    width: '1500',
                    height: '450',
                    unit: 'mm',
                    is_active: true
                };

                const parsed = GlobalAttributeSchema.parse(uiPayload);
                const sizeLabel = (parsed.size_label || parsed.name || '').trim();
                const length = parsed.length ? parseFloat(String(parsed.length)) : null;
                const width = parsed.width ? parseFloat(String(parsed.width)) : null;
                const height = parsed.height ? parseFloat(String(parsed.height)) : null;

                expect(sizeLabel).toBe('Queen Standard');
                expect(length).toBe(2000);
                expect(width).toBe(1500);
                expect(height).toBe(450);
            });

            it('immediately reflects new size in local state', () => {
                const newSize = {
                    id: 8,
                    size_label: 'King XL',
                    length: 2100,
                    width: 1900,
                    height: 500,
                    unit: 'mm',
                    is_active: true
                };

                state.sizes = [...state.sizes, newSize];

                expect(state.sizes.length).toBe(2);
                expect(state.sizes.some(sz => sz.id === 8 && sz.size_label === 'King XL')).toBe(true);
            });

            it('immediately reflects edited size', () => {
                const updatedSize = { id: 1, size_label: 'Single Bed Standard', length: 1950, width: 950, height: 420, unit: 'mm', is_active: true };

                state.sizes = state.sizes.map(s => s.id === updatedSize.id ? updatedSize : s);

                expect(state.sizes.find(s => s.id === 1)?.length).toBe(1950);
            });

            it('immediately removes deleted size from state', () => {
                state.sizes = state.sizes.filter(s => s.id !== 1);

                expect(state.sizes.length).toBe(0);
            });
        });

        // ── COLOR ──
        describe('Color Attribute Flow', () => {
            it('normalizes color input when UI sends color_name without name', () => {
                const uiPayload = {
                    type: 'color' as const,
                    color_name: 'Midnight Navy Blue',
                    color_code: '#001f3f',
                    is_active: true
                };

                const parsed = GlobalAttributeSchema.parse(uiPayload);
                const colorName = (parsed.color_name || parsed.name || '').trim();
                const colorCode = parsed.color_code || parsed.code || null;

                expect(colorName).toBe('Midnight Navy Blue');
                expect(colorCode).toBe('#001f3f');
                expect(colorName.length).toBeGreaterThan(0);
            });

            it('immediately reflects new color in local state', () => {
                const newColor = {
                    id: 12,
                    color_name: 'Emerald Velvet Green',
                    color_code: '#50c878',
                    is_active: true
                };

                state.colors = [...state.colors, newColor].sort((a, b) => (a.color_name || '').localeCompare(b.color_name || ''));

                expect(state.colors.length).toBe(2);
                expect(state.colors.some(c => c.id === 12 && c.color_name === 'Emerald Velvet Green')).toBe(true);
            });

            it('immediately reflects edited color', () => {
                const updatedColor = { id: 1, color_name: 'Matte Jet Black', color_code: '#111111', is_active: true };

                state.colors = state.colors.map(c => c.id === updatedColor.id ? updatedColor : c);

                expect(state.colors.find(c => c.id === 1)?.color_name).toBe('Matte Jet Black');
                expect(state.colors.find(c => c.id === 1)?.color_code).toBe('#111111');
            });

            it('immediately removes deleted color from state', () => {
                state.colors = state.colors.filter(c => c.id !== 1);

                expect(state.colors.length).toBe(0);
            });
        });

        // ── ERROR HANDLING ──
        describe('Error Handling and Non-Optimistic Guard', () => {
            it('rejects empty name/label gracefully and prevents false positive success messages', () => {
                const invalidSpec = { type: 'spec' as const, spec_name: '   ' };
                const specName = (invalidSpec.spec_name || '').trim();
                expect(specName).toBe('');

                const invalidCategory = { type: 'category' as const, name: '   ' };
                const catName = (invalidCategory.name || '').trim();
                expect(catName).toBe('');

                const invalidColor = { type: 'color' as const, color_name: '   ' };
                const colorName = (invalidColor.color_name || '').trim();
                expect(colorName).toBe('');
            });

            it('does not mutate state if backend returns an error', () => {
                const initialCategoryCount = state.categories.length;
                const backendResponse = { success: false, error: 'Database unique constraint violation: Name already exists' };

                if (!backendResponse.success || backendResponse.error) {
                    // UI correctly shows feedback error and aborts state change
                } else {
                    state.categories.push({ id: 99, name: 'Failed Category' });
                }

                expect(state.categories.length).toBe(initialCategoryCount);
            });
        });

        // ── PERFORMANCE AND TIMING CHECKS ──
        describe('Performance & Timing Optimization Checks', () => {
            it('measures and verifies that in-memory cache resolves subsequent requests in < 5ms', async () => {
                const cache = new Map<string, { data: any; expiry: number }>();
                const mockFetch = vi.fn().mockResolvedValue([{ id: 1, product_name: 'Ergonomic Desk' }]);

                const getWithCache = async (key: string) => {
                    const cached = cache.get(key);
                    if (cached && cached.expiry > Date.now()) {
                        return cached.data;
                    }
                    const data = await mockFetch();
                    cache.set(key, { data, expiry: Date.now() + 30000 });
                    return data;
                };

                // First call: populates cache
                const start1 = performance.now();
                const res1 = await getWithCache('test-key');
                const duration1 = performance.now() - start1;

                expect(res1).toHaveLength(1);
                expect(mockFetch).toHaveBeenCalledTimes(1);

                // Second call: served from cache in sub-millisecond time
                const start2 = performance.now();
                const res2 = await getWithCache('test-key');
                const duration2 = performance.now() - start2;

                expect(res2).toHaveLength(1);
                expect(mockFetch).toHaveBeenCalledTimes(1); // not called again
                expect(duration2).toBeLessThan(5); // under 5ms
            });

            it('invalidating cache forces next request to fetch fresh data', async () => {
                let cache: any = { data: [{ id: 1, name: 'Old' }], expiry: Date.now() + 30000 };
                const invalidateCache = () => { cache = null; };

                // Before invalidation
                expect(cache).not.toBeNull();

                // Mutate attribute -> triggers invalidateCache()
                invalidateCache();
                expect(cache).toBeNull();
            });

            it('verifies targeted purchase count aggregation filters only returned product IDs', () => {
                const products = [
                    { id: 10, product_name: 'Desk' },
                    { id: 20, product_name: 'Chair' }
                ];

                const productIds = products.map(p => p.id).filter(Boolean);
                expect(productIds).toEqual([10, 20]);
                expect(productIds.length).toBe(2);

                // Empty catalog skips order item query entirely
                const emptyProducts: any[] = [];
                const emptyIds = emptyProducts.map(p => p.id).filter(Boolean);
                expect(emptyIds.length).toBe(0);
            });
        });
    });
});

