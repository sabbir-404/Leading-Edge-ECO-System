import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => process.cwd() + '/tests/fixtures/temp_userdata_nas')
    },
    BrowserWindow: {
        getAllWindows: vi.fn(() => [])
    }
}));

describe('Smart NAS / Tailscale Database Access — Issue 2 Fixes', () => {
    let engine: DatabaseFailoverEngine;
    let mockNasClient: any;
    let mockSupabaseClient: any;
    let mockSupabaseAdmin: any;

    const tempUserDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata_nas');
    const connectionStatePath = path.join(tempUserDir, 'nas_connection.json');
    const journalPath = path.join(tempUserDir, 'fallback_write_journal.json');

    const cleanTempFiles = () => {
        try {
            if (fs.existsSync(connectionStatePath)) fs.unlinkSync(connectionStatePath);
            if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
            if (fs.existsSync(tempUserDir)) fs.rmdirSync(tempUserDir, { recursive: true });
        } catch {}
    };

    beforeEach(() => {
        cleanTempFiles();
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

    describe('1. Non-Blocking Startup & Fast Endpoint Preference', () => {
        it('persists and reloads lastWorkingNasUrl across app restarts', async () => {
            const fetchMock = vi.fn().mockImplementation((url: string) => {
                if (url.includes('192.168.1.14')) {
                    return Promise.resolve({ ok: true, status: 200 });
                }
                return Promise.reject(new Error('unreachable'));
            });
            global.fetch = fetchMock as any;

            await engine.checkNasConnectivity({
                localUrl: 'http://192.168.1.14:3001',
                tunnelUrl: 'https://db.lenas.me',
                publicUrl: 'http://100.88.85.6:3001'
            });

            expect(engine.getLastWorkingNasUrl()).toBe('http://192.168.1.14:3001');

            // Simulate app restart by instantiating new engine
            (DatabaseFailoverEngine as any).instance = null;
            const newEngine = DatabaseFailoverEngine.getInstance();
            expect(newEngine.getLastWorkingNasUrl()).toBe('http://192.168.1.14:3001');
        });

        it('probes lastWorkingNasUrl first before trying other endpoints', async () => {
            // Save state indicating tunnel was the last working url
            fs.mkdirSync(tempUserDir, { recursive: true });
            fs.writeFileSync(connectionStatePath, JSON.stringify({
                lastWorkingNasUrl: 'https://db.lenas.me',
                tier: 'nas_tunnel',
                updatedAt: Date.now()
            }));

            (DatabaseFailoverEngine as any).instance = null;
            const restoredEngine = DatabaseFailoverEngine.getInstance();
            expect(restoredEngine.getLastWorkingNasUrl()).toBe('https://db.lenas.me');

            const fetchCalls: string[] = [];
            global.fetch = vi.fn().mockImplementation((url: string) => {
                fetchCalls.push(url);
                return Promise.resolve({ ok: true, status: 200 });
            }) as any;

            const online = await restoredEngine.checkNasConnectivity({
                localUrl: 'http://192.168.1.14:3001',
                tunnelUrl: 'https://db.lenas.me',
                publicUrl: 'http://100.88.85.6:3001'
            });

            expect(online).toBe(true);
            // Verify that the very first probed URL was the last working candidate
            expect(fetchCalls[0]).toContain('db.lenas.me');
        });
    });

    describe('2. Bounded 2000ms Query Timeout & Immediate Failover', () => {
        it('falls back to Supabase Cloud when NAS query times out past 2000ms', async () => {
            // Mock NAS query that hangs longer than 2000ms
            const nasQueryPromise = vi.fn().mockImplementation(() => new Promise((resolve) => {
                setTimeout(() => resolve({ data: [{ id: 1, name: 'Late Result' }], error: null }), 3000);
            }));

            const supabaseQueryPromise = vi.fn().mockResolvedValue({
                data: [{ id: 1, name: 'Cloud Fallback Product' }],
                error: null
            });

            const res = await engine.executeRead(async (client) => {
                if (client === mockNasClient) return nasQueryPromise();
                return supabaseQueryPromise();
            }, 'products-read');

            expect(res.databaseUsed).toBe('supabase');
            expect(res.data).toEqual([{ id: 1, name: 'Cloud Fallback Product' }]);
            expect(res.error).toBeNull();

            // Circuit breaker tripped to degraded
            const status = engine.getStatus();
            expect(status.circuitState).toBe('degraded');
            expect(status.activeTarget).toBe('supabase');
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(0);
        });

        it('immediately routes query to Supabase (0ms wait) during active cooldown', async () => {
            // Trip the circuit breaker
            engine.recordNasFailure(new Error('ETIMEDOUT'));
            expect(engine.getStatus().circuitState).toBe('degraded');

            let nasCalled = false;
            let supabaseCalled = false;

            const res = await engine.executeRead(async (client) => {
                if (client === mockNasClient) {
                    nasCalled = true;
                    return { data: null, error: new Error('Should not be called') };
                }
                supabaseCalled = true;
                return { data: [{ id: 99, name: 'Fast Fallback' }], error: null };
            }, 'fast-read-during-cooldown');

            expect(nasCalled).toBe(false);
            expect(supabaseCalled).toBe(true);
            expect(res.databaseUsed).toBe('supabase');
            expect(res.data).toEqual([{ id: 99, name: 'Fast Fallback' }]);
        });
    });

    describe('3. Adaptive Cooldown on Flapping (30s to 120s)', () => {
        it('increases cooldown duration on repeated/flapping NAS failures up to 120s max', () => {
            // 1st failure: 30s base
            engine.recordNasFailure(new Error('fetch failed'));
            let status = engine.getStatus();
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(25000);
            expect(status.latencyStats?.cooldownRemainingMs).toBeLessThanOrEqual(30000);

            // 2nd failure: 30 * 1.5 = 45s
            engine.recordNasFailure(new Error('fetch failed'));
            status = engine.getStatus();
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(40000);
            expect(status.latencyStats?.cooldownRemainingMs).toBeLessThanOrEqual(45000);

            // 5+ failures: capped at 120s
            for (let i = 0; i < 5; i++) {
                engine.recordNasFailure(new Error('fetch failed'));
            }
            status = engine.getStatus();
            expect(status.latencyStats?.cooldownRemainingMs).toBeLessThanOrEqual(120000);
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(110000);
        });

        it('resets cooldown to 0 on verified NAS success', () => {
            engine.recordNasFailure(new Error('fetch failed'));
            expect(engine.getStatus().latencyStats?.cooldownRemainingMs).toBeGreaterThan(0);

            engine.recordNasSuccess(45);
            const status = engine.getStatus();
            expect(status.latencyStats?.cooldownRemainingMs).toBe(0);
            expect(status.latencyStats?.lastLatencyMs).toBe(45);
            expect(status.latencyStats?.avgLatencyMs).toBe(45);
        });
    });

    describe('4. Real Query Verification & Recovery', () => {
        it('verifies NAS health with a real query before restoring primary state', async () => {
            // Put engine into degraded state
            engine.recordNasFailure(new Error('network outage'));
            expect(engine.getStatus().circuitState).toBe('degraded');

            // Setup mock for real verification query: client.from('companies').select('id').limit(1)
            const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
            const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
            mockNasClient.from.mockImplementation((table: string) => {
                if (table === 'companies') return { select: mockSelect };
                return { select: vi.fn() };
            });

            const recovered = await engine.verifyAndRecoverNas();
            expect(recovered).toBe(true);

            const status = engine.getStatus();
            expect(status.circuitState).toBe('healthy');
            expect(status.activeTarget).toBe('nas');
            expect(status.latencyStats?.cooldownRemainingMs).toBe(0);
        });

        it('refuses to restore primary state if real verification query fails', async () => {
            engine.recordNasFailure(new Error('network outage'));
            expect(engine.getStatus().circuitState).toBe('degraded');

            // Mock verification query failing
            const mockLimit = vi.fn().mockResolvedValue({ data: null, error: { message: '502 Bad Gateway' } });
            const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
            mockNasClient.from.mockImplementation((table: string) => {
                if (table === 'companies') return { select: mockSelect };
                return { select: vi.fn() };
            });

            const recovered = await engine.verifyAndRecoverNas();
            expect(recovered).toBe(false);

            const status = engine.getStatus();
            expect(status.circuitState).toBe('degraded');
            expect(status.activeTarget).toBe('supabase');
        });
    });

    describe('5. Architectural Write Safety & Ambiguous Timeout Protection (Tests A-F)', () => {
        it('A. NAS successful write: writes to NAS master and mirrors to Cloud', async () => {
            const product = { id: 501, product_code: 'TBL-EXEC-01', product_name: 'Executive Board Table' };
            const nasWriteFn = vi.fn().mockResolvedValue({ data: product, error: null });

            const res = await engine.executeWrite(
                nasWriteFn,
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 501 },
                    data: product
                },
                'create-product-on-nas'
            );

            expect(res.databaseUsed).toBe('nas');
            expect(res.data).toEqual(product);
            expect(res.error).toBeNull();
            expect(nasWriteFn).toHaveBeenCalledWith(mockNasClient);
        });

        it('B & C. Ambiguous timeout: NAS write response times out -> operation is NOT duplicated on Supabase', async () => {
            // Simulate NAS accepting the request and committing, but the response times out past 3000ms
            const hangingNasWrite = vi.fn().mockImplementation(() => new Promise((resolve) => {
                setTimeout(() => resolve({ data: { id: 502, name: 'Late Commit' }, error: null }), 4000);
            }));

            let supabaseWriteCalled = false;
            const writeFn = vi.fn().mockImplementation(async (client) => {
                if (client === mockNasClient) {
                    return hangingNasWrite();
                }
                supabaseWriteCalled = true;
                return { data: { id: 502, name: 'Duplicate on Supabase' }, error: null };
            });

            const res = await engine.executeWrite(
                writeFn,
                {
                    table: 'make_orders',
                    operation: 'insert',
                    primaryKey: { name: 'order_number', value: 'MAKE-2026-000502' },
                    data: { order_number: 'MAKE-2026-000502', customer_name: 'Acme Corp' }
                },
                'create-order-with-nas-timeout'
            );

            // B. Operation timed out on NAS
            expect(res.databaseUsed).toBe('nas');
            expect(res.error).toBeDefined();
            expect(res.error.message).toContain('NAS write timeout');

            // C. CRITICAL CHECK: Same operation must NOT be duplicated on Supabase
            expect(supabaseWriteCalled).toBe(false);
            expect(res.data).toBeNull();

            // Circuit breaker tripped to degraded to guard subsequent operations
            expect(engine.getStatus().circuitState).toBe('degraded');
        });

        it('D. NAS genuinely offline before write -> safe Supabase fallback', async () => {
            // Pre-condition: NAS is already known to be degraded/offline
            engine.recordNasFailure(new Error('connection refused'));
            expect(engine.getStatus().circuitState).toBe('degraded');

            let nasCalled = false;
            let supabaseCalled = false;
            const fallbackProduct = { id: 777, product_code: 'FALLBACK-ITEM', product_name: 'Fallback Item' };

            const writeFn = vi.fn().mockImplementation(async (client) => {
                if (client === mockNasClient) {
                    nasCalled = true;
                    return { data: null, error: new Error('Should not reach NAS') };
                }
                supabaseCalled = true;
                return { data: fallbackProduct, error: null };
            });

            const res = await engine.executeWrite(
                writeFn,
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 777 },
                    data: fallbackProduct
                },
                'create-product-during-outage'
            );

            expect(nasCalled).toBe(false);
            expect(supabaseCalled).toBe(true);
            expect(res.databaseUsed).toBe('supabase');
            expect(res.data).toEqual(fallbackProduct);
            expect(res.error).toBeNull();
        });

        it('E. Product creation during fallback -> journaled -> NAS reconciliation', async () => {
            // Set degraded state
            engine.recordNasFailure(new Error('WAN link down'));

            const offlineOrder = { id: 801, order_number: 'MAKE-2026-OFFLINE-801' };
            const writeFn = vi.fn().mockImplementation(async (client) => {
                return { data: offlineOrder, error: null };
            });

            await engine.executeWrite(
                writeFn,
                {
                    table: 'make_orders',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 801 },
                    data: offlineOrder
                },
                'order-during-fallback'
            );

            // Verify written to fallback write journal
            const pending = engine.getPendingJournalEntries();
            expect(pending.length).toBeGreaterThanOrEqual(1);
            const entry = pending.find(e => e.table === 'make_orders' && e.data?.order_number === 'MAKE-2026-OFFLINE-801');
            expect(entry).toBeDefined();
            expect(entry?.operation).toBe('insert');

            // Setup NAS mock for reconciliation
            (engine as any).isNasReachable = true;
            const mockUpsert = vi.fn().mockResolvedValue({ data: offlineOrder, error: null });
            mockNasClient.from.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                    })
                }),
                upsert: mockUpsert
            });

            // Reconcile pending writes to NAS
            const result = await engine.reconcileFallbackWrites();
            expect(result.reconciled).toBeGreaterThanOrEqual(1);
        });

        it('F. Network recovery -> NAS verified and becomes primary again', async () => {
            // Start in degraded state
            engine.recordNasFailure(new Error('temporary glitch'));
            expect(engine.getStatus().circuitState).toBe('degraded');
            expect(engine.getStatus().activeTarget).toBe('supabase');

            // Setup mock for real lightweight verification query: client.from('companies').select('id').limit(1)
            const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
            const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
            mockNasClient.from.mockImplementation((table: string) => {
                if (table === 'companies') return { select: mockSelect };
                return { select: vi.fn() };
            });

            const recovered = await engine.verifyAndRecoverNas();
            expect(recovered).toBe(true);

            // NAS restored as primary authority
            const status = engine.getStatus();
            expect(status.circuitState).toBe('healthy');
            expect(status.activeTarget).toBe('nas');
            expect(status.latencyStats?.cooldownRemainingMs).toBe(0);
        });
    });
});

