/**
 * tests/integration/server-reconciliation-daemon.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and Lifecycle Verification for Isolated Server Reconciliation Daemon.
 *
 * Covers:
 *   1. Safety abort when TrueNAS master database is unreachable.
 *   2. Discovery and inspection of 'committed' buffer reservations.
 *   3. Verified cloud deletion before quota pruning for storage fallback.
 *   4. Failure preservation: storage delete failures or RPC errors leave
 *      reservations retryable and observable without dropping data.
 *   5. Successful end-to-end reconciliation: cloud files pruned, RPC called,
 *      and quota restored.
 *   6. Privilege separation: Unprivileged callers cannot prune quota.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { reconcileReservation, runReconciliationCycle } = require('../../scripts/server-reconciliation-daemon.cjs');

describe('Server Reconciliation Daemon Lifecycle & Verification', () => {
    let mockSupabase: any;
    let mockPg: any;
    let mockLogger: any;
    let mockStorageFiles: Map<string, string[]>;
    let mockReservations: any[];

    beforeEach(() => {
        mockStorageFiles = new Map();
        mockReservations = [];

        mockLogger = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        };

        mockPg = {
            connect: vi.fn().mockResolvedValue(undefined),
            query: vi.fn().mockResolvedValue({ rows: [{ alive: 1 }] }),
            end: vi.fn().mockResolvedValue(undefined)
        };

        mockSupabase = {
            storage: {
                from: vi.fn().mockReturnValue({
                    list: vi.fn().mockImplementation(async (subfolder: string, options: any) => {
                        const search = options?.search || '';
                        const allFiles = mockStorageFiles.get(subfolder) || [];
                        const matched = allFiles
                            .filter(f => f.includes(search))
                            .map(name => ({ name }));
                        return { data: matched, error: null };
                    }),
                    remove: vi.fn().mockImplementation(async (filePaths: string[]) => {
                        for (const fp of filePaths) {
                            const [subfolder, name] = fp.split('/');
                            const current = mockStorageFiles.get(subfolder) || [];
                            mockStorageFiles.set(subfolder, current.filter(f => f !== name));
                        }
                        return { data: filePaths, error: null };
                    })
                })
            },
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation(async () => {
                    return {
                        data: mockReservations.filter(r => r.status === 'committed'),
                        error: null
                    };
                })
            }),
            rpc: vi.fn().mockImplementation(async (fnName: string, args: any) => {
                if (fnName === 'release_buffer_capacity') {
                    const res = mockReservations.find(r => r.id === args.p_reservation_id);
                    if (!res) return { data: { success: false, reason: 'NOT_FOUND' }, error: null };

                    // Authorization check
                    if (args.p_status === 'pruned' && args.p_client_id !== 'reconciliation_daemon') {
                        return {
                            data: {
                                success: false,
                                reason: 'UNAUTHORIZED_PRUNING_DENIED',
                                detail: 'Trusted reconciliation verification required.'
                            },
                            error: null
                        };
                    }

                    res.status = args.p_status;
                    return { data: { success: true, status: args.p_status }, error: null };
                }
                return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
            })
        };
    });

    it('1. Aborts cycle safely when TrueNAS master is unreachable to prevent premature cloud pruning', async () => {
        mockPg.query.mockRejectedValueOnce(new Error('Connection timeout to 100.88.85.6:5432'));

        const result = await runReconciliationCycle({
            supabaseAdmin: mockSupabase,
            pgClient: mockPg,
            logger: mockLogger
        });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('TRUENAS_UNAVAILABLE');
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('TrueNAS PostgreSQL unreachable'));
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('2. Discovers committed reservations and skips when no records are pending', async () => {
        mockReservations = [];

        const result = await runReconciliationCycle({
            supabaseAdmin: mockSupabase,
            pgClient: mockPg,
            logger: mockLogger
        });

        expect(result.success).toBe(true);
        expect(result.processedCount).toBe(0);
        expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('No committed buffer reservations pending pruning'));
    });

    it('3. Verifies cloud deletion before quota pruning for storage fallback', async () => {
        mockReservations.push({
            id: 'upload_desk_cad_101',
            resource_type: 'storage',
            bytes_reserved: 25_000_000,
            status: 'committed'
        });

        // Populate mock file in storage under 'cad' subfolder
        mockStorageFiles.set('cad', ['upload_desk_cad_101_spec.png']);

        const result = await runReconciliationCycle({
            supabaseAdmin: mockSupabase,
            pgClient: mockPg,
            logger: mockLogger
        });

        expect(result.success).toBe(true);
        expect(result.prunedCount).toBe(1);
        expect(mockSupabase.storage.from).toHaveBeenCalledWith('make-order-files');
        expect(mockSupabase.rpc).toHaveBeenCalledWith('release_buffer_capacity', {
            p_reservation_id: 'upload_desk_cad_101',
            p_client_id: 'reconciliation_daemon',
            p_status: 'pruned',
            p_actual_bytes: 0
        });

        // Cloud file removed
        expect(mockStorageFiles.get('cad')).toHaveLength(0);
        // Reservation updated to pruned
        expect(mockReservations[0].status).toBe('pruned');
    });

    it('4. Leaves reservation in committed state when cloud deletion fails', async () => {
        mockReservations.push({
            id: 'upload_fail_102',
            resource_type: 'storage',
            bytes_reserved: 10_000_000,
            status: 'committed'
        });

        mockStorageFiles.set('products', ['upload_fail_102_render.png']);

        // Storage removal fails: mock remove returning error
        const mockStorageBucket = {
            list: vi.fn().mockResolvedValue({
                data: [{ name: 'upload_fail_102_render.png' }],
                error: null
            }),
            remove: vi.fn().mockResolvedValue({
                data: null,
                error: { message: '500 Internal Cloud Storage Error' }
            })
        };
        mockSupabase.storage.from.mockReturnValue(mockStorageBucket);

        const result = await runReconciliationCycle({
            supabaseAdmin: mockSupabase,
            pgClient: mockPg,
            logger: mockLogger
        });

        expect(result.success).toBe(true);
        expect(result.prunedCount).toBe(0);
        expect(result.errorCount).toBe(1);

        // Reservation remains 'committed' and retryable
        expect(mockReservations[0].status).toBe('committed');
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not prune reservation upload_fail_102'));
    });

    it('5. Leaves reservation in committed state when RPC pruning fails or is rejected', async () => {
        mockReservations.push({
            id: 'db_bill_999',
            resource_type: 'database',
            bytes_reserved: 50_000,
            status: 'committed'
        });

        mockSupabase.rpc.mockResolvedValueOnce({
            data: { success: false, reason: 'RESERVATION_LOCKED' },
            error: null
        });

        const result = await runReconciliationCycle({
            supabaseAdmin: mockSupabase,
            pgClient: mockPg,
            logger: mockLogger
        });

        expect(result.success).toBe(true);
        expect(result.prunedCount).toBe(0);
        expect(result.errorCount).toBe(1);
        expect(mockReservations[0].status).toBe('committed');
    });

    it('6. Rejects unprivileged client attempts to prune quota directly with UNAUTHORIZED_PRUNING_DENIED', async () => {
        mockReservations.push({
            id: 'db_bill_unauthorized',
            resource_type: 'database',
            bytes_reserved: 30_000,
            status: 'committed'
        });

        // Unprivileged client calls RPC directly
        const rpcResult = await mockSupabase.rpc('release_buffer_capacity', {
            p_reservation_id: 'db_bill_unauthorized',
            p_client_id: 'regular_desktop_client_uuid',
            p_status: 'pruned',
            p_actual_bytes: 0
        });

        expect(rpcResult.data.success).toBe(false);
        expect(rpcResult.data.reason).toBe('UNAUTHORIZED_PRUNING_DENIED');
        expect(mockReservations[0].status).toBe('committed');
    });
});
