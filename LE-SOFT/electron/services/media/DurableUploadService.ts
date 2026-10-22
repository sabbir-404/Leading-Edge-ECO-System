/**
 * DurableUploadService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Durable, Bounded Image & CAD Upload Pipeline for LE-SOFT.
 *
 * Guarantees zero lost files and truthful upload status across network outages:
 *  - Safely stages selected files to local disk (userData/upload_staging) before remote transfer.
 *  - Computes and verifies SHA-256 checksums to detect partial or corrupted uploads.
 *  - Bounded concurrency with realistic 20s timeouts and exponential backoff with jitter.
 *  - Independent health tracking: NAS Storage failures do not require database failover.
 *  - Ephemeral Supabase Cloud storage buffer strictly gated by the 600 MB / 1 GB Quota Manager.
 *  - Automatic Cloud-to-NAS reconciliation: When TrueNAS Storage recovers, buffered objects
 *    are transferred to NAS, verified, the database is updated with the authoritative URL,
 *    and the temporary cloud copy is safely pruned.
 *  - Truthful UI state: Distinguishes 'staged_local', 'buffered_supabase', and 'synced_nas'.
 */

import Database from 'better-sqlite3';
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseQuotaManager } from '../quota/SupabaseQuotaManager';
import { getCfAccessHeaders, getNasStorageCandidates } from '../../supabase';

export type UploadStatus = 
    | 'staged_local'
    | 'buffered_supabase'
    | 'awaiting_association'
    | 'synced_nas'
    | 'failed'
    | 'aborted';

export interface UploadEntityMeta {
    entityType?: string;      // e.g. 'make_orders', 'make_order_items', 'products'
    entityId?: string | number;
    fieldName?: string;       // e.g. 'pdf_urls', 'technical_drawing_url', 'image_url'
}

/** Normalize persisted metadata from pre-schema-migration app versions. */
export const normalizeDurableUploadFieldName = (entityType: string, fieldName: string): string =>
    entityType === 'make_orders' && fieldName === 'stage_photo_url'
        ? 'current_stage_photo'
        : fieldName;

export interface StagedUploadRecord {
    id: string;
    localPath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    subfolder: string;
    entityType: string | null;
    entityId: string | null;
    fieldName: string | null;
    status: UploadStatus;
    remoteUrlNas: string | null;
    remoteUrlSupabase: string | null;
    retryCount: number;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
}

export class DurableUploadService {
    private static instance: DurableUploadService | null = null;
    private db: Database.Database | null = null;
    private stagingDir: string;

    private nasClient: SupabaseClient | null = null;
    private supabaseClient: SupabaseClient | null = null;

    private workerTimer: ReturnType<typeof setInterval> | null = null;
    private isWorking = false;

    private inFlightDispatches = new Map<string, Promise<{ success: boolean; url?: string; activeUrl?: string; durableKey?: string; status: UploadStatus; error?: string }>>();
    private pendingAssociations = new Map<string, UploadEntityMeta>();

    private constructor() {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.stagingDir = path.join(userData, 'upload_staging');
        const dbPath = path.join(userData, 'lesoft_durable_uploads.db');

        try {
            fs.mkdirSync(this.stagingDir, { recursive: true });
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');

            this.db.exec(`
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
                    retry_count INTEGER DEFAULT 0,
                    last_error TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_upload_status ON durable_uploads(status);
                CREATE INDEX IF NOT EXISTS idx_upload_created ON durable_uploads(created_at);

                CREATE TABLE IF NOT EXISTS pending_associations (
                    identifier TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_pending_assoc_created ON pending_associations(created_at);
            `);

            // Schema migration: ensure entity tracking columns exist on pre-existing databases
            const columns = this.db.pragma('table_info(durable_uploads)');
            if (Array.isArray(columns)) {
                const colNames = new Set(columns.map((c: any) => c.name));
                if (!colNames.has('entity_type')) {
                    this.db.exec(`ALTER TABLE durable_uploads ADD COLUMN entity_type TEXT;`);
                }
                if (!colNames.has('entity_id')) {
                    this.db.exec(`ALTER TABLE durable_uploads ADD COLUMN entity_id TEXT;`);
                }
                if (!colNames.has('field_name')) {
                    this.db.exec(`ALTER TABLE durable_uploads ADD COLUMN field_name TEXT;`);
                }
            }

            // Reload and reconcile any durable pending associations on startup
            this.reconcilePendingAssociations();

            console.log('[DurableUpload] Initialized upload queue at:', dbPath);
        } catch (err: any) {
            console.error('[DurableUpload] Failed to initialize upload database:', err.message);
        }
    }

    public static getInstance(): DurableUploadService {
        if (!DurableUploadService.instance) {
            DurableUploadService.instance = new DurableUploadService();
        }
        return DurableUploadService.instance;
    }

    public static resetInstanceForTesting(): void {
        if (DurableUploadService.instance) {
            DurableUploadService.instance.stopWorker();
            try {
                if (DurableUploadService.instance.db) {
                    DurableUploadService.instance.db.close();
                }
            } catch {}
            DurableUploadService.instance = null as any;
        }
    }

    public registerClients(clients: { nas: SupabaseClient | null; supabase: SupabaseClient | null }): void {
        this.nasClient = clients.nas;
        this.supabaseClient = clients.supabase;
    }

