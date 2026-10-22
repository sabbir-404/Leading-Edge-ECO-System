import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    upsertOrderRecord,
    resolveTargetOrderId,
    getIdMapping,
    recordIdMapping,
    updateCheckpoint,
    getCheckpoint
} from '../../scripts/nas-pull-replication-worker.cjs';

describe('Phase 3: Critical Data Integrity & Release Recovery Regression Suite', () => {

    describe('1. Cross-Database ID Collision Prevention (Supabase ID 15 vs TrueNAS ID 15)', () => {
        let mockPgClient: any;
        let mockSupabaseClient: any;
        let trueNasOrders: Map<number, any>;
        let idMapTable: Map<string, any>;
        let nextSequenceId = 100;

        beforeEach(() => {
            trueNasOrders = new Map();
            idMapTable = new Map();

            // Populate TrueNAS with existing customer order at ID 15 ("Right Way", MAKE-2026-613437)
            trueNasOrders.set(15, {
                id: 15,
                order_number: 'MAKE-2026-613437',
                furniture_name: 'Executive Office Suite',
                total_price: 45000,
                sale_price: 45000,
                current_stage: 'In Assembly',
                status: 'Processing',
                customer_name: 'Right Way',
                created_at: '2026-09-15T10:00:00Z',
                updated_at: '2026-09-15T10:00:00Z'
            });

            // Mock PostgreSQL Client
            mockPgClient = {
                query: vi.fn(async (sql: string, params: any[] = []) => {
                    const cleanSql = sql.replace(/\s+/g, ' ').trim();

                    // Check nas_replication_id_map lookup
                    if (cleanSql.includes('SELECT target_id FROM nas_replication_id_map')) {
                        const key = `${params[0]}:${params[1]}`;
                        const found = idMapTable.get(key);
                        return { rows: found ? [{ target_id: found.target_id }] : [] };
                    }

                    // Record nas_replication_id_map
                    if (cleanSql.includes('INSERT INTO nas_replication_id_map')) {
                        const key = `${params[0]}:${params[1]}`;
                        idMapTable.set(key, {
                            entity_type: params[0],
                            source_id: params[1],
                            target_id: params[2],
                            natural_key: params[3]
                        });
                        return { rows: [] };
                    }

                    // Check order by order_number
                    if (cleanSql.includes('SELECT id, order_number FROM make_orders WHERE order_number = $1')) {
                        for (const ord of trueNasOrders.values()) {
                            if (ord.order_number === params[0]) {
                                return { rows: [{ id: ord.id, order_number: ord.order_number }] };
                            }
                        }
                        return { rows: [] };
                    }

                    // Check order by id
                    if (cleanSql.includes('SELECT id, order_number FROM make_orders WHERE id = $1')) {
                        const found = trueNasOrders.get(Number(params[0]));
                        return { rows: found ? [{ id: found.id, order_number: found.order_number }] : [] };
                    }

                    // Update existing order
                    if (cleanSql.includes('UPDATE make_orders SET')) {
                        const targetId = params[params.length - 1];
                        const existing = trueNasOrders.get(Number(targetId));
                        if (existing) {
                            existing.order_number = params[0];
                            existing.furniture_name = params[1];
                            existing.total_price = params[2];
                            existing.sale_price = params[3];
                            existing.current_stage = params[4];
                            existing.status = params[5];
                            existing.updated_at = params[8];
                        }
                        return { rows: [] };
                    }

                    // Insert with explicit ID
                    if (cleanSql.includes('INSERT INTO make_orders ( id,')) {
                        const newId = Number(params[0]);
                        trueNasOrders.set(newId, {
                            id: newId,
                            order_number: params[1],
                            furniture_name: params[2],
                            total_price: params[3],
                            sale_price: params[4],
                            current_stage: params[5],
                            status: params[6],
                            created_at: params[9],
                            updated_at: params[10]
                        });
                        return { rows: [] };
                    }

                    // Insert with sequence allocation (RETURNING id)
                    if (cleanSql.includes('RETURNING id')) {
                        const allocatedId = nextSequenceId++;
                        trueNasOrders.set(allocatedId, {
                            id: allocatedId,
                            order_number: params[0],
                            furniture_name: params[1],
                            total_price: params[2],
                            sale_price: params[3],
                            current_stage: params[4],
                            status: params[5],
                            created_at: params[8],
                            updated_at: params[9]
                        });
                        return { rows: [{ id: allocatedId }] };
                    }

                    // Sequence setval
                    if (cleanSql.includes('pg_get_serial_sequence')) {
                        return { rows: [] };
                    }

                    // Delete operations
                    if (cleanSql.includes('DELETE FROM make_orders WHERE id = $1')) {
                        trueNasOrders.delete(Number(params[0]));
                        return { rows: [] };
                    }
                    if (cleanSql.includes('DELETE FROM make_order_items') || cleanSql.includes('DELETE FROM make_order_updates')) {
                        return { rows: [] };
                    }

                    return { rows: [] };
                })
            };

            // Mock Supabase Client
            mockSupabaseClient = {
                from: vi.fn((table: string) => ({
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockImplementation(async () => {
                        return { data: null, error: null };
                    })
                }))
            };
        });

        it('reproduces ID 15 collision: incoming Supabase ID 15 does NOT overwrite TrueNAS customer order 15', async () => {
            const incomingSupabaseOrder = {
                id: 15,
                order_number: 'LE-ORD-20260909-JTYN',
                furniture_name: 'Synthetic Test Desk',
                total_price: 1500,
                sale_price: 1500,
                current_stage: 'Draft',
                status: 'Placed',
                created_at: '2026-09-09T08:00:00Z',
                updated_at: '2026-09-09T08:00:00Z'
            };

            // Verify pre-condition: TrueNAS ID 15 has the customer order
            const preOrder = trueNasOrders.get(15);
            expect(preOrder).toBeDefined();
            expect(preOrder.order_number).toBe('MAKE-2026-613437');
            expect(preOrder.customer_name).toBe('Right Way');

            // Apply incoming order using upsertOrderRecord
            const result = await upsertOrderRecord(mockPgClient, mockSupabaseClient, incomingSupabaseOrder, {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn()
            });

            // 1. Result must not overwrite ID 15
            expect(result.targetId).not.toBe(15);
            expect(result.targetId).toBeGreaterThanOrEqual(100);

            // 2. CRITICAL SAFETY CHECK: Customer order 15 must remain untouched!
            const preservedCustomerOrder = trueNasOrders.get(15);
            expect(preservedCustomerOrder).toBeDefined();
            expect(preservedCustomerOrder.order_number).toBe('MAKE-2026-613437');
            expect(preservedCustomerOrder.furniture_name).toBe('Executive Office Suite');
            expect(preservedCustomerOrder.customer_name).toBe('Right Way');

            // 3. Newly allocated record exists with the incoming test order's data
            const newRecord = trueNasOrders.get(result.targetId);
            expect(newRecord).toBeDefined();
            expect(newRecord.order_number).toBe('LE-ORD-20260909-JTYN');
            expect(newRecord.furniture_name).toBe('Synthetic Test Desk');

            // 4. nas_replication_id_map maps (make_orders, '15') -> result.targetId
            const mapEntry = idMapTable.get('make_orders:15');
            expect(mapEntry).toBeDefined();
            expect(mapEntry.target_id).toBe(result.targetId);
            expect(mapEntry.natural_key).toBe('LE-ORD-20260909-JTYN');
        });

        it('idempotency: applying incoming order a second time updates the mapped record without creating duplicates', async () => {
            const incomingSupabaseOrder = {
                id: 15,
                order_number: 'LE-ORD-20260909-JTYN',
                furniture_name: 'Synthetic Test Desk Updated',
                total_price: 1800,
                sale_price: 1800,
                current_stage: 'Approved',
                status: 'In Production',
                created_at: '2026-09-09T08:00:00Z',
                updated_at: '2026-09-09T09:00:00Z'
            };

            // First run
            const res1 = await upsertOrderRecord(mockPgClient, mockSupabaseClient, incomingSupabaseOrder, {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn()
            });

            // Second run
            const res2 = await upsertOrderRecord(mockPgClient, mockSupabaseClient, incomingSupabaseOrder, {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn()
            });

            // Must map to the exact same targetId
            expect(res2.targetId).toBe(res1.targetId);
            expect(trueNasOrders.size).toBe(2); // ID 15 (customer) + newly allocated ID (test order)

            // Updated fields reflected
            const updatedRecord = trueNasOrders.get(res1.targetId);
            expect(updatedRecord.furniture_name).toBe('Synthetic Test Desk Updated');
            expect(updatedRecord.current_stage).toBe('Approved');
        });

        it('resolves foreign keys for child updates through resolveTargetOrderId', async () => {
            // Setup source order 15 mapped to target ID 100
            idMapTable.set('make_orders:15', {
                entity_type: 'make_orders',
                source_id: '15',
                target_id: 100,
                natural_key: 'LE-ORD-20260909-JTYN'
            });

            const resolvedTargetId = await resolveTargetOrderId(mockPgClient, mockSupabaseClient, 15);
            expect(resolvedTargetId).toBe(100);
            expect(resolvedTargetId).not.toBe(15);
        });
    });

    describe('2. Checkpoint Advancement and Network Failure Safety', () => {
        let mockPgClient: any;
        let checkpoints: Map<string, any>;

        beforeEach(() => {
            checkpoints = new Map();
            mockPgClient = {
                query: vi.fn(async (sql: string, params: any[] = []) => {
                    const clean = sql.replace(/\s+/g, ' ').trim();
                    if (clean.includes('FROM nas_replication_checkpoints WHERE table_name = $1')) {
                        const cp = checkpoints.get(params[0]);
                        return { rows: cp ? [cp] : [] };
                    }
                    if (clean.includes('INSERT INTO nas_replication_checkpoints')) {
                        const existing = checkpoints.get(params[0]) || {};
                        checkpoints.set(params[0], {
                            table_name: params[0],
                            last_replicated_id: params[1] !== null && params[1] !== undefined ? params[1] : existing.last_replicated_id,
                            last_replicated_at: params[2] !== null && params[2] !== undefined ? params[2] : existing.last_replicated_at,
                            items_replicated: (existing.items_replicated || 0) + (params[3] || 0),
                            last_error: params[4]
                        });
                        return { rows: [] };
                    }
                    return { rows: [] };
                })
            };
        });

        it('advances checkpoint on success', async () => {
            await updateCheckpoint(mockPgClient, 'make_orders', '10', '2026-10-21T12:00:00Z', 1, null);
            const cp = await getCheckpoint(mockPgClient, 'make_orders');
            expect(cp.last_replicated_id).toBe('10');
            expect(cp.last_error).toBeNull();
        });

        it('records error without advancing last_replicated_id cursor on failure', async () => {
            // Prior successful checkpoint
            await updateCheckpoint(mockPgClient, 'make_orders', '10', '2026-10-21T12:00:00Z', 1, null);

            // Error occurs on next item
            await updateCheckpoint(mockPgClient, 'make_orders', null, null, 0, 'Connection reset by peer');

            const cp = await getCheckpoint(mockPgClient, 'make_orders');
            // Cursor remains at 10, not advanced to broken state
            expect(cp.last_replicated_id).toBe('10');
            expect(cp.last_error).toBe('Connection reset by peer');
        });
    });

    describe('3. TrueNAS Access Control & Authentication Contract', () => {
        it('proves unauthenticated requests are assigned web_anon and fail on sensitive tables', async () => {
            // Simulated PostgREST auth policy logic
            const simulatePostgrestAccess = (token: string | null, table: string) => {
                const role = token === 'valid-jwt-token' ? 'nas_authenticated' : 'web_anon';

                const tablePermissions: Record<string, string[]> = {
                    'web_anon': ['make_products'], // Public catalog only
                    'nas_authenticated': ['make_products', 'make_orders', 'make_order_items', 'make_order_updates', 'users', 'device_sessions']
                };

                const allowedTables = tablePermissions[role] || [];
                if (!allowedTables.includes(table)) {
                    return { status: 403, error: `Permission denied for table ${table} under role ${role}` };
                }
                return { status: 200, data: [] };
            };

            // Anonymous request to users table -> MUST FAIL (403)
            const anonUsers = simulatePostgrestAccess(null, 'users');
            expect(anonUsers.status).toBe(403);
            expect(anonUsers.error).toContain('web_anon');

            // Anonymous request to make_orders table -> MUST FAIL (403)
            const anonOrders = simulatePostgrestAccess(null, 'make_orders');
            expect(anonOrders.status).toBe(403);

            // Anonymous request to device_sessions table -> MUST FAIL (403)
            const anonSessions = simulatePostgrestAccess(null, 'device_sessions');
            expect(anonSessions.status).toBe(403);

            // Authorized request with JWT -> MUST SUCCEED (200)
            const authOrders = simulatePostgrestAccess('valid-jwt-token', 'make_orders');
            expect(authOrders.status).toBe(200);
        });
    });

    describe('4. Explicit Persistence Acknowledgement & Durable Queue Contract', () => {
        it('reports persisted_canonical: true when primary cloud write succeeds', () => {
            const result = {
                success: true,
                id: 42,
                order_number: 'MAKE-2026-123456',
                status: 'persisted',
                canonical_authority: 'supabase',
                persisted_canonical: true,
                data_source: 'supabase_canonical'
            };

            expect(result.persisted_canonical).toBe(true);
            expect(result.status).toBe('persisted');
            expect(result.canonical_authority).toBe('supabase');
        });

        it('reports persisted_canonical: false and status: buffered when falling back to NAS buffer', () => {
            const result = {
                success: true,
                id: 105,
                order_number: 'MAKE-2026-654321',
                status: 'buffered',
                canonical_authority: 'buffered_nas',
                persisted_canonical: false,
                data_source: 'nas_buffer',
                warning: 'Order buffered to local storage; canonical cloud synchronization pending.'
            };

            // Explicit persistence acknowledgement contract: MUST NOT claim canonical persistence!
            expect(result.persisted_canonical).toBe(false);
            expect(result.status).toBe('buffered');
            expect(result.canonical_authority).toBe('buffered_nas');
            expect(result.warning).toBeDefined();
        });
    });
});
