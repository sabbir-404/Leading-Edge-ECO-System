import { describe, it, expect, beforeEach } from 'vitest';
import { MakePricingService, round2 } from '../../electron/services/make/MakePricingService';
import { CatalogProductSchema, CreateMakeOrderSchema } from '../../electron/ipc/schemas/make.schema';
import {
  canViewCostPrice,
  canEditCostPrice,
  canViewSalePrice,
  canEditSalePrice,
  getUserPricingPermissions
} from '../../src/utils/permissions';
import {
  saveProductCatalogDraft,
  loadProductCatalogDraft,
  clearProductCatalogDraft,
  hasMeaningfulDraftContent,
  type ProductFormDraft
} from '../../src/utils/productCatalogDraft';
import {
  savePlaceOrderDraft,
  loadPlaceOrderDraft,
  clearPlaceOrderDraft,
  hasMeaningfulPlaceOrderDraft,
  type PlaceOrderDraftData
} from '../../src/utils/placeOrderDraft';

describe('Feature B: Product Catalog Pricing and Order Discount Enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Catalog Product Pricing Validation & Lowest Permitted Price', () => {
    it('validates a product with percentage-based maximum discount and computes lowest price', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 15000,
        sale_price: 25000,
        max_discount_type: 'percent',
        max_discount_value: 20
      });

      expect(result.isValid).toBe(true);
      expect(result.costPrice).toBe(15000);
      expect(result.salePrice).toBe(25000);
      expect(result.maxDiscountType).toBe('percent');
      expect(result.maxDiscountValue).toBe(20);
      expect(result.maxDiscountAmount).toBe(5000); // 20% of 25000
      expect(result.lowestPermittedSalePrice).toBe(20000); // 25000 - 5000
    });

    it('validates a product with fixed-amount maximum discount and computes lowest price', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 12000,
        sale_price: 20000,
        max_discount_type: 'amount',
        max_discount_value: 3500
      });

      expect(result.isValid).toBe(true);
      expect(result.costPrice).toBe(12000);
      expect(result.salePrice).toBe(20000);
      expect(result.maxDiscountType).toBe('amount');
      expect(result.maxDiscountValue).toBe(3500);
      expect(result.maxDiscountAmount).toBe(3500);
      expect(result.lowestPermittedSalePrice).toBe(16500); // 20000 - 3500
    });

    it('rejects negative cost price', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: -500,
        sale_price: 1000,
        max_discount_type: 'percent',
        max_discount_value: 10
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Cost price cannot be negative');
    });

    it('rejects negative sale price', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 500,
        sale_price: -100,
        max_discount_type: 'percent',
        max_discount_value: 10
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Sale price cannot be negative');
    });

    it('rejects negative discount value', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 500,
        sale_price: 1000,
        max_discount_type: 'percent',
        max_discount_value: -5
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Maximum discount value cannot be negative');
    });

    it('rejects percentage discount greater than 100%', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 500,
        sale_price: 1000,
        max_discount_type: 'percent',
        max_discount_value: 110
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot exceed 100%');
    });

    it('rejects fixed discount amount greater than sale price', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: 500,
        sale_price: 1000,
        max_discount_type: 'amount',
        max_discount_value: 1200
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot exceed the sale price');
    });

    it('handles legacy product with zero or null discount fields gracefully', () => {
      const result = MakePricingService.validateCatalogProductPricing({
        cost_price: null,
        sale_price: 5000,
        max_discount_type: null,
        max_discount_value: null
      });

      expect(result.isValid).toBe(true);
      expect(result.costPrice).toBe(0);
      expect(result.salePrice).toBe(5000);
      expect(result.maxDiscountType).toBe('percent');
      expect(result.maxDiscountValue).toBe(0);
      expect(result.lowestPermittedSalePrice).toBe(5000);
    });
  });

  describe('2. Zod IPC Schema Validation', () => {
    it('validates catalog product payload with pricing and discount limits', () => {
      const validPayload = {
        product_code: 'DESK-001',
        product_name: 'Executive Teak Desk',
        cost_price: 18500.5,
        sale_price: 32000,
        max_discount_type: 'percent' as const,
        max_discount_value: 15,
        is_active: true
      };

      const parsed = CatalogProductSchema.parse(validPayload);
      expect(parsed.cost_price).toBe(18500.5);
      expect(parsed.sale_price).toBe(32000);
      expect(parsed.max_discount_type).toBe('percent');
      expect(parsed.max_discount_value).toBe(15);
    });

    it('validates create make order payload with discount breakdown', () => {
      const orderPayload = {
        furniture_name: 'Custom Conference Table',
        description: 'Large conference table with cable grommets',
        customer_name: 'Test Customer Corp',
        quantity: 1,
        designer_name: 'Arif Ahmed',
        priority: 'Normal',
        target_delivery_date: '2026-11-15',
        cost_price: 45000,
        sale_price: 70000,
        discount_type: 'percent' as const,
        discount_value: 10,
        discount_amount: 7000,
        final_price: 63000,
        items: [
          {
            product_name: 'Conference Table Base',
            quantity: 1,
            item_cost_price: 45000,
            item_sale_price: 70000,
            max_discount_type: 'percent' as const,
            max_discount_value: 15
          }
        ]
      };

      const parsed = CreateMakeOrderSchema.parse(orderPayload);
      expect(parsed.discount_type).toBe('percent');
      expect(parsed.discount_value).toBe(10);
      expect(parsed.discount_amount).toBe(7000);
      expect(parsed.final_price).toBe(63000);
      expect(parsed.items[0].max_discount_value).toBe(15);
    });
  });

  describe('3. Order Discount Enforcement & Totals Recalculation', () => {
    const sampleItems = [
      {
        product_id: 10,
        product_name: 'Ergonomic Desk',
        quantity: 2,
        item_cost_price: 10000,
        item_sale_price: 15000,
        max_discount_type: 'percent' as const,
        max_discount_value: 20 // 20% max discount per unit (3,000 max disc per unit => 6,000 total)
      },
      {
        product_id: 11,
        product_name: 'Mesh Chair',
        quantity: 1,
        item_cost_price: 5000,
        item_sale_price: 8000,
        max_discount_type: 'amount' as const,
        max_discount_value: 1000 // Fixed 1,000 max disc
      }
    ];
    // Subtotal: (15,000 * 2) + 8,000 = 38,000
    // Total cost: (10,000 * 2) + 5,000 = 25,000
    // Total allowed discount: (6,000) + 1,000 = 7,000
    // Total allowed discount %: (7,000 / 38,000) * 100 = 18.42%

    it('calculates totals correctly with a valid percentage discount below the limit', () => {
      const result = MakePricingService.calculateAndValidateTotals(sampleItems, {
        discount_type: 'percent',
        discount_value: 10
      });

      expect(result.isValid).toBe(true);
      expect(result.subtotal).toBe(38000);
      expect(result.discountType).toBe('percent');
      expect(result.discountValue).toBe(10);
      expect(result.discountAmount).toBe(3800); // 10% of 38,000
      expect(result.finalPrice).toBe(34200); // 38,000 - 3,800
      expect(result.totalCostPrice).toBe(25000);
      expect(result.marginAmount).toBe(9200); // 34,200 - 25,000
      expect(result.isLossMaking).toBe(false);
    });

    it('calculates totals correctly with a valid percentage discount exactly at the limit', () => {
      // Limit is 18.42% (7000 / 38000 = 18.42105%)
      const result = MakePricingService.calculateAndValidateTotals(sampleItems, {
        discount_type: 'percent',
        discount_value: 18.42
      });

      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBeCloseTo(7000, 0);
      expect(result.finalPrice).toBeCloseTo(31000, 0);
    });

    it('rejects a percentage discount exceeding the configured maximum limit', () => {
      // Attempting 25% discount when maximum allowed is 18.42%
      const result = MakePricingService.calculateAndValidateTotals(sampleItems, {
        discount_type: 'percent',
        discount_value: 25
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds the maximum permitted discount limit');
      expect(result.error).toContain('18.42%');
    });

    it('calculates totals correctly with a valid fixed-amount discount below the limit', () => {
      const result = MakePricingService.calculateAndValidateTotals(sampleItems, {
        discount_type: 'amount',
        discount_value: 5000
      });

      expect(result.isValid).toBe(true);
      expect(result.subtotal).toBe(38000);
      expect(result.discountType).toBe('amount');
      expect(result.discountValue).toBe(5000);
      expect(result.discountAmount).toBe(5000);
      expect(result.finalPrice).toBe(33000);
      expect(result.marginAmount).toBe(8000); // 33,000 - 25,000
    });

    it('rejects a fixed-amount discount exceeding the configured maximum limit', () => {
      // Attempting ৳8,500 discount when maximum allowed is ৳7,000
      const result = MakePricingService.calculateAndValidateTotals(sampleItems, {
        discount_type: 'amount',
        discount_value: 8500
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds the maximum permitted discount limit of ৳7,000');
    });

    it('avoids floating-point rounding errors in calculations', () => {
      const fractionalItems = [
        {
          product_name: 'Custom Shelf',
          quantity: 3,
          item_cost_price: 33.33,
          item_sale_price: 99.99
        }
      ];
      // Subtotal: 99.99 * 3 = 299.97
      // 10% discount: 29.997 -> rounded to 30.00
      // Final: 269.97
      const result = MakePricingService.calculateAndValidateTotals(fractionalItems, {
        discount_type: 'percent',
        discount_value: 10
      });

      expect(result.isValid).toBe(true);
      expect(result.subtotal).toBe(299.97);
      expect(result.discountAmount).toBe(30);
      expect(result.finalPrice).toBe(269.97);
      expect(result.totalCostPrice).toBe(99.99); // 33.33 * 3 = 99.99
    });

    it('provides backward-compatible default for products without configured discount limits', () => {
      const legacyItems = [
        {
          product_name: 'Historical Product A',
          quantity: 1,
          item_cost_price: 2000,
          item_sale_price: 5000
          // No max_discount_type or max_discount_value
        }
      ];

      // A 30% discount on a product with no limit should be permitted (not blocked)
      const result = MakePricingService.calculateAndValidateTotals(legacyItems, {
        discount_type: 'percent',
        discount_value: 30
      });

      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(1500);
      expect(result.finalPrice).toBe(3500);
    });
  });

  describe('4. Draft Restoration of Pricing Fields', () => {
    it('persists and restores catalog product pricing fields in draft', () => {
      clearProductCatalogDraft();

      const draft: ProductFormDraft = {
        formData: {
          product_name: 'Draft Executive Chair',
          cost_price: 7500,
          sale_price: 14000,
          max_discount_type: 'amount',
          max_discount_value: 2000,
          is_active: true
        }
      };

      saveProductCatalogDraft({ productForm: draft });
      const loaded = loadProductCatalogDraft();

      expect(loaded?.productForm?.formData?.product_name).toBe('Draft Executive Chair');
      expect(loaded?.productForm?.formData?.cost_price).toBe(7500);
      expect(loaded?.productForm?.formData?.sale_price).toBe(14000);
      expect(loaded?.productForm?.formData?.max_discount_type).toBe('amount');
      expect(loaded?.productForm?.formData?.max_discount_value).toBe(2000);

      // Verify meaningful content detection includes pricing
      expect(hasMeaningfulDraftContent({ productForm: draft.formData })).toBe(true);
    });

    it('persists and restores place order discount and pricing fields in draft', () => {
      clearPlaceOrderDraft();

      const orderDraft: PlaceOrderDraftData = {
        customerName: 'Sabbir Hossain',
        discountType: 'percent',
        discountValue: 12.5,
        cartItems: [
          {
            _id: '123',
            product_name: 'Teak Desk',
            quantity: 1,
            item_cost_price: 15000,
            item_sale_price: 25000,
            max_discount_type: 'percent',
            max_discount_value: 15
          }
        ]
      };

      savePlaceOrderDraft(orderDraft);
      const loaded = loadPlaceOrderDraft();

      expect(loaded?.customerName).toBe('Sabbir Hossain');
      expect(loaded?.discountType).toBe('percent');
      expect(loaded?.discountValue).toBe(12.5);
      expect(loaded?.cartItems?.[0]?.max_discount_type).toBe('percent');
      expect(loaded?.cartItems?.[0]?.max_discount_value).toBe(15);

      expect(hasMeaningfulPlaceOrderDraft(orderDraft)).toBe(true);
    });
  });

  describe('5. Role-Based Permissions for Pricing', () => {
    it('grants Superadmin full access to view and edit cost and sale prices', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'superadmin' }));

      const perms = getUserPricingPermissions();
      expect(perms.isSuperadmin).toBe(true);
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(true);
      expect(perms.canViewSalePrice).toBe(true);
      expect(perms.canEditSalePrice).toBe(true);
    });

    it('grants Furniture Designer access to view and edit both cost and sale prices', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'furniture_designer' }));

      const perms = getUserPricingPermissions();
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(true);
      expect(perms.canViewSalePrice).toBe(true);
      expect(perms.canEditSalePrice).toBe(true);
    });

    it('allows Salesperson to view cost price but hides sale price and forbids price edits', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'salesperson' }));

      const perms = getUserPricingPermissions();
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(false);
      expect(perms.canViewSalePrice).toBe(false);
      expect(perms.canEditSalePrice).toBe(false);
    });

    it('allows Factory Manager to view cost price but strictly hides sale price and forbids edit', () => {
      localStorage.setItem('user', JSON.stringify({ role: 'factory_manager' }));

      const perms = getUserPricingPermissions();
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(false);
      expect(perms.canViewSalePrice).toBe(false);
      expect(perms.canEditSalePrice).toBe(false);
    });
  });
});
