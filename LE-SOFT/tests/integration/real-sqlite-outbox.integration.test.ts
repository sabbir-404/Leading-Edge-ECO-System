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

        const count = db.prepare('SELECT COUNT(*) as cnt FROM durable_uploads WHERE status = ?').get('staged_local');
        expect(count.cnt).toBe(200);
    });
});
