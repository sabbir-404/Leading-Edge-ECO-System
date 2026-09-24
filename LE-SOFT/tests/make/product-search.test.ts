import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MakeSearchService } from '../../electron/services/make/MakeSearchService';
import { supabase } from '../../electron/supabase';

vi.mock('../../electron/supabase', () => ({
    supabase: {
        from: vi.fn()
    }
}));

describe('MAKE V1.1 — Intelligent Whole-Catalog Product Search Engine', () => {
    const mockProducts = [
        {
            id: 101,
            product_code: 'M-1025',
            product_name: 'Executive Workstation Table',
            description: 'Solid teakwood executive office table with wire management',
            category: 'Office Furniture',
            main_image: 'https://storage.lenas.me/desk1.jpg',
            is_active: true,
            specifications: [
                { id: 1, spec_name: 'Premium Brass Inlay', spec_code: 'BR-01', spec_details: 'Brushed gold metal finish' }
            ],
            sizes: [
                { id: 11, size_label: 'Standard', length: 1200, width: 600, height: 750, unit: 'mm' },
                { id: 12, size_label: 'Large', length: 1500, width: 750, height: 750, unit: 'mm' }
            ],
            colors: [
                { id: 21, color_name: 'Walnut Dark', color_code: '#3E2723' },
                { id: 22, color_name: 'Black Matte', color_code: '#000000' }
            ]
        },
        {
            id: 102,
            product_code: 'WS-204',
            product_name: 'Modular Office Cubicle Desk',
            description: 'Modular metal frame desk workstation',
            category: 'Workstation',
            main_image: 'https://storage.lenas.me/desk2.jpg',
            is_active: true,
            specifications: [
                { id: 2, spec_name: 'Executive Wire Grommet', spec_code: 'WG-02', spec_details: 'Cast metal grommet' }
            ],
            sizes: [
                { id: 13, size_label: 'Compact', length: 1000, width: 500, height: 750, unit: 'mm' }
            ],
            colors: [
                { id: 23, color_name: 'Grey Industrial', color_code: '#808080' }
            ]
        },
        {
            id: 103,
            product_code: 'CH-900',
            product_name: 'Ergonomic Mesh Chair',
            description: 'Black premium mesh chair with adjustable lumbar support',
            category: 'Seating',
            main_image: 'https://storage.lenas.me/chair1.jpg',
            is_active: true,
            specifications: [
                { id: 3, spec_name: 'Premium Pneumatic Lift', spec_code: 'LIFT-01', spec_details: 'Heavy duty class-4 gas lift' }
            ],
            sizes: [],
            colors: [
                { id: 22, color_name: 'Black Matte', color_code: '#000000' }
            ]
        },
        {
            id: 104,
            product_code: 'ST-01',
            product_name: 'Round Coffee Table',
            description: 'Minimalist round wood and metal coffee table',
            category: 'Lounge',
            main_image: 'https://storage.lenas.me/table3.jpg',
            is_active: true,
            specifications: [
                { id: 4, spec_name: 'Natural Finish', spec_code: 'FIN-NAT', spec_details: 'Organic beeswax wood polish' }
            ],
            sizes: [
                { id: 14, size_label: 'Round 800', diameter: 800, height: 450, unit: 'mm' }
            ],
            colors: [
                { id: 24, color_name: 'Natural Oak', color_code: '#D2B48C' }
            ]
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        MakeSearchService.invalidateCache();

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'make_products') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue({ data: mockProducts, error: null })
                        }),
                        data: mockProducts,
                        error: null
                    })
                };
            }
            if (table === 'make_product_specification_links') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            if (table === 'make_product_size_links') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            if (table === 'make_product_color_links') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            if (table === 'make_product_specifications') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            if (table === 'make_product_sizes') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            if (table === 'make_product_colors') {
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            }
            return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        });
    });

    // ── 1. PRODUCT FIELDS SEARCH ──────────────────────────────────────────────
    it('finds products by exact product name', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'Executive Workstation Table' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(101);
        expect(results[0].product_name).toBe('Executive Workstation Table');
    });

    it('finds products by product code and model number', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'M-1025' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(101);
        expect(results[0].product_code).toBe('M-1025');
    });

    it('tolerates punctuation differences in model number ("m1025" and "M 1025")', async () => {
        const resultsStripped = await MakeSearchService.searchProducts({ query: 'm1025' });
        expect(resultsStripped.length).toBeGreaterThan(0);
        expect(resultsStripped[0].id).toBe(101);

        const resultsSpace = await MakeSearchService.searchProducts({ query: 'M 1025' });
        expect(resultsSpace.length).toBeGreaterThan(0);
        expect(resultsSpace[0].id).toBe(101);
    });

    it('finds products by category and description keywords ("teakwood", "workstation")', async () => {
        const byDesc = await MakeSearchService.searchProducts({ query: 'teakwood' });
        expect(byDesc.some(p => p.id === 101)).toBe(true);

        const byCat = await MakeSearchService.searchProducts({ query: 'Seating' });
        expect(byCat.some(p => p.id === 103)).toBe(true);
    });

    // ── 2. RELATED ATTRIBUTES SEARCH ──────────────────────────────────────────
    it('finds products through Color name match even when not in product title ("Walnut")', async () => {
        // "Walnut" is NOT in "Executive Workstation Table" title
        const results = await MakeSearchService.searchProducts({ query: 'Walnut' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(101);
        expect(results[0].matchedReasons.some(r => r.includes('Color: Walnut'))).toBe(true);
    });

    it('finds products through Size and Dimension numbers ("1200", "1200 x 600", "750")', async () => {
        const by1200 = await MakeSearchService.searchProducts({ query: '1200' });
        expect(by1200.some(p => p.id === 101)).toBe(true);
        expect(by1200[0].matchedReasons.some(r => r.includes('1200'))).toBe(true);

        const byDim = await MakeSearchService.searchProducts({ query: '1200 x 600' });
        expect(byDim.some(p => p.id === 101)).toBe(true);

        const byHeight = await MakeSearchService.searchProducts({ query: '750' });
        expect(byHeight.some(p => p.id === 101)).toBe(true);
    });

    it('finds products through Diameter dimensions ("800")', async () => {
        const results = await MakeSearchService.searchProducts({ query: '800' });
        expect(results.some(p => p.id === 104)).toBe(true);
    });

    it('finds products through Specification & Finish ("Premium", "Brass Inlay")', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'Brass Inlay' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(101);
        expect(results[0].matchedReasons.some(r => r.includes('Specification: Premium Brass Inlay'))).toBe(true);
    });

    it('finds products through Material keywords ("metal", "wood")', async () => {
        const byMetal = await MakeSearchService.searchProducts({ query: 'metal' });
        expect(byMetal.length).toBeGreaterThan(0);
        expect(byMetal.some(p => p.id === 102 || p.id === 101 || p.id === 104)).toBe(true);
    });

    // ── 3. MULTI-WORD & RELEVANCE RANKING ─────────────────────────────────────
    it('ranks products higher when matching multiple tokens across name and attributes ("black executive table")', async () => {
        // ID 101 matches: "Executive" (name), "Table" (name), "Black" (color attribute)
        // ID 103 matches: "black" (desc/color)
        const results = await MakeSearchService.searchProducts({ query: 'black executive table' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(101); // 101 must be ranked highest!
    });

    it('ranks exact code matches above partial text matches', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'WS-204' });
        expect(results[0].id).toBe(102);
        expect(results[0].score).toBeGreaterThan(1000);
    });

    it('finds products with multi-attribute query ("chair black premium")', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'chair black premium' });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe(103);
    });

    // ── 4. RESULT STRUCTURE & SANITIZATION ────────────────────────────────────
    it('returns structured, clean product result objects with match badges rather than raw database rows', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'Walnut' });
        expect(results.length).toBeGreaterThan(0);
        const item = results[0];

        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('product_name');
        expect(item).toHaveProperty('product_code');
        expect(item).toHaveProperty('matchedReasons');
        expect(item).toHaveProperty('sizes');
        expect(item).toHaveProperty('colors');
        expect(item).toHaveProperty('specifications');
        expect(Array.isArray(item.matchedReasons)).toBe(true);
        expect(item.matchedReasons.length).toBeGreaterThan(0);
    });

    it('returns empty array when no products match rather than throwing error', async () => {
        const results = await MakeSearchService.searchProducts({ query: 'nonexistent-xyz-widget-9999' });
        expect(results).toEqual([]);
    });

    // ── 5. CATEGORY ATTRIBUTE SEARCH (V1.2) ───────────────────────────────────
    describe('5. Category Attribute Search & Matched Reasons', () => {
        it('finds products by Category and includes "Matched Category" in matchedReasons', async () => {
            const results = await MakeSearchService.searchProducts({ query: 'Office Furniture' });
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe(101);
            expect(results[0].matchedReasons).toContain('Matched Category: Office Furniture');
        });

        it('resolves authoritative category_id to category name in search', async () => {
            const productWithOnlyCategoryId = {
                id: 105,
                product_code: 'DSK-99',
                product_name: 'Presidential Table',
                category_id: 88,
                category: null, // text is null, authoritative ID is 88
                is_active: true,
                specifications: [],
                sizes: [],
                colors: []
            };

            const mockCategories = [
                { id: 88, name: 'Executive Presidential', code: 'CAT-PRES' }
            ];

            MakeSearchService.invalidateCache();
            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_products') {
                    return {
                        select: vi.fn().mockReturnValue({
                            order: vi.fn().mockReturnValue({
                                limit: vi.fn().mockResolvedValue({ data: [productWithOnlyCategoryId], error: null })
                            }),
                            data: [productWithOnlyCategoryId],
                            error: null
                        })
                    };
                }
                if (table === 'make_product_categories') {
                    return { select: vi.fn().mockResolvedValue({ data: mockCategories, error: null }) };
                }
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            });

            const results = await MakeSearchService.searchProducts({ query: 'Presidential' });
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe(105);
            expect(results[0].category).toBe('Executive Presidential');
            expect(results[0].matchedReasons.some(r => r.includes('Executive Presidential'))).toBe(true);
        });

        it('searches across Category combined with dimensions and colors ("Office Furniture Walnut 1200")', async () => {
            // Restore default mock
            MakeSearchService.invalidateCache();
            (supabase.from as any).mockImplementation((table: string) => {
                if (table === 'make_products') {
                    return {
                        select: vi.fn().mockReturnValue({
                            order: vi.fn().mockReturnValue({
                                limit: vi.fn().mockResolvedValue({ data: mockProducts, error: null })
                            }),
                            data: mockProducts,
                            error: null
                        })
                    };
                }
                return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
            });

            const results = await MakeSearchService.searchProducts({ query: 'Office Furniture Walnut 1200' });
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe(101);
            // Must contain reasons for multiple attributes
            expect(results[0].matchedReasons.some(r => r.includes('Office Furniture'))).toBe(true);
            expect(results[0].matchedReasons.some(r => r.includes('Walnut'))).toBe(true);
            expect(results[0].matchedReasons.some(r => r.includes('1200'))).toBe(true);
        });
    });
});
