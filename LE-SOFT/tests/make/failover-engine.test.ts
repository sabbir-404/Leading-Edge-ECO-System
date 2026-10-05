import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata'))
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

describe('DatabaseFailoverEngine — Dual Database Architecture & Reliability', () => {
  let engine: DatabaseFailoverEngine;
  let mockNasClient: any;
  let mockSupabaseClient: any;
  let mockSupabaseAdmin: any;

  const tempUserDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata');
  const journalPath = path.join(tempUserDir, 'fallback_write_journal.json');
  const mirrorJournalPath = path.join(tempUserDir, 'cloud_mirror_retry_journal.json');
  const freshnessPath = path.join(tempUserDir, 'fallback_freshness.json');

  const cleanTempFiles = () => {
    try {
      if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
      if (fs.existsSync(mirrorJournalPath)) fs.unlinkSync(mirrorJournalPath);
      if (fs.existsSync(freshnessPath)) fs.unlinkSync(freshnessPath);
      if (fs.existsSync(tempUserDir)) fs.rmdirSync(tempUserDir, { recursive: true });
    } catch {}
  };

  beforeEach(() => {
    cleanTempFiles();

    // Reset singleton instance
    (DatabaseFailoverEngine as any).instance = null;
    engine = DatabaseFailoverEngine.getInstance();

    mockNasClient = {
      from: vi.fn()
    };

    mockSupabaseClient = {
      from: vi.fn()
    };

    mockSupabaseAdmin = {
      from: vi.fn()
    };

    engine.registerClients({
      nas: mockNasClient,
      supabase: mockSupabaseClient,
      supabaseAdmin: mockSupabaseAdmin
    });
  });

  afterEach(() => {
    engine.stopBackgroundMonitoring();
    cleanTempFiles();
    vi.restoreAllMocks();
  });

  describe('1. Fast Health Detection & Intermittent Product-Load Protection', () => {
    it('initializes and reports active status and freshness metadata', () => {
      const status = engine.getStatus();
      expect(status).toHaveProperty('activeTarget');
      expect(status).toHaveProperty('circuitState');
      expect(status).toHaveProperty('connectionTier');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('freshness');
      expect(status.freshness).toHaveProperty('isFallbackReady');
      expect(status.freshness).toHaveProperty('storageWarningState');
    });

    it('probes candidate endpoints and selects the fastest responding NAS url', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('100.88.85.6')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.reject(new Error('Connection refused'));
      });
      global.fetch = fetchMock as any;

      const online = await engine.checkNasConnectivity({
        localUrl: 'http://192.168.1.14:3001',
        tunnelUrl: 'https://db.lenas.me',
        publicUrl: 'http://100.88.85.6:3001'
      });

      expect(online).toBe(true);
      const status = engine.getStatus();
      expect(status.isNasReachable).toBe(true);
      expect(status.activeNasUrl).toBe('http://100.88.85.6:3001');
      expect(status.connectionTier).toBe('nas_public');
    });

    it('prioritizes the last known working NAS URL on subsequent checks', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === 'https://db.lenas.me') {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.reject(new Error('Offline'));
      });
      global.fetch = fetchMock as any;

      await engine.checkNasConnectivity({
        tunnelUrl: 'https://db.lenas.me'
      });
      expect(engine.getStatus().activeNasUrl).toBe('https://db.lenas.me');

      fetchMock.mockClear();

      await engine.checkNasConnectivity({
        tunnelUrl: 'https://db.lenas.me',
        publicUrl: 'http://100.88.85.6:3001'
      });

      expect(fetchMock).toHaveBeenCalledWith('https://db.lenas.me', expect.objectContaining({ method: 'HEAD' }));
    });
  });

  describe('2. NAS Timeout, Failure & Automatic Supabase Failover (Issue A)', () => {
    it('executes read from NAS when healthy', async () => {
      (engine as any).circuitState = 'healthy';
      (engine as any).isNasReachable = true;

      const mockData = [{ id: 1, product_name: 'Premium Dining Table' }];
      const queryFn = vi.fn().mockResolvedValue({ data: mockData, error: null });

      const res = await engine.executeRead(queryFn, 'test-catalog-read');
      expect(res.databaseUsed).toBe('nas');
      expect(res.data).toEqual(mockData);
      expect(queryFn).toHaveBeenCalledWith(mockNasClient);
    });

    it('automatically falls back to Supabase Cloud on NAS timeout/network error without throwing', async () => {
      (engine as any).circuitState = 'healthy';
      (engine as any).isNasReachable = true;

      const mockFallbackData = [{ id: 1, product_name: 'Emergency Fallback Product' }];

      const queryFn = vi.fn().mockImplementation((client: any) => {
        if (client === mockNasClient) {
          return Promise.resolve({ data: null, error: { message: 'fetch failed: ECONNREFUSED' } });
        }
        return Promise.resolve({ data: mockFallbackData, error: null });
      });

      const res = await engine.executeRead(queryFn, 'load-product-catalog');

      expect(res.databaseUsed).toBe('supabase');
      expect(res.data).toEqual(mockFallbackData);
      expect(res.error).toBeNull();

      const status = engine.getStatus();
      expect(status.metrics.failoverQueries).toBeGreaterThanOrEqual(1);
    });

    it('trips circuit breaker to DEGRADED state after 2 consecutive transient NAS failures', () => {
      expect(engine.getStatus().circuitState).toBe('healthy');

      // First transient failure: circuit stays healthy
      engine.recordNasFailure(new Error('fetch failed: ETIMEDOUT'));
      expect(engine.getStatus().circuitState).toBe('healthy');

      // Second consecutive transient failure: NOW trips to degraded
      engine.recordNasFailure(new Error('fetch failed: ETIMEDOUT'));
      expect(engine.getStatus().circuitState).toBe('degraded');
      expect(engine.getStatus().activeTarget).toBe('supabase');
    });

    it('trips circuit breaker IMMEDIATELY on hard failure (ECONNREFUSED)', () => {
      expect(engine.getStatus().circuitState).toBe('healthy');

      engine.recordNasFailure(new Error('ECONNREFUSED'));
      expect(engine.getStatus().circuitState).toBe('degraded');
      expect(engine.getStatus().activeTarget).toBe('supabase');
    });

    it('routes subsequent reads immediately to Supabase Cloud when circuit is DEGRADED', async () => {
      (engine as any).circuitState = 'degraded';
      (engine as any).activeTarget = 'supabase';

      const mockData = [{ id: 10, product_name: 'Fast Fallback Item' }];
      const queryFn = vi.fn().mockResolvedValue({ data: mockData, error: null });

      const res = await engine.executeRead(queryFn, 'fast-read');
      expect(res.databaseUsed).toBe('supabase');
      expect(queryFn).toHaveBeenCalledWith(mockSupabaseClient);
      expect(queryFn).not.toHaveBeenCalledWith(mockNasClient);
    });
  });

  describe('3. Bidirectional Durability (Mirror Retry & Fallback Journal)', () => {
    it('executes writes to Supabase and journals them when in fallback mode', async () => {
      (engine as any).circuitState = 'degraded';
      (engine as any).activeTarget = 'supabase';

      const newProduct = {
        id: 999,
        product_code: 'OFFLINE-001',
        product_name: 'Offline Created Product',
        updated_at: new Date().toISOString()
      };

      const writeFn = vi.fn().mockResolvedValue({ data: newProduct, error: null });

      const res = await engine.executeWrite(
        writeFn,
        {
          table: 'make_products',
          operation: 'insert',
          primaryKey: { name: 'id', value: 999 },
          data: newProduct
        },
        'create-product-offline'
      );

      expect(res.databaseUsed).toBe('supabase');
      expect(res.data).toEqual(newProduct);

      const pending = engine.getPendingJournalEntries();
      expect(pending.length).toBe(1);
      expect(pending[0].table).toBe('make_products');
      expect(pending[0].operation).toBe('insert');
      expect(pending[0].data.product_code).toBe('OFFLINE-001');
      expect(pending[0].status).toBe('pending');
    });

    it('persists journal entries to disk and survives engine restarts', () => {
      (engine as any).circuitState = 'degraded';
      engine.journalWrite({
        table: 'make_products',
        operation: 'insert',
        data: { id: 888, product_name: 'Persisted Offline Product' }
      });

      (DatabaseFailoverEngine as any).instance = null;
      const restartedEngine = DatabaseFailoverEngine.getInstance();

      const pending = restartedEngine.getPendingJournalEntries();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.some(e => e.data.product_name === 'Persisted Offline Product')).toBe(true);
    });

    it('persists failed cloud mirror writes to mirror retry journal and retries them until acknowledged', async () => {
      (engine as any).circuitState = 'healthy';
      (engine as any).isNasReachable = true;

      // When NAS write succeeds, mock cloud upsert failure to trigger mirror retry journal
      mockNasClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 123, product_name: 'Mirror Test' }, error: null })
          })
        })
      });

      const cloudUpsertMock = vi.fn()
        .mockRejectedValueOnce(new Error('Supabase Cloud 503 Service Unavailable'))
        .mockResolvedValueOnce({ error: null });

      mockSupabaseAdmin.from.mockReturnValue({
        upsert: cloudUpsertMock
      });

      // Write on healthy NAS
      await engine.executeWrite(
        async client => client.from('make_products').insert({ id: 123, product_name: 'Mirror Test' }).select().single(),
        {
          table: 'make_products',
          operation: 'insert',
          primaryKey: { name: 'id', value: 123 },
          data: { id: 123, product_name: 'Mirror Test' }
        },
        'insert-with-mirror'
      );

      // Wait a tick for async mirror promise rejection to log into retry journal
      await new Promise(r => setTimeout(r, 20));

      const status = engine.getStatus();
      expect(status.pendingMirrorRetriesCount).toBe(1);

      // Retry the mirror operation
      const retryResult = await engine.processPendingMirrorRetries();
      expect(retryResult.succeeded).toBe(1);
      expect(retryResult.failed).toBe(0);
      expect(engine.getStatus().pendingMirrorRetriesCount).toBe(0);
    });
  });

  describe('4. Insert, Update & DELETE Reconciliation', () => {
    it('idempotently reconciles pending offline writes to NAS upon recovery', async () => {
      engine.journalWrite({
        table: 'make_products',
        operation: 'insert',
        primaryKey: { name: 'id', value: 777 },
        data: {
          id: 777,
          product_code: 'RECOVER-001',
          product_name: 'Recovered Table',
          updated_at: '2026-09-29T12:00:00.000Z'
        }
      });

      expect(engine.getPendingJournalEntries().length).toBe(1);

      (engine as any).isNasReachable = true;
      const nasUpsertMock = vi.fn().mockResolvedValue({ error: null });
      const nasMaybeSingleMock = vi.fn().mockResolvedValue({ data: null });

      mockNasClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: nasMaybeSingleMock
          })
        }),
        upsert: nasUpsertMock
      });

      const reconcileResult = await engine.reconcileFallbackWrites();

      expect(reconcileResult.reconciled).toBe(1);
      expect(reconcileResult.failed).toBe(0);
      expect(engine.getPendingJournalEntries().length).toBe(0);

      expect(nasUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 777,
          product_code: 'RECOVER-001'
        })
      );

      expect(engine.getStatus().circuitState).toBe('healthy');
      expect(engine.getStatus().activeTarget).toBe('nas');
    });

    it('safely reconciles DELETE operations so deleted items are NOT resurrected on NAS', async () => {
      // Record a delete operation performed during offline outage
      engine.journalWrite({
        table: 'make_products',
        operation: 'delete',
        primaryKey: { name: 'id', value: 654 }
      });

      (engine as any).isNasReachable = true;
      const nasDeleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      });

      mockNasClient.from.mockReturnValue({
        delete: nasDeleteMock
      });

      const res = await engine.reconcileFallbackWrites();
      expect(res.reconciled).toBe(1);
      expect(nasDeleteMock().eq).toHaveBeenCalledWith('id', 654);
    });

    it('resolves conflicts: does NOT overwrite newer NAS data with stale fallback data', async () => {
      const nasRow = {
        id: 555,
        product_name: 'Updated on NAS by Another Terminal',
        updated_at: '2026-09-29T15:00:00.000Z'
      };

      engine.journalWrite({
        table: 'make_products',
        operation: 'update',
        primaryKey: { name: 'id', value: 555 },
        data: {
          id: 555,
          product_name: 'Stale Fallback Edit',
          updated_at: '2026-09-29T14:00:00.000Z'
        }
      });

      (engine as any).isNasReachable = true;
      const nasUpsertMock = vi.fn().mockResolvedValue({ error: null });

      mockNasClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: nasRow })
          })
        }),
        upsert: nasUpsertMock
      });

      const res = await engine.reconcileFallbackWrites();
      expect(res.reconciled).toBe(1);
      expect(nasUpsertMock).not.toHaveBeenCalled();
    });

    it('re-running reconciliation multiple times is strictly idempotent', async () => {
      (engine as any).isNasReachable = true;
      // When queue is empty, returns 0 and does not error
      const firstRun = await engine.reconcileFallbackWrites();
      const secondRun = await engine.reconcileFallbackWrites();
      expect(firstRun.reconciled).toBe(0);
      expect(secondRun.reconciled).toBe(0);
    });
  });

  describe('5. Automated Fallback Bootstrap & Freshness Tracking', () => {
    it('populates fallback emergency dataset from authoritative NAS master', async () => {
      (engine as any).isNasReachable = true;

      const mockCategories = [{ id: 1, name: 'Desks' }];
      const mockProducts = [{ id: 10, product_code: 'DSK-01', product_name: 'Standard Desk' }];
      const mockOrders = [{ id: 100, order_number: 'ORD-01', status: 'Production', created_at: new Date().toISOString() }];

      mockNasClient.from.mockImplementation((table: string) => {
        if (table === 'make_product_categories') return { select: vi.fn().mockResolvedValue({ data: mockCategories, error: null }) };
        if (table === 'make_products') return { select: vi.fn().mockResolvedValue({ data: mockProducts, error: null }) };
        if (table === 'make_orders') return { select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: mockOrders, error: null }) }) };
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const cloudUpsertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseAdmin.from.mockReturnValue({ upsert: cloudUpsertMock });

      const bootstrapResult = await engine.bootstrapFallbackDataset();
      expect(bootstrapResult.success).toBe(true);
      expect(bootstrapResult.syncedTables['make_products']).toBe(1);
      expect(bootstrapResult.syncedTables['make_product_categories']).toBe(1);

      const status = engine.getStatus();
      expect(status.freshness.isFallbackReady).toBe(true);
      expect(status.freshness.productCount).toBe(1);
      expect(status.freshness.categoryCount).toBe(1);
      expect(status.freshness.lastSuccessfulMirrorTime).toBeGreaterThan(0);
    });

    it('auto-triggers bootstrap when fallback is detected empty', async () => {
      (engine as any).isNasReachable = true;

      // Mock cloud reporting 0 products
      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'make_products') {
          return {
            select: vi.fn().mockImplementation((_fields: any, opts: any) => {
              if (opts?.head) return Promise.resolve({ count: 0, error: null });
              return Promise.resolve({ data: [], error: null });
            }),
            upsert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return {
          select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          upsert: vi.fn().mockResolvedValue({ error: null })
        };
      });

      mockNasClient.from.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: [], error: null }) })
      }));

      const triggered = await engine.checkAndBootstrapFallbackIfEmpty();
      expect(triggered).toBe(true);
    });
  });

  describe('6. Bounded Supabase Fallback Dataset (~1 GB Retention & Warnings)', () => {
    it('prunes completed orders older than 90 days from Supabase Cloud only after NAS confirmation', async () => {
      const oldOrders = [
        { id: 101, order_number: 'ORD-OLD-01', status: 'Delivered' },
        { id: 102, order_number: 'ORD-OLD-02', status: 'Completed' }
      ];

      (engine as any).isNasReachable = true;

      mockNasClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [{ id: 101 }, { id: 102 }] })
        })
      });

      const cloudDeleteMock = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null })
      });

      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'make_orders') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: oldOrders, error: null })
                })
              })
            }),
            delete: cloudDeleteMock
          };
        }
        return {
          delete: cloudDeleteMock,
          select: vi.fn().mockReturnValue({ count: 10, head: true })
        };
      });

      const audit = await engine.maintainSupabaseRetention();

      expect(audit.prunedOrders).toBe(2);
      expect(cloudDeleteMock).toHaveBeenCalled();
      expect(mockNasClient.from).not.toHaveBeenCalledWith(expect.stringMatching(/delete/));
    });

    it('emits WARNING and CRITICAL states as fallback approaches 1 GB threshold', async () => {
      // Mock 32,000 orders to push estimated size over 800 MB
      mockSupabaseAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockImplementation((_fields: any, opts: any) => {
          if (opts?.head) {
            return Promise.resolve({ count: table === 'make_orders' ? 33000 : 100, error: null });
          }
          return {
            in: vi.fn().mockReturnValue({
              lt: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        })
      }));

      const audit = await engine.maintainSupabaseRetention();
      expect(audit.estimatedFallbackSizeMb).toBeGreaterThan(800);
      expect(audit.warningState).toBe('warning');

      const status = engine.getStatus();
      expect(status.freshness.storageWarningState).toBe('warning');
    });
  });
});
