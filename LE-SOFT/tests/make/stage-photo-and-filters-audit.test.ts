import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MakeProductionService, CANONICAL_PRODUCTION_STAGES } from '../../electron/services/make/MakeProductionService';
import { normalizeDurableUploadFieldName } from '../../electron/services/media/DurableUploadService';
import { orderMatchesFilter, TRACK_ORDERS_FILTERS } from '../../src/pages/Make/TrackOrders';
import { supabase } from '../../electron/supabase';

vi.mock('../../electron/supabase', () => {
  return {
    supabase: {
      from: vi.fn()
    }
  };
});

describe('MAKE Stage Photo Upload & Schema Fallback Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MakeProductionService.setSupportsCurrentStagePhoto(null);
  });

  it('normalizes legacy queued stage-photo associations to the current database column', () => {
    expect(normalizeDurableUploadFieldName('make_orders', 'stage_photo_url')).toBe('current_stage_photo');
    expect(normalizeDurableUploadFieldName('make_orders', 'current_stage_photo')).toBe('current_stage_photo');
    expect(normalizeDurableUploadFieldName('make_order_updates', 'stage_photo_url')).toBe('stage_photo_url');
  });

  it('successfully advances stage and preserves photo in make_order_updates when make_orders.current_stage_photo is absent', async () => {
    const orderId = 101;
    const initialStatus = 'Work in process';
    const targetStage = 'Production On Going';
    const photoUrl = 'make-order-files/101/stages/photo_abc.webp';

    const existingOrder = {
      id: orderId,
      status: initialStatus,
      current_stage: initialStatus,
      production_hold: false,
      admin_approval_status: 'none'
    };

    let orderUpdateAttempts = 0;
    const insertedUpdates: any[] = [];
    const updatedOrders: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'make_orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: existingOrder, error: null }),
              maybeSingle: async () => ({ data: existingOrder, error: null })
            })
          }),
          update: (updates: any) => ({
            eq: async (_col: string, _val: any) => {
              orderUpdateAttempts++;
              if (updates.current_stage_photo && orderUpdateAttempts === 1) {
                // Simulate PostgREST schema cache error (missing column)
                return {
                  data: null,
                  error: {
                    message: "Could not find the 'current_stage_photo' column of 'make_orders' in the schema cache",
                    code: 'PGRST204'
                  }
                };
              }
              Object.assign(existingOrder, updates);
              updatedOrders.push(updates);
              return { data: [updates], error: null };
            }
          })
        };
      }
      if (table === 'make_order_updates') {
        return {
          insert: async (row: any) => {
            insertedUpdates.push(row);
            return { data: [row], error: null };
          }
        };
      }
      if (table === 'notifications') {
        return {
          insert: async () => ({ data: null, error: null })
        };
      }
      return {};
    });

    const result = await MakeProductionService.advanceOrderStage({
      orderId,
      targetStage,
      note: 'Welding completed, passing to assembly',
      photoUrl,
      actorName: 'Workshop Lead'
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe(targetStage);
    expect(result.photo_url).toBe(photoUrl);

    // Verify photo is preserved in make_order_updates
    expect(insertedUpdates.length).toBe(1);
    expect(insertedUpdates[0].stage).toBe(targetStage);
    expect(insertedUpdates[0].photo_url).toBe(photoUrl);
    expect(insertedUpdates[0].photo_urls).toEqual([photoUrl]);

    // Verify make_orders update retried without current_stage_photo
    expect(orderUpdateAttempts).toBe(2);
    expect(updatedOrders.length).toBe(1);
    expect(updatedOrders[0].status).toBe(targetStage);
    expect(updatedOrders[0].current_stage).toBe(targetStage);
    expect(updatedOrders[0].current_stage_photo).toBeUndefined();

    // Verify capability cache now remembers column is unsupported
    expect(MakeProductionService.getSupportsCurrentStagePhoto()).toBe(false);

    // Next call should skip current_stage_photo on make_orders immediately without failing first
    orderUpdateAttempts = 0;
    const secondResult = await MakeProductionService.advanceOrderStage({
      orderId,
      targetStage: 'Primary QC',
      note: 'QC check',
      photoUrl: 'make-order-files/101/stages/photo_qc.webp',
      actorName: 'Inspector'
    });

    expect(secondResult.success).toBe(true);
    expect(orderUpdateAttempts).toBe(1); // Exactly 1 attempt, no retry needed
    expect(updatedOrders[1].current_stage_photo).toBeUndefined();
  });

  it('updates make_orders.current_stage_photo when schema supports it', async () => {
    const orderId = 102;
    const initialStatus = 'Work in process';
    const targetStage = 'Production On Going';
    const photoUrl = 'make-order-files/102/stages/photo_supported.webp';

    const existingOrder = {
      id: orderId,
      status: initialStatus,
      current_stage: initialStatus,
      production_hold: false,
      admin_approval_status: 'none'
    };

    const updatedOrders: any[] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'make_orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: existingOrder, error: null }),
              maybeSingle: async () => ({ data: existingOrder, error: null })
            })
          }),
          update: (updates: any) => ({
            eq: async () => {
              updatedOrders.push(updates);
              return { data: [updates], error: null };
            }
          })
        };
      }
      if (table === 'make_order_updates') {
        return {
          insert: async (row: any) => ({ data: [row], error: null })
        };
      }
      return {};
    });

    const result = await MakeProductionService.advanceOrderStage({
      orderId,
      targetStage,
      photoUrl,
      actorName: 'Factory Manager'
    });

    expect(result.success).toBe(true);
    expect(updatedOrders.length).toBe(1);
    expect(updatedOrders[0].current_stage_photo).toBe(photoUrl);
    expect(MakeProductionService.getSupportsCurrentStagePhoto()).toBe(true);
  });

  it('fails closed and returns meaningful error on genuine database persistence failure', async () => {
    const orderId = 103;
    const existingOrder = {
      id: orderId,
      status: 'Work in process',
      current_stage: 'Work in process',
      production_hold: false,
      admin_approval_status: 'none'
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'make_orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: existingOrder, error: null }),
              maybeSingle: async () => ({ data: existingOrder, error: null })
            })
          }),
          update: () => ({
            eq: async () => ({
              data: null,
              error: { message: 'Database connection terminated unexpectedly', code: '57P01' }
            })
          })
        };
      }
      if (table === 'make_order_updates') {
        return {
          insert: async () => ({ data: [], error: null })
        };
      }
      return {};
    });

    const result = await MakeProductionService.advanceOrderStage({
      orderId,
      targetStage: 'Production On Going',
      photoUrl: 'make-order-files/103/photo.webp',
      actorName: 'Lead'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to update order record: Database connection terminated unexpectedly');
  });
});

