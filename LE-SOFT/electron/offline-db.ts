/**
 * offline-db.ts
 *
 * Local SQLite fallback database for LE-SOFT.
 * Provides a reliable local cache of Supabase data and a persistent queue for offline writes.
 *
 * Uses better-sqlite3 (synchronous API) which has official prebuilt binaries for
 * all platforms (darwin-arm64, win32-x64) — no native compilation required.
 * The public API is kept async for backward-compatibility with the rest of the codebase.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export async function initOfflineDB(): Promise<void> {
    if (db) return;

    const dbPath = path.join(app.getPath('userData'), 'lesoft_offline.db');
    db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');

    // 1. Table cache (stores entire tables as JSON blobs for offline reads)
    db.exec(`
        CREATE TABLE IF NOT EXISTS table_cache (
            table_name TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // 2. Sync queue (stores pending operations when offline)
    db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            retry_count INTEGER DEFAULT 0
        )
    `);

    console.log('[OfflineDB] Initialized at:', dbPath);
}

// ── Cache Operations (Reads) ──────────────────────────────────────────────────

export async function saveTableCache(tableName: string, rows: any[]): Promise<void> {
    if (!db) return;
    try {
        const json = JSON.stringify(rows);
        const stmt = db.prepare(`
            INSERT INTO table_cache (table_name, data_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(table_name) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at
        `);
        stmt.run(tableName, json, Date.now());
    } catch (e: any) {
        console.error(`[OfflineDB] Failed to save cache for ${tableName}:`, e.message);
    }
}

export async function loadTableCache(tableName: string): Promise<any[]> {
    if (!db) return [];
    try {
        const stmt = db.prepare(`SELECT data_json FROM table_cache WHERE table_name = ?`);
        const row = stmt.get(tableName) as { data_json: string } | undefined;
        if (row?.data_json) {
            return JSON.parse(row.data_json);
        }
    } catch (e: any) {
        console.error(`[OfflineDB] Failed to load cache for ${tableName}:`, e.message);
    }
    return [];
}

export async function clearTableCache(): Promise<void> {
    if (!db) return;
    db.prepare(`DELETE FROM table_cache`).run();
}

// ── Queue Operations (Writes) ─────────────────────────────────────────────────

export interface SyncOperation {
    id: string;
    table: string;
    operation: 'insert' | 'update' | 'upsert' | 'delete';
    payload: any;
    created_at?: number;
    retry_count?: number;
}

export async function enqueueOfflineWrite(op: SyncOperation): Promise<void> {
    if (!db) return;
    try {
        const stmt = db.prepare(`
            INSERT INTO sync_queue (id, table_name, operation, payload_json, created_at, retry_count)
            VALUES (?, ?, ?, ?, ?, 0)
        `);
        stmt.run(op.id, op.table, op.operation, JSON.stringify(op.payload), Date.now());
        console.log(`[OfflineDB] Enqueued offline write: ${op.operation} on ${op.table}`);
    } catch (e: any) {
        console.error(`[OfflineDB] Failed to enqueue offline write:`, e.message);
    }
}

export async function getPendingWrites(): Promise<SyncOperation[]> {
    if (!db) return [];
    try {
        const rows = db.prepare(`SELECT * FROM sync_queue ORDER BY created_at ASC`).all() as any[];
        return rows.map(r => ({
            id: r.id,
            table: r.table_name,
            operation: r.operation as any,
            payload: JSON.parse(r.payload_json),
            created_at: r.created_at,
            retry_count: r.retry_count
        }));
    } catch (e: any) {
        console.error(`[OfflineDB] Failed to get pending writes:`, e.message);
        return [];
    }
}

export async function removePendingWrite(id: string): Promise<void> {
    if (!db) return;
    db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(id);
}

export async function incrementRetryCount(id: string): Promise<void> {
    if (!db) return;
    db.prepare(`UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`).run(id);
}
