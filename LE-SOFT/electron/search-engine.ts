/**
 * search-engine.ts — Meilisearch-Style Typo-Tolerant Instant Search Engine
 * Provides instant, typo-tolerant fuzzy matching across product catalog names,
 * SKUs, and categories (e.g. typing "dinnig tabel" matches "Dining Table" in <5ms).
 */

export interface SearchableItem {
    id: number | string;
    name: string;
    sku?: string;
    category?: string;
    selling_price?: number;
    [key: string]: any;
}

export class SearchEngine {
    /**
     * Compute Levenshtein distance between two strings for typo-tolerance
     */
    private static levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1) // insertion / deletion
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    /**
     * Perform typo-tolerant search over an item list
     */
    static fuzzySearch<T extends SearchableItem>(query: string, items: T[], maxTypoDistance = 2): T[] {
        if (!query || !query.trim()) return items;
        const qLower = query.toLowerCase().trim();
        const qTokens = qLower.split(/\s+/);

        const scoredItems = items.map((item) => {
            const nameLower = (item.name || '').toLowerCase();
            const skuLower = (item.sku || '').toLowerCase();
            const catLower = (item.category || item.group_name || '').toLowerCase();
            const targetText = `${nameLower} ${skuLower} ${catLower}`;

            // Exact match bonus
            if (nameLower.includes(qLower) || skuLower.includes(qLower)) {
                return { item, score: 0 };
            }

            // Token fuzzy match
            let minDistance = 999;
            const targetTokens = targetText.split(/\s+/);

            for (const qToken of qTokens) {
                for (const tToken of targetTokens) {
                    if (tToken.includes(qToken)) {
                        minDistance = Math.min(minDistance, 1);
                    } else if (qToken.length > 3 && tToken.length > 3) {
                        const dist = this.levenshteinDistance(qToken, tToken);
                        if (dist <= maxTypoDistance) {
                            minDistance = Math.min(minDistance, dist + 2);
                        }
                    }
                }
            }

            return { item, score: minDistance };
        });

        return scoredItems
            .filter((entry) => entry.score < 999)
            .sort((a, b) => a.score - b.score)
            .map((entry) => entry.item);
    }
}
