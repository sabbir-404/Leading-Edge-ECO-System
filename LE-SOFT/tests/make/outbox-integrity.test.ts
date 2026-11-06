import { afterEach, describe, expect, it, vi } from 'vitest';
import { DurableOutboxService } from '../../electron/services/outbox/DurableOutboxService';

describe('Durable outbox data-integrity regressions', () => {
    const outbox = DurableOutboxService.getInstance();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('routes bill_shipping updates through UPDATE and preserves the requested status', async () => {
        let updatedPayload: any;
        const builder: any = {
            update: vi.fn((payload: any) => { updatedPayload = payload; return builder; }),
            eq: vi.fn(() => builder),
            select: vi.fn().mockResolvedValue({ data: [{ id: 22 }], error: null }),
            upsert: vi.fn()
        };
        const client: any = { from: vi.fn(() => builder) };

        const result = await outbox.executeOnClient(
            client,
            'bill_shipping',
            'update',
            { status: 'shipped', shipping_charge: 450 },
            'id',
            [{ column: 'id', value: 22 }]
        );

        expect(result.success).toBe(true);
        expect(builder.update).toHaveBeenCalledTimes(1);
        expect(updatedPayload.status).toBe('shipped');
        expect(builder.upsert).not.toHaveBeenCalled();
    });

    it('routes bill_shipping deletes through DELETE instead of recreating a pending shipment', async () => {
        const builder: any = {
            delete: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            select: vi.fn().mockResolvedValue({ data: [{ id: 22 }], error: null }),
            upsert: vi.fn()
        };
        const client: any = { from: vi.fn(() => builder) };

        const result = await outbox.executeOnClient(
            client,
            'bill_shipping',
            'delete',
            { id: 22 },
            'id',
            [{ column: 'id', value: 22 }]
        );

        expect(result.success).toBe(true);
        expect(builder.delete).toHaveBeenCalledTimes(1);
        expect(builder.upsert).not.toHaveBeenCalled();
    });

    it('preserves explicit shipping status on an insert/upsert and strips invoice lookup metadata', async () => {
        const lookup: any = {
            select: vi.fn(() => lookup),
            eq: vi.fn(() => lookup),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 51 }, error: null })
        };
        let writtenPayload: any;
        const shippingResult: any = {
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 82 }, error: null })
        };
        const shipping: any = {
            upsert: vi.fn((payload: any) => { writtenPayload = payload; return { select: vi.fn(() => shippingResult) }; })
        };
        const client: any = {
            from: vi.fn((table: string) => table === 'bills' ? lookup : shipping)
        };

        const result = await outbox.executeOnClient(
            client,
            'bill_shipping',
            'insert',
            { invoice_number: 'INV-51', status: 'shipped', ship_to_name: 'Client' },
            'id'
        );

        expect(result.success).toBe(true);
        expect(writtenPayload.bill_id).toBe(51);
        expect(writtenPayload.status).toBe('shipped');
        expect(writtenPayload.invoice_number).toBeUndefined();
    });

    it('refuses a partial bill-item retry without deleting existing invoice rows', async () => {
        const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
            delete: vi.fn()
        };
        const insert = vi.fn();
        const client: any = {
            from: vi.fn(() => ({
                ...query,
                select: query.select,
                eq: query.eq,
                delete: query.delete,
                insert
            }))
        };

        const result = await outbox.executeOnClient(
            client,
            'bill_items',
            'insert',
            [{ bill_id: 12, product_id: 1 }, { bill_id: 12, product_id: 2 }],
            'id'
        );

        expect(result.success).toBe(false);
        expect(String(result.error?.message)).toContain('Refusing destructive replacement');
        expect(query.delete).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
    });

    it('sets a future retry time with bounded exponential backoff', () => {
        const id = `retry-backoff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        outbox.enqueueSingle({
            id,
            entityType: 'test_entity',
            operation: 'insert',
            payload: { test: true },
            target: 'supabase',
            maxRetries: 10
        });

        const before = Date.now();
        (outbox as any).incrementRetry(id, 0, 10);
        const row = (outbox as any).db
            .prepare('SELECT * FROM outbox_operations WHERE id = ?')
            .get(id);

        expect(row.retry_count).toBe(1);
        expect(row.next_attempt_at).toBeGreaterThanOrEqual(before + 1000);
        expect(row.next_attempt_at).toBeLessThanOrEqual(before + 1500);
    });
});
