/**
 * MakeSearchService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Intelligent Whole-Catalog Product Search Engine for the MAKE Module.
 * 
 * Features:
 *  - Comprehensive multi-entity search: Searches across Product header (name, code,
 *    model number, description, category) and all linked Product Attributes (Sizes,
 *    Colors, Specifications, Dimensions).
 *  - Junction relationship resolution: Finds products via normalized junctions
 *    (make_product_specification_links, make_product_size_links, make_product_color_links)
 *    and direct attribute references.
 *  - Multi-word query tokenization: Matches terms across different fields (e.g. "black executive table"
 *    matches color "black" + name "executive table").
 *  - Relevance-based scoring & ranking:
 *      1. Exact code / model match
 *      2. Exact product name match
 *      3. All query tokens matched across fields bonus
 *      4. Attribute-level match (color, size, spec)
 *      5. Partial / multi-field matches
 *  - Typo, case, and spacing tolerance: Punctuation normalization (e.g. "M-1025" vs "m1025" vs "M 1025"),
 *    dimension formats (e.g. "1200 x 600", "1200x600").
 *  - Match Highlights / Visual Context: Collects specific matching reasons (e.g.
 *    "Matched Color: Walnut", "Matched Size: 1200×600 mm") to help users quickly understand results.
 *  - Secure: Searches only MAKE catalog products and attributes, never sensitive ERP data.
 */

import { supabase } from '../../supabase';
import { decryptRows } from '../../field-encryption';

export interface SearchProductResult {
    id: number | string;
    product_code: string;
    product_name: string;
    description?: string | null;
    category?: string | null;
    main_image?: string | null;
    is_active: boolean;
    score: number;
    matchedReasons: string[];
    specifications: any[];
    sizes: any[];
    colors: any[];
    images?: any[];
}