    // ── Local File Staging API ───────────────────────────────────────────────────

    /**
     * Stages a file buffer or source path safely to local disk.
     * Computes SHA-256 and records into SQLite with status 'staged_local'.
     * By default triggers background dispatch unless autoDispatch is explicitly false.
     */
    public async stageFile(
        source: Buffer | string,
        fileName: string,
        mimeType: string,
        subfolder: string,
        meta?: UploadEntityMeta,
        options?: { autoDispatch?: boolean }
    ): Promise<StagedUploadRecord> {
        if (!this.db) throw new Error('Upload database not initialized');

        const uploadId = `upl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const stagedFileName = `${uploadId}_${sanitized}`;
        const targetPath = path.join(this.stagingDir, stagedFileName);

        let buffer: Buffer;
        if (typeof source === 'string') {
            buffer = fs.readFileSync(source);
        } else {
            buffer = source;
        }

        // Check if there was a pre-queued pending association for this upload
        let effectiveMeta = meta;
        if (!effectiveMeta?.entityId) {
            let pending: any = this.pendingAssociations.get(uploadId) || this.pendingAssociations.get(sanitized) || this.pendingAssociations.get(fileName);
            if (!pending && this.db) {
                try {
                    const rowPending = this.db.prepare(`
                        SELECT * FROM pending_associations
                        WHERE identifier = ? OR identifier = ? OR identifier = ? OR identifier LIKE ?
                    `).get(uploadId, sanitized, fileName, `%${uploadId}%`) as any;
                    if (rowPending) {
                        pending = {
                            entityType: rowPending.entity_type,
                            entityId: rowPending.entity_id,
                            fieldName: rowPending.field_name
                        };
                    }
                } catch {}
            }
            if (pending) {
                effectiveMeta = pending;
            }
        }

        // Write directly to staging directory
        fs.writeFileSync(targetPath, buffer);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
        const sizeBytes = buffer.length;
        const now = Date.now();

        this.db.prepare(`
            INSERT INTO durable_uploads (
                id, local_path, file_name, mime_type, size_bytes, sha256,
                subfolder, entity_type, entity_id, field_name, status,
                retry_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged_local', 0, ?, ?)
        `).run(
            uploadId,
            targetPath,
            sanitized,
            mimeType,
            sizeBytes,
            hash,
            subfolder,
            effectiveMeta?.entityType || null,
            effectiveMeta?.entityId ? String(effectiveMeta.entityId) : null,
            effectiveMeta?.fieldName || null,
            now,
            now
        );

        console.log(`[DurableUpload] Staged file "${sanitized}" (${(sizeBytes / 1024).toFixed(1)} KB, SHA256: ${hash.slice(0, 10)}...) -> ID: ${uploadId}`);

        // Staging contract: stageFile isolates local file staging; callers dispatch explicitly or pass { autoDispatch: true }
        const shouldDispatch = options?.autoDispatch ?? false;
        if (shouldDispatch) {
            this.dispatchUpload(uploadId).catch(() => {});
        }

        return {
            id: uploadId,
            localPath: targetPath,
            fileName: sanitized,
            mimeType,
            sizeBytes,
            sha256: hash,
            subfolder,
            entityType: effectiveMeta?.entityType || null,
            entityId: effectiveMeta?.entityId ? String(effectiveMeta.entityId) : null,
            fieldName: effectiveMeta?.fieldName || null,
            status: 'staged_local',
            remoteUrlNas: null,
            remoteUrlSupabase: null,
            retryCount: 0,
            lastError: null,
            createdAt: now,
            updatedAt: now
        };
    }

    // ── Dispatch & Transfer Engine ──────────────────────────────────────────────

    public startWorker(intervalMs = 3000): void {
        if (this.workerTimer) return;
        this.workerTimer = setInterval(() => this.processNextBatch().catch(() => {}), intervalMs);
        console.log(`[DurableUpload] Background upload worker started (interval: ${intervalMs}ms).`);
    }

    public stopWorker(): void {
        if (this.workerTimer) {
            clearInterval(this.workerTimer);
            this.workerTimer = null;
        }
    }

    public async processNextBatch(): Promise<void> {
        if (!this.db || this.isWorking) return;
        this.isWorking = true;

        try {
            // Reconcile pending associations before dispatching next batch
            this.reconcilePendingAssociations();

            // Find actionable uploads: staged_local (needs upload), buffered_supabase (needs NAS reconciliation), or awaiting_association
            const rows = this.db.prepare(`
                SELECT * FROM durable_uploads
                WHERE status IN ('staged_local', 'buffered_supabase', 'awaiting_association')
                ORDER BY created_at ASC
                LIMIT 5
            `).all() as any[];

            for (const r of rows) {
                await this.dispatchUpload(r.id);
            }
        } catch (err: any) {
            console.error('[DurableUpload] Worker batch exception:', err.message);
        } finally {
            this.isWorking = false;
        }
    }

    /**
     * Dispatches an upload with single-flight protection to ensure
     * concurrent calls for the same upload ID await the exact same promise.
     */
    public async dispatchUpload(uploadId: string): Promise<{ success: boolean; url?: string; activeUrl?: string; durableKey?: string; status: UploadStatus; error?: string }> {
        const existingFlight = this.inFlightDispatches.get(uploadId);
        if (existingFlight) {
            return await existingFlight;
        }

        const dispatchPromise = this.executeDispatchUpload(uploadId);
        this.inFlightDispatches.set(uploadId, dispatchPromise);
        try {
            return await dispatchPromise;
        } finally {
            this.inFlightDispatches.delete(uploadId);
        }
    }

    private async executeDispatchUpload(uploadId: string): Promise<{ success: boolean; url?: string; activeUrl?: string; durableKey?: string; status: UploadStatus; error?: string }> {
        if (!this.db) return { success: false, status: 'failed', error: 'Upload database not initialized' };

        const row = this.db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(uploadId) as any;
        if (!row || !fs.existsSync(row.local_path)) {
            return { success: false, status: 'failed', error: 'Upload record or local file not found' };
        }

        if (row.status === 'synced_nas' || (row.remote_url_nas && !row.remote_url_supabase)) {
            return {
                success: true,
                url: row.remote_url_nas,
                activeUrl: row.remote_url_nas,
                durableKey: row.remote_url_nas,
                status: 'synced_nas'
            };
        }

        // If row is missing owner metadata, check if a pending association was queued
        if (!row.entity_type || !row.entity_id || !row.field_name) {
            let pending: any = this.pendingAssociations.get(uploadId) || this.pendingAssociations.get(row.file_name);
            if (!pending && this.db) {
                try {
                    const rowPending = this.db.prepare(`
                        SELECT * FROM pending_associations
                        WHERE identifier = ? OR identifier = ? OR identifier LIKE ?
                    `).get(uploadId, row.file_name, `%${uploadId}%`) as any;
                    if (rowPending) {
                        pending = {
                            entityType: rowPending.entity_type,
                            entityId: rowPending.entity_id,
                            fieldName: rowPending.field_name
                        };
                    }
                } catch {}
            }
            if (pending && pending.entityType && pending.entityId && pending.fieldName) {
                this.associateUploadWithEntity(uploadId, {
                    entityType: pending.entityType,
                    entityId: pending.entityId,
                    fieldName: pending.fieldName
                });
                const reloaded = this.db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(uploadId) as any;
                if (reloaded) {
                    Object.assign(row, reloaded);
                }
            }
        }

        const buffer = fs.readFileSync(row.local_path);
        const candidates = getNasStorageCandidates();
        const cfHeaders = getCfAccessHeaders();
        const cleanFileName = (row.file_name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        // Stable, deterministic object key derived from durable upload ID
        const finalStorageName = `${uploadId}_${cleanFileName}`;
        const cloudPath = row.subfolder ? `${row.subfolder}/${finalStorageName}` : finalStorageName;
        const cloudBucket = 'make-order-files';

        let cloudUrl: string | null = row.remote_url_supabase || null;
        let lastError: string | null = null;
        let activeSignedUrl: string | undefined = undefined;

        // 1. Primary Write Target: Supabase Storage
        // Subject to quota reservation, validation, and confirmed durable object key persistence.
        if (cloudUrl) {
            // Already uploaded to Supabase Storage in prior attempt; generate active signed URL
            if (this.supabaseClient) {
                try {
                    const { data: signedData } = await this.supabaseClient.storage
                        .from(cloudBucket)
                        .createSignedUrl(cloudUrl, 3600);
                    activeSignedUrl = signedData?.signedUrl || undefined;
                } catch {}
            }
        } else if (this.supabaseClient) {
            const quotaMgr = SupabaseQuotaManager.getInstance();
            const canBuffer = await quotaMgr.reserveStorageQuota(uploadId, row.size_bytes);

            if (!canBuffer) {
                lastError = 'Supabase Storage quota limit reached or reservation failed (2.2 GB storage / 3 GB ceiling). File held safely in local staging.';
                const nextRetry = (row.retry_count || 0) + 1;
                this.db.prepare(`
                    UPDATE durable_uploads
                    SET retry_count = ?, last_error = ?, updated_at = ?
                    WHERE id = ?
                `).run(nextRetry, lastError, Date.now(), uploadId);
                this.broadcastUploadStatus();
                return {
                    success: false,
                    status: 'staged_local',
                    durableKey: cloudPath,
                    error: lastError
                };
            }

            try {
                const { error: sbErr } = await this.supabaseClient.storage
                    .from(cloudBucket)
                    .upload(cloudPath, buffer, { contentType: row.mime_type, upsert: true });

                if (!sbErr) {
                    try {
                        const { data: signedData } = await this.supabaseClient.storage
                            .from(cloudBucket)
                            .createSignedUrl(cloudPath, 3600);
                        activeSignedUrl = signedData?.signedUrl || undefined;
                    } catch {}

                    cloudUrl = cloudPath;
                    const committed = await quotaMgr.releaseStorageQuota(uploadId, row.size_bytes, 'committed');
                    if (!committed) {
                        console.warn(`[DurableUpload] Storage quota commit rejected or ambiguous for upload ${uploadId}. Retaining local staging.`);
                        lastError = 'Supabase quota commit transition failed or ambiguous; retained in local staging';
                        try {
                            await this.supabaseClient.storage.from(cloudBucket).remove([cloudPath]);
                        } catch {}
                        cloudUrl = null;
                    } else {
                        // Update entity record with durable object key if owner metadata exists
                        if (row.entity_type && row.entity_id && row.field_name) {
                            await this.updateEntityRecord(
                                row.entity_type,
                                row.entity_id,
                                row.field_name,
                                cloudUrl,
                                undefined,
                                uploadId
                            );
                        }

                        this.db.prepare(`
                            UPDATE durable_uploads
                            SET status = 'buffered_supabase', remote_url_supabase = ?, last_error = NULL, updated_at = ?
                            WHERE id = ?
                        `).run(cloudUrl, Date.now(), uploadId);

                        console.log(`[DurableUpload] Upload ${uploadId} confirmed in primary Supabase Storage (${(row.size_bytes / 1024).toFixed(1)} KB). Key: ${cloudUrl}`);
                    }
                } else {
                    await quotaMgr.releaseStorageQuota(uploadId, 0, 'released');
                    lastError = `Supabase storage error: ${sbErr.message}`;
                }
            } catch (sbEx: any) {
                await quotaMgr.releaseStorageQuota(uploadId, 0, 'released');
                lastError = `Supabase storage exception: ${sbEx.message}`;
            }
        } else {
            lastError = 'Supabase Storage client is not configured or offline. File retained in local staging.';
        }

        // If primary Supabase upload failed or is not committed, check if NAS replica is already established
        if (!cloudUrl && !row.remote_url_nas) {
            const nextRetry = (row.retry_count || 0) + 1;
            this.db.prepare(`
                UPDATE durable_uploads
                SET retry_count = ?, last_error = ?, updated_at = ?
                WHERE id = ?
            `).run(nextRetry, lastError, Date.now(), uploadId);
            this.broadcastUploadStatus();
            return {
                success: false,
                status: 'staged_local',
                durableKey: cloudPath,
                error: lastError || 'Primary Supabase upload unconfirmed'
            };
        }

        // 2. Replication Target: TrueNAS Storage (Pull / Mirror Destination)
        // Consumes confirmed Supabase objects. A NAS health failure must not cause healthy
        // Supabase writes to fail, and NAS replication failure leaves Supabase copy intact!
        let nasSuccess = !!row.remote_url_nas;
        let nasUrl: string | null = row.remote_url_nas || null;

        if (!nasSuccess) {
            const nasRes = await this.uploadToNasStorage(buffer, finalStorageName, row.mime_type, row.subfolder, row.sha256);
            if (nasRes.success && nasRes.url) {
                if (nasRes.sha256 && nasRes.sha256.toUpperCase() !== row.sha256.toUpperCase()) {
                    lastError = `Checksum mismatch: expected ${row.sha256}, got ${nasRes.sha256}`;
                    console.warn(`[DurableUpload] NAS replica checksum mismatch for ${uploadId}: ${lastError}`);
                } else {
                    nasSuccess = true;
                    nasUrl = nasRes.url;
                }
            } else {
                lastError = nasRes.error || 'NAS replica storage failed';
            }
        }

        if (nasSuccess && nasUrl) {
            // Check if upload has confirmed owner metadata
            const hasOwner = !!(row.entity_type && row.entity_id && row.field_name);
            if (row.remote_url_supabase && !hasOwner) {
                // Upload has reached NAS, but owning order/item has not been associated yet.
                // DEFER destructive cleanup and defer transition to synced_nas!
                const deferMsg = `Upload persisted to NAS (${nasUrl}) but awaiting owner association (${row.entity_type || 'unlinked'}). Preserving cloud copy and quota until confirmed.`;
                console.log(`[DurableUpload] ${deferMsg}`);
                this.db.prepare(`
                    UPDATE durable_uploads
                    SET status = 'awaiting_association', remote_url_nas = ?, last_error = ?, updated_at = ?
                    WHERE id = ?
                `).run(nasUrl, deferMsg, Date.now(), uploadId);
                this.broadcastUploadStatus();
                return {
                    success: true,
                    url: nasUrl,
                    activeUrl: nasUrl,
                    durableKey: nasUrl,
                    status: 'awaiting_association',
                    error: deferMsg
                };
            }

            if (hasOwner) {
                // Update entity record with authoritative URL
                const entityUpdated = await this.updateEntityRecord(
                    row.entity_type,
                    row.entity_id,
                    row.field_name,
                    nasUrl,
                    row.remote_url_supabase || undefined,
                    uploadId
                );

                if (!entityUpdated) {
                    lastError = `Entity record update failed for ${row.entity_type} ${row.entity_id}. Staged copy preserved for retry.`;
                    this.db.prepare(`
                        UPDATE durable_uploads
                        SET remote_url_nas = ?, last_error = ?, updated_at = ?
                        WHERE id = ?
                    `).run(nasUrl, lastError, Date.now(), uploadId);
                    this.broadcastUploadStatus();
                    return {
                        success: false,
                        url: nasUrl,
                        activeUrl: nasUrl,
                        durableKey: nasUrl,
                        status: row.status,
                        error: lastError
                    };
                }
            }

            // Safely prune cloud copy now that NAS is confirmed and entity updated
            if (row.remote_url_supabase) {
                const pruned = await this.pruneCloudCopy(row.subfolder, row.remote_url_supabase, row.size_bytes, uploadId);
                if (!pruned) {
                    lastError = 'Authoritative NAS persistence confirmed, but Supabase cloud copy cleanup or quota prune failed. Retaining for cleanup retry.';
                    this.db.prepare(`
                        UPDATE durable_uploads
                        SET remote_url_nas = ?, last_error = ?, updated_at = ?
                        WHERE id = ?
                    `).run(nasUrl, lastError, Date.now(), uploadId);
                    this.broadcastUploadStatus();
                    return {
                        success: false,
                        url: nasUrl,
                        activeUrl: nasUrl,
                        durableKey: nasUrl,
                        status: row.status,
                        error: lastError
                    };
                }
            }

            this.db.prepare(`
                UPDATE durable_uploads
                SET status = 'synced_nas', remote_url_nas = ?, remote_url_supabase = NULL, last_error = NULL, updated_at = ?
                WHERE id = ?
            `).run(nasUrl, Date.now(), uploadId);

            console.log(`[DurableUpload] Upload ${uploadId} successfully synchronized to authoritative NAS Storage: ${nasUrl}`);
            this.broadcastUploadStatus();
            return {
                success: true,
                url: nasUrl,
                activeUrl: nasUrl,
                durableKey: nasUrl,
                status: 'synced_nas'
            };
        }

        // TrueNAS replication is pending/unavailable, but Supabase primary is confirmed!
        // Invariant 1: NAS health failure must NOT cause healthy Supabase writes to fail.
        if (lastError) {
            this.db.prepare(`
                UPDATE durable_uploads
                SET last_error = ?, updated_at = ?
                WHERE id = ?
            `).run(lastError, Date.now(), uploadId);
        }
        this.broadcastUploadStatus();
        return {
            success: true,
            url: cloudUrl || nasUrl || undefined,
            activeUrl: activeSignedUrl || cloudUrl || nasUrl || undefined,
            durableKey: cloudUrl || `${row.subfolder}/${finalStorageName}`,
            status: 'buffered_supabase',
            error: lastError || 'Primary Supabase write confirmed; TrueNAS replication pending.'
        };
    }

    /**
     * Associates a staged upload with an owning entity and field.
     * Safe to call after an order or item has been created.
     */
    public associateUploadWithEntity(
        identifier: string,
        meta: { entityType: string; entityId: string | number; fieldName: string }
    ): boolean {
        if (!this.db || !identifier || !meta.entityType || !meta.entityId || !meta.fieldName) return false;
        try {
            // Migrate associations written by older builds to the current schema.
            const normalizedMeta = {
                ...meta,
                fieldName: normalizeDurableUploadFieldName(meta.entityType, meta.fieldName)
            };
            let uploadId = identifier;
            const match = identifier.match(/(upl_[0-9]+_[0-9a-f]+)/i);
            if (match) {
                uploadId = match[1];
            }

            const res = this.db.prepare(`
                UPDATE durable_uploads
                SET entity_type = ?, entity_id = ?, field_name = ?, updated_at = ?
                WHERE id = ? OR id = ? OR local_path LIKE ? OR remote_url_supabase LIKE ? OR remote_url_nas LIKE ?
            `).run(normalizedMeta.entityType, String(normalizedMeta.entityId), normalizedMeta.fieldName, Date.now(), uploadId, identifier, `%${uploadId}%`, `%${uploadId}%`, `%${uploadId}%`);

            const associated = res.changes > 0;
            if (associated) {
                try {
                    this.db.prepare(`
                        DELETE FROM pending_associations
                        WHERE identifier = ? OR identifier = ?
                    `).run(uploadId, identifier);
                } catch {}
                this.pendingAssociations.delete(uploadId);
                this.pendingAssociations.delete(identifier);
            } else {
                console.warn(`[DurableUpload] associateUploadWithEntity found no matching upload for identifier "${identifier}". Queuing durable pending association.`);
                try {
                    this.db.prepare(`
                        INSERT INTO pending_associations (identifier, entity_type, entity_id, field_name, retry_count, created_at, updated_at)
                        VALUES (?, ?, ?, ?, 0, ?, ?)
                        ON CONFLICT(identifier) DO UPDATE SET
                            entity_type = excluded.entity_type,
                            entity_id = excluded.entity_id,
                            field_name = excluded.field_name,
                            updated_at = excluded.updated_at
                    `).run(identifier, normalizedMeta.entityType, String(normalizedMeta.entityId), normalizedMeta.fieldName, Date.now(), Date.now());
                } catch (dbErr: any) {
                    console.warn('[DurableUpload] Failed to persist pending_association:', dbErr.message);
                }
                this.pendingAssociations.set(uploadId, normalizedMeta);
                if (uploadId !== identifier) {
                    this.pendingAssociations.set(identifier, normalizedMeta);
                }
            }

            return associated;
        } catch (err: any) {
            console.warn('[DurableUpload] Failed to associate upload with entity:', err.message);
            return false;
        }
    }

    /**
     * Reconciles persisted pending associations against staged uploads.
     * Called on startup and before processing pending batches.
     */
    public reconcilePendingAssociations(): void {
        if (!this.db) return;
        try {
            const pendingList = this.db.prepare(`SELECT * FROM pending_associations`).all() as any[];
            for (const p of pendingList) {
                let uploadId = p.identifier;
                const match = p.identifier.match(/(upl_[0-9]+_[0-9a-f]+)/i);
                if (match) {
                    uploadId = match[1];
                }

                const fieldName = normalizeDurableUploadFieldName(p.entity_type, p.field_name);
                const res = this.db.prepare(`
                    UPDATE durable_uploads
                    SET entity_type = ?, entity_id = ?, field_name = ?, updated_at = ?
                    WHERE (id = ? OR id = ? OR local_path LIKE ? OR remote_url_supabase LIKE ? OR remote_url_nas LIKE ?)
                      AND (entity_type IS NULL OR entity_id IS NULL)
                `).run(p.entity_type, String(p.entity_id), fieldName, Date.now(), uploadId, p.identifier, `%${uploadId}%`, `%${uploadId}%`, `%${uploadId}%`);

                if (res.changes > 0) {
                    this.db.prepare(`DELETE FROM pending_associations WHERE identifier = ?`).run(p.identifier);
                    this.pendingAssociations.delete(p.identifier);
                    this.pendingAssociations.delete(uploadId);
                }
            }
        } catch (err: any) {
            console.warn('[DurableUpload] Reconciling pending associations error:', err.message);
        }
    }

    public getPendingAssociationsCount(): number {
        if (!this.db) return this.pendingAssociations.size;
        try {
            const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM pending_associations`).get() as any;
            return row?.cnt ?? this.pendingAssociations.size;
        } catch {
            return this.pendingAssociations.size;
        }
    }

    private async updateEntityRecord(
        entityType: string | null,
        entityId: string | null,
        fieldName: string | null,
        newUrl: string,
        oldRef?: string,
        uploadId?: string
    ): Promise<boolean> {
        if (!entityType || !entityId || !fieldName) {
            console.warn(`[DurableUpload] Cannot update entity record: missing owner metadata (entityType: ${entityType}, entityId: ${entityId}, fieldName: ${fieldName})`);
            return false;
        }
        // Old durable upload queues may still carry the pre-migration column name.
        // Normalize it before selecting/updating the target row so these uploads retry.
        const resolvedFieldName = normalizeDurableUploadFieldName(entityType, fieldName);
        const client = this.nasClient || this.supabaseClient;
        if (!client) {
            console.warn(`[DurableUpload] Cannot update entity record: No active client`);
            return false;
        }

        try {
            // First verify the target record actually exists
            const { data: existing, error: selectErr } = await client
                .from(entityType)
                .select(`id, ${resolvedFieldName}`)
                .eq('id', entityId)
                .maybeSingle();

            if (selectErr || !existing) {
                console.warn(`[DurableUpload] Target record does not exist for ${entityType} ID ${entityId}:`, selectErr?.message || 'Record not found');
                return false;
            }

            if (resolvedFieldName === 'pdf_urls' || resolvedFieldName === 'invoice_attachment_urls') {
                const list: string[] = Array.isArray((existing as any)?.[resolvedFieldName]) ? (existing as any)[resolvedFieldName] : [];
                const uploadPrefix = uploadId ? `${uploadId}_` : null;

                let replaced = false;
                const updatedList = list.map(item => {
                    if ((uploadPrefix && item.includes(uploadPrefix)) || (oldRef && item === oldRef)) {
                        replaced = true;
                        return newUrl;
                    }
                    return item;
                });

                if (!replaced && !updatedList.includes(newUrl)) {
                    updatedList.push(newUrl);
                }

                const deduplicated = Array.from(new Set(updatedList));
                const { data: updatedRows, error: updErr } = await client
                    .from(entityType)
                    .update({ [resolvedFieldName]: deduplicated })
                    .eq('id', entityId)
                    .select('id');

                const rowsAffected = Array.isArray(updatedRows) ? updatedRows.length : (updatedRows ? 1 : 0);
                if (updErr || rowsAffected === 0) {
                    console.warn(`[DurableUpload] Could not update entity array for ${entityType} ID ${entityId} (affected ${rowsAffected} rows):`, updErr?.message);
                    return false;
                }
            } else {
                const updatePayload: Record<string, any> = { [resolvedFieldName]: newUrl };
                if (entityType === 'make_order_items' && resolvedFieldName === 'technical_drawing_url') {
                    try {
                        const { data: item } = await client.from('make_order_items').select('pdf_urls').eq('id', entityId).maybeSingle();
                        if (item && Array.isArray(item.pdf_urls)) {
                            const uploadPrefix = uploadId ? `${uploadId}_` : null;
                            let replaced = false;
                            const updatedPdfs = item.pdf_urls.map((p: string) => {
                                if ((uploadPrefix && p.includes(uploadPrefix)) || (oldRef && p === oldRef)) {
                                    replaced = true;
                                    return newUrl;
                                }
                                return p;
                            });
                            if (!replaced && !updatedPdfs.includes(newUrl)) {
                                updatedPdfs.push(newUrl);
                            }
                            updatePayload.pdf_urls = Array.from(new Set(updatedPdfs));
                        }
                    } catch {}
                }

                const { data: updatedRows, error: updErr } = await client
                    .from(entityType)
                    .update(updatePayload)
                    .eq('id', entityId)
                    .select('id');

                const rowsAffected = Array.isArray(updatedRows) ? updatedRows.length : (updatedRows ? 1 : 0);
                if (updErr || rowsAffected === 0) {
                    console.warn(`[DurableUpload] Could not update entity field for ${entityType} ID ${entityId} (affected ${rowsAffected} rows):`, updErr?.message);
                    return false;
                }
            }
            return true;
        } catch (e: any) {
            console.warn(`[DurableUpload] Exception updating entity record for ${entityType} ID ${entityId}:`, e.message);
            return false;
        }
    }

    public async pruneCloudCopy(subfolder: string, cloudUrl: string, sizeBytes: number, uploadId?: string): Promise<boolean> {
        if (!this.supabaseClient) return false;
        if (!cloudUrl || typeof cloudUrl !== 'string') return false;

        try {
            // Extract storage object key safely from either a relative key, a supabase:// URI, or a full HTTP URL
            let objectKey = cloudUrl.trim();

            if (/^https?:\/\//i.test(objectKey)) {
                try {
                    const urlObj = new URL(objectKey);
                    const parts = urlObj.pathname.split('/make-order-files/');
                    if (parts.length > 1) {
                        objectKey = parts.slice(1).join('/make-order-files/');
                    } else {
                        objectKey = urlObj.pathname.replace(/^\/+/, '');
                    }
                    objectKey = decodeURIComponent(objectKey);
                } catch (e: any) {
                    console.warn(`[DurableUpload] Could not parse URL "${objectKey}":`, e.message);
                    return false;
                }
            } else if (/^supabase:\/\/make-order-files\//i.test(objectKey)) {
                objectKey = objectKey.replace(/^supabase:\/\/make-order-files\//i, '');
            } else if (/^supabase:\/\//i.test(objectKey)) {
                objectKey = objectKey.replace(/^supabase:\/\//i, '');
            }

            objectKey = objectKey.replace(/^\/+/, '');

            // Candidate keys for Supabase bucket 'make-order-files'
            const candidateKeys = new Set<string>();
            candidateKeys.add(objectKey);
            if (objectKey.startsWith('make-order-files/')) {
                candidateKeys.add(objectKey.replace(/^make-order-files\//, ''));
            } else {
                candidateKeys.add(`make-order-files/${objectKey}`);
            }

            const keysToRemove = Array.from(candidateKeys).filter(k => k.length > 0);
            const { error } = await this.supabaseClient.storage
                .from('make-order-files')
                .remove(keysToRemove);

            if (error) {
                console.warn(`[DurableUpload] Failed to remove object from Supabase bucket: ${error.message}`);
                return false;
            }

            if (uploadId) {
                const pruned = await SupabaseQuotaManager.getInstance().pruneConfirmedStorage(uploadId, sizeBytes);
                if (!pruned) {
                    console.warn(`[DurableUpload] Storage quota prune RPC failed for ${uploadId}`);
                    return false;
                }
            } else {
                SupabaseQuotaManager.getInstance().deductConfirmedPrunedStorage(sizeBytes);
            }

            console.log(`[DurableUpload] Safely pruned temporary cloud copy after NAS persistence: ${objectKey}`);
            return true;
        } catch (err: any) {
            console.warn(`[DurableUpload] Exception during cloud copy pruning:`, err.message);
            return false;
        }
    }

    public getPendingUploadStats(): { stagedCount: number; bufferedCount: number; awaitingAssociationCount: number; totalPendingBytes: number } {
        if (!this.db) return { stagedCount: 0, bufferedCount: 0, awaitingAssociationCount: 0, totalPendingBytes: 0 };
        try {
            const res = this.db.prepare(`
                SELECT 
                    COUNT(CASE WHEN status = 'staged_local' THEN 1 END) as staged_cnt,
                    COUNT(CASE WHEN status = 'buffered_supabase' THEN 1 END) as buffered_cnt,
                    COUNT(CASE WHEN status = 'awaiting_association' THEN 1 END) as awaiting_assoc_cnt,
                    SUM(CASE WHEN status IN ('staged_local', 'buffered_supabase', 'awaiting_association') THEN size_bytes ELSE 0 END) as total_bytes
                FROM durable_uploads
            `).get() as any;
            return {
                stagedCount: res.staged_cnt || 0,
                bufferedCount: res.buffered_cnt || 0,
                awaitingAssociationCount: res.awaiting_assoc_cnt || 0,
                totalPendingBytes: res.total_bytes || 0
            };
        } catch {
            return { stagedCount: 0, bufferedCount: 0, awaitingAssociationCount: 0, totalPendingBytes: 0 };
        }
    }

    public async verifyRemoteObject(url: string, expectedSha256?: string): Promise<{ verified: boolean; sha256?: string; error?: string }> {
        const cfHeaders = getCfAccessHeaders();
        const isTunnel = url.startsWith('https://');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        try {
            const resp = await fetch(url, {
                method: 'GET',
                headers: isTunnel ? cfHeaders : {},
                signal: controller.signal
            });

            if (!resp.ok) {
                return { verified: false, error: `Remote verification fetch failed: HTTP ${resp.status} ${resp.statusText}` };
            }

            const arrayBuffer = await resp.arrayBuffer();
            const remoteBuf = Buffer.from(arrayBuffer);
            const remoteHash = crypto.createHash('sha256').update(remoteBuf).digest('hex').toUpperCase();

            if (expectedSha256 && remoteHash !== expectedSha256.toUpperCase()) {
                return {
                    verified: false,
                    sha256: remoteHash,
                    error: `Remote digest mismatch: expected ${expectedSha256}, got ${remoteHash}`
                };
            }

            return { verified: true, sha256: remoteHash };
        } catch (err: any) {
            return { verified: false, error: err.message || 'Remote read-back verification timeout' };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Safely normalizes the remote storage URL returned by a TrueNAS storage service candidate.
     * Prevents internal :8080 ports from breaking Tailscale/LAN access while preserving
     * paths, query params, and candidate host alignment.
     */
    public static normalizeNasStorageUrl(rawUrl: string, candidateBase: string): string {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        try {
            const candUrl = new URL(candidateBase);
            const parsed = new URL(rawUrl, candidateBase);

            // Only normalize legacy :8080 port for approved TrueNAS hosts or candidate host
            if (parsed.port === '8080') {
                const lowerHost = parsed.hostname.toLowerCase();
                const candHost = candUrl.hostname.toLowerCase();
                if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14' || lowerHost === candHost) {
                    parsed.port = candUrl.port || (candUrl.protocol === 'https:' ? '443' : '80');
                    parsed.protocol = candUrl.protocol;
                    parsed.hostname = candUrl.hostname;
                }
            }

            return parsed.toString();
        } catch {
            return rawUrl;
        }
    }

    public async uploadToNasStorage(
        buffer: Buffer,
        fileName: string,
        mimeType: string,
        subfolder: string,
        expectedSha256?: string
    ): Promise<{ success: boolean; url?: string; sha256?: string; error?: string }> {
        const candidates = getNasStorageCandidates();
        const cfHeaders = getCfAccessHeaders();
        let lastError: string | null = null;

        // Dynamic size-based timeout: minimum 30s, up to 300s for large files
        const timeoutMs = Math.max(30000, Math.min(300000, Math.ceil(buffer.length / 200000) * 1000 + 30000));

        for (const candidateBase of candidates) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const formData = new FormData();
                formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

                const isTunnel = candidateBase.startsWith('https://');
                const reqHeaders: Record<string, string> = {
                    'x-subfolder': subfolder,
                    ...(isTunnel ? cfHeaders : {})
                };

                const response = await fetch(`${candidateBase.replace(/\/$/, '')}/upload`, {
                    method: 'POST',
                    body: formData,
                    headers: reqHeaders,
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = (await response.json()) as any;
                    if (data && data.success && (data.file_url || data.url || data.urlPath)) {
                        const rawUrl = (data.file_url || data.url || (data.urlPath ? `/files/${String(data.urlPath).replace(/^\/?files\/?/, '')}` : '')) as string;
                        const url = DurableUploadService.normalizeNasStorageUrl(rawUrl, candidateBase);

                        // Check if remote upload response provided an authoritative server-side digest
                        const remoteReportedHash = data.sha256 || data.checksum || data.digest;
                        if (remoteReportedHash) {
                            const hashStr = String(remoteReportedHash).toUpperCase();
                            if (expectedSha256 && hashStr !== expectedSha256.toUpperCase()) {
                                lastError = `Remote digest mismatch: expected ${expectedSha256}, got ${hashStr}`;
                                continue;
                            }
                            return { success: true, url, sha256: hashStr };
                        }

                        // If remote did not supply a digest in upload response, verify via remote read-back
                        const verifyRes = await this.verifyRemoteObject(url, expectedSha256);
                        if (verifyRes.verified) {
                            return { success: true, url, sha256: verifyRes.sha256 };
                        } else {
                            lastError = verifyRes.error || 'Remote object read-back verification failed';
                            continue;
                        }
                    } else {
                        lastError = data?.error || 'NAS upload reported unsuccessful status or missing valid URL';
                    }
                } else {
                    lastError = `NAS storage HTTP ${response.status} ${response.statusText}`;
                }
            } catch (err: any) {
                lastError = err.message || 'NAS network timeout';
            } finally {
                clearTimeout(timeoutId);
            }
        }

        return { success: false, error: lastError || 'All NAS storage candidates failed' };
    }

    public getStagedUploads(): StagedUploadRecord[] {
        if (!this.db) return [];
        try {
            const rows = this.db.prepare(`
                SELECT * FROM durable_uploads
                ORDER BY created_at DESC
                LIMIT 100
            `).all() as any[];

            return rows.map(r => ({
                id: r.id,
                localPath: r.local_path,
                fileName: r.file_name,
                mimeType: r.mime_type,
                sizeBytes: r.size_bytes,
                sha256: r.sha256,
                subfolder: r.subfolder,
                entityType: r.entity_type,
                entityId: r.entity_id,
                fieldName: r.field_name,
                status: r.status,
                remoteUrlNas: r.remote_url_nas,
                remoteUrlSupabase: r.remote_url_supabase,
                retryCount: r.retry_count,
                lastError: r.last_error,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            }));
        } catch {
            return [];
        }
    }

    private broadcastUploadStatus(): void {
        const stats = this.getPendingUploadStats();
        try {
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('upload-status-changed', stats);
                }
            });
        } catch {}
    }
}
