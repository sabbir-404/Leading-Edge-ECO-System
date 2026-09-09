/**
 * inventory-valuation.ts — Stock Valuation Engine (FIFO & Weighted Average Cost)
 * Calculates real-time average inventory cost and total inventory valuation.
 */

export interface StockBatch {
    quantity: number;
    unitCost: number;
}

export class InventoryValuationEngine {
    /**
     * Calculate Weighted Average Cost for a product given transaction batches.
     * Formula: Weighted Average Cost = Total Stock Value / Total Quantity
     */
    static calculateWeightedAverageCost(purchases: StockBatch[]): number {
        if (!Array.isArray(purchases) || purchases.length === 0) return 0;

        let totalValue = 0;
        let totalQuantity = 0;

        for (const batch of purchases) {
            const qty = Number(batch.quantity) || 0;
            const cost = Number(batch.unitCost) || 0;
            if (qty > 0) {
                totalValue += qty * cost;
                totalQuantity += qty;
            }
        }

        if (totalQuantity <= 0) return 0;
        return Math.round((totalValue / totalQuantity) * 100) / 100;
    }

    /**
     * Calculate Cost of Goods Sold (COGS) for a sale under FIFO method.
     */
    static calculateFifoCogs(batches: StockBatch[], qtyToSell: number): { cogs: number; remainingBatches: StockBatch[] } {
        let remainingQtyNeeded = qtyToSell;
        let cogs = 0;
        const remainingBatches: StockBatch[] = [];

        for (const batch of batches) {
            if (remainingQtyNeeded <= 0) {
                remainingBatches.push({ ...batch });
                continue;
            }

            if (batch.quantity <= remainingQtyNeeded) {
                cogs += batch.quantity * batch.unitCost;
                remainingQtyNeeded -= batch.quantity;
            } else {
                cogs += remainingQtyNeeded * batch.unitCost;
                remainingBatches.push({
                    quantity: batch.quantity - remainingQtyNeeded,
                    unitCost: batch.unitCost,
                });
                remainingQtyNeeded = 0;
            }
        }

        return { cogs: Math.round(cogs * 100) / 100, remainingBatches };
    }
}
