import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * local-cache.ts — Local-First SQLite Cache Engine (Tally-Level Speed)
 * Caches products, customers, stock items, and dashboard metrics inside
 * local SQLite (lesoft_offline.db) so pages open instantly in <5ms.
 */

export class LocalEntityCache {
    private static db: any = null;

    private static initDb() {
        if (this.db) return;
        try {
            const userDataPath = app.getPath('userData');
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            const dbPath = path.join(userDataPath, 'lesoft_offline.db');
            this.db = new Database(dbPath);

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS local_entity_cache (
                    entity_type TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            `);
        } catch (err) {
            console.error('[LocalCache] Initialization failed:', err);
        }
    }

    /**
     * Store entity dataset in local SQLite cache
     */
    static setCache(entityType: string, data: any[]) {
        this.initDb();
        if (!this.db) return;
        try {
            const payload = JSON.stringify(data || []);
            const stmt = this.db.prepare(`
                INSERT INTO local_entity_cache (entity_type, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(entity_type) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
            `);
            stmt.run(entityType, payload, Date.now());
        } catch (err) {
            console.error(`[LocalCache] Failed to set cache for ${entityType}:`, err);
        }
    }

    /**
     * Read entity dataset instantly from local SQLite cache (<5ms response)
     */
    static getCache<T = any>(entityType: string): T[] | null {
        this.initDb();
        if (!this.db) return null;
        try {
            const stmt = this.db.prepare('SELECT payload FROM local_entity_cache WHERE entity_type = ?');
            const row = stmt.get(entityType);
            if (row && row.payload) {
                return JSON.parse(row.payload);
            }
        } catch (err) {
            console.error(`[LocalCache] Failed to read cache for ${entityType}:`, err);
        }
        return null;
    }
}
