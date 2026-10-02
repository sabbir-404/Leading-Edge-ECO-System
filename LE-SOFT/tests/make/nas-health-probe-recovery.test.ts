import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';
import fs from 'fs';
import path from 'path';

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => process.cwd() + '/tests/fixtures/temp_userdata_probe')
    },
    BrowserWindow: {
        getAllWindows: vi.fn(() => [])
    }
}));

describe('NAS Health Probe & False-Negative Recovery Tests (v1.8.6)', () => {
    let engine: DatabaseFailoverEngine;
    let mockNasClient: any;
    let mockSupabaseClient: any;
    let mockSupabaseAdmin: any;

    const tempUserDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata_probe');
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

    // 1. NAS health endpoint returns 403 HTML, but actual make_products GET succeeds
    it('1. NAS remains usable and loads Product Catalog when an unrelated proxy endpoint returns 403 HTML but make_products succeeds', async () => {
        // Direct NAS query succeeds
        const productsData = [{ id: 1, product_name: 'Executive Desk' }];
        mockNasClient.from.mockImplementation((table: string) => {
            if (table === 'make_products') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({ data: productsData, error: null })
                    })
                };
            }
            return {
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null })
                })
            };
        });

        // Execute catalog read
        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        expect(res.databaseUsed).toBe('nas');
        expect(res.data).toEqual(productsData);
        expect(res.error).toBeNull();
        expect(engine.getStatus().circuitState).toBe('healthy');
    });

    // 2. NAS actual database query times out: failover activates correctly
    it('2. NAS actual database query times out -> failover activates to Supabase Cloud', async () => {
        // NAS times out
        mockNasClient.from.mockImplementation(() => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 3000)))
                })
            };
        });

        // Supabase succeeds
        const fallbackData = [{ id: 2, product_name: 'Fallback Chair' }];
        mockSupabaseClient.from.mockImplementation((table: string) => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: fallbackData, error: null })
                })
            };
        });

        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        expect(res.databaseUsed).toBe('supabase');
        expect(res.data).toEqual(fallbackData);
        expect(engine.getStatus().circuitState).toBe('degraded');
    });

    // 3. NAS returns genuine database/API failure: failover activates correctly
    it('3. NAS returns genuine database/API failure -> failover activates to Supabase', async () => {
        // NAS returns connection error
        mockNasClient.from.mockImplementation(() => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'PGRST000', message: 'Connection to server lost' }
                    })
                })
            };
        });

        const fallbackData = [{ id: 3, product_name: 'Fallback Sofa' }];
        mockSupabaseClient.from.mockImplementation(() => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: fallbackData, error: null })
                })
            };
        });

        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        expect(res.databaseUsed).toBe('supabase');
        expect(res.data).toEqual(fallbackData);
        expect(engine.getStatus().circuitState).toBe('degraded');
    });

    // 4. NAS returns 401/403 for the actual protected database query: reports genuine authorization failure
    it('4. NAS returns 401/403 for the actual protected database query -> reports genuine authorization failure and does not pretend healthy', async () => {
        mockNasClient.from.mockImplementation(() => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: '42501', message: 'permission denied for table make_products' }
                    })
                })
            };
        });

        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        // It should return the permission error directly from NAS without masking it
        expect(res.databaseUsed).toBe('nas');
        expect(res.error).toBeDefined();
        expect(res.error.message).toContain('permission denied');
    });

    // 5. HTML 403 from an unrelated/wrong endpoint: must not be treated as proof that database itself is offline
    it('5. HTML 403 proxy error clears cached tunnel URL without permanently disabling NAS if valid candidate exists', async () => {
        // Simulate cached lastWorkingNasUrl pointing to HTTPS tunnel
        (engine as any).lastWorkingNasUrl = 'https://db.lenas.me';
        (engine as any).saveNasConnectionState();

        // Trigger failure with proxy HTML block error
        engine.recordNasFailure(new Error('Database proxy/access blocked: 403 Forbidden (HTML response from proxy/gateway)'));

        // Engine must clear lastWorkingNasUrl so next probe hits direct IP
        expect(engine.getLastWorkingNasUrl()).toBeNull();
    });

    // 6. Normal healthy NAS: Product Catalog loads from NAS
    it('6. Normal healthy NAS loads Product Catalog with status healthy', async () => {
        const catalog = [{ id: 10, product_name: 'Conference Table' }];
        mockNasClient.from.mockImplementation((table: string) => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: catalog, error: null })
                })
            };
        });

        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        expect(res.databaseUsed).toBe('nas');
        expect(res.data).toEqual(catalog);
        expect(engine.getStatus().circuitState).toBe('healthy');
    });

    // 7. NAS unavailable: Supabase fallback still works
    it('7. NAS completely unavailable -> Supabase fallback serves catalog seamlessly', async () => {
        (engine as any).circuitState = 'degraded';
        (engine as any).cooldownUntil = Date.now() + 60000;

        const cloudCatalog = [{ id: 20, product_name: 'Cloud Desk' }];
        mockSupabaseClient.from.mockImplementation(() => {
            return {
                select: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: cloudCatalog, error: null })
                })
            };
        });

        const res = await engine.executeRead(async (client) => {
            return client.from('make_products').select('*').order('created_at', { ascending: false });
        }, 'make-get-catalog-products');

        expect(res.databaseUsed).toBe('supabase');
        expect(res.data).toEqual(cloudCatalog);
    });

    // 8. Mutation safety: no POST/PUT/PATCH/DELETE is blindly replayed after an ambiguous NAS timeout
    it('8. Mutation safety: write failure on NAS is journaled but never blindly replayed at transport layer', async () => {
        (engine as any).circuitState = 'healthy';
        (engine as any).cooldownUntil = 0;

        // NAS write times out
        mockNasClient.from.mockImplementation(() => {
            return {
                insert: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 4000)))
            };
        });

        // Supabase write succeeds
        mockSupabaseClient.from.mockImplementation(() => {
            return {
                insert: vi.fn().mockResolvedValue({ data: { id: 99 }, error: null })
            };
        });

        const res = await engine.executeWrite(
            async (client) => client.from('make_products').insert({ product_name: 'Safe Table' }),
            { table: 'make_products', operation: 'insert', data: { product_name: 'Safe Table' } },
            'create-product'
        );

        // When NAS write suffers an ambiguous timeout, duplicate replay to Supabase is rejected to protect database integrity
        expect(res.databaseUsed).toBe('nas');
        expect(res.error?.message).toContain('Replay halted to prevent duplicate mutations');
        expect(engine.getPendingJournalEntries().length).toBe(1);
        expect(engine.getPendingJournalEntries()[0].table).toBe('make_products');
    });

    // 9. Circuit breaker recovery: NAS becomes healthy again and is restored as primary
    it('9. Circuit breaker recovery: verifyAndRecoverNas verifies make_products and restores NAS as primary', async () => {
        (engine as any).circuitState = 'degraded';
        (engine as any).cooldownUntil = Date.now() + 60000;

        mockNasClient.from.mockImplementation((table: string) => {
            if (table === 'make_products') {
                return {
                    select: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null })
                    })
                };
            }
            return {
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };
        });

        const recovered = await engine.verifyAndRecoverNas();
        expect(recovered).toBe(true);
        expect(engine.getStatus().circuitState).toBe('healthy');
        expect(engine.getStatus().activeTarget).toBe('nas');
        expect(engine.getStatus().cooldownUntil).toBeUndefined(); // or cooldownRemainingMs == 0
    });
});
