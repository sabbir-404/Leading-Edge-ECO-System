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
    unit_sale_price?: number | string | null;
    item_cost_price?: number | string | null;
    item_sale_price?: number | string | null;
    discount_type?: 'percent' | 'amount' | null;
    discount_value?: number | string | null;
    discount_amount?: number | string | null;
    final_item_price?: number | string | null;
    max_discount_type?: 'percent' | 'amount' | null;
    max_discount_value?: number | string | null;
    max_discount_percent?: number | string | null;
    max_discount_amount?: number | string | null;
    product_code?: string | null;
    is_custom?: boolean;
    is_customized?: boolean;
    custom_sale_price?: number | string | null;
    custom_cost_price?: number | string | null;
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
        discount_type?: 'percent' | 'amount' | null;
        discount_value?: number;
        discount_amount?: number;
        final_item_price?: number | null;
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

            // Line-level discount calculation
            let itemDiscType: 'percent' | 'amount' | null = null;
            let itemDiscVal = 0;
            let itemDiscAmount = 0;
            let itemFinalPrice = itemSaleTotal;

            const isCatalogProduct = Boolean(item.product_id) ||
                item.max_discount_percent !== undefined ||
                item.max_discount_amount !== undefined ||
                item.max_discount_type !== undefined ||
                Boolean(item.product_code);
            const hasProduct = isCatalogProduct;
            const isCustomOrNonCatalog = item.is_custom === true || !isCatalogProduct;
            const rawItemDiscVal = item.discount_value !== undefined && item.discount_value !== null && item.discount_value !== '' ? Number(item.discount_value) : 0;
            const rawItemDiscAmt = item.discount_amount !== undefined && item.discount_amount !== null && item.discount_amount !== '' ? Number(item.discount_amount) : 0;

            if (isCustomOrNonCatalog && (rawItemDiscVal > 0 || rawItemDiscAmt > 0)) {
                return {
                    isValid: false,
                    error: `Discounts are not permitted on custom or non-catalog item "${item.product_name}".`,
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

            if (hasProduct && rawSale !== null && item.discount_value !== undefined && item.discount_value !== null && item.discount_value !== '') {
                const parsedItemDisc = Number(item.discount_value);
                if (isNaN(parsedItemDisc) || parsedItemDisc < 0) {
                    return {
                        isValid: false,
                        error: `Discount value for item "${item.product_name}" cannot be negative (${item.discount_value}).`,
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

                itemDiscType = item.discount_type === 'amount' ? 'amount' : 'percent';
                itemDiscVal = round2(parsedItemDisc);

                const maxLimitType: 'percent' | 'amount' = item.max_discount_type || (item.max_discount_amount !== undefined && item.max_discount_amount !== null && item.max_discount_amount !== '' ? 'amount' : 'percent');
                const maxLimitValRaw = item.max_discount_value !== undefined && item.max_discount_value !== null && item.max_discount_value !== ''
                    ? item.max_discount_value
                    : (maxLimitType === 'amount' ? item.max_discount_amount : item.max_discount_percent);
                const hasConfiguredLimit = maxLimitValRaw !== undefined && maxLimitValRaw !== null && maxLimitValRaw !== '';
                if (hasConfiguredLimit) {
                    const maxLimitVal = Number(maxLimitValRaw);
                    if (maxLimitType === 'amount') {
                        if (itemDiscType === 'amount') {
                            if (itemDiscVal > maxLimitVal + 0.001) {
                                return {
                                    isValid: false,
                                    error: `Discount amount (৳${itemDiscVal}) for item "${item.product_name}" exceeds the maximum permitted discount limit of ৳${maxLimitVal}.`,
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
                        } else {
                            const maxPct = rawSale > 0 ? round2((maxLimitVal / rawSale) * 100) : 0;
                            if (itemDiscVal > maxPct + 0.001) {
                                return {
                                    isValid: false,
                                    error: `Discount (${itemDiscVal}%) for item "${item.product_name}" exceeds the maximum permitted discount limit of ${maxPct}% (৳${maxLimitVal}).`,
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
                        }
                    } else {
                        // max_discount_type === 'percent'
                        const maxPct = Math.min(100, Math.max(0, maxLimitVal));
                        if (itemDiscType === 'percent') {
                            if (itemDiscVal > maxPct + 0.001) {
                                return {
                                    isValid: false,
                                    error: `Discount (${itemDiscVal}%) for item "${item.product_name}" exceeds the maximum permitted discount limit of ${maxPct}%.`,
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
                        } else {
                            const maxAmt = round2(rawSale * (maxPct / 100));
                            if (itemDiscVal > maxAmt + 0.001) {
                                return {
                                    isValid: false,
                                    error: `Discount amount (৳${itemDiscVal}) for item "${item.product_name}" exceeds the maximum permitted discount limit of ৳${maxAmt} (${maxPct}%).`,
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
                        }
                    }
                } else {
                    if (itemDiscType === 'percent' && itemDiscVal > 100) {
                        return {
                            isValid: false,
                            error: `Discount percentage cannot exceed 100% for item "${item.product_name}".`,
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
                    if (itemDiscType === 'amount' && itemDiscVal > rawSale) {
                        return {
                            isValid: false,
                            error: `Discount amount (৳${itemDiscVal}) cannot exceed the unit sale price (৳${rawSale}) for item "${item.product_name}".`,
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
                }

                if (itemDiscType === 'percent') {
                    itemDiscAmount = round2(rawSale * (itemDiscVal / 100) * qty);
                } else {
                    itemDiscAmount = round2(itemDiscVal * qty);
                }
                itemFinalPrice = Math.max(0, round2((rawSale * qty) - itemDiscAmount));
            }

            // Product-level discount limit aggregation (custom/non-catalog items have no discount capacity)
            if (rawSale !== null && hasProduct) {
                const itemSub = rawSale * qty;
                const aggLimitType: 'percent' | 'amount' = item.max_discount_type || (item.max_discount_amount !== undefined && item.max_discount_amount !== null && item.max_discount_amount !== '' ? 'amount' : 'percent');
                const aggLimitRaw = item.max_discount_value !== undefined && item.max_discount_value !== null && item.max_discount_value !== ''
                    ? item.max_discount_value
                    : (aggLimitType === 'amount' ? item.max_discount_amount : item.max_discount_percent);
                const hasItemLimit = aggLimitRaw !== undefined && aggLimitRaw !== null && aggLimitRaw !== '';
                if (hasItemLimit) {
                    hasAnyConfiguredDiscountLimit = true;
                    const maxVal = Number(aggLimitRaw);
                    if (aggLimitType === 'amount') {
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
                discount_type: itemDiscType,
                discount_value: itemDiscVal,
                discount_amount: itemDiscAmount,
                final_item_price: itemFinalPrice,
                total_cost: itemCostTotal,
                total_sale: itemSaleTotal
            });
        }

        const undiscountedSubtotal = hasAnySalePrice ? round2(subtotal || 0) : null;
        totalAllowedDiscountAmount = round2(totalAllowedDiscountAmount);
        const totalAllowedDiscountPercent = undiscountedSubtotal && undiscountedSubtotal > 0
            ? round2((totalAllowedDiscountAmount / undiscountedSubtotal) * 100)
            : 0;

        const totalLineDiscountAmount = round2(processedItems.reduce((acc, it) => acc + (it.discount_amount || 0), 0));

        // Process order discount
        let discType: 'percent' | 'amount' | null = null;
        let discValue = 0;
        let orderDiscountAmount = 0;

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

                orderDiscountAmount = undiscountedSubtotal !== null ? round2(undiscountedSubtotal * (discValue / 100)) : 0;
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

                orderDiscountAmount = round2(discValue);
            }
        }

        const finalSalePrice = undiscountedSubtotal !== null
            ? Math.max(0, round2(undiscountedSubtotal - orderDiscountAmount))
            : null;
        const isLossMaking = finalSalePrice !== null && finalSalePrice < round2(totalCost);
        const marginAmount = finalSalePrice !== null ? round2(finalSalePrice - totalCost) : null;

        return {
            isValid: true,
            subtotal: undiscountedSubtotal,
            discountType: discType,
            discountValue: discValue,
            discountAmount: orderDiscountAmount > 0 ? orderDiscountAmount : totalLineDiscountAmount,
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

    /**
     * Calculates the amount due given an order total and money received.
     * Enforces non-negative results and 2 decimal places precision.
     */
    public static calculateAmountDue(orderTotal: number, moneyReceived: number): number {
        const total = round2(Math.max(0, Number(orderTotal || 0)));
        const received = round2(Math.max(0, Number(moneyReceived || 0)));
        return round2(Math.max(0, total - received));
    }

    /**
     * Authoritatively calculates payment status, amount due, and production hold.
     * Enforces currency rounding, decimal precision, and payment constraints.
     */
    public static calculatePaymentStatus(
        finalPrice: number | null,
        rawMoneyReceived: number | string | null | undefined
    ): {
        isValid: boolean;
        error?: string;
        finalPrice: number;
        moneyReceived: number;
        amountDue: number;
        paymentStatus: 'unpaid' | 'partial' | 'paid';
        productionHold: boolean;
        holdReason: string | null;
    } {
        const orderTotal = round2(Math.max(0, Number(finalPrice || 0)));

        if (rawMoneyReceived === undefined || rawMoneyReceived === null || rawMoneyReceived === '') {
            return {
                isValid: true,
                finalPrice: orderTotal,
                moneyReceived: 0,
                amountDue: orderTotal,
                paymentStatus: orderTotal === 0 ? 'paid' : 'unpaid',
                productionHold: orderTotal > 0,
                holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
            };
        }

        // Validate string inputs
        if (typeof rawMoneyReceived === 'string') {
            const trimmed = rawMoneyReceived.trim();
            if (trimmed.startsWith('-')) {
                return {
                    isValid: false,
                    error: 'Money received cannot be negative.',
                    finalPrice: orderTotal,
                    moneyReceived: 0,
                    amountDue: orderTotal,
                    paymentStatus: 'unpaid',
                    productionHold: orderTotal > 0,
                    holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
                };
            }
            const parsed = Number(trimmed);
            if (isNaN(parsed) || !/^\d+(\.\d+)?$/.test(trimmed)) {
                return {
                    isValid: false,
                    error: 'Money received must be a valid non-negative number.',
                    finalPrice: orderTotal,
                    moneyReceived: 0,
                    amountDue: orderTotal,
                    paymentStatus: 'unpaid',
                    productionHold: orderTotal > 0,
                    holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
                };
            }
            if (trimmed.includes('.')) {
                const decPart = trimmed.split('.')[1];
                if (decPart && decPart.length > 2) {
                    return {
                        isValid: false,
                        error: 'Money received cannot have more than 2 decimal places.',
                        finalPrice: orderTotal,
                        moneyReceived: 0,
                        amountDue: orderTotal,
                        paymentStatus: 'unpaid',
                        productionHold: orderTotal > 0,
                        holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
                    };
                }
            }
        } else if (typeof rawMoneyReceived === 'number') {
            if (isNaN(rawMoneyReceived) || rawMoneyReceived < 0) {
                return {
                    isValid: false,
                    error: rawMoneyReceived < 0 ? 'Money received cannot be negative.' : 'Money received must be a valid non-negative number.',
                    finalPrice: orderTotal,
                    moneyReceived: 0,
                    amountDue: orderTotal,
                    paymentStatus: 'unpaid',
                    productionHold: orderTotal > 0,
                    holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
                };
            }
            const strVal = rawMoneyReceived.toString();
            if (strVal.includes('.')) {
                const decPart = strVal.split('.')[1];
                if (decPart && decPart.length > 2 && Math.abs(round2(rawMoneyReceived) - rawMoneyReceived) > 1e-6) {
                    return {
                        isValid: false,
                        error: 'Money received cannot have more than 2 decimal places.',
                        finalPrice: orderTotal,
                        moneyReceived: 0,
                        amountDue: orderTotal,
                        paymentStatus: 'unpaid',
                        productionHold: orderTotal > 0,
                        holdReason: orderTotal > 0 ? `Outstanding balance of ৳${orderTotal.toLocaleString()} due.` : null
                    };
                }
            }
        }

        const received = Number(rawMoneyReceived);
        const roundedReceived = round2(received);

        if (roundedReceived > orderTotal) {
            return {
                isValid: false,
                error: `Money received (৳${roundedReceived.toLocaleString()}) cannot exceed the order total (৳${orderTotal.toLocaleString()}).`,
                finalPrice: orderTotal,
                moneyReceived: roundedReceived,
                amountDue: 0,
                paymentStatus: 'paid',
                productionHold: false,
                holdReason: null
            };
        }

        const amountDue = round2(Math.max(0, orderTotal - roundedReceived));
        let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';

        if (amountDue === 0 && (orderTotal > 0 ? roundedReceived >= orderTotal : true)) {
            paymentStatus = 'paid';
        } else if (roundedReceived > 0 && amountDue > 0) {
            paymentStatus = 'partial';
        } else {
            paymentStatus = 'unpaid';
        }

        const productionHold = amountDue > 0;
        const holdReason = productionHold
            ? `Outstanding balance of ৳${amountDue.toLocaleString()} due.`
            : null;

        return {
            isValid: true,
            finalPrice: orderTotal,
            moneyReceived: roundedReceived,
            amountDue,
            paymentStatus,
            productionHold,
            holdReason
        };
    }

    /**
     * Authoritatively validates and sanitizes line pricing based on the actor's user role:
     * - Designer / Admin: Can enter cost price and sale price for any line.
     * - Salesman:
     *   - Cannot set or view cost price (strictly scrubbed to 0).
     *   - Catalog products: Sale price is locked to catalog sale price; line discount is allowed up to product limit.
     *   - Non-catalog products: Can enter sale price; cannot edit cost price.
     * - Factory Manager: Strictly prohibited from placing orders or entering prices.
     */
    public static validateRolePricingPermissions(
        items: PricingItem[],
        userRole: string,
        catalogProductsMap?: Record<number, any>
    ): { isValid: boolean; error?: string; sanitizedItems: PricingItem[] } {
        const normRole = (userRole || '').toLowerCase();
        const isFactoryManager = normRole === 'factory_manager' || normRole === 'factory manager' || normRole === 'factory';
        if (isFactoryManager) {
            return {
                isValid: false,
                error: 'Factory Managers are strictly restricted from placing orders or modifying order pricing.',
                sanitizedItems: []
            };
        }

        const isSalesperson = normRole === 'salesperson' || normRole === 'salesman' || normRole === 'sales';
        const sanitizedItems: PricingItem[] = [];

        for (const it of items) {
            const isCatalog = Boolean(it.product_id && (catalogProductsMap ? catalogProductsMap[Number(it.product_id)] : true));
            const catalogProd = it.product_id && catalogProductsMap ? catalogProductsMap[Number(it.product_id)] : null;

            if (isSalesperson) {
                // Salesman cannot enter or view cost price
                const sanitizedCost = 0;
                let sanitizedSale = it.item_sale_price;

                if (isCatalog && catalogProd) {
                    // For catalog products, salesman cannot override catalog base sale price
                    sanitizedSale = catalogProd.sale_price;
                } else if (!isCatalog) {
                    // For non-catalog products, salesman can enter sale price
                    if (sanitizedSale === undefined || sanitizedSale === null || sanitizedSale === '') {
                        sanitizedSale = null;
                    } else if (Number(sanitizedSale) < 0) {
                        return {
                            isValid: false,
                            error: `Sale price for non-catalog item "${it.product_name}" cannot be negative.`,
                            sanitizedItems: []
                        };
                    }
                }

                sanitizedItems.push({
                    ...it,
                    item_cost_price: sanitizedCost,
                    item_sale_price: sanitizedSale,
                    max_discount_type: it.max_discount_type || catalogProd?.max_discount_type || null,
                    max_discount_value: it.max_discount_value !== undefined && it.max_discount_value !== null
                        ? it.max_discount_value
                        : (catalogProd?.max_discount_value ?? null)
                });
            } else {
                // Designer, Admin, Super Admin
                sanitizedItems.push({
                    ...it,
                    max_discount_type: it.max_discount_type || catalogProd?.max_discount_type || null,
                    max_discount_value: it.max_discount_value !== undefined && it.max_discount_value !== null
                        ? it.max_discount_value
                        : (catalogProd?.max_discount_value ?? null)
                });
            }
        }

        return { isValid: true, sanitizedItems };
    }
}
