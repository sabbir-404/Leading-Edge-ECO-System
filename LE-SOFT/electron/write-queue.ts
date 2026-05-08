/**
 * ═══════════════════════════════════════════════════════════════════════════
 * write-queue.ts — Universal Asynchronous Write Buffer for LE-SOFT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 *   All Supabase writes pass through this queue instead of hitting the DB
 *   directly. This gives us:
 *   1. OFFLINE RESILIENCE — writes survive network drops (persisted to SQLite)
 *   2. NON-BLOCKING UI   — IPC handlers return immediately; DB write is async
 *   3. RETRY LOGIC       — exponential backoff up to 4 retries before failing
 *   4. BATCH THROUGHPUT  — 10 concurrent writes per 300ms drain cycle
 *
 * DATA FLOW:
 *   ipc-handlers → enqueue() → [memory queue + SQLite sync_queue]
 *                 → drain() every 300ms
 *                 → processEntry() → Supabase
 *                 → onSuccess() → renderer refresh signal
 *
 * SHUTDOWN:
 *   main.ts calls flush() in 'before-quit'. Drains all writes within 15s
 *   before calling app.exit(0). Unsent writes stay in SQLite for next launch.
 */

import { BrowserWindow } from 'electron';
import supabase from './supabase';
import { encryptObject, encryptRowsAsync } from './field-encryption';
import { enqueueOfflineWrite, removePendingWrite, getPendingWrites, incrementRetryCount } from './offline-db';

// ── Types ──────────────────────────────────────────────────────────────────────
export type QueueOperation = 'insert' | 'update' | 'upsert' | 'delete' | 'custom';

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
        } else if (operation === 'custom' && table === 'bill_shipping') {
            const d = data as Record<string, any>;
            // Handle bill_shipping custom operation here so it survives app restarts
            // Since create-bill uses the write-queue, the bill_id might not exist yet
            // when we queued this. We resolve it now using the deterministic invoice_number.
            const { data: b } = await supabase.from('bills').select('id').eq('invoice_number', d.invoice_number).maybeSingle();
            const realBillId = b?.id || d.bill_id;

            const { data: sh, error: shErr } = await supabase.from('bill_shipping').upsert({ 
                bill_id: realBillId, 
                ship_to_name: d.ship_to_name, 
                ship_to_address: d.ship_to_address, 
                ship_to_phone: d.ship_to_phone || '', 
                ship_from_name: d.ship_from_name || '', 
                ship_from_address: d.ship_from_address || '', 
                shipping_charge: d.shipping_charge || 0, 
                updated_by: d.updated_by, 
                status: 'pending_payment' 
            }, { onConflict: 'bill_id' }).select('id').single();
            
            error = shErr;

            if (!error && sh) {
                await supabase.from('shipping_status_log').insert({ 
                    shipment_id: sh.id, 
                    bill_id: realBillId, 
                    status: 'pending_payment', 
                    note: 'Shipping order created', 
                    updated_by: d.updated_by, 
                    updated_by_role: d.user_role || 'cashier' 
                });
                
                // Write audit log (same as writeAuditLog in ipc-handlers)
                await supabase.from('system_audit_log').insert({
                    module: 'Shipping',
                    action: 'SHIPPING_CREATED',
                    entity_type: 'bill',
                    entity_id: String(realBillId),
                    description: `Shipping added. Destination: ${d.ship_to_address}`,
                    new_value: JSON.stringify(d),
                    performed_by: d.updated_by
                });
            }
        }

        if (error) throw new Error(error.message);
        
        // Remove from SQLite offline queue on success
        await removePendingWrite(entry.id).catch(() => {});
        entry.onSuccess?.({ success: true });

        // Broadcast data update to frontend to trigger silent auto-refresh
        try {
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('data-updated', entry.table);
                }
            });
        } catch { }
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
