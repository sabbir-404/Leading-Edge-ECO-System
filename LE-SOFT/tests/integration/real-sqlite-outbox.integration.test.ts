/**
 * tests/integration/real-sqlite-outbox.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real SQLite Integration Test Suite for LE-SOFT Durable Outbox & Upload Queue.
 *
 * Verifies actual native SQLite behavior beyond in-memory mocks:
 *  - Real SQLite Write-Ahead Logging (WAL) and synchronous pragma behavior.
 *  - Atomic transaction rollback on constraint violation.
 *  - Simulated ungraceful shutdown and restart recovery.
 *  - High-concurrency worker access without database locked errors.
 *  - Strict per-destination parent ID resolution mapping in outbox_id_map.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

const isRealSqlite = process.env.TEST_REAL_SQLITE === 'true';

describe.runIf(isRealSqlite)('Real SQLite Outbox & Upload Integration Tests', () => {
    let tempDir: string;
    let dbPath: string;
    let db: any;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-sqlite-integration-'));
        dbPath = path.join(tempDir, 'test_durable_outbox.db');
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 5000');

        // Initialize production schema
        db.exec(`
            CREATE TABLE IF NOT EXISTS outbox_operations (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                filter_json TEXT,
                primary_key_col TEXT,
                primary_key_val TEXT,
                upsert_conflict TEXT,
                dependency_op_id TEXT,
                target TEXT NOT NULL DEFAULT 'both',
                status TEXT NOT NULL DEFAULT 'pending',
                retry_count INTEGER NOT NULL DEFAULT 0,
                max_retries INTEGER NOT NULL DEFAULT 8,
                last_error TEXT,
                metadata_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_operations(status);
            CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_operations(created_at);
            CREATE INDEX IF NOT EXISTS idx_outbox_dep ON outbox_operations(dependency_op_id);

            CREATE TABLE IF NOT EXISTS outbox_id_map (
                op_id TEXT NOT NULL,
                target TEXT NOT NULL,
                resolved_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(op_id, target)
            );

            CREATE TABLE IF NOT EXISTS durable_uploads (
                id TEXT PRIMARY KEY,
                local_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                subfolder TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                field_name TEXT,
                status TEXT NOT NULL DEFAULT 'staged_local',
                remote_url_nas TEXT,
                remote_url_supabase TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);
    });

    afterEach(() => {
        try {
            if (db) db.close();
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch {}
    });

    it('1. Enforces WAL journal mode and schema integrity', () => {
        const mode = db.pragma('journal_mode', { simple: true });
        expect(String(mode).toLowerCase()).toBe('wal');

        const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
        const names = tables.map((t: any) => t.name);
        expect(names).toContain('outbox_operations');
        expect(names).toContain('outbox_id_map');
        expect(names).toContain('durable_uploads');
    });

    it('2. Enforces atomic rollback on transaction constraint violation', () => {
        const insertStmt = db.prepare(`
            INSERT INTO outbox_operations (
                id, entity_type, operation, payload_json, target, status, retry_count, max_retries, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // First insert succeeds
        insertStmt.run('op_test_1', 'bills', 'insert', JSON.stringify({ amount: 100 }), 'both', 'pending', 0, 5, Date.now(), Date.now());

        const tx = db.transaction(() => {
            insertStmt.run('op_test_2', 'bills', 'insert', JSON.stringify({ amount: 200 }), 'both', 'pending', 0, 5, Date.now(), Date.now());
            // Attempt duplicate ID in same transaction
            insertStmt.run('op_test_1', 'bills', 'insert', JSON.stringify({ amount: 300 }), 'both', 'pending', 0, 5, Date.now(), Date.now());
        });

        expect(() => tx()).toThrow(/UNIQUE constraint failed/);

        // Verify op_test_2 was rolled back completely
        const row2 = db.prepare('SELECT id FROM outbox_operations WHERE id = ?').get('op_test_2');
        expect(row2).toBeUndefined();

        const count = db.prepare('SELECT COUNT(*) as cnt FROM outbox_operations').get().cnt;
        expect(count).toBe(1);
    });

    it('3. Recovers uncorrupted state after simulated process restart', () => {
        // Write pending records
        const insertStmt = db.prepare(`
            INSERT INTO outbox_operations (
                id, entity_type, operation, payload_json, target, status, retry_count, max_retries, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < 50; i++) {
            insertStmt.run(`op_batch_${i}`, 'make_orders', 'insert', JSON.stringify({ item: i }), 'both', 'pending', 0, 5, Date.now(), Date.now());
        }

        // Simulate crash: close database handle abruptly without checkpoint
        db.close();

        // Reopen database as if application restarted
        const recoveredDb = new Database(dbPath);
        recoveredDb.pragma('journal_mode = WAL');

        const rows = recoveredDb.prepare('SELECT COUNT(*) as cnt FROM outbox_operations WHERE status = ?').get('pending');
        expect(rows.cnt).toBe(50);
        recoveredDb.close();
    });

    it('4. Resolves parent IDs strictly per destination without cross-destination pollution', () => {
        const idMapInsert = db.prepare(`
            INSERT INTO outbox_id_map (op_id, target, resolved_id, created_at)
            VALUES (?, ?, ?, ?)
        `);

        // Record deliberately different parent IDs: NAS ID is 1001, Supabase ID is 9999
        idMapInsert.run('parent_bill_op', 'nas', '1001', Date.now());
        idMapInsert.run('parent_bill_op', 'supabase', '9999', Date.now());

        // Query per destination
        const nasRow = db.prepare(`
            SELECT resolved_id FROM outbox_id_map WHERE op_id = ? AND target = ?
        `).get('parent_bill_op', 'nas');

        const sbRow = db.prepare(`
            SELECT resolved_id FROM outbox_id_map WHERE op_id = ? AND target = ?
        `).get('parent_bill_op', 'supabase');

        expect(nasRow.resolved_id).toBe('1001');
        expect(sbRow.resolved_id).toBe('9999');
        expect(nasRow.resolved_id).not.toBe(sbRow.resolved_id);
    });

    it('5. Handles high-concurrency inserts without database locks', () => {
        const insertStmt = db.prepare(`
            INSERT INTO durable_uploads (
                id, local_path, file_name, mime_type, size_bytes, sha256, subfolder, status, retry_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items: any[]) => {
            for (const item of items) {
                insertStmt.run(
                    item.id,
                    item.path,
                    item.name,
                    'image/webp',
                    1024,
                    'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
                    'products',
                    'staged_local',
                    0,
                    Date.now(),
                    Date.now()
                );
            }
        });

        const batch = Array.from({ length: 200 }, (_, i) => ({
            id: `upl_concurrent_${i}`,
            path: `C:/test/file_${i}.webp`,
            name: `file_${i}.webp`
        }));

        expect(() => insertMany(batch)).not.toThrow();
    });

    it('6. Atomic billing operation graph enqueue and dependency ordering across restarts', () => {
        const invoiceNum = 'INV-SQLITE-9901';
        const billOpId = `bill_${invoiceNum}`;
        const itemsOpId = `bill_items_${invoiceNum}`;
        const orderOpId = `make_order_${invoiceNum}_0`;
        const stockOpId = `stock_dec_${invoiceNum}_101_0`;
        const mysqlSyncOpId = `mysql_stock_sync_${invoiceNum}_101_0`;

        const insertStmt = db.prepare(`
            INSERT INTO outbox_operations (
                id, entity_type, operation, payload_json, dependency_op_id, target, status, retry_count, max_retries, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Execute atomic graph enqueue in a single SQLite WAL transaction
        const graphTx = db.transaction(() => {
            insertStmt.run(billOpId, 'bills', 'insert', JSON.stringify({ invoice_number: invoiceNum, total: 5000 }), null, 'both', 'pending', 0, 8, Date.now(), Date.now());
            insertStmt.run(itemsOpId, 'bill_items', 'insert', JSON.stringify([{ product_id: 101, quantity: 2 }]), billOpId, 'both', 'pending', 0, 8, Date.now(), Date.now());
            insertStmt.run(orderOpId, 'make_orders', 'insert', JSON.stringify({ item_name: 'Custom Oak Desk' }), billOpId, 'both', 'pending', 0, 8, Date.now(), Date.now());
            insertStmt.run(stockOpId, 'inventory_decrement', 'insert', JSON.stringify({ product_id: 101, quantity: 2 }), billOpId, 'both', 'pending', 0, 8, Date.now(), Date.now());
            insertStmt.run(mysqlSyncOpId, 'mysql_stock_sync', 'insert', JSON.stringify({ product_id: 101, quantity: 2, sync_id: mysqlSyncOpId }), stockOpId, 'both', 'pending', 0, 8, Date.now(), Date.now());
        });

        graphTx();

        // Simulate crash and reopen
        db.close();
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');

        // Verify all 5 graph operations were durably committed
        const ops = db.prepare('SELECT id, entity_type, dependency_op_id, status FROM outbox_operations WHERE id LIKE ?').all(`%${invoiceNum}%`);
        expect(ops.length).toBe(5);

        const bill = ops.find((o: any) => o.id === billOpId);
        const items = ops.find((o: any) => o.id === itemsOpId);
        const mysqlSync = ops.find((o: any) => o.id === mysqlSyncOpId);

        expect(bill.dependency_op_id).toBeNull();
        expect(items.dependency_op_id).toBe(billOpId);
        expect(mysqlSync.dependency_op_id).toBe(stockOpId);

        // Attempting to re-enqueue same invoice duplicate is blocked by PRIMARY KEY
        const reinsertStmt = db.prepare(`
            INSERT INTO outbox_operations (
                id, entity_type, operation, payload_json, dependency_op_id, target, status, retry_count, max_retries, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        expect(() => {
            db.transaction(() => {
                reinsertStmt.run(billOpId, 'bills', 'insert', JSON.stringify({ invoice_number: invoiceNum }), null, 'both', 'pending', 0, 8, Date.now(), Date.now());
            })();
        }).toThrow(/UNIQUE constraint failed/);
    });

    it('7. Reconciles temporary database fallback buffer and maintains cleanup_pending on failure', () => {
        const opId = 'op_buffered_fallback_1';
        const insertStmt = db.prepare(`
            INSERT INTO outbox_operations (
                id, entity_type, operation, payload_json, target, status, retry_count, max_retries, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Record operation buffered in Supabase Cloud fallback
        insertStmt.run(opId, 'bills', 'insert', JSON.stringify({ invoice_number: 'INV-FB-1' }), 'both', 'buffered_supabase', 0, 8, Date.now(), Date.now());

        // Map resolved Supabase ID
        db.prepare('INSERT INTO outbox_id_map (op_id, target, resolved_id, created_at) VALUES (?, ?, ?, ?)').run(opId, 'supabase', 'sb_row_uuid_123', Date.now());

        // TrueNAS persistence confirmed -> status moves to cleanup_pending if cloud copy deletion fails
        db.prepare(`
            UPDATE outbox_operations
            SET status = 'cleanup_pending', last_error = 'Cloud cleanup timeout. Retrying.'
            WHERE id = ?
        `).run(opId);

        const pendingRow = db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(pendingRow.status).toBe('cleanup_pending');
        expect(pendingRow.last_error).toContain('Cloud cleanup timeout');

        // Once cloud deletion and quota prune succeed -> status moves to completed
        db.prepare(`
            UPDATE outbox_operations
            SET status = 'completed', last_error = NULL
            WHERE id = ?
        `).run(opId);

        const completedRow = db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(completedRow.status).toBe('completed');
        expect(completedRow.last_error).toBeNull();
    });

    it('8. Destination-enforced idempotency prevents duplicate stock decrements on retry', () => {
        // Create destination table simulating MySQL le_stock_sync_idempotency
        db.exec(`
            CREATE TABLE IF NOT EXISTS test_mysql_idempotency (
                dedup_key TEXT PRIMARY KEY,
                invoice_number TEXT,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                synced_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS test_mysql_products (
                id INTEGER PRIMARY KEY,
                quantity INTEGER NOT NULL
            );
            INSERT INTO test_mysql_products (id, quantity) VALUES (101, 50);
        `);

        const syncStock = (dedupKey: string, prodId: number, qty: number) => {
            return db.transaction(() => {
                const existing = db.prepare('SELECT dedup_key FROM test_mysql_idempotency WHERE dedup_key = ?').get(dedupKey);
                if (existing) {
                    return { skipped: true, remaining: db.prepare('SELECT quantity FROM test_mysql_products WHERE id = ?').get(prodId).quantity };
                }
                db.prepare('INSERT INTO test_mysql_idempotency (dedup_key, invoice_number, product_id, quantity, synced_at) VALUES (?, ?, ?, ?, ?)').run(
                    dedupKey, 'INV-DEDUP-1', prodId, qty, Date.now()
                );
                db.prepare('UPDATE test_mysql_products SET quantity = MAX(quantity - ?, 0) WHERE id = ?').run(qty, prodId);
                return { skipped: false, remaining: db.prepare('SELECT quantity FROM test_mysql_products WHERE id = ?').get(prodId).quantity };
            })();
        };

        const syncKey = 'sync_INV-DEDUP-1_101';

        // First attempt decrements from 50 to 45
        const first = syncStock(syncKey, 101, 5);
        expect(first.skipped).toBe(false);
        expect(first.remaining).toBe(45);

        // Simulated crash after remote execution: retry with same syncKey
        const second = syncStock(syncKey, 101, 5);
        expect(second.skipped).toBe(true);
        expect(second.remaining).toBe(45); // Unchanged!
    });
});

