/**
 * SupabaseQuotaManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomic Quota Accounting & Hard Ceiling Enforcement Engine for Supabase Fallback Buffer.
 *
 * SCOPE SPECIFICATION:
 * The 1,000,000,000 bytes (1 GB) cap is an application-enforced ceiling specifically
 * governing application-managed temporary fallback data (cloud-buffered image/CAD uploads
 * and temporary fallback database records pending TrueNAS sync).
 * It does NOT represent global project infrastructure storage (auth tokens, project telemetry,
 * platform audit logs), which is managed independently by Supabase project tiers.
 * While atomic reservation provides fast pre-write gatekeeping based on conservative payload
 * bounds, authoritative ground truth is established via recursive live bucket crawls and
 * database footprint audits.
 *
 * Buffer Partition Allocations:
 *  - 600 MB (600,000,000 B) max allocation for temporary cloud-buffered image & CAD objects.
 *  - 250 MB (250,000,000 B) max allocation for temporary fallback database records & indexes.
 *  - 150 MB (150,000,000 B) hard reserve for critical system logs, auth sessions & telemetry.
 *
 * Warning Thresholds:
 *  - 800 MB (800,000,000 B): Warning state emitted; non-urgent background caching throttled.
 *  - 950 MB (950,000,000 B): Critical state emitted; new cloud uploads halted, held in local outbox.
 *  - 1,000,000,000 B: Hard limit; absolute freeze on new Supabase buffer writes.
 *
 * Guarantees:
 *  - Atomic capacity reservation across concurrent workers & desktop clients.
 *  - Explicit validation of every Supabase RPC { data, error } response.
 *  - Safe cleanup: Cloud copies are NEVER deleted until authoritative TrueNAS persistence
 *    and byte/checksum verification are confirmed.
 *  - Never evicts unreplicated writes or sole copies of files.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface QuotaBreakdown {
    databaseBytes: number;
    storageBytes: number;
    reservedBytes: number;
    totalUsedBytes: number;
    hardLimitBytes: number;
    databaseLimitBytes: number;
    storageLimitBytes: number;
    reserveLimitBytes: number;
    remainingStorageBufferBytes: number;
    remainingDatabaseBufferBytes: number;
    remainingTotalBytes: number;
    status: 'ok' | 'warning' | 'critical' | 'exceeded';
    lastMeasuredAt: number;
    oldestPendingUploadTime: number | null;
    blockedOperationsCount: number;
}

export class SupabaseQuotaManager {
    private static instance: SupabaseQuotaManager | null = null;

    // Hard ceiling definitions (in bytes)
    public static readonly HARD_CEILING_BYTES = 1_000_000_000;         // 1 GB total
    public static readonly STORAGE_CEILING_BYTES = 600_000_000;        // 600 MB for images/CAD
    public static readonly DATABASE_CEILING_BYTES = 250_000_000;       // 250 MB for DB rows
    public static readonly CRITICAL_RESERVE_BYTES = 150_000_000;       // 150 MB emergency floor

    public static readonly WARNING_THRESHOLD_BYTES = 800_000_000;     // 800 MB (80%)
    public static readonly CRITICAL_THRESHOLD_BYTES = 950_000_000;    // 950 MB (95%)

    public clientId: string;
    private client: SupabaseClient | null = null;
    private reconciliationClient: SupabaseClient | null = null;
    private stateFilePath: string;

    // In-memory atomic reservation tracking (local view)
    private activeStorageReservations = new Map<string, number>();
    private activeDatabaseReservations = new Map<string, number>();

    // Measured byte metrics
    private measuredDatabaseBytes = 0;
    private measuredStorageBytes = 0;
    private lastMeasuredAt = 0;
    private oldestPendingTime: number | null = null;
    private blockedOperationsCount = 0;
    private isMeasurementStale = false;

    private isAuditing = false;

    public constructor(clientId?: string, client?: SupabaseClient | null) {
        this.clientId = clientId || (process.env.LESOFT_CLIENT_ID || (app?.getPath ? app.getPath('userData') : process.cwd()).replace(/[^a-zA-Z0-9_-]/g, '_'));
        this.client = client || null;
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.stateFilePath = path.join(userData, `supabase_quota_state_${this.clientId.slice(0, 16)}.json`);
        this.loadPersistedState();
    }

    public static getInstance(): SupabaseQuotaManager {
        if (!SupabaseQuotaManager.instance) {
            SupabaseQuotaManager.instance = new SupabaseQuotaManager();
        }
        return SupabaseQuotaManager.instance;
    }

    public registerClient(client: SupabaseClient | null): void {
        this.client = client;
    }

    public registerClients(clients: { supabase: SupabaseClient | null; reconciliation?: SupabaseClient | null }): void {
        this.client = clients.supabase;
        if (clients.reconciliation !== undefined) {
            this.reconciliationClient = clients.reconciliation;
        }
    }

    /**
     * Registers a trusted reconciliation client (e.g. an authenticated reconciliation operator session)
     * for pruning committed buffer capacity without embedding service-role secrets in desktop client config.
     */
    public registerReconciliationClient(client: SupabaseClient | null): void {
        this.reconciliationClient = client;
    }

    public recordUsage(_source: string, storageBytes: number, dbBytes: number): void {
        this.measuredStorageBytes = storageBytes;
        this.measuredDatabaseBytes = dbBytes;
        this.lastMeasuredAt = Date.now();
        this.isMeasurementStale = false;
        this.persistState();
    }

    private loadPersistedState(): void {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.measuredDatabaseBytes = Number(parsed.measuredDatabaseBytes) || 0;
                this.measuredStorageBytes = Number(parsed.measuredStorageBytes) || 0;
                this.lastMeasuredAt = Number(parsed.lastMeasuredAt) || 0;
            }
        } catch {
            this.measuredDatabaseBytes = 0;
            this.measuredStorageBytes = 0;
            this.lastMeasuredAt = 0;
        }
    }

    private persistState(): void {
        try {
            fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
            fs.writeFileSync(this.stateFilePath, JSON.stringify({
                measuredDatabaseBytes: this.measuredDatabaseBytes,
                measuredStorageBytes: this.measuredStorageBytes,
                lastMeasuredAt: this.lastMeasuredAt,
                updatedAt: Date.now()
            }, null, 2), 'utf-8');
        } catch {}
    }

    // ── Atomic Reservation Mechanism ─────────────────────────────────────────────

    /**
     * Attempts to atomically reserve storage quota for a file upload.
     * Enforces shared server-side reservation across multiple desktop clients when client is registered.
     * Returns true if reservation is accepted, false if capacity would be exceeded or uncertain.
     */
    public async reserveStorageQuota(reservationId: string, bytesNeeded: number): Promise<boolean> {
        if (bytesNeeded <= 0) return true;

        // Shared server-side atomic reservation with PostgreSQL advisory locking
        if (this.client) {
            try {
                // Call authoritative PostgreSQL RPC reserve_buffer_capacity
                const { data, error } = await this.client.rpc('reserve_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_resource_type: 'storage',
                    p_bytes: bytesNeeded
                });

                if (!error && data) {
                    if (data.success === true) {
                        this.activeStorageReservations.set(reservationId, bytesNeeded);
                        return true;
                    } else {
                        this.blockedOperationsCount++;
                        console.warn(`[QUOTA] Shared storage reservation REJECTED for ${reservationId} (${bytesNeeded} B). Reason: ${data.reason}`);
                        return false;
                    }
                }

                // If RPC fails or network drops, fail closed to local SQLite outbox!
                this.blockedOperationsCount++;
                console.warn(`[QUOTA] Shared quota RPC error: ${error?.message || 'Unknown RPC failure'}. Failing closed to local storage.`);
                return false;
            } catch (ex: any) {
                this.blockedOperationsCount++;
                console.warn(`[QUOTA] Shared quota verification exception. Retaining work locally:`, ex.message);
                return false;
            }
        }

        // Standalone offline or test mode reservation check
        const currentReserved = this.getTotalReservedStorageBytes();
        const prospectiveStorageTotal = this.measuredStorageBytes + currentReserved + bytesNeeded;
        const prospectiveGrandTotal = this.getCurrentTotalUsageBytes() + bytesNeeded;

        if (prospectiveStorageTotal > SupabaseQuotaManager.STORAGE_CEILING_BYTES ||
            prospectiveGrandTotal > SupabaseQuotaManager.CRITICAL_THRESHOLD_BYTES) {
            this.blockedOperationsCount++;
            return false;
        }

        this.activeStorageReservations.set(reservationId, bytesNeeded);
        return true;
    }

    public async releaseStorageQuota(reservationId: string, confirmedUploadedBytes = 0, statusOverride?: 'committed' | 'released' | 'pruned'): Promise<boolean> {
        this.activeStorageReservations.delete(reservationId);
        if (this.client) {
            try {
                const finalStatus = statusOverride || (confirmedUploadedBytes > 0 ? 'committed' : 'released');
                const { data, error } = await this.client.rpc('release_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_status: finalStatus,
                    p_actual_bytes: confirmedUploadedBytes
                });

                if (error || !data || data.success !== true) {
                    console.warn(`[QUOTA] Failed to transition storage capacity via RPC for ${reservationId} (status=${finalStatus}): ${error?.message || data?.reason || 'Unknown error'}`);
                    return false;
                }

                if (confirmedUploadedBytes > 0) {
                    this.measuredStorageBytes += confirmedUploadedBytes;
                    this.persistState();
                }
                return true;
            } catch (err: any) {
                console.warn('[QUOTA] Failed to release storage capacity via RPC:', err.message);
                return false;
            }
        }

        if (confirmedUploadedBytes > 0) {
            this.measuredStorageBytes += confirmedUploadedBytes;
            this.persistState();
        }
        return true;
    }

    public async pruneConfirmedStorage(reservationId: string, bytesPruned: number): Promise<boolean> {
        const activeClient = this.reconciliationClient || this.client;
        if (activeClient) {
            try {
                const { data, error } = await activeClient.rpc('release_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_status: 'pruned',
                    p_actual_bytes: 0
                });

                if (error || !data || data.success !== true) {
                    console.warn(`[QUOTA] Failed to prune storage buffer capacity via RPC for ${reservationId}: ${error?.message || data?.reason || 'Unknown error'}`);
                    return false;
                }

                if (bytesPruned > 0) {
                    this.measuredStorageBytes = Math.max(0, this.measuredStorageBytes - bytesPruned);
                    this.persistState();
                }
                return true;
            } catch (err: any) {
                console.warn('[QUOTA] Exception pruning storage capacity:', err.message);
                return false;
            }
        }

        if (bytesPruned > 0) {
            this.measuredStorageBytes = Math.max(0, this.measuredStorageBytes - bytesPruned);
            this.persistState();
        }
        return true;
    }

    /**
     * Attempts to atomically reserve database quota for an offline fallback row batch.
     */
    public async reserveDatabaseQuota(reservationId: string, estimatedBytes: number): Promise<boolean> {
        if (estimatedBytes <= 0) return true;

        if (this.client) {
            try {
                const { data, error } = await this.client.rpc('reserve_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_resource_type: 'database',
                    p_bytes: estimatedBytes
                });

                if (!error && data) {
                    if (data.success === true) {
                        this.activeDatabaseReservations.set(reservationId, estimatedBytes);
                        return true;
                    } else {
                        this.blockedOperationsCount++;
                        console.warn(`[QUOTA] Shared database reservation REJECTED for ${reservationId}. Reason: ${data.reason}`);
                        return false;
                    }
                }

                // If RPC fails, fail closed to local SQLite outbox!
                this.blockedOperationsCount++;
                console.warn(`[QUOTA] Shared DB quota RPC error: ${error?.message || 'Unknown'}. Failing closed.`);
                return false;
            } catch (ex: any) {
                this.blockedOperationsCount++;
                console.warn(`[QUOTA] Shared DB quota exception:`, ex.message);
                return false;
            }
        }

        const currentReserved = this.getTotalReservedDatabaseBytes();
        const prospectiveDbTotal = this.measuredDatabaseBytes + currentReserved + estimatedBytes;
        const prospectiveGrandTotal = this.getCurrentTotalUsageBytes() + estimatedBytes;

        if (prospectiveDbTotal > SupabaseQuotaManager.DATABASE_CEILING_BYTES ||
            prospectiveGrandTotal > SupabaseQuotaManager.CRITICAL_THRESHOLD_BYTES) {
            this.blockedOperationsCount++;
            return false;
        }

        this.activeDatabaseReservations.set(reservationId, estimatedBytes);
        return true;
    }

    public async releaseDatabaseQuota(reservationId: string, confirmedWrittenBytes = 0, statusOverride?: 'committed' | 'released' | 'pruned'): Promise<boolean> {
        this.activeDatabaseReservations.delete(reservationId);
        if (this.client) {
            try {
                const finalStatus = statusOverride || (confirmedWrittenBytes > 0 ? 'committed' : 'released');
                const { data, error } = await this.client.rpc('release_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_status: finalStatus,
                    p_actual_bytes: confirmedWrittenBytes
                });

                if (error || !data || data.success !== true) {
                    console.warn(`[QUOTA] Failed to transition database capacity via RPC for ${reservationId} (status=${finalStatus}): ${error?.message || data?.reason || 'Unknown error'}`);
                    return false;
                }

                if (confirmedWrittenBytes > 0) {
                    this.measuredDatabaseBytes += confirmedWrittenBytes;
                    this.persistState();
                }
                return true;
            } catch (err: any) {
                console.warn('[QUOTA] Failed to release database capacity via RPC:', err.message);
                return false;
            }
        }

        if (confirmedWrittenBytes > 0) {
            this.measuredDatabaseBytes += confirmedWrittenBytes;
            this.persistState();
        }
        return true;
    }

    public async pruneConfirmedDatabase(reservationId: string, bytesPruned: number): Promise<boolean> {
        const activeClient = this.reconciliationClient || this.client;
        if (activeClient) {
            try {
                const { data, error } = await activeClient.rpc('release_buffer_capacity', {
                    p_reservation_id: reservationId,
                    p_client_id: this.clientId,
                    p_status: 'pruned',
                    p_actual_bytes: 0
                });

                if (error || !data || data.success !== true) {
                    console.warn(`[QUOTA] Failed to prune database buffer capacity via RPC for ${reservationId}: ${error?.message || data?.reason || 'Unknown error'}`);
                    return false;
                }

                if (bytesPruned > 0) {
                    this.measuredDatabaseBytes = Math.max(0, this.measuredDatabaseBytes - bytesPruned);
                    this.persistState();
                }
                return true;
            } catch (err: any) {
                console.warn('[QUOTA] Exception pruning database capacity:', err.message);
                return false;
            }
        }

        if (bytesPruned > 0) {
            this.measuredDatabaseBytes = Math.max(0, this.measuredDatabaseBytes - bytesPruned);
            this.persistState();
        }
        return true;
    }

    public deductConfirmedPrunedStorage(bytesRemoved: number): void {
        if (bytesRemoved > 0) {
            this.measuredStorageBytes = Math.max(0, this.measuredStorageBytes - bytesRemoved);
            this.persistState();
        }
    }

    public deductConfirmedPrunedDatabase(bytesRemoved: number): void {
        if (bytesRemoved > 0) {
            this.measuredDatabaseBytes = Math.max(0, this.measuredDatabaseBytes - bytesRemoved);
            this.persistState();
        }
    }

    public canAcceptStorageUpload(bytesNeeded: number = 0): boolean {
        if (bytesNeeded < 0) return false;
        if (this.isMeasurementStale && this.getCurrentTotalUsageBytes() > 750_000_000) return false;
        const currentReserved = this.getTotalReservedStorageBytes();
        const prospectiveStorageTotal = this.measuredStorageBytes + currentReserved + bytesNeeded;
        const prospectiveGrandTotal = this.getCurrentTotalUsageBytes() + bytesNeeded;

        return prospectiveStorageTotal <= SupabaseQuotaManager.STORAGE_CEILING_BYTES &&
               prospectiveGrandTotal <= SupabaseQuotaManager.CRITICAL_THRESHOLD_BYTES;
    }

    public canAcceptDatabaseWrite(bytesNeeded: number = 0): boolean {
        if (bytesNeeded < 0) return false;
        if (this.isMeasurementStale && this.getCurrentTotalUsageBytes() > 750_000_000) return false;
        const currentReserved = this.getTotalReservedDatabaseBytes();
        const prospectiveDbTotal = this.measuredDatabaseBytes + currentReserved + bytesNeeded;
        const prospectiveGrandTotal = this.getCurrentTotalUsageBytes() + bytesNeeded;

        return prospectiveDbTotal <= SupabaseQuotaManager.DATABASE_CEILING_BYTES &&
               prospectiveGrandTotal <= SupabaseQuotaManager.CRITICAL_THRESHOLD_BYTES;
    }

    private auditTimer: ReturnType<typeof setInterval> | null = null;

    public async auditUsage(): Promise<QuotaBreakdown> {
        return this.auditLiveCloudUsage();
    }

    public startBackgroundAudit(intervalMs = 60000): void {
        if (this.auditTimer) return;
        this.auditTimer = setInterval(() => {
            this.auditLiveCloudUsage().catch(() => {});
        }, intervalMs);
    }

    public stopBackgroundAudit(): void {
        if (this.auditTimer) {
            clearInterval(this.auditTimer);
            this.auditTimer = null;
        }
    }

    // ── Metric Calculation ───────────────────────────────────────────────────────

    public getTotalReservedStorageBytes(): number {
        let total = 0;
        for (const bytes of this.activeStorageReservations.values()) {
            total += bytes;
        }
        return total;
    }

    public getTotalReservedDatabaseBytes(): number {
        let total = 0;
        for (const bytes of this.activeDatabaseReservations.values()) {
            total += bytes;
        }
        return total;
    }

    public getCurrentTotalUsageBytes(): number {
        return this.measuredDatabaseBytes +
               this.measuredStorageBytes +
               this.getTotalReservedStorageBytes() +
               this.getTotalReservedDatabaseBytes();
    }

    public getQuotaStatus(): QuotaBreakdown {
        const totalUsed = this.getCurrentTotalUsageBytes();
        let status: 'ok' | 'warning' | 'critical' | 'exceeded' = 'ok';

        if (totalUsed >= SupabaseQuotaManager.HARD_CEILING_BYTES) {
            status = 'exceeded';
        } else if (totalUsed >= SupabaseQuotaManager.CRITICAL_THRESHOLD_BYTES) {
            status = 'critical';
        } else if (totalUsed >= SupabaseQuotaManager.WARNING_THRESHOLD_BYTES) {
            status = 'warning';
        }

        const totalReserved = this.getTotalReservedStorageBytes() + this.getTotalReservedDatabaseBytes();

        return {
            databaseBytes: this.measuredDatabaseBytes,
            storageBytes: this.measuredStorageBytes,
            reservedBytes: totalReserved,
            totalUsedBytes: totalUsed,
            hardLimitBytes: SupabaseQuotaManager.HARD_CEILING_BYTES,
            databaseLimitBytes: SupabaseQuotaManager.DATABASE_CEILING_BYTES,
            storageLimitBytes: SupabaseQuotaManager.STORAGE_CEILING_BYTES,
            reserveLimitBytes: SupabaseQuotaManager.CRITICAL_RESERVE_BYTES,
            remainingStorageBufferBytes: Math.max(0, SupabaseQuotaManager.STORAGE_CEILING_BYTES - (this.measuredStorageBytes + this.getTotalReservedStorageBytes())),
            remainingDatabaseBufferBytes: Math.max(0, SupabaseQuotaManager.DATABASE_CEILING_BYTES - (this.measuredDatabaseBytes + this.getTotalReservedDatabaseBytes())),
            remainingTotalBytes: Math.max(0, SupabaseQuotaManager.HARD_CEILING_BYTES - totalUsed),
            status,
            lastMeasuredAt: this.lastMeasuredAt,
            oldestPendingUploadTime: this.oldestPendingTime,
            blockedOperationsCount: this.blockedOperationsCount
        };
    }

    public setOldestPendingTime(timestamp: number | null): void {
        this.oldestPendingTime = timestamp;
    }

    // ── Live Audit of Supabase Cloud Usage ───────────────────────────────────────

    /**
     * Recursive crawler that measures all nested Supabase Storage objects.
     */
    private async crawlStorageBucketRecursive(bucket: string, prefix = ''): Promise<{ totalBytes: number; fileCount: number }> {
        let totalBytes = 0;
        let fileCount = 0;
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            try {
                const { data, error } = await this.client!.storage
                    .from(bucket)
                    .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

                if (error || !data || data.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const item of data) {
                    if (item.metadata && typeof item.metadata.size === 'number') {
                        totalBytes += item.metadata.size;
                        fileCount++;
                    } else if (!item.id || item.id === null) {
                        // Nested subfolder: recursively traverse
                        const nestedPath = prefix ? `${prefix}/${item.name}` : item.name;
                        const subResult = await this.crawlStorageBucketRecursive(bucket, nestedPath);
                        totalBytes += subResult.totalBytes;
                        fileCount += subResult.fileCount;
                    }
                }

                if (data.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                }
            } catch {
                hasMore = false;
                break;
            }
        }
        return { totalBytes, fileCount };
    }

    /**
     * Conducts a read-only live measurement of Supabase Database table footprints
     * and Supabase Storage bucket volume.
     */
    public async auditLiveCloudUsage(): Promise<QuotaBreakdown> {
        if (!this.client || this.isAuditing) {
            return this.getQuotaStatus();
        }

        this.isAuditing = true;
        try {
            console.log('[QUOTA] Performing live measurement of Supabase fallback buffer...');

            // 1. Recursive storage bucket audit across make-order-files
            let totalStorageBytes = 0;
            try {
                const rootCrawl = await this.crawlStorageBucketRecursive('make-order-files', '');
                totalStorageBytes = rootCrawl.totalBytes;

                // Explicit check on known nested subfolders
                const knownSubfolders = ['product-images', 'cad-models', 'technical-drawings', 'order-drawings', 'order-photos', 'bill-attachments', 'temp'];
                for (const sub of knownSubfolders) {
                    const subCrawl = await this.crawlStorageBucketRecursive('make-order-files', sub);
                    if (rootCrawl.fileCount === 0) {
                        totalStorageBytes += subCrawl.totalBytes;
                    }
                }
            } catch (storageErr: any) {
                console.warn('[QUOTA] Storage crawl exception:', storageErr.message);
                this.isMeasurementStale = true;
            }

            // 2. Comprehensive Database table footprint audit with index/WAL overhead
            let totalDatabaseBytes = 0;
            let hadTableFailure = false;

            const tablesToInspect = [
                { name: 'bills', avgBytesPerRow: 600 },
                { name: 'bill_items', avgBytesPerRow: 400 },
                { name: 'billing_customers', avgBytesPerRow: 500 },
                { name: 'customer_payments', avgBytesPerRow: 300 },
                { name: 'customer_addresses', avgBytesPerRow: 350 },
                { name: 'exchange_orders', avgBytesPerRow: 500 },
                { name: 'exchange_items', avgBytesPerRow: 350 },
                { name: 'make_orders', avgBytesPerRow: 1500 },
                { name: 'make_order_items', avgBytesPerRow: 800 },
                { name: 'make_products', avgBytesPerRow: 1000 },
                { name: 'company_settings', avgBytesPerRow: 1200 },
                { name: 'system_audit_log', avgBytesPerRow: 500 },
                { name: 'shipping_status_log', avgBytesPerRow: 400 },
                { name: 'nas_client_registry', avgBytesPerRow: 300 },
                { name: 'supabase_buffer_reservations', avgBytesPerRow: 250 }
            ];

            await Promise.allSettled(tablesToInspect.map(async t => {
                try {
                    const { count, error } = await this.client!
                        .from(t.name)
                        .select('id', { count: 'exact', head: true });
                    if (!error && typeof count === 'number') {
                        // Data bytes + conservative 40% Postgres index/WAL multiplier
                        totalDatabaseBytes += Math.round(count * t.avgBytesPerRow * 1.4);
                    } else if (error) {
                        hadTableFailure = true;
                    }
                } catch {
                    hadTableFailure = true;
                }
            }));

            this.isMeasurementStale = hadTableFailure;
            this.measuredStorageBytes = totalStorageBytes;
            this.measuredDatabaseBytes = totalDatabaseBytes;
            this.lastMeasuredAt = Date.now();
            this.persistState();

            const status = this.getQuotaStatus();
            console.log(`[QUOTA] Live audit complete: DB: ${(status.databaseBytes / (1024 * 1024)).toFixed(2)} MB, Storage: ${(status.storageBytes / (1024 * 1024)).toFixed(2)} MB, Total: ${(status.totalUsedBytes / (1024 * 1024)).toFixed(2)} MB / 1000 MB. Status: ${status.status.toUpperCase()}`);
            return status;
        } catch (err: any) {
            console.error('[QUOTA] Live quota audit error:', err.message);
            this.isMeasurementStale = true;
            return this.getQuotaStatus();
        } finally {
            this.isAuditing = false;
        }
    }
}
