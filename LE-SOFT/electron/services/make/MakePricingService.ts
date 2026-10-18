/**
 * MakePricingService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Server-Side Pricing Engine for MAKE Custom Manufacturing.
 * 
 * Rules for MAKE V1 & Catalog Pricing / Discounts:
 *  1. Every item cost_price >= 0, sale_price >= 0 (or null if unpriced).
 *  2. Order total cost_price = sum(item_cost_price * quantity).
 *  3. Order total sale_price = sum(item_sale_price * quantity) - discount_amount.
 *  4. Maximum discount limits enforced per product (percent or fixed amount).
 *  5. For order approval: final sale_price MUST be >= cost_price (or managerial override).
 *  6. Floating-point safe rounding applied to all persistent monetary amounts.
 */

export interface PricingItem {
    id?: number;
    product_id?: number | null;
    product_name: string;
    quantity: number;
    item_cost_price?: number | string | null;
    item_sale_price?: number | string | null;
    max_discount_type?: 'percent' | 'amount' | null;
    max_discount_value?: number | string | null;
}

export interface OrderDiscountInput {
    discount_type?: 'percent' | 'amount' | null;
    discount_value?: number | string | null;
}

export interface PricingCalculationResult {
    isValid: boolean;
    error?: string;
    subtotal: number | null;
    discountType: 'percent' | 'amount' | null;
    discountValue: number;
    discountAmount: number;
    totalCostPrice: number;
    totalSalePrice: number | null;
    finalPrice: number | null;
    marginAmount: number | null;
    totalMargin?: number | null;
    isLossMaking: boolean;
    maxAllowedDiscountAmount?: number;
    maxAllowedDiscountPercent?: number;
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

/** Utility for floating-point safe monetary rounding to 2 decimal places */
export function round2(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
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
        return { isValid: true, costPrice, salePrice, margin: round2(salePrice - costPrice) };
    }

    /**
     * Validates catalog product pricing, discount limits, and calculates lowest permitted sale price.
     */
    public static validateCatalogProductPricing(product: {
        cost_price?: number | string | null;
        sale_price?: number | string | null;
        max_discount_type?: 'percent' | 'amount' | null;
        max_discount_value?: number | string | null;
    }): {
        isValid: boolean;
        error?: string;
        costPrice: number;
        salePrice: number;
        maxDiscountType: 'percent' | 'amount';
        maxDiscountValue: number;
        lowestPermittedSalePrice: number;
        maxDiscountAmount: number;
    } {
        const rawCost = product.cost_price !== undefined && product.cost_price !== null && product.cost_price !== ''
            ? Number(product.cost_price)
            : 0;
        const rawSale = product.sale_price !== undefined && product.sale_price !== null && product.sale_price !== ''
            ? Number(product.sale_price)
            : 0;
        const rawDiscountType: 'percent' | 'amount' = product.max_discount_type === 'amount' ? 'amount' : 'percent';
        const rawDiscountVal = product.max_discount_value !== undefined && product.max_discount_value !== null && product.max_discount_value !== ''
            ? Number(product.max_discount_value)
            : 0;

        if (isNaN(rawCost) || rawCost < 0) {
            return {
                isValid: false,
                error: 'Cost price cannot be negative.',
                costPrice: 0,
                salePrice: rawSale,
                maxDiscountType: rawDiscountType,
                maxDiscountValue: 0,
                lowestPermittedSalePrice: rawSale,
                maxDiscountAmount: 0
            };
        }

        if (isNaN(rawSale) || rawSale < 0) {
            return {
                isValid: false,
                error: 'Sale price cannot be negative.',
                costPrice: rawCost,
                salePrice: 0,
                maxDiscountType: rawDiscountType,
                maxDiscountValue: 0,
                lowestPermittedSalePrice: 0,
                maxDiscountAmount: 0
            };
        }

        if (isNaN(rawDiscountVal) || rawDiscountVal < 0) {
            return {
                isValid: false,
                error: 'Maximum discount value cannot be negative.',
                costPrice: rawCost,
                salePrice: rawSale,
                maxDiscountType: rawDiscountType,
                maxDiscountValue: 0,
                lowestPermittedSalePrice: rawSale,
                maxDiscountAmount: 0
            };
        }

        let maxDiscountAmount = 0;
        let lowestPermittedSalePrice = rawSale;

        if (rawDiscountType === 'percent') {
            if (rawDiscountVal > 100) {
                return {
                    isValid: false,
                    error: 'Maximum discount percentage cannot exceed 100%.',
                    costPrice: rawCost,
                    salePrice: rawSale,
                    maxDiscountType: rawDiscountType,
                    maxDiscountValue: rawDiscountVal,
                    lowestPermittedSalePrice: rawSale,
                    maxDiscountAmount: 0
                };
            }
            maxDiscountAmount = round2(rawSale * (rawDiscountVal / 100));
            lowestPermittedSalePrice = Math.max(0, round2(rawSale - maxDiscountAmount));
        } else {
            // fixed amount
            if (rawDiscountVal > rawSale) {
                return {
                    isValid: false,
                    error: `Fixed maximum discount (৳${rawDiscountVal.toLocaleString()}) cannot exceed the sale price (৳${rawSale.toLocaleString()}).`,
                    costPrice: rawCost,
                    salePrice: rawSale,
                    maxDiscountType: rawDiscountType,
                    maxDiscountValue: rawDiscountVal,
                    lowestPermittedSalePrice: rawSale,
                    maxDiscountAmount: 0
                };
            }
            maxDiscountAmount = round2(rawDiscountVal);
            lowestPermittedSalePrice = Math.max(0, round2(rawSale - maxDiscountAmount));
        }

        return {
            isValid: true,
            costPrice: round2(rawCost),
            salePrice: round2(rawSale),
            maxDiscountType: rawDiscountType,
            maxDiscountValue: round2(rawDiscountVal),
            lowestPermittedSalePrice,
            maxDiscountAmount
        };
    }

