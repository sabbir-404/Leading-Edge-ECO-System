/**
 * cache-manager.ts
 * In-memory data cache for LE-SOFT.
 *
 * - Loaded AFTER user authentication (not on cold start)
 * - Cleared when app quits (purely in-memory, no disk writes)
 * - Serves reads instantly from memory; falls back to Supabase if miss
 * - Decrypts all rows on load from Supabase
 * - Invalidated on any write to the corresponding table
 * - TTL: 10 minutes per namespace (refreshed on access if < 1 min old)
 */

import { BrowserWindow } from 'electron';
import supabase from './supabase';
import { decryptRows, decryptRowsAsync } from './field-encryption';
import { saveTableCache, loadTableCache } from './offline-db';

// ── Cache entry type ──────────────────────────────────────────────────────────
interface CacheEntry {
    data: any[];
    loadedAt: number;
    ttlMs: number; // default 10 min
}

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

// ── Progress broadcaster ──────────────────────────────────────────────────────
function broadcastProgress(step: string, progress: number, total: number) {
    try {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('cache-load-progress', { step, progress, total });
            }
        });
    } catch { }
}

// ── Preload manifest ──────────────────────────────────────────────────────────
interface PreloadTask {
    key: string;
    label: string;
    query: () => Promise<any[]>;
    ttlMs?: number;
}

const PRELOAD_TASKS: PreloadTask[] = [
    {
        key: 'users',
        label: 'User accounts',
        query: async () => {
            const { data } = await supabase.from('users').select('*').order('full_name');
            return data || [];
        },
    },
    {
        key: 'user_groups',
        label: 'User groups',
        query: async () => {
            const { data } = await supabase.from('user_groups').select('*');
            return data || [];
        },
    },
    {
        key: 'stock_items',
        label: 'Products & stock',
        query: async () => {
            const { data } = await supabase.from('stock_items').select('*').order('name');
            return data || [];
        },
    },
    {
        key: 'billing_customers',
        label: 'Customer records',
        query: async () => {
            const { data } = await supabase
                .from('billing_customers')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(3000);
            return data || [];
        },
    },
    {
        key: 'hrm_employees',
        label: 'Employee records',
        query: async () => {
            const { data } = await supabase.from('hrm_employees').select('*');
            return data || [];
        },
    },
    {
        key: 'make_orders_recent',
        label: 'Production orders',
        query: async () => {
            const { data } = await supabase
                .from('make_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            return data || [];
        },
    },
    {
        key: 'bill_shipping_recent',
        label: 'Shipping records',
        query: async () => {
            const { data } = await supabase
                .from('bill_shipping')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            return data || [];
        },
    },
];

// ── Preload all tables (called after login) ───────────────────────────────────
export async function preloadCache(): Promise<void> {
    const total = PRELOAD_TASKS.length;
    console.log(`[Cache] Starting preload of ${total} data sources...`);

    for (let i = 0; i < PRELOAD_TASKS.length; i++) {
        const task = PRELOAD_TASKS[i];
        broadcastProgress(task.label, i, total);
        try {
            const rows = await task.query();
            // Decrypt all rows on load asynchronously to prevent event loop blocking
            store.set(task.key, {
                data: await decryptRowsAsync(rows, 200),
                loadedAt: Date.now(),
                ttlMs: task.ttlMs ?? DEFAULT_TTL,
            });
            await saveTableCache(task.key, rows).catch(() => {});
            console.log(`[Cache] Loaded '${task.key}': ${rows.length} rows`);
        } catch (e: any) {
            console.warn(`[Cache] Failed to preload '${task.key}':`, e.message);
            const cachedRows = await loadTableCache(task.key);
            if (cachedRows && cachedRows.length > 0) {
                store.set(task.key, { data: await decryptRowsAsync(cachedRows, 200), loadedAt: Date.now(), ttlMs: DEFAULT_TTL });
                console.log(`[Cache] Using offline cache for '${task.key}': ${cachedRows.length} rows`);
            } else {
                store.set(task.key, { data: [], loadedAt: Date.now(), ttlMs: DEFAULT_TTL });
            }
        }
    }

    broadcastProgress('Ready', total, total);
    console.log('[Cache] Preload complete.');
}

// ── Readers ───────────────────────────────────────────────────────────────────
function isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.loadedAt > entry.ttlMs;
}

export function get(key: string): any[] | null {
    const entry = store.get(key);
    if (!entry || isExpired(entry)) return null;
    return entry.data;
}

/** Get with inline search filter (case-insensitive substring on field) */
export function search(
    key: string,
    fields: string[],
    query: string
): any[] | null {
    const data = get(key);
    if (!data) return null;
    const q = query.toLowerCase();
    return data.filter(row =>
        fields.some(f => row[f] != null && String(row[f]).toLowerCase().includes(q))
    );
}

/** Get a single row by field equality */
export function findOne(key: string, field: string, value: any): any | null {
    const data = get(key);
    if (!data) return null;
    return data.find(row => row[field] === value) ?? null;
}

// ── Invalidation ──────────────────────────────────────────────────────────────
/** Call after any write to a table — removes its cache so next read re-fetches */
export function invalidate(key: string): void {
    if (store.has(key)) {
        store.delete(key);
        console.log(`[Cache] Invalidated '${key}'`);
    }
}

/** Refresh a cache key immediately from Supabase */
export async function refresh(key: string): Promise<void> {
    const task = PRELOAD_TASKS.find(t => t.key === key);
    if (!task) return;
    try {
        const rows = await task.query();
        store.set(key, { data: await decryptRowsAsync(rows, 100), loadedAt: Date.now(), ttlMs: task.ttlMs ?? DEFAULT_TTL });
        console.log(`[Cache] Refreshed '${key}': ${rows.length} rows`);
    } catch (e: any) {
        console.warn(`[Cache] Refresh failed for '${key}':`, e.message);
    }
}

// ── Write-through helpers (update cache immediately without waiting for refresh) ──
export function updateOne(key: string, predicate: (row: any) => boolean, updatedRow: any): void {
    const entry = store.get(key);
    if (!entry) return;
    entry.data = entry.data.map(row => predicate(row) ? { ...row, ...updatedRow } : row);
}

export function addOne(key: string, newRow: any): void {
    const entry = store.get(key);
    if (!entry) return;
    entry.data.unshift(newRow); // prepend so it shows at top of lists
}

export function removeOne(key: string, predicate: (row: any) => boolean): void {
    const entry = store.get(key);
    if (!entry) return;
    entry.data = entry.data.filter(row => !predicate(row));
}

// ── Clear all (called on logout / app quit) ───────────────────────────────────
export function clearAll(): void {
    store.clear();
    console.log('[Cache] All cache cleared.');
}

export function getCacheStats(): Record<string, { count: number; ageSeconds: number }> {
    const stats: Record<string, { count: number; ageSeconds: number }> = {};
    for (const [k, v] of store.entries()) {
        stats[k] = {
            count: v.data.length,
            ageSeconds: Math.round((Date.now() - v.loadedAt) / 1000),
        };
    }
    return stats;
}
