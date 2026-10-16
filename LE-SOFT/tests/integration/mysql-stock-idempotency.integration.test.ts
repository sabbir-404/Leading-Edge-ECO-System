/**
 * tests/integration/mysql-stock-idempotency.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 5 MySQL Stock Synchronization Idempotency & Transaction Verification.
 *
 * Verifies all 6 required criteria:
 * 1. Two concurrent requests with the same idempotency key.
 * 2. Process failure after MySQL commits but before SQLite marks completion.
 * 3. Retry following an ambiguous connection failure.
 * 4. Missing MySQL connection (explicit error, never swallowed).
 * 5. SQL transaction failure and rollback (rollback executed, stock unchanged).
 * 6. A new operation with a distinct idempotency key (decrements cleanly).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncStockToMySQL, setMySQLPool } from '../../electron/ipc-handlers';

interface MockProduct {
    id: number;
    quantity: number;
}

interface MockIdempotencyRow {
    dedup_key: string;
    invoice_number: string | null;
    product_id: number;
    quantity: number;
}

describe('Phase 5: MySQL Stock Synchronization Idempotency & Transaction Safety', () => {
    let mockProducts: Map<number, MockProduct>;
    let mockIdempotency: Map<string, MockIdempotencyRow>;
    let activeLocks: Set<string>;
    let isTableProvisioned: boolean;

    beforeEach(() => {
        mockProducts = new Map();
        mockProducts.set(101, { id: 101, quantity: 50 });
        mockIdempotency = new Map();
        activeLocks = new Set();
        isTableProvisioned = true;
    });

    afterEach(() => {
        setMySQLPool(null);
        vi.restoreAllMocks();
    });

    /**
     * Builds a stateful simulated MySQL pool supporting transactions,
     * SELECT FOR UPDATE, COMMIT, ROLLBACK, and release.
     */
    function createMockPool(options?: {
        failTableCreation?: boolean;
        failOnUpdate?: boolean;
        transientErrorOnFirstAttempt?: boolean;
    }) {
        let transientAttemptCount = 0;

        return {
            query: vi.fn(async (sql: string, _params?: any[]) => {
                if (sql.includes('CREATE TABLE IF NOT EXISTS le_stock_sync_idempotency')) {
                    if (options?.failTableCreation && !isTableProvisioned) {
                        throw new Error('Table creation denied by user privileges');
                    }
                    isTableProvisioned = true;
                    return [{}];
                }
                if (sql.includes('SELECT 1 FROM le_stock_sync_idempotency')) {
                    if (!isTableProvisioned) {
                        throw new Error("Table 'lesoft_remote.le_stock_sync_idempotency' doesn't exist");
                    }
                    return [[{ 1: 1 }]];
                }
                return [[]];
            }),
            getConnection: vi.fn(async () => {
                let txActive = false;
                let pendingDedup: MockIdempotencyRow | null = null;
                let pendingStockUpdate: { productId: number; qty: number } | null = null;

                return {
                    beginTransaction: vi.fn(async () => {
                        txActive = true;
                    }),
                    query: vi.fn(async (sql: string, params?: any[]) => {
                        if (!txActive) throw new Error('Transaction not started');

                        if (sql.includes('SELECT dedup_key FROM le_stock_sync_idempotency WHERE dedup_key = ? FOR UPDATE')) {
                            const key = params![0];
                            const existing = mockIdempotency.get(key);
                            return existing ? [[{ dedup_key: key }]] : [[]];
                        }

                        if (sql.includes('INSERT INTO le_stock_sync_idempotency')) {
                            const [key, inv, prodId, qty] = params!;
                            if (mockIdempotency.has(key) || activeLocks.has(key)) {
                                const err: any = new Error(`ER_DUP_ENTRY: Duplicate entry '${key}' for key 'PRIMARY'`);
                                err.code = 'ER_DUP_ENTRY';
                                err.errno = 1062;
                                throw err;
                            }
                            activeLocks.add(key);
                            pendingDedup = { dedup_key: key, invoice_number: inv, product_id: prodId, quantity: qty };
                            return [{ affectedRows: 1 }];
                        }

                        if (sql.includes('UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE le_local_id = ?')) {
                            if (options?.transientErrorOnFirstAttempt && transientAttemptCount === 0) {
                                transientAttemptCount++;
                                throw new Error('PROTOCOL_CONNECTION_LOST: The server closed the connection.');
                            }

                            if (options?.failOnUpdate) {
                                throw new Error('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock');
                            }

                            const [qty, prodId] = params!;
                            const prod = mockProducts.get(prodId);
                            if (!prod) throw new Error(`Product ${prodId} not found`);
                            pendingStockUpdate = { productId: prodId, qty };
                            return [{ affectedRows: 1 }];
                        }

                        return [[]];
                    }),
                    commit: vi.fn(async () => {
                        if (pendingDedup) {
                            mockIdempotency.set(pendingDedup.dedup_key, pendingDedup);
                            activeLocks.delete(pendingDedup.dedup_key);
                            pendingDedup = null;
                        }
                        if (pendingStockUpdate) {
                            const prod = mockProducts.get(pendingStockUpdate.productId)!;
                            prod.quantity = Math.max(0, prod.quantity - pendingStockUpdate.qty);
                            pendingStockUpdate = null;
                        }
                        txActive = false;
                    }),
                    rollback: vi.fn(async () => {
                        if (pendingDedup) {
                            activeLocks.delete(pendingDedup.dedup_key);
                            pendingDedup = null;
                        }
                        pendingStockUpdate = null;
                        txActive = false;
                    }),
                    release: vi.fn(() => {})
                };
            })
        };
    }

    it('1. Missing MySQL connection throws explicit error and never swallows failure', async () => {
        setMySQLPool(null);
        await expect(syncStockToMySQL(101, 5, 'sync_missing_conn', 'INV-001'))
            .rejects
            .toThrow(/MySQL connection pool is not configured or offline/);
    });

    it('2. Schema prerequisite missing: fails explicitly when idempotency table cannot be found or created', async () => {
        isTableProvisioned = false;
        const pool = createMockPool({ failTableCreation: true });
        setMySQLPool(pool);

        await expect(syncStockToMySQL(101, 5, 'sync_no_table', 'INV-002'))
            .rejects
            .toThrow(/Idempotency schema prerequisite missing: table 'le_stock_sync_idempotency' does not exist/);
    });

    it('3. Two concurrent requests with the same idempotency key decrement stock exactly once', async () => {
        const pool = createMockPool();
        setMySQLPool(pool);

        const syncKey = 'sync_INV-CONCURRENT_101';

        // Dispatch two concurrent synchronization attempts simultaneously
        await Promise.all([
            syncStockToMySQL(101, 5, syncKey, 'INV-CONCURRENT'),
            syncStockToMySQL(101, 5, syncKey, 'INV-CONCURRENT')
        ]);

        // Stock must have decremented exactly once from 50 to 45 (never to 40)
        expect(mockProducts.get(101)!.quantity).toBe(45);
        expect(mockIdempotency.has(syncKey)).toBe(true);
    });

    it('4. Process failure after MySQL commits but before SQLite marks completion is safely deduplicated on retry', async () => {
        const pool = createMockPool();
        setMySQLPool(pool);

        const syncKey = 'sync_INV-CRASH-RETRY_101';

        // 1. First execution: MySQL commits stock decrement to 45
        await syncStockToMySQL(101, 5, syncKey, 'INV-CRASH');
        expect(mockProducts.get(101)!.quantity).toBe(45);

        // 2. Simulated process crash & restart: SQLite row was not marked completed, so outbox retries same syncKey
        await syncStockToMySQL(101, 5, syncKey, 'INV-CRASH');

        // Stock MUST remain 45, not double-decremented to 40
        expect(mockProducts.get(101)!.quantity).toBe(45);
    });

    it('5. Retry following an ambiguous connection failure rolls back cleanly and applies on subsequent attempt', async () => {
        const pool = createMockPool({ transientErrorOnFirstAttempt: true });
        setMySQLPool(pool);

        const syncKey = 'sync_INV-TRANSIENT_101';

        // First attempt suffers ambiguous network abort during update
        await expect(syncStockToMySQL(101, 5, syncKey, 'INV-TRANSIENT'))
            .rejects
            .toThrow(/PROTOCOL_CONNECTION_LOST/);

        // Stock and idempotency marker rolled back; unchanged from initial 50
        expect(mockProducts.get(101)!.quantity).toBe(50);
        expect(mockIdempotency.has(syncKey)).toBe(false);

        // Second retry succeeds
        await syncStockToMySQL(101, 5, syncKey, 'INV-TRANSIENT');
        expect(mockProducts.get(101)!.quantity).toBe(45);
        expect(mockIdempotency.has(syncKey)).toBe(true);
    });

    it('6. SQL transaction failure and rollback: rolls back cleanly and leaves stock untouched', async () => {
        const pool = createMockPool({ failOnUpdate: true });
        setMySQLPool(pool);

        const syncKey = 'sync_INV-DEADLOCK_101';

        await expect(syncStockToMySQL(101, 5, syncKey, 'INV-DEADLOCK'))
            .rejects
            .toThrow(/ER_LOCK_DEADLOCK/);

        // Stock must remain 50 and dedup key must NOT be recorded
        expect(mockProducts.get(101)!.quantity).toBe(50);
        expect(mockIdempotency.has(syncKey)).toBe(false);
    });

    it('7. A new operation with a distinct idempotency key decrements stock cleanly', async () => {
        const pool = createMockPool();
        setMySQLPool(pool);

        // Op 1 for Invoice A
        await syncStockToMySQL(101, 10, 'sync_INV-A_101', 'INV-A');
        expect(mockProducts.get(101)!.quantity).toBe(40);

        // Op 2 for Invoice B (distinct key)
        await syncStockToMySQL(101, 15, 'sync_INV-B_101', 'INV-B');
        expect(mockProducts.get(101)!.quantity).toBe(25);

        expect(mockIdempotency.size).toBe(2);
    });
});