    /**
     * Authoritatively recalculates and validates item prices, order discount, and totals.
     */
    public static calculateAndValidateTotals(
        items: PricingItem[],
        discountInput?: OrderDiscountInput | null
    ): PricingCalculationResult {
        if (!Array.isArray(items) || items.length === 0) {
            return {
                isValid: false,
                error: 'Order must contain at least one item.',
                subtotal: null,
                discountType: null,
                discountValue: 0,
                discountAmount: 0,
                totalCostPrice: 0,
                totalSalePrice: null,
                finalPrice: null,
                marginAmount: null,
                totalMargin: null,
                isLossMaking: false,
                items: []
            };
        }

        let totalCost = 0;
        let subtotal: number | null = 0;
        let hasAnySalePrice = false;
        const processedItems = [];

        // Sum up total allowed discount capacity across items for product-level limits
        let totalAllowedDiscountAmount = 0;
        let hasAnyConfiguredDiscountLimit = false;

        for (const item of items) {
            const qty = Number(item.quantity);
            if (isNaN(qty) || qty <= 0) {
                return {
                    isValid: false,
                    error: `Invalid quantity (${item.quantity}) for item: ${item.product_name || 'Unnamed item'}. Quantity must be greater than 0.`,
                    subtotal: null,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0,
                    totalCostPrice: 0,
                    totalSalePrice: null,
                    finalPrice: null,
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
                    subtotal: null,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0,
                    totalCostPrice: 0,
                    totalSalePrice: null,
                    finalPrice: null,
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
                        subtotal: null,
                        discountType: null,
                        discountValue: 0,
                        discountAmount: 0,
                        totalCostPrice: 0,
                        totalSalePrice: null,
                        finalPrice: null,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        items: []
                    };
                }
                hasAnySalePrice = true;
                if (subtotal !== null) {
                    subtotal += rawSale * qty;
                }
            }

            const itemCostTotal = rawCost * qty;
            const itemSaleTotal = rawSale !== null ? rawSale * qty : null;
            totalCost += itemCostTotal;

            // Product-level discount limit aggregation
            if (rawSale !== null) {
                const itemSub = rawSale * qty;
                const hasConfiguredLimit = item.max_discount_value !== undefined && item.max_discount_value !== null && item.max_discount_value !== '';
                if (hasConfiguredLimit) {
                    hasAnyConfiguredDiscountLimit = true;
                    const maxVal = Number(item.max_discount_value);
                    if (item.max_discount_type === 'amount') {
                        totalAllowedDiscountAmount += Math.min(itemSub, maxVal * qty);
                    } else {
                        // percent
                        const pct = Math.min(100, Math.max(0, maxVal));
                        totalAllowedDiscountAmount += itemSub * (pct / 100);
                    }
                } else {
                    // Backward-compatible default: if product has no configured limit, it imposes no restriction
                    totalAllowedDiscountAmount += itemSub;
                }
            }

            processedItems.push({
                product_name: item.product_name,
                quantity: qty,
                cost_price: rawCost,
                sale_price: rawSale,
                total_cost: itemCostTotal,
                total_sale: itemSaleTotal
            });
        }

        const undiscountedSubtotal = hasAnySalePrice ? round2(subtotal || 0) : null;
        totalAllowedDiscountAmount = round2(totalAllowedDiscountAmount);
        const totalAllowedDiscountPercent = undiscountedSubtotal && undiscountedSubtotal > 0
            ? round2((totalAllowedDiscountAmount / undiscountedSubtotal) * 100)
            : 0;

        // Process order discount
        let discType: 'percent' | 'amount' | null = null;
        let discValue = 0;
        let discountAmount = 0;

