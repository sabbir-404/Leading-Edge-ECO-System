import { describe, it, expect } from 'vitest';
import { MakePricingService } from '../../electron/services/make/MakePricingService';

describe('MAKE V1 — Authoritative Pricing Validation', () => {
    it('should accept valid pricing where sale_price >= cost_price >= 0', () => {
        const result = MakePricingService.validateItemPricing(1500, 2200);
        expect(result.isValid).toBe(true);
        expect(result.costPrice).toBe(1500);
        expect(result.salePrice).toBe(2200);
        expect(result.error).toBeUndefined();
    });

    it('should accept pricing when sale_price is equal to cost_price (break-even)', () => {
        const result = MakePricingService.validateItemPricing(1500, 1500);
        expect(result.isValid).toBe(true);
        expect(result.margin).toBe(0);
    });

    it('should reject negative cost price', () => {
        const result = MakePricingService.validateItemPricing(-100, 500);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Cost price cannot be negative');
    });

    it('should reject negative sale price', () => {
        const result = MakePricingService.validateItemPricing(500, -50);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Sale price cannot be negative');
    });

    it('should reject loss-making pricing (sale_price < cost_price) during standard validation', () => {
        const result = MakePricingService.validateItemPricing(5000, 4500);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('cannot be less than cost price');
    });

    it('should reject loss-making order during approval without privileged override', () => {
        const approvalCheck = MakePricingService.validateApprovalPricing(5000, 4200, null);
        expect(approvalCheck.allowed).toBe(false);
        expect(approvalCheck.requiresOverride).toBe(true);
        expect(approvalCheck.error).toContain('requires management authorization');
    });

    it('should approve loss-making order when valid manager override is provided', () => {
        const override = {
            overrideReason: 'Strategic customer sample / promotional discount',
            authorizedBy: 'Operations Director',
            timestamp: new Date().toISOString()
        };

        const approvalCheck = MakePricingService.validateApprovalPricing(5000, 4200, override);
        expect(approvalCheck.allowed).toBe(true);
        expect(approvalCheck.requiresOverride).toBe(true);
    });

    it('should reject override if reason is blank', () => {
        const override = {
            overrideReason: '',
            authorizedBy: 'Director',
            timestamp: new Date().toISOString()
        };

        const approvalCheck = MakePricingService.validateApprovalPricing(5000, 4200, override);
        expect(approvalCheck.allowed).toBe(false);
        expect(approvalCheck.error).toContain('reason is required');
    });

    it('should accurately calculate authoritative totals across multiple items', () => {
        const items = [
            { product_name: 'Executive Desk', quantity: 2, item_cost_price: 15000, item_sale_price: 22000 },
            { product_name: 'Metal Chair', quantity: 4, item_cost_price: 3500, item_sale_price: 5500 }
        ];

        const totals = MakePricingService.calculateAndValidateTotals(items);
        expect(totals.isValid).toBe(true);
        expect(totals.totalCostPrice).toBe(2 * 15000 + 4 * 3500); // 30,000 + 14,000 = 44,000
        expect(totals.totalSalePrice).toBe(2 * 22000 + 4 * 5500); // 44,000 + 22,000 = 66,000
        expect(totals.totalMargin).toBe(22000);
    });
});