describe('MAKE Track Orders Filters Suite', () => {
  it('defines exactly the 13 canonical filter buttons in correct order', () => {
    expect(TRACK_ORDERS_FILTERS).toEqual([
      'All',
      'Draft',
      'Awaiting Price',
      'Pricing done',
      'Pending approved',
      'Work in process',
      'Production On Going',
      'Primary QC',
      'Color Ongoing (oven)',
      'QC Final',
      'Packaging',
      'Ready to Ship',
      'Delivered'
    ]);
  });

  it('filters Draft orders accurately without substring false-positives', () => {
    const draftOrder = { id: 1, status: 'Draft', approval_status: 'draft' } as any;
    const otherOrder = { id: 2, status: 'Production On Going', approval_status: 'approved' } as any;

    expect(orderMatchesFilter(draftOrder, 'Draft')).toBe(true);
    expect(orderMatchesFilter(otherOrder, 'Draft')).toBe(false);
  });

  it('filters Awaiting Price and Pricing done accurately', () => {
    const awaitingOrder = { id: 3, status: 'Awaiting Pricing', approval_status: 'pending_pricing' } as any;
    const pricedOrder = { id: 4, status: 'Pricing Done', approval_status: 'priced' } as any;

    expect(orderMatchesFilter(awaitingOrder, 'Awaiting Price')).toBe(true);
    expect(orderMatchesFilter(pricedOrder, 'Awaiting Price')).toBe(false);

    expect(orderMatchesFilter(pricedOrder, 'Pricing done')).toBe(true);
    expect(orderMatchesFilter(awaitingOrder, 'Pricing done')).toBe(false);
  });

  it('filters Pending approved orders correctly', () => {
    const pendingOrder = { id: 5, status: 'Pending Approval', approval_status: 'pending' } as any;
    const modPendingOrder = { id: 6, status: 'Pending approved', approval_status: 'modification_pending_approval' } as any;
    const approvedOrder = { id: 7, status: 'Work in process', approval_status: 'approved' } as any;

    expect(orderMatchesFilter(pendingOrder, 'Pending approved')).toBe(true);
    expect(orderMatchesFilter(modPendingOrder, 'Pending approved')).toBe(true);
    expect(orderMatchesFilter(approvedOrder, 'Pending approved')).toBe(false);
  });

  it('filters canonical production stages and normalizes legacy stage names', () => {
    // 0: Work in process (legacy WIP, Cutting & Woodworking)
    expect(orderMatchesFilter({ id: 10, status: 'Work in process', current_stage: 'Work in process' } as any, 'Work in process')).toBe(true);
    expect(orderMatchesFilter({ id: 11, status: 'WIP', current_stage: 'WIP' } as any, 'Work in process')).toBe(true);
    expect(orderMatchesFilter({ id: 12, status: 'Cutting & Woodworking' } as any, 'Work in process')).toBe(true);

    // 1: Production On Going (legacy In Production, Metalwork)
    expect(orderMatchesFilter({ id: 13, status: 'Production On Going' } as any, 'Production On Going')).toBe(true);
    expect(orderMatchesFilter({ id: 14, status: 'In Production' } as any, 'Production On Going')).toBe(true);

    // 3: Color Ongoing (oven) (legacy Color Ongoing, Polish & Paint)
    expect(orderMatchesFilter({ id: 15, status: 'Color Ongoing (oven)' } as any, 'Color Ongoing (oven)')).toBe(true);
    expect(orderMatchesFilter({ id: 16, status: 'Color Ongoing' } as any, 'Color Ongoing (oven)')).toBe(true);
    expect(orderMatchesFilter({ id: 17, status: 'Polish & Paint' } as any, 'Color Ongoing (oven)')).toBe(true);

    // 7: Delivered (legacy Completed)
    expect(orderMatchesFilter({ id: 18, status: 'Delivered' } as any, 'Delivered')).toBe(true);
    expect(orderMatchesFilter({ id: 19, status: 'Completed' } as any, 'Delivered')).toBe(true);
    expect(orderMatchesFilter({ id: 20, status: 'Work in process' } as any, 'Delivered')).toBe(false);
  });

  it('All filter includes all orders', () => {
    const anyOrder = { id: 99, status: 'Draft' } as any;
    expect(orderMatchesFilter(anyOrder, 'All')).toBe(true);
  });
});