        if (discountInput && discountInput.discount_value !== undefined && discountInput.discount_value !== null && discountInput.discount_value !== '') {
            const parsedVal = Number(discountInput.discount_value);
            if (isNaN(parsedVal) || parsedVal < 0) {
                return {
                    isValid: false,
                    error: `Discount value cannot be negative (${discountInput.discount_value}).`,
                    subtotal: undiscountedSubtotal,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0,
                    totalCostPrice: round2(totalCost),
                    totalSalePrice: undiscountedSubtotal,
                    finalPrice: undiscountedSubtotal,
                    marginAmount: null,
                    totalMargin: null,
                    isLossMaking: false,
                    items: processedItems
                };
            }

            discType = discountInput.discount_type === 'amount' ? 'amount' : 'percent';
            discValue = round2(parsedVal);

            if (undiscountedSubtotal === null && discValue > 0) {
                return {
                    isValid: false,
                    error: 'Cannot apply discount when items do not have defined sale prices.',
                    subtotal: null,
                    discountType: discType,
                    discountValue: discValue,
                    discountAmount: 0,
                    totalCostPrice: round2(totalCost),
                    totalSalePrice: null,
                    finalPrice: null,
                    marginAmount: null,
                    totalMargin: null,
                    isLossMaking: false,
                    items: processedItems
                };
            }

            if (discType === 'percent') {
                if (discValue > 100) {
                    return {
                        isValid: false,
                        error: 'Discount percentage cannot exceed 100%.',
                        subtotal: undiscountedSubtotal,
                        discountType: discType,
                        discountValue: discValue,
                        discountAmount: 0,
                        totalCostPrice: round2(totalCost),
                        totalSalePrice: undiscountedSubtotal,
                        finalPrice: undiscountedSubtotal,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        items: processedItems
                    };
                }

                // Mode enforcement: For percentage mode, compare percentages
                if (hasAnyConfiguredDiscountLimit && discValue > totalAllowedDiscountPercent + 0.001) {
                    return {
                        isValid: false,
                        error: `Discount (${discValue}%) exceeds the maximum permitted discount limit of ${totalAllowedDiscountPercent}%.`,
                        subtotal: undiscountedSubtotal,
                        discountType: discType,
                        discountValue: discValue,
                        discountAmount: 0,
                        totalCostPrice: round2(totalCost),
                        totalSalePrice: undiscountedSubtotal,
                        finalPrice: undiscountedSubtotal,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        maxAllowedDiscountAmount: totalAllowedDiscountAmount,
                        maxAllowedDiscountPercent: totalAllowedDiscountPercent,
                        items: processedItems
                    };
                }

                discountAmount = undiscountedSubtotal !== null ? round2(undiscountedSubtotal * (discValue / 100)) : 0;
            } else {
                // fixed amount mode
                if (undiscountedSubtotal !== null && discValue > undiscountedSubtotal) {
                    return {
                        isValid: false,
                        error: `Discount amount (৳${discValue.toLocaleString()}) cannot exceed the order subtotal (৳${undiscountedSubtotal.toLocaleString()}).`,
                        subtotal: undiscountedSubtotal,
                        discountType: discType,
                        discountValue: discValue,
                        discountAmount: 0,
                        totalCostPrice: round2(totalCost),
                        totalSalePrice: undiscountedSubtotal,
                        finalPrice: undiscountedSubtotal,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        items: processedItems
                    };
                }

                // Mode enforcement: For fixed mode, compare monetary amounts
                if (hasAnyConfiguredDiscountLimit && discValue > totalAllowedDiscountAmount + 0.001) {
                    return {
                        isValid: false,
                        error: `Discount amount (৳${discValue.toLocaleString()}) exceeds the maximum permitted discount limit of ৳${totalAllowedDiscountAmount.toLocaleString()}.`,
                        subtotal: undiscountedSubtotal,
                        discountType: discType,
                        discountValue: discValue,
                        discountAmount: 0,
                        totalCostPrice: round2(totalCost),
                        totalSalePrice: undiscountedSubtotal,
                        finalPrice: undiscountedSubtotal,
                        marginAmount: null,
                        totalMargin: null,
                        isLossMaking: false,
                        maxAllowedDiscountAmount: totalAllowedDiscountAmount,
                        maxAllowedDiscountPercent: totalAllowedDiscountPercent,
                        items: processedItems
                    };
                }

                discountAmount = round2(discValue);
            }
        }

        const finalSalePrice = undiscountedSubtotal !== null
            ? Math.max(0, round2(undiscountedSubtotal - discountAmount))
            : null;
        const isLossMaking = finalSalePrice !== null && finalSalePrice < round2(totalCost);
        const marginAmount = finalSalePrice !== null ? round2(finalSalePrice - totalCost) : null;

        return {
            isValid: true,
            subtotal: undiscountedSubtotal,
            discountType: discType,
            discountValue: discValue,
            discountAmount,
            totalCostPrice: round2(totalCost),
            totalSalePrice: finalSalePrice,
            finalPrice: finalSalePrice,
            marginAmount,
            totalMargin: marginAmount,
            isLossMaking,
            maxAllowedDiscountAmount: hasAnyConfiguredDiscountLimit ? totalAllowedDiscountAmount : undefined,
            maxAllowedDiscountPercent: hasAnyConfiguredDiscountLimit ? totalAllowedDiscountPercent : undefined,
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
