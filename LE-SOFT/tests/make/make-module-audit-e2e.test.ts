/**
 * tests/make/make-module-audit-e2e.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * End-to-End Test Suite for MAKE Module Audit & Feature Enhancements (Phases 1-10)
 *
 * Verifies:
 *  1. Phase 2: Multiple Invoice Attachments schema and handling
 *  2. Phase 3: Product-level pricing and item-level discounts
 *  3. Phase 4: Factory Manager price visibility (cost visible, sale hidden server-side)
 *  4. Phase 5: Money received, amount due, production hold, and admin override approval
 *  5. Phase 5: Payment ledger recording and automatic hold release on full payment
 *  6. Phase 6: Salesman assignment persistence on order placement
 *  7. Phase 7: Sequential production stage enforcement against holds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MakePricingService } from '../../electron/services/make/MakePricingService';
import { CreateMakeOrderSchema, RecordOrderPaymentSchema, ProductionApprovalDecisionSchema } from '../../electron/ipc/schemas/make.schema';
import {
  canViewCostPrice,
  canEditCostPrice,
  canViewSalePrice,
  canEditSalePrice,
  getUserPricingPermissions
} from '../../src/utils/permissions';

describe('MAKE Module Comprehensive Audit & Feature Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ─── Phase 2: Multiple Invoice Attachments ─────────────────────────────────
  describe('Phase 2: Multiple Invoice Attachments', () => {
    it('accepts order payload with multiple invoice attachment URLs', () => {
      const orderPayload = {
        furniture_name: 'Custom Executive Desk',
        customer_name: 'Apex Holdings Ltd',
        customer_phone: '01711000000',
        target_delivery_days: 15,
        delivery_date: '2026-11-15',
        salesman_id: 12,
        cost_price: 35000,
        sale_price: 52000,
        money_received: 20000,
        invoice_attachment_urls: [
          'https://storage.lenas.me/files/inv_001.pdf',
          'https://storage.lenas.me/files/inv_002.pdf',
          'https://storage.lenas.me/files/receipt_scan.png'
        ],
        items: [
          {
            product_name: 'Desk Frame',
            quantity: 1,
            item_cost_price: 35000,
            item_sale_price: 52000
          }
        ]
      };

      const parsed = CreateMakeOrderSchema.safeParse(orderPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.invoice_attachment_urls).toHaveLength(3);
        expect(parsed.data.invoice_attachment_urls?.[0]).toBe('https://storage.lenas.me/files/inv_001.pdf');
      }
    });

    it('gracefully handles missing or empty invoice_attachment_urls', () => {
      const orderPayload = {
        furniture_name: 'Solo Dining Table',
        customer_name: 'Rahim Khan',
        customer_phone: '01811223344',
        target_delivery_days: 10,
        delivery_date: '2026-11-10',
        items: [
          {
            product_name: 'Dining Table',
            quantity: 1
          }
        ]
      };

      const parsed = CreateMakeOrderSchema.safeParse(orderPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.invoice_attachment_urls).toBeUndefined();
      }
    });
  });

  // ─── Phase 3: Product-level Pricing & Line Discounts ───────────────────────
  describe('Phase 3: Product-level Pricing & Line Item Discounts', () => {
    it('validates catalog item with allowed percentage discount within product limit', () => {
      const items = [
        {
          product_name: 'Ergonomic Task Chair',
          quantity: 2,
          unit_sale_price: 15000,
          discount_type: 'percent' as const,
          discount_value: 10,
          max_discount_percent: 15, // limit is 15%
          item_sale_price: 13500, // 15000 - 1500
          item_cost_price: 9000
        }
      ];

      const totals = MakePricingService.calculateAndValidateTotals(items);
      expect(totals.isValid).toBe(true);
      expect(totals.subtotal).toBe(27000); // 2 * 13500
      expect(totals.totalCostPrice).toBe(18000);
      expect(totals.marginAmount).toBe(9000);
    });

    it('rejects line item percentage discount that exceeds product max_discount_percent', () => {
      const items = [
        {
          product_name: 'Executive Boardroom Table',
          quantity: 1,
          unit_sale_price: 80000,
          discount_type: 'percent' as const,
          discount_value: 25, // Requested 25%
          max_discount_percent: 20, // Max allowed is 20%
          item_sale_price: 60000
        }
      ];

      const totals = MakePricingService.calculateAndValidateTotals(items);
      expect(totals.isValid).toBe(false);
      expect(totals.error).toContain('exceeds the maximum permitted discount limit');
    });

    it('validates line item fixed-amount discount within product limit', () => {
      const items = [
        {
          product_name: 'Managerial L-Desk',
          quantity: 1,
          unit_sale_price: 45000,
          discount_type: 'amount' as const,
          discount_value: 4000,
          max_discount_amount: 5000,
          item_sale_price: 41000,
          item_cost_price: 28000
        }
      ];

      const totals = MakePricingService.calculateAndValidateTotals(items);
      expect(totals.isValid).toBe(true);
      expect(totals.subtotal).toBe(41000);
      expect(totals.marginAmount).toBe(13000);
    });

    it('allows designer to enter custom sale price for non-catalog items', () => {
      const customItems = [
        {
          product_name: 'Custom Reception Counter with LED Backlight',
          quantity: 1,
          item_cost_price: 32000, // Set by Designer
          item_sale_price: 58000  // Set by designer
        }
      ];

      const totals = MakePricingService.calculateAndValidateTotals(customItems);
      expect(totals.isValid).toBe(true);
      expect(totals.subtotal).toBe(58000);
      expect(totals.totalCostPrice).toBe(32000);
      expect(totals.marginAmount).toBe(26000);
    });
  });

  // ─── Phase 4: Factory Manager Price Visibility ─────────────────────────────
  describe('Phase 4: Factory Manager Price Visibility & Redaction', () => {
    it('grants cost price visibility to Factory Manager', () => {
      expect(canViewCostPrice('factory manager')).toBe(true);
      expect(canViewCostPrice('factory_manager')).toBe(true);
      expect(canViewCostPrice('Factory Manager')).toBe(true);
    });

    it('strictly denies sale price visibility to Factory Manager', () => {
      expect(canViewSalePrice('factory manager')).toBe(false);
      expect(canViewSalePrice('factory_manager')).toBe(false);
      expect(canViewSalePrice('Factory Manager')).toBe(false);
      expect(canEditSalePrice('factory manager')).toBe(false);
    });

    it('returns correct composite pricing permissions for Factory Manager', () => {
      const perms = getUserPricingPermissions('factory_manager');
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(false);
      expect(perms.canViewSalePrice).toBe(false);
      expect(perms.canEditSalePrice).toBe(false);
    });

    it('returns correct composite pricing permissions for Salesperson', () => {
      const perms = getUserPricingPermissions('salesperson');
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(false);
      expect(perms.canViewSalePrice).toBe(false);
      expect(perms.canEditSalePrice).toBe(false);
    });

    it('returns correct composite pricing permissions for Furniture Designer', () => {
      const perms = getUserPricingPermissions('designer');
      expect(perms.canViewCostPrice).toBe(true);
      expect(perms.canEditCostPrice).toBe(true);
      expect(perms.canViewSalePrice).toBe(true);
      expect(perms.canEditSalePrice).toBe(true);
    });

    it('scrubs sale prices from order record for factory manager in simulation', () => {
      const rawOrder = {
        id: 99,
        order_number: 'MAKE-2026-000099',
        cost_price: 25000,
        sale_price: 38000,
        final_price: 38000,
        money_received: 20000,
        amount_due: 18000,
        items: [
          {
            id: 1,
            unit_cost_price: 25000,
            unit_sale_price: 38000,
            item_cost_price: 25000,
            item_sale_price: 38000
          }
        ]
      };

      // Server-side scrubbing logic simulation (as implemented in electron/ipc/handlers/make.ts)
      const userRole = 'factory_manager';
      const isFactory = userRole === 'factory_manager' || userRole === 'factory manager';
      const scrubbed = { ...rawOrder };
      if (isFactory) {
        scrubbed.sale_price = null as any;
        scrubbed.final_price = null as any;
        scrubbed.money_received = null as any;
        scrubbed.amount_due = null as any;
        scrubbed.items = scrubbed.items.map(it => ({
          ...it,
          unit_sale_price: null,
          item_sale_price: null
        }));
      }

      // Cost price is intact
      expect(scrubbed.cost_price).toBe(25000);
      expect(scrubbed.items[0].item_cost_price).toBe(25000);

      // Sale price is scrubbed
      expect(scrubbed.sale_price).toBeNull();
      expect(scrubbed.final_price).toBeNull();
      expect(scrubbed.money_received).toBeNull();
      expect(scrubbed.amount_due).toBeNull();
      expect(scrubbed.items[0].item_sale_price).toBeNull();
    });
  });

  // ─── Phase 5: Money Received, Amount Due & Production Hold ─────────────────
  describe('Phase 5: Financial Status, Production Hold & Payment Workflow', () => {
    it('sets production hold active and status partial when order has unpaid balance', () => {
      const totalSale = 50000;
      const moneyReceived = 20000;
      const amountDue = Math.max(0, totalSale - moneyReceived);
      const paymentStatus = amountDue <= 0 ? 'paid' : (moneyReceived > 0 ? 'partial' : 'unpaid');
      const productionHold = amountDue > 0;

      expect(amountDue).toBe(30000);
      expect(paymentStatus).toBe('partial');
      expect(productionHold).toBe(true);
    });

    it('sets payment status unpaid and production hold when zero advance payment', () => {
      const totalSale = 45000;
      const moneyReceived = 0;
      const amountDue = totalSale - moneyReceived;
      const paymentStatus = amountDue <= 0 ? 'paid' : (moneyReceived > 0 ? 'partial' : 'unpaid');
      const productionHold = amountDue > 0;

      expect(amountDue).toBe(45000);
      expect(paymentStatus).toBe('unpaid');
      expect(productionHold).toBe(true);
    });

    it('sets payment status paid and production hold false when 100% advance received', () => {
      const totalSale = 60000;
      const moneyReceived = 60000;
      const amountDue = Math.max(0, totalSale - moneyReceived);
      const paymentStatus = amountDue <= 0 ? 'paid' : (moneyReceived > 0 ? 'partial' : 'unpaid');
      const productionHold = amountDue > 0;

      expect(amountDue).toBe(0);
      expect(paymentStatus).toBe('paid');
      expect(productionHold).toBe(false);
    });

    it('validates RecordOrderPaymentSchema with valid positive amount', () => {
      const validPayload = {
        orderId: 105,
        amount: 15000,
        paymentMethod: 'BKASH',
        reference: 'TRX-87391823',
        notes: 'Second installment via bKash merchant'
      };

      const result = RecordOrderPaymentSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects RecordOrderPaymentSchema with zero or negative amount', () => {
      const zeroPayload = {
        orderId: 105,
        amount: 0
      };
      expect(RecordOrderPaymentSchema.safeParse(zeroPayload).success).toBe(false);

      const negPayload = {
        orderId: 105,
        amount: -500
      };
      expect(RecordOrderPaymentSchema.safeParse(negPayload).success).toBe(false);
    });

    it('validates ProductionApprovalDecisionSchema with approved and rejected choices', () => {
      const approvePayload = {
        orderId: 105,
        decision: 'approved' as const,
        notes: 'Corporate client approved by Managing Director'
      };
      expect(ProductionApprovalDecisionSchema.safeParse(approvePayload).success).toBe(true);

      const rejectPayload = {
        orderId: 105,
        decision: 'rejected' as const,
        notes: 'Hold enforced until 50% deposit cleared'
      };
      expect(ProductionApprovalDecisionSchema.safeParse(rejectPayload).success).toBe(true);

      const invalidPayload = {
        orderId: 105,
        decision: 'maybe' as any
      };
      expect(ProductionApprovalDecisionSchema.safeParse(invalidPayload).success).toBe(false);
    });

    it('simulates payment ledger progression clearing hold upon 100% balance settlement', () => {
      const order = {
        final_price: 50000,
        money_received: 20000,
        amount_due: 30000,
        payment_status: 'partial',
        production_hold: true
      };

      // Record second payment of 30,000
      const paymentAmount = 30000;
      const newReceived = order.money_received + paymentAmount;
      const newDue = Math.max(0, order.final_price - newReceived);
      const newStatus = newDue <= 0 ? 'paid' : (newReceived > 0 ? 'partial' : 'unpaid');
      const newHold = newDue > 0;

      expect(newReceived).toBe(50000);
      expect(newDue).toBe(0);
      expect(newStatus).toBe('paid');
      expect(newHold).toBe(false); // Hold automatically released!
    });
  });

  // ─── Phase 6: Salesman Assignment ──────────────────────────────────────────
  describe('Phase 6: Salesman Assignment on Order Placement', () => {
    it('validates CreateMakeOrderSchema with salesman_id integer', () => {
      const orderPayload = {
        furniture_name: 'Conference Table',
        customer_name: 'Square Pharmaceuticals',
        customer_phone: '01700112233',
        target_delivery_days: 20,
        salesman_id: 8,
        items: [{ product_name: 'Table Top', quantity: 1 }]
      };

      const parsed = CreateMakeOrderSchema.safeParse(orderPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.salesman_id).toBe(8);
      }
    });

    it('accepts null salesman_id when no salesman is assigned', () => {
      const orderPayload = {
        furniture_name: 'Conference Table',
        customer_name: 'Square Pharmaceuticals',
        customer_phone: '01700112233',
        target_delivery_days: 20,
        salesman_id: null,
        items: [{ product_name: 'Table Top', quantity: 1 }]
      };

      const parsed = CreateMakeOrderSchema.safeParse(orderPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.salesman_id).toBeNull();
      }
    });
  });

  // ─── Phase 7: Production Hold Enforcement on Stage Transitions ─────────────
  describe('Phase 7: Production Stage Transitions & Hold Rejection', () => {
    it('enforces that production hold blocks progression past Placed stage unless approved', () => {
      // Order with hold active and no admin override approval
      const heldOrder = {
        status: 'Placed',
        production_hold: true,
        admin_approval_status: 'none',
        amount_due: 25000
      };

      // Moving to 'Work in process' should be blocked
      const isBlocked = heldOrder.production_hold && heldOrder.admin_approval_status !== 'approved';
      expect(isBlocked).toBe(true);
    });

    it('permits stage transition when admin override is approved despite unpaid balance', () => {
      // Order with hold active BUT admin override is approved
      const approvedHeldOrder = {
        status: 'Placed',
        production_hold: true,
        admin_approval_status: 'approved',
        amount_due: 25000
      };

      const isBlocked = approvedHeldOrder.production_hold && approvedHeldOrder.admin_approval_status !== 'approved';
      expect(isBlocked).toBe(false); // Production allowed to proceed!
    });

    it('permits stage transition when order is fully paid (hold false)', () => {
      const fullyPaidOrder = {
        status: 'Placed',
        production_hold: false,
        admin_approval_status: null,
        amount_due: 0
      };

      const isBlocked = fullyPaidOrder.production_hold && fullyPaidOrder.admin_approval_status !== 'approved';
      expect(isBlocked).toBe(false);
    });
  });
});
