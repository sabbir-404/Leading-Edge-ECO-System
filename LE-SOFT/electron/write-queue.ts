/**
 * write-queue.ts
 * Universal async write queue for ALL Supabase data-entry operations.
 *
 * Every write (insert/update/delete) to Supabase goes through this queue.
 * Writes are processed asynchronously in the background every 300ms.
 * The caller gets an immediate success response.
 *
 * On app close (before-quit signal), call flush() to wait for queue drain.
 */

import { BrowserWindow } from 'electron';
import supabase from './supabase';
import { encryptObject, encryptRowsAsync } from './field-encryption';
import { enqueueOfflineWrite, removePendingWrite, getPendingWrites, incrementRetryCount } from './offline-db';

// ── Types ──────────────────────────────────────────────────────────────────────
export type QueueOperation = 'insert' | 'update' | 'upsert' | 'delete';

export interface QueueEntry {
    id: string;
    table: string;
    operation: QueueOperation;
    data?: Record<string, any> | Record<string, any>[];
    filter?: { column: string; value: any }[];  // for update/delete
    upsertConflict?: string;                     // for upsert: conflict column
    retries: number;
    enqueuedAt: number;
    /** Optional callback upon completion (in-process) */
    onSuccess?: (result: any) => void;
    onError?: (err: Error) => void;
}

// ── Queue state ───────────────────────────────────────────────────────────────
const queue: QueueEntry[] = [];
const MAX_QUEUE_SIZE = 2000;
const MAX_RETRIES = 4;
const DRAIN_INTERVAL_MS = 300;
const FLUSH_TIMEOUT_MS = 15000;

let drainTimer: ReturnType<typeof setInterval> | null = null;
let isFlushing = false;

// ── Queue ID generator ────────────────────────────────────────────────────────
let _seq = 0;
function nextId(): string {
    return `q-${Date.now()}-${++_seq}`;
}

// ── Broadcast queue status to renderer ───────────────────────────────────────
function broadcastStatus() {
    const pending = queue.length;
    try {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('write-queue-status', { pending });
            }
        });
    } catch { }
}

// ── Enqueue ───────────────────────────────────────────────────────────────────
export function enqueue(entry: Omit<QueueEntry, 'id' | 'retries' | 'enqueuedAt'>): string {
    if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn('[WriteQueue] Queue full! Dropping oldest entry.');
        queue.shift();
    }
    const id = nextId();
    const newEntry: QueueEntry = { ...entry, id, retries: 0, enqueuedAt: Date.now() };
    queue.push(newEntry);
    
    // Persist to offline SQLite queue immediately (fire-and-forget)
    enqueueOfflineWrite({
        id: newEntry.id,
        table: newEntry.table,
        operation: newEntry.operation,
        payload: newEntry.data || newEntry.filter || {} 
    }).catch(() => {});

    broadcastStatus();
    return id;
}

// ── Process a single entry ────────────────────────────────────────────────────
async function processEntry(entry: QueueEntry): Promise<void> {
    try {
        const { table, operation, data, filter, upsertConflict } = entry;

        // Encrypt data before writing (non-blocking chunked for huge arrays)
        const encData = Array.isArray(data)
            ? await encryptRowsAsync(data, 100)
            : data ? encryptObject(data) : undefined;

        let error: any = null;

        if (operation === 'insert') {
            const res = await supabase.from(table).insert(encData as any);
            error = res.error;
        } else if (operation === 'upsert') {
            const res = await supabase.from(table).upsert(encData as any,
                upsertConflict ? { onConflict: upsertConflict } : undefined
            );
            error = res.error;
        } else if (operation === 'update' && filter) {
            let q: any = supabase.from(table).update(encData as any);
            for (const f of filter) q = q.eq(f.column, f.value);
            const res = await q;
            error = res.error;
        } else if (operation === 'delete' && filter) {
            let q: any = supabase.from(table).delete();
            for (const f of filter) q = q.eq(f.column, f.value);
            const res = await q;
            error = res.error;
        }

        if (error) throw new Error(error.message);
        
        // Remove from SQLite offline queue on success
        await removePendingWrite(entry.id).catch(() => {});
        entry.onSuccess?.({ success: true });
    } catch (err: any) {
        entry.retries++;
        await incrementRetryCount(entry.id).catch(() => {});
        
        if (entry.retries < MAX_RETRIES) {
            // Exponential backoff: re-add to back of queue
            const delay = Math.min(1000 * Math.pow(2, entry.retries - 1), 8000);
            console.warn(`[WriteQueue] Retry ${entry.retries}/${MAX_RETRIES} for ${entry.table} in ${delay}ms`);
            setTimeout(() => queue.push(entry), delay);
        } else {
            console.error(`[WriteQueue] Permanently failed after ${MAX_RETRIES} retries:`, entry.table, err.message);
            entry.onError?.(err);
        }
    }
}

// ── Drain loop ────────────────────────────────────────────────────────────────
async function drain(): Promise<void> {
    if (queue.length === 0) return;

    // Process up to 10 entries per drain cycle (batched)
    const batch = queue.splice(0, 10);
    broadcastStatus();

    // Process concurrently (some tables have no order dependency)
    await Promise.allSettled(batch.map(processEntry));
}

// ── Start/Stop the drain timer ────────────────────────────────────────────────
// ── Start/Stop the drain timer ────────────────────────────────────────────────
export async function startQueue(): Promise<void> {
    if (drainTimer) return;
    
    // Load any pending offline writes from previous sessions
    try {
        const pending = await getPendingWrites();
        for (const p of pending) {
            if (!queue.find(q => q.id === p.id)) {
                queue.push({
                    id: p.id,
                    table: p.table,
                    operation: p.operation,
                    data: (p.operation === 'insert' || p.operation === 'upsert') ? p.payload : undefined,
                    filter: (p.operation === 'update' || p.operation === 'delete') ? p.payload : undefined,
                    retries: p.retry_count || 0,
                    enqueuedAt: p.created_at || Date.now()
                });
            }
        }
        if (pending.length > 0) {
            console.log(`[WriteQueue] Restored ${pending.length} pending offline writes from SQLite.`);
            broadcastStatus();
        }
    } catch (e: any) {
        console.error('[WriteQueue] Failed to load pending offline writes:', e.message);
    }

    drainTimer = setInterval(drain, DRAIN_INTERVAL_MS);
    console.log('[WriteQueue] Started. Draining every', DRAIN_INTERVAL_MS, 'ms.');
}

export function stopQueue(): void {
    if (drainTimer) {
        clearInterval(drainTimer);
        drainTimer = null;
    }
}

// ── Flush (called before app quit) ────────────────────────────────────────────
export async function flush(): Promise<void> {
    if (isFlushing) return;
    isFlushing = true;
    stopQueue();
    console.log(`[WriteQueue] Flushing ${queue.length} pending writes before quit...`);

    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    while (queue.length > 0 && Date.now() < deadline) {
        const batch = queue.splice(0, 20);
        await Promise.allSettled(batch.map(processEntry));
    }

    if (queue.length > 0) {
        console.warn(`[WriteQueue] Flushed with ${queue.length} writes still pending (timeout).`);
    } else {
        console.log('[WriteQueue] All writes flushed successfully.');
    }
}

// ── Queue stats (for IPC) ─────────────────────────────────────────────────────
export function getQueueStats() {
    return {
        pending: queue.length,
        oldest: queue[0]?.enqueuedAt ?? null,
    };
}