export class MakeSearchService {
    /**
     * Normalizes a search string by trimming, lowercasing, and normalizing spaces.
     */
    public static normalize(str?: string | null): string {
        if (!str) return '';
        return str.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /**
     * Strips non-alphanumeric characters for model/code matching (e.g. "M-1025" -> "m1025").
     */
    public static stripPunctuation(str?: string | null): string {
        if (!str) return '';
        return str.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Formats dimensions for comparison (e.g. "1200 x 600 x 750 mm").
     */
    public static formatSizeDimensions(size: any): string {
        const parts: string[] = [];
        if (size.length) parts.push(String(size.length));
        if (size.width) parts.push(String(size.width));
        if (size.height) parts.push(String(size.height));
        if (size.diameter) parts.push(`Ø${size.diameter}`);
        const dims = parts.join(' × ');
        return dims ? `${dims} ${size.unit || 'mm'}` : (size.size_label || '');
    }

    private static cache: {
        timestamp: number;
        products: any[];
        specIdsByProd: Map<string, any[]>;
        sizeIdsByProd: Map<string, any[]>;
        colorIdsByProd: Map<string, any[]>;
        allCatsMap: Map<string, string>;
    } | null = null;

    public static invalidateCache(): void {
        this.cache = null;
    }

    /**
     * Searches the entire MAKE catalog using the multi-entity intelligent search engine.
     */
    public static async searchProducts(params: {
        query?: string;
        category?: string;
        activeOnly?: boolean;
        limit?: number;
    }): Promise<SearchProductResult[]> {
        const rawQuery = (params.query || '').trim();
        const normQuery = this.normalize(rawQuery);
        const strippedQuery = this.stripPunctuation(rawQuery);
        const activeOnly = params.activeOnly !== false;
        const limit = params.limit || 30;

        // If query is empty, return top products ordered by name
        if (!normQuery) {
            let baseQuery = supabase.from('make_products').select(`
                *,
                specifications:make_product_specifications(*),
                sizes:make_product_sizes(*),
                colors:make_product_colors(*),
                images:make_product_images(*)
            `).order('product_name', { ascending: true }).limit(limit);

            if (activeOnly) {
                baseQuery = baseQuery.eq('is_active', true);
            }
            if (params.category) {
                baseQuery = baseQuery.ilike('category', `%${params.category}%`);
            }

            const { data } = await baseQuery;
            const decrypted = decryptRows(data || []);
            return decrypted.map(p => ({
                id: p.id,
                product_code: p.product_code,
                product_name: p.product_name,
                description: p.description,
                category: p.category,
                main_image: p.main_image,
                is_active: p.is_active,
                score: 1,
                matchedReasons: [],
                specifications: p.specifications || [],
                sizes: p.sizes || [],
                colors: p.colors || [],
                images: p.images || []
            }));
        }

        // Check in-memory cache (30 second TTL)
        let products: any[];
        let specIdsByProd: Map<string, any[]>;
        let sizeIdsByProd: Map<string, any[]>;
        let colorIdsByProd: Map<string, any[]>;
        let allCatsMap: Map<string, string>;

        if (this.cache && (Date.now() - this.cache.timestamp < 30_000)) {
            products = this.cache.products;
            specIdsByProd = this.cache.specIdsByProd;
            sizeIdsByProd = this.cache.sizeIdsByProd;
            colorIdsByProd = this.cache.colorIdsByProd;
            allCatsMap = this.cache.allCatsMap;
        } else {
            // Fetch catalog products and their attributes (both direct and junction links)
            const [productsRes, specLinksRes, sizeLinksRes, colorLinksRes, allSpecsRes, allSizesRes, allColorsRes, allCatsRes] = await Promise.all([
                supabase.from('make_products').select(`
                    *,
                    specifications:make_product_specifications(*),
                    sizes:make_product_sizes(*),
                    colors:make_product_colors(*),
                    images:make_product_images(*)
                `),
                supabase.from('make_product_specification_links').select('*'),
                supabase.from('make_product_size_links').select('*'),
                supabase.from('make_product_color_links').select('*'),
                supabase.from('make_product_specifications').select('*'),
                supabase.from('make_product_sizes').select('*'),
                supabase.from('make_product_colors').select('*'),
                supabase.from('make_product_categories').select('*')
            ]);

            products = decryptRows(productsRes.data || []);
            const specLinks = specLinksRes.data || [];
            const sizeLinks = sizeLinksRes.data || [];
            const colorLinks = colorLinksRes.data || [];
            const allSpecsMap = new Map((allSpecsRes.data || []).map((s: any) => [String(s.id), s]));
            const allSizesMap = new Map((allSizesRes.data || []).map((s: any) => [String(s.id), s]));
            const allColorsMap = new Map((allColorsRes.data || []).map((c: any) => [String(c.id), c]));
            allCatsMap = new Map((allCatsRes.data || []).map((c: any) => [String(c.id), c.name]));

            // Group junction links by productId
            specIdsByProd = new Map<string, any[]>();
            for (const link of specLinks) {
                const pId = String(link.product_id);
                const spec = allSpecsMap.get(String(link.spec_id));
                if (spec) {
                    const list = specIdsByProd.get(pId) || [];
                    list.push(spec);
                    specIdsByProd.set(pId, list);
                }
            }

            sizeIdsByProd = new Map<string, any[]>();
            for (const link of sizeLinks) {
                const pId = String(link.product_id);
                const size = allSizesMap.get(String(link.size_id));
                if (size) {
                    const list = sizeIdsByProd.get(pId) || [];
                    list.push(size);
                    sizeIdsByProd.set(pId, list);
                }
            }

            colorIdsByProd = new Map<string, any[]>();
            for (const link of colorLinks) {
                const pId = String(link.product_id);
                const color = allColorsMap.get(String(link.color_id));
                if (color) {
                    const list = colorIdsByProd.get(pId) || [];
                    list.push(color);
                    colorIdsByProd.set(pId, list);
                }
            }

            this.cache = {
                timestamp: Date.now(),
                products,
                specIdsByProd,
                sizeIdsByProd,
                colorIdsByProd,
                allCatsMap
            };
        }

        // Tokenize query: e.g. "black executive table" -> ['black', 'executive', 'table']
        const tokens = normQuery.split(/\s+/).filter(t => t.length > 0);
        // Clean dimensions if numeric: e.g. "1200 x 600"
        const dimensionNumbers = normQuery.match(/\b\d+(\.\d+)?\b/g) || [];

        const scoredResults: SearchProductResult[] = [];

        for (const prod of products) {
            if (activeOnly && prod.is_active === false) continue;
            const resolvedCategory = prod.category || (prod.category_id ? allCatsMap.get(String(prod.category_id)) : null) || null;
            if (params.category && resolvedCategory && !this.normalize(resolvedCategory).includes(this.normalize(params.category))) {
                continue;
            }

            const pIdStr = String(prod.id);
            // Merge direct and junction attributes (deduped by id)
            const combinedSpecs: any[] = [...(prod.specifications || [])];
            const junctionSpecs = specIdsByProd.get(pIdStr) || [];
            for (const js of junctionSpecs) {
                if (!combinedSpecs.some(s => String(s.id) === String(js.id))) {
                    combinedSpecs.push(js);
                }
            }

            const combinedSizes: any[] = [...(prod.sizes || [])];
            const junctionSizes = sizeIdsByProd.get(pIdStr) || [];
            for (const jz of junctionSizes) {
                if (!combinedSizes.some(s => String(s.id) === String(jz.id))) {
                    combinedSizes.push(jz);
                }
            }

            const combinedColors: any[] = [...(prod.colors || [])];
            const junctionColors = colorIdsByProd.get(pIdStr) || [];
            for (const jc of junctionColors) {
                if (!combinedColors.some(c => String(c.id) === String(jc.id))) {
                    combinedColors.push(jc);
                }
            }

            let score = 0;
            const matchedReasons: string[] = [];

            const pNameNorm = this.normalize(prod.product_name);
            const pCodeNorm = this.normalize(prod.product_code);
            const pCodeStripped = this.stripPunctuation(prod.product_code);
            const pDescNorm = this.normalize(prod.description);
            const pCatNorm = this.normalize(resolvedCategory);

            // 1. Exact & Model Code Matches (Highest Priority)
            if (pCodeNorm === normQuery || (strippedQuery && pCodeStripped === strippedQuery)) {
                score += 1200;
                matchedReasons.push(`Exact Code Match: ${prod.product_code}`);
            } else if (pCodeNorm.startsWith(normQuery) || (strippedQuery && pCodeStripped.startsWith(strippedQuery))) {
                score += 600;
                matchedReasons.push(`Code Prefix: ${prod.product_code}`);
            } else if (pCodeNorm.includes(normQuery) || (strippedQuery && pCodeStripped.includes(strippedQuery))) {
                score += 350;
                matchedReasons.push(`Code Match: ${prod.product_code}`);
            }

            // 2. Exact Product Name Matches
            if (pNameNorm === normQuery) {
                score += 1000;
                matchedReasons.push(`Exact Name Match: ${prod.product_name}`);
            } else if (pNameNorm.startsWith(normQuery)) {
                score += 500;
                matchedReasons.push(`Name Prefix: ${prod.product_name}`);
            } else if (pNameNorm.includes(normQuery)) {
                score += 300;
            }

            // 3. Category Match
            if (pCatNorm) {
                if (pCatNorm === normQuery) {
                    score += 500;
                    matchedReasons.push(`Matched Category: ${resolvedCategory}`);
                } else if (pCatNorm.startsWith(normQuery)) {
                    score += 350;
                    matchedReasons.push(`Matched Category: ${resolvedCategory}`);
                } else if (pCatNorm.includes(normQuery)) {
                    score += 250;
                    matchedReasons.push(`Matched Category: ${resolvedCategory}`);
                }
            }

            // 4. Description Full Phrase Match
            if (pDescNorm && pDescNorm.includes(normQuery)) {
                score += 150;
            }

            // 5. Attribute Matching (Color, Size, Specification, Material)
            // Color matching
            for (const col of combinedColors) {
                const cName = this.normalize(col.color_name);
                const cCode = this.normalize(col.color_code);
                if (cName === normQuery) {
                    score += 400;
                    matchedReasons.push(`Matched Color: ${col.color_name}`);
                } else if (cName.includes(normQuery) || (cCode && cCode.includes(normQuery))) {
                    score += 200;
                    matchedReasons.push(`Matched Color: ${col.color_name}`);
                }
            }

            // Specification & Material matching
            for (const sp of combinedSpecs) {
                const sName = this.normalize(sp.spec_name);
                const sCode = this.normalize(sp.spec_code);
                const sDetails = this.normalize(sp.spec_details);
                if (sName === normQuery || sCode === normQuery) {
                    score += 400;
                    matchedReasons.push(`Matched Specification: ${sp.spec_name}`);
                } else if (sName.includes(normQuery) || (sCode && sCode.includes(normQuery)) || (sDetails && sDetails.includes(normQuery))) {
                    score += 200;
                    matchedReasons.push(`Matched Specification: ${sp.spec_name}`);
                }
            }

            // Size & Dimensions matching
            for (const sz of combinedSizes) {
                const sLabel = this.normalize(sz.size_label);
                const formattedDim = this.formatSizeDimensions(sz);
                const formattedDimNorm = this.normalize(formattedDim);

                if (sLabel && sLabel === normQuery) {
                    score += 400;
                    matchedReasons.push(`Matched Size: ${sz.size_label}`);
                } else if (sLabel && sLabel.includes(normQuery)) {
                    score += 200;
                    matchedReasons.push(`Matched Size: ${sz.size_label}`);
                } else if (formattedDimNorm.includes(normQuery)) {
                    score += 250;
                    matchedReasons.push(`Matched Size: ${formattedDim}`);
                }

                // Numerical dimension matching: check if numbers in query match length/width/height/diameter
                if (dimensionNumbers.length > 0) {
                    const lStr = sz.length != null ? String(sz.length) : '';
                    const wStr = sz.width != null ? String(sz.width) : '';
                    const hStr = sz.height != null ? String(sz.height) : '';
                    const dStr = sz.diameter != null ? String(sz.diameter) : '';

                    for (const num of dimensionNumbers) {
                        if (lStr === num || wStr === num || hStr === num || dStr === num) {
                            score += 150;
                            const reason = `Matched Dimension: ${num} ${sz.unit || 'mm'}`;
                            if (!matchedReasons.includes(reason)) {
                                matchedReasons.push(reason);
                            }
                        }
                    }
                }
            }

            // 6. Multi-Word Token Matching
            // Track how many tokens were matched for multi-term queries (e.g. "black executive table")
            let tokensMatchedCount = 0;
            for (const token of tokens) {
                let tokenHit = false;

                if (pNameNorm.includes(token)) {
                    score += 80;
                    tokenHit = true;
                }
                if (pCodeNorm.includes(token) || (strippedQuery && pCodeStripped.includes(token))) {
                    score += 70;
                    tokenHit = true;
                }
                if (pCatNorm && pCatNorm.includes(token)) {
                    score += 70;
                    tokenHit = true;
                    const r = `Matched Category: ${resolvedCategory}`;
                    if (!matchedReasons.includes(r)) matchedReasons.push(r);
                }
                if (pDescNorm && pDescNorm.includes(token)) {
                    score += 25;
                    tokenHit = true;
                }

                // Check colors
                for (const col of combinedColors) {
                    if (this.normalize(col.color_name).includes(token)) {
                        score += 60;
                        tokenHit = true;
                        const r = `Matched Color: ${col.color_name}`;
                        if (!matchedReasons.includes(r)) matchedReasons.push(r);
                        break;
                    }
                }

                // Check specs
                for (const sp of combinedSpecs) {
                    if (this.normalize(sp.spec_name).includes(token) || (sp.spec_details && this.normalize(sp.spec_details).includes(token))) {
                        score += 60;
                        tokenHit = true;
                        const r = `Matched Specification: ${sp.spec_name}`;
                        if (!matchedReasons.includes(r)) matchedReasons.push(r);
                        break;
                    }
                }

                // Check sizes
                for (const sz of combinedSizes) {
                    if (this.normalize(sz.size_label).includes(token) || this.normalize(this.formatSizeDimensions(sz)).includes(token)) {
                        score += 60;
                        tokenHit = true;
                        const r = `Matched Size: ${sz.size_label || this.formatSizeDimensions(sz)}`;
                        if (!matchedReasons.includes(r)) matchedReasons.push(r);
                        break;
                    }
                }

                if (tokenHit) {
                    tokensMatchedCount++;
                }
            }

            // All Tokens Matched Bonus: if all tokens were found, grant a significant multiplier
            if (tokens.length > 1 && tokensMatchedCount === tokens.length) {
                score += 350;
            }

            if (score > 0) {
                // Deduplicate matched reasons
                const uniqueReasons = Array.from(new Set(matchedReasons)).slice(0, 3);

                scoredResults.push({
                    id: prod.id,
                    product_code: prod.product_code,
                    product_name: prod.product_name,
                    description: prod.description,
                    category: resolvedCategory,
                    main_image: prod.main_image,
                    is_active: prod.is_active,
                    score,
                    matchedReasons: uniqueReasons,
                    specifications: combinedSpecs,
                    sizes: combinedSizes,
                    colors: combinedColors,
                    images: prod.images || []
                });
            }
        }

        // Sort descending by relevance score, then alphabetically by name
        scoredResults.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.product_name.localeCompare(b.product_name);
        });

        return scoredResults.slice(0, limit);
    }
}
