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
    const mirrorJournalPath = path.join(tempUserDir, 'mirror_retry_journal.json');
    const freshnessPath = path.join(tempUserDir, 'freshness.json');

    const cleanTempFiles = () => {
        try {
            if (fs.existsSync(connectionStatePath)) fs.unlinkSync(connectionStatePath);
            if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
            if (fs.existsSync(mirrorJournalPath)) fs.unlinkSync(mirrorJournalPath);
            if (fs.existsSync(freshnessPath)) fs.unlinkSync(freshnessPath);
            if (fs.existsSync(tempUserDir)) fs.rmdirSync(tempUserDir, { recursive: true });
        } catch {}
    };

    beforeEach(() => {
        cleanTempFiles();
        (DatabaseFailoverEngine as any).instance = null;
        engine = DatabaseFailoverEngine.getInstance();

        const createMockTable = () => ({
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
            }),
            select: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                })
            })
        });

        mockNasClient = {
            from: vi.fn().mockImplementation(() => createMockTable())
        };

        mockSupabaseClient = {
            from: vi.fn().mockImplementation(() => createMockTable())
        };

        mockSupabaseAdmin = {
            from: vi.fn().mockImplementation(() => createMockTable())
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

    describe('2. Bounded 6000ms Query Timeout & Failover After Consecutive Failures', () => {
        it('falls back to Supabase Cloud when NAS query times out past 6000ms', { timeout: 20000 }, async () => {
            // Mock NAS query that hangs longer than 6000ms
            const nasQueryPromise = vi.fn().mockImplementation(() => new Promise((resolve) => {
                setTimeout(() => resolve({ data: [{ id: 1, name: 'Late Result' }], error: null }), 7000);
            }));

            const supabaseQueryPromise = vi.fn().mockResolvedValue({
                data: [{ id: 1, name: 'Cloud Fallback Product' }],
                error: null
            });

            // First timeout: NAS gets the failure recorded but circuit stays healthy
            const res1 = await engine.executeRead(async (client) => {
                if (client === mockNasClient) return nasQueryPromise();
                return supabaseQueryPromise();
            }, 'products-read');

            // After first timeout, engine falls back for THIS query but circuit is not yet degraded
            expect(res1.databaseUsed).toBe('supabase');
            expect(res1.data).toEqual([{ id: 1, name: 'Cloud Fallback Product' }]);
            expect(res1.error).toBeNull();

            // Second timeout: NOW circuit breaker trips to degraded
            const res2 = await engine.executeRead(async (client) => {
                if (client === mockNasClient) return nasQueryPromise();
                return supabaseQueryPromise();
            }, 'products-read-2');

            expect(res2.databaseUsed).toBe('supabase');

            const status = engine.getStatus();
            expect(status.circuitState).toBe('degraded');
            expect(status.activeTarget).toBe('supabase');
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(0);
        });

        it('immediately routes query to Supabase (0ms wait) during active cooldown', async () => {
            // Trip the circuit breaker — requires 2 consecutive timeout failures
            engine.recordNasFailure(new Error('ETIMEDOUT'));
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
            // 1st failure: timeout/transient does NOT trip circuit with only 1 failure
            engine.recordNasFailure(new Error('fetch failed'));
            let status = engine.getStatus();
            // Circuit is still healthy after 1 transient failure
            expect(status.circuitState).toBe('healthy');
            expect(status.latencyStats?.cooldownRemainingMs).toBeGreaterThan(25000);
            expect(status.latencyStats?.cooldownRemainingMs).toBeLessThanOrEqual(30000);

            // 2nd failure: now trips to degraded
            engine.recordNasFailure(new Error('fetch failed'));
            status = engine.getStatus();
            expect(status.circuitState).toBe('degraded');
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
            // Put engine into degraded state — requires 2 consecutive failures for transient errors
            engine.recordNasFailure(new Error('network outage'));
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
        it('A1. NAS successful write: writes to NAS master and successfully mirrors to Cloud', async () => {
            const product = { id: 501, product_code: 'TBL-EXEC-01', product_name: 'Executive Board Table' };
            const nasWriteFn = vi.fn().mockResolvedValue({ data: product, error: null });

            const mockTable = {
                upsert: vi.fn().mockResolvedValue({ data: product, error: null }),
                delete: vi.fn()
            };
            mockSupabaseAdmin.from.mockReturnValue(mockTable);

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

            // Wait a small tick for the async cloud mirror promise to complete
            await new Promise(r => setTimeout(r, 20));

            expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('make_products');
            expect(mockTable.upsert).toHaveBeenCalledWith(product);
        });

        it('A2. NAS write succeeds but cloud mirror fails: safely journaled for retry without breaking NAS write', async () => {
            const product = { id: 502, product_code: 'TBL-EXEC-02', product_name: 'Executive Side Table' };
            const nasWriteFn = vi.fn().mockResolvedValue({ data: product, error: null });

            const mockTable = {
                upsert: vi.fn().mockResolvedValue({ data: null, error: { message: 'Cloud connection timeout' } }),
                delete: vi.fn()
            };
            mockSupabaseAdmin.from.mockReturnValue(mockTable);

            const res = await engine.executeWrite(
                nasWriteFn,
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 502 },
                    data: product
                },
                'create-product-on-nas-mirror-fail'
            );

            // 1. NAS write returns successfully despite cloud mirror failure
            expect(res.databaseUsed).toBe('nas');
            expect(res.data).toEqual(product);
            expect(res.error).toBeNull();

            // Wait a small tick for the async cloud mirror promise to fail and journal
            await new Promise(r => setTimeout(r, 20));

            // 2. Failure safely recorded in mirror retry journal
            const retryEntries = engine.getMirrorRetryEntries();
            expect(retryEntries).toBeDefined();
            const found = retryEntries.find(e => e.table === 'make_products' && (e.data as any)?.id === 502);
            expect(found).toBeDefined();
            expect(found?.operation).toBe('insert');
        });

        it('A3. Missing or malformed client configuration followed by explicit, observable failure handling', async () => {
            // Case 1: Supabase client is completely missing (unregistered)
            engine.registerClients({
                nas: mockNasClient,
                supabase: null as any,
                supabaseAdmin: null as any
            });

            const productMissingClient = { id: 503, product_code: 'TBL-NO-CLIENT', product_name: 'No Client Table' };
            const nasWriteFn1 = vi.fn().mockResolvedValue({ data: productMissingClient, error: null });

            const res1 = await engine.executeWrite(
                nasWriteFn1,
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 503 },
                    data: productMissingClient
                },
                'write-with-missing-client'
            );

            expect(res1.databaseUsed).toBe('nas');
            expect(res1.data).toEqual(productMissingClient);
            expect(res1.error).toBeNull();

            // Wait small tick for mirror rejection to journal
            await new Promise(r => setTimeout(r, 20));

            let entries = engine.getMirrorRetryEntries();
            const found1 = entries.find(e => (e.data as any)?.id === 503);
            expect(found1).toBeDefined();

            // Case 2: Supabase client is malformed (missing from() function)
            engine.registerClients({
                nas: mockNasClient,
                supabase: {} as any,
                supabaseAdmin: {} as any
            });

            const productMalformedClient = { id: 504, product_code: 'TBL-BAD-CLIENT', product_name: 'Bad Client Table' };
            const nasWriteFn2 = vi.fn().mockResolvedValue({ data: productMalformedClient, error: null });

            const res2 = await engine.executeWrite(
                nasWriteFn2,
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 504 },
                    data: productMalformedClient
                },
                'write-with-malformed-client'
            );

            expect(res2.databaseUsed).toBe('nas');
            expect(res2.data).toEqual(productMalformedClient);
            expect(res2.error).toBeNull();

            await new Promise(r => setTimeout(r, 20));

            entries = engine.getMirrorRetryEntries();
            const found2 = entries.find(e => (e.data as any)?.id === 504);
            expect(found2).toBeDefined();

            // Restore clients for subsequent tests
            engine.registerClients({
                nas: mockNasClient,
                supabase: mockSupabaseClient,
                supabaseAdmin: mockSupabaseAdmin
            });
        });

        it('A4. Retry processing that eventually succeeds and removes the entry from the journal', async () => {
            const product = { id: 505, product_code: 'TBL-RETRY-01', product_name: 'Retry Board Table' };

            // 1. Add entry to mirror retry journal
            engine.journalMirrorRetry({
                table: 'make_products',
                operation: 'insert',
                primaryKey: { name: 'id', value: 505 },
                data: product
            });

            expect(engine.getMirrorRetryEntries().some(e => (e.data as any)?.id === 505)).toBe(true);

            // Test deduplication: calling journalMirrorRetry again for id: 505 updates in place without duplicating
            const updatedProduct = { id: 505, product_code: 'TBL-RETRY-01', product_name: 'Updated Retry Board Table' };
            engine.journalMirrorRetry({
                table: 'make_products',
                operation: 'update',
                primaryKey: { name: 'id', value: 505 },
                data: updatedProduct
            });

            const matchingEntries = engine.getMirrorRetryEntries().filter(e => (e.data as any)?.id === 505);
            expect(matchingEntries.length).toBe(1); // exactly 1, no duplicate entries created!
            expect(matchingEntries[0].data.product_name).toBe('Updated Retry Board Table');
            expect(matchingEntries[0].operation).toBe('update');

            // 2. Configure mock table with working upsert
            const mockUpsert = vi.fn().mockResolvedValue({ data: updatedProduct, error: null });
            mockSupabaseAdmin.from.mockReturnValue({
                upsert: mockUpsert,
                delete: vi.fn()
            });

            // 3. Process pending mirror retries
            const retryRes = await engine.processPendingMirrorRetries();
            expect(retryRes.succeeded).toBeGreaterThanOrEqual(1);
            expect(retryRes.failed).toBe(0);
            expect(mockUpsert).toHaveBeenCalledWith(updatedProduct);

            // 4. Verify entry is cleanly removed from mirror retry journal
            const remaining = engine.getMirrorRetryEntries();
            expect(remaining.some(e => (e.data as any)?.id === 505)).toBe(false);
        });

        it('A5. Delete mirroring: mirrors deletion to Supabase via primaryKey or filter', async () => {
            const mockDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
            const mockDelete = vi.fn().mockReturnValue({
                eq: mockDeleteEq
            });
            mockSupabaseAdmin.from.mockReturnValue({
                delete: mockDelete,
                upsert: vi.fn()
            });

            // 1. Delete with primaryKey
            const nasDeleteFn = vi.fn().mockResolvedValue({ data: null, error: null });
            const res = await engine.executeWrite(
                nasDeleteFn,
                {
                    table: 'make_products',
                    operation: 'delete',
                    primaryKey: { name: 'id', value: 506 }
                },
                'delete-product-on-nas'
            );

            expect(res.databaseUsed).toBe('nas');
            expect(res.error).toBeNull();

            await new Promise(r => setTimeout(r, 20));

            expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('make_products');
            expect(mockDelete).toHaveBeenCalled();
            expect(mockDeleteEq).toHaveBeenCalledWith('id', 506);
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

            // Single write timeout does NOT trip circuit breaker (requires 2 consecutive failures)
            // But the write is protected from duplication
            const status = engine.getStatus();
            expect(status.circuitState).toBe('healthy');
        });

        it('D. NAS genuinely offline before write -> safe Supabase fallback', async () => {
            // Pre-condition: NAS is already known to be degraded/offline — ECONNREFUSED trips immediately
            engine.recordNasFailure(new Error('ECONNREFUSED'));
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
            // Set degraded state — ECONNREFUSED is a hard failure, trips immediately
            engine.recordNasFailure(new Error('ECONNREFUSED'));

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

        it('E2. Idempotent reconciliation does not lose or duplicate orders or products during replay', async () => {
            // Set degraded state
            engine.recordNasFailure(new Error('ECONNREFUSED'));

            const offlineProduct = { id: 901, product_code: 'RECON-PROD-901', product_name: 'Reconciled Product' };
            const offlineOrder = { id: 902, order_number: 'MAKE-2026-RECON-902', customer_name: 'Reconciled Client' };

            // Journal both a product and an order while offline
            await engine.executeWrite(
                async () => ({ data: offlineProduct, error: null }),
                {
                    table: 'make_products',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 901 },
                    data: offlineProduct
                },
                'product-offline'
            );

            await engine.executeWrite(
                async () => ({ data: offlineOrder, error: null }),
                {
                    table: 'make_orders',
                    operation: 'insert',
                    primaryKey: { name: 'id', value: 902 },
                    data: offlineOrder
                },
                'order-offline'
            );

            // Mock NAS client accepting idempotent upserts
            (engine as any).isNasReachable = true;
            const upsertedTables: string[] = [];
            const upsertedData: any[] = [];
            mockNasClient.from.mockImplementation((tableName: string) => ({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                    })
                }),
                upsert: vi.fn().mockImplementation(async (d: any) => {
                    upsertedTables.push(tableName);
                    upsertedData.push(d);
                    return { data: d, error: null };
                })
            }));

            // First reconciliation run: both pending items should be reconciled
            const firstRun = await engine.reconcileFallbackWrites();
            expect(firstRun.reconciled).toBe(2);
            expect(firstRun.failed).toBe(0);
            expect(upsertedTables).toContain('make_products');
            expect(upsertedTables).toContain('make_orders');

            // Second reconciliation run: journal is already empty/cleared, 0 items replayed, no duplicate writes
            const secondRun = await engine.reconcileFallbackWrites();
            expect(secondRun.reconciled).toBe(0);
            expect(secondRun.failed).toBe(0);
            expect(upsertedTables.length).toBe(2); // exactly 2 upserts total, no duplicates!
        });

        it('F. Network recovery -> NAS verified and becomes primary again', async () => {
            // Start in degraded state — ECONNREFUSED is a hard failure, trips immediately
            engine.recordNasFailure(new Error('ECONNREFUSED'));
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

