/**
 * MakePricingService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Server-Side Pricing Engine for MAKE Custom Manufacturing.
 * 
 * Rules for MAKE V1:
 *  1. Every item cost_price >= 0, sale_price >= 0 (or null if unpriced).
 *  2. Order total cost_price = sum(item_cost_price * quantity).
 *  3. Order total sale_price = sum(item_sale_price * quantity).
 *  4. For order approval: sale_price MUST be >= cost_price.
 *  5. Exceptional loss-making orders (sale_price < cost_price) require an explicit
 *     authorized override containing { overrideReason, authorizedBy, timestamp }.
 */

export interface PricingItem {
    id?: number;
    product_name: string;
    quantity: number;
    item_cost_price?: number | string | null;
    item_sale_price?: number | string | null;
}

export interface PricingCalculationResult {
    isValid: boolean;
    error?: string;
    totalCostPrice: number;
    totalSalePrice: number | null;
    marginAmount: number | null;
    totalMargin?: number | null;
    isLossMaking: boolean;
    items: {
        product_name: string;
        quantity: number;
        cost_price: number;
        sale_price: number | null;
        total_cost: number;
        total_sale: number | null;
    }[];
}

export interface PricingOverride {
    overrideReason: string;
    authorizedBy: string;
    timestamp: string;
}

export class MakePricingService {
    /**
     * Validates an individual item's cost and sale prices.
     */
    public static validateItemPricing(costPrice: number, salePrice: number): {
        isValid: boolean;
        costPrice: number;
        salePrice: number;
        margin?: number;
        error?: string;
    } {
        if (costPrice < 0) {
            return { isValid: false, costPrice, salePrice, error: 'Cost price cannot be negative' };
        }
        if (salePrice < 0) {
            return { isValid: false, costPrice, salePrice, error: 'Sale price cannot be negative' };
        }
        if (salePrice < costPrice) {
            return { isValid: false, costPrice, salePrice, error: 'Sale price cannot be less than cost price without managerial override' };
        }
        return { isValid: true, costPrice, salePrice, margin: salePrice - costPrice };
    }

    /**
     * Authoritatively recalculates and validates item prices and order totals.
     */
    public static calculateAndValidateTotals(items: PricingItem[]): PricingCalculationResult {
        if (!Array.isArray(items) || items.length === 0) {
            return {
                isValid: false,
                error: 'Order must contain at least one item.',
                totalCostPrice: 0,
                totalSalePrice: null,
                marginAmount: null,
                totalMargin: null,
                isLossMaking: false,
                items: []
            };
        }

        let totalCost = 0;
        let totalSale: number | null = 0;
        let hasAnySalePrice = false;
        const processedItems = [];

        for (const item of items) {
            const qty = Number(item.quantity);
            if (isNaN(qty) || qty <= 0) {
                return {
                    isValid: false,
                    error: `Invalid quantity (${item.quantity}) for item: ${item.product_name || 'Unnamed item'}. Quantity must be greater than 0.`,
                    totalCostPrice: 0,
                    totalSalePrice: null,
                    marginAmount: null,
                    totalMargin: null,
                    isLossMaking: false,
                    items: []
                };
            }

            const rawCost = item.item_cost_price !== undefined && item.item_cost_price !== null && item.item_cost_price !== ''
                ? Number(item.item_cost_price)
                : 0;

            if (isNaN(rawCost) || rawCost < 0) {
                return {
                    isValid: false,
                    error: `Cost price for item "${item.product_name}" cannot be negative (${rawCost}).`,
                    totalCostPrice: 0,
                    totalSalePrice: null,
                    marginAmount: null,
                    totalMargin: null,
                    isLossMaking: false,
                    items: []
                };
            }

            const hasSale = item.item_sale_price !== undefined && item.item_sale_price !== null && item.item_sale_price !== '';
            let rawSale: number | null = null;

            if (hasSale) {
                rawSale = Number(item.item_sale_price);
                if (isNaN(rawSale) || rawSale < 0) {
                    return {
                        isValid: false,
                        error: `Sale price for item "${item.product_name}" cannot be negative (${rawSale}).`,
                        totalCostPrice: 0,
                        totalSalePrice: null,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        items: []
                    };
                }
                hasAnySalePrice = true;
                if (totalSale !== null) {
                    totalSale += rawSale * qty;
                }
            }

            const itemCostTotal = rawCost * qty;
            const itemSaleTotal = rawSale !== null ? rawSale * qty : null;
            totalCost += itemCostTotal;

            processedItems.push({
                product_name: item.product_name,
                quantity: qty,
                cost_price: rawCost,
                sale_price: rawSale,
                total_cost: itemCostTotal,
                total_sale: itemSaleTotal
            });
        }

        const finalSalePrice = hasAnySalePrice ? totalSale : null;
        const isLossMaking = finalSalePrice !== null && finalSalePrice < totalCost;
        const marginAmount = finalSalePrice !== null ? finalSalePrice - totalCost : null;

        return {
            isValid: true,
            totalCostPrice: Math.round(totalCost * 100) / 100,
            totalSalePrice: finalSalePrice !== null ? Math.round(finalSalePrice * 100) / 100 : null,
            marginAmount: marginAmount !== null ? Math.round(marginAmount * 100) / 100 : null,
            totalMargin: marginAmount !== null ? Math.round(marginAmount * 100) / 100 : null,
            isLossMaking,
            items: processedItems
        };
    }

    /**
     * Validates whether an order is eligible for approval based on pricing rules.
     */
    public static validateApprovalPricing(
        costPrice: number,
        salePrice: number | null,
        override?: PricingOverride | null
    ): { allowed: boolean; error?: string; requiresOverride?: boolean } {
        if (costPrice < 0) {
            return { allowed: false, error: 'Cost price cannot be negative.' };
        }

        if (salePrice === null || salePrice === undefined) {
            return { allowed: false, error: 'Order cannot be approved without a defined sale price.' };
        }

        if (salePrice < 0) {
            return { allowed: false, error: 'Sale price cannot be negative.' };
        }

        if (salePrice < costPrice) {
            if (!override || !override.authorizedBy) {
                return {
                    allowed: false,
                    requiresOverride: true,
                    error: `Sale price (৳${salePrice.toLocaleString()}) is less than cost price (৳${costPrice.toLocaleString()}). Approval requires management authorization and an override reason.`
                };
            }
            if (!override.overrideReason || override.overrideReason.trim() === '') {
                return {
                    allowed: false,
                    requiresOverride: true,
                    error: `Sale price (৳${salePrice.toLocaleString()}) is less than cost price (৳${costPrice.toLocaleString()}). An authorized management override reason is required.`
                };
            }
            // Valid override provided
            return { allowed: true, requiresOverride: true };
        }

        return { allowed: true };
    }
}
