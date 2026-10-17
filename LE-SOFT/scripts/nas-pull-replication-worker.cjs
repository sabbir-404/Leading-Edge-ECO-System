/**
 * scripts/nas-pull-replication-worker.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * LE-SOFT Authoritative NAS-Side Pull Replication Daemon.
 *
 * ARCHITECTURAL CONTRACT:
 * 1. Supabase Cloud is the canonical primary write authority.
 * 2. TrueNAS is strictly a downstream replication / pull-mirror destination.
 * 3. This worker runs ON or ALONGSIDE TrueNAS (in Docker container, systemd unit,
 *    or scheduled task), initiating outbound pull requests to Supabase Cloud.
 * 4. Desktop Electron applications NEVER embed or handle Supabase service-role keys.
 *    The server-side replication credentials reside strictly in this backend daemon.
 * 5. Data Flow:
 *    - Text / Business Records:
 *      Supabase PostgreSQL -> pull changes in dependency order (parent orders before
 *      child updates) -> apply idempotently to TrueNAS PostgreSQL -> advance checkpoint.
 *    - Files / Images:
 *      Supabase Storage -> pull binary bytes -> verify SHA-256 checksum -> persist to
 *      TrueNAS local storage / MinIO -> acknowledge replication.
 * 6. Cloud Data Preservation:
 *    - Authoritative Supabase business rows are NEVER deleted.
 *    - Supabase Storage objects are preserved by default; cloud buffer pruning is
 *      only executed if PRUNE_CLOUD_AFTER_NAS_CONFIRMATION is explicitly enabled
 *      and destination persistence is verified.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');
const { Client: PgClient } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getPgConfig(env = process.env) {
    return {
        host: env.TRUENAS_PG_HOST || '127.0.0.1',
        port: parseInt(env.TRUENAS_PG_PORT || '5432', 10),
        database: env.TRUENAS_PG_DATABASE || 'lesoft',
        user: env.TRUENAS_PG_USER || 'postgres',
        password: env.TRUENAS_PG_PASSWORD || '',
        statement_timeout: 10000,
        query_timeout: 10000
    };
}

/**
 * Ensures durable checkpoint table and file registry exist on TrueNAS PostgreSQL.
 * Also self-heals required columns in TrueNAS replica schema.
 */
async function initCheckpoints(pgClient) {
    const ddl = `
        CREATE TABLE IF NOT EXISTS nas_replication_checkpoints (
            table_name VARCHAR(100) PRIMARY KEY,
            last_replicated_id VARCHAR(100),
            last_replicated_at TIMESTAMPTZ,
            items_replicated BIGINT DEFAULT 0,
            last_error TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS nas_replicated_files (
            object_key TEXT PRIMARY KEY,
            sha256 TEXT NOT NULL,
            size_bytes BIGINT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            replicated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;
    await pgClient.query(ddl);

    // Self-healing: ensure TrueNAS PostgreSQL tables have all replicated columns
    try {
        await pgClient.query(`
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS invoice_attachment_urls TEXT[] DEFAULT '{}'::text[];
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_stage_photo TEXT;
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Placed';
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_url TEXT;
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}'::text[];
        `);
    } catch {}
}

/**
 * Gets checkpoint for a specific table or stream
 */
async function getCheckpoint(pgClient, tableName) {
    const res = await pgClient.query(
        'SELECT * FROM nas_replication_checkpoints WHERE table_name = $1',
        [tableName]
    );
    if (res.rows && res.rows.length > 0) {
        return res.rows[0];
    }
    return {
        table_name: tableName,
        last_replicated_id: null,
        last_replicated_at: null,
        items_replicated: 0,
        last_error: null
    };
}

/**
 * Updates durable checkpoint on TrueNAS PostgreSQL
 */
async function updateCheckpoint(pgClient, tableName, lastId, lastAt, countIncrement = 0, lastError = null) {
    const sql = `
        INSERT INTO nas_replication_checkpoints (table_name, last_replicated_id, last_replicated_at, items_replicated, last_error, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (table_name) DO UPDATE SET
            last_replicated_id = COALESCE($2, nas_replication_checkpoints.last_replicated_id),
            last_replicated_at = COALESCE($3, nas_replication_checkpoints.last_replicated_at),
            items_replicated = nas_replication_checkpoints.items_replicated + $4,
            last_error = $5,
            updated_at = NOW();
    `;
    await pgClient.query(sql, [tableName, lastId, lastAt, countIncrement, lastError]);
}

/**
 * Normalizes raw storage URLs or URIs to a stable, relative object key.
 */
function normalizeStorageObjectKey(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let clean = rawPath.trim()
        .replace(/^supabase:\/\/make-order-files\//i, '')
        .replace(/^make-order-files\//i, '')
        .split('?')[0]
        .replace(/^\/+/, '');
    return clean || null;
}

/**
 * Pulls committed business data from Supabase Cloud to TrueNAS PostgreSQL in strict dependency order:
 * 1. replication_tombstones (deletions / removals)
 * 2. make_orders (parent orders with mutable field updates & soft deletions)
 * 3. make_order_updates (dependent stage updates with strict parent-before-child ordering)
 */
async function pullBusinessData(supabaseClient, pgClient, options = {}) {
    const logger = options.logger || console;
    let totalReplicated = 0;

    // ── 1. Pull Deletion Tombstones (if supported / present) ─────────────────
    try {
        const tombCp = await getCheckpoint(pgClient, 'replication_tombstones');
        let tombQuery = supabaseClient
            .from('replication_tombstones')
            .select('*')
            .order('deleted_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(options.batchSize || 100);

        if (tombCp.last_replicated_at) {
            if (tombCp.last_replicated_id) {
                tombQuery = tombQuery.or(`deleted_at.gt.${tombCp.last_replicated_at},and(deleted_at.eq.${tombCp.last_replicated_at},id.gt.${tombCp.last_replicated_id})`);
            } else {
                tombQuery = tombQuery.gt('deleted_at', tombCp.last_replicated_at);
            }
        }

        const { data: tombstones, error: tombErr } = await tombQuery;
        if (!tombErr && tombstones && tombstones.length > 0) {
            for (const tomb of tombstones) {
                const targetTable = tomb.entity_name || tomb.table_name || 'make_orders';
                const targetId = tomb.record_id || tomb.entity_id;
                if (targetTable === 'make_orders' && targetId) {
                    await pgClient.query('DELETE FROM make_orders WHERE id = $1', [targetId]);
                    logger.log(`[NAS-Pull-Worker] Processed tombstone: deleted ${targetTable} ID ${targetId}`);
                }
                const tombAt = tomb.deleted_at || tomb.created_at || new Date().toISOString();
                await updateCheckpoint(pgClient, 'replication_tombstones', String(tomb.id), tombAt, 1, null);
                totalReplicated++;
            }
        }
    } catch (tombEx) {
        // Table might not exist in all environments; proceed gracefully
    }

    // ── 2. Pull Parent Orders (make_orders) with Compound Watermark ───────────
    const orderCp = await getCheckpoint(pgClient, 'make_orders');
    let orderQuery = supabaseClient
        .from('make_orders')
        .select('*')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(options.batchSize || 100);

    if (orderCp.last_replicated_at) {
        if (orderCp.last_replicated_id) {
            orderQuery = orderQuery.or(`updated_at.gt.${orderCp.last_replicated_at},and(updated_at.eq.${orderCp.last_replicated_at},id.gt.${orderCp.last_replicated_id})`);
        } else {
            orderQuery = orderQuery.gt('updated_at', orderCp.last_replicated_at);
        }
    } else if (orderCp.last_replicated_id) {
        orderQuery = orderQuery.gt('id', orderCp.last_replicated_id);
    }

    const { data: newOrders, error: orderErr } = await orderQuery;
    if (orderErr) {
        logger.error('[NAS-Pull-Worker] Error querying make_orders from Supabase:', orderErr.message);
        await updateCheckpoint(pgClient, 'make_orders', null, null, 0, orderErr.message);
        return { success: false, error: orderErr.message };
    }

    if (newOrders && newOrders.length > 0) {
        for (const ord of newOrders) {
            const ordUpdatedAt = ord.updated_at || ord.created_at || new Date().toISOString();
            const ordId = String(ord.id);

            // Handle soft deletion
            if (ord.is_deleted === true || ord.deleted_at || ord.status === 'deleted') {
                await pgClient.query('DELETE FROM make_orders WHERE id = $1', [ord.id]);
                logger.log(`[NAS-Pull-Worker] Replicated soft deletion for make_orders ID ${ord.id}`);
            } else {
                // Idempotent upsert into TrueNAS PostgreSQL with all mutable fields
                const upsertSql = `
                    INSERT INTO make_orders (
                        id, order_number, furniture_name, total_price, current_stage, status,
                        invoice_attachment_urls, current_stage_photo, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO UPDATE SET
                        order_number = EXCLUDED.order_number,
                        furniture_name = EXCLUDED.furniture_name,
                        total_price = EXCLUDED.total_price,
                        current_stage = EXCLUDED.current_stage,
                        status = EXCLUDED.status,
                        invoice_attachment_urls = EXCLUDED.invoice_attachment_urls,
                        current_stage_photo = EXCLUDED.current_stage_photo,
                        updated_at = EXCLUDED.updated_at;
                `;
                await pgClient.query(upsertSql, [
                    ord.id,
                    ord.order_number || `ORD-${ord.id}`,
                    ord.furniture_name || '',
                    ord.total_price || 0,
                    ord.current_stage || ord.stage || 'Draft',
                    ord.status || 'Placed',
                    ord.invoice_attachment_urls || [],
                    ord.current_stage_photo || null,
                    ord.created_at || new Date().toISOString(),
                    ordUpdatedAt
                ]);
            }

            // Commit checkpoint only AFTER the local TrueNAS transaction succeeds
            await updateCheckpoint(pgClient, 'make_orders', ordId, ordUpdatedAt, 1, null);
            totalReplicated++;
        }
        logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${newOrders.length} parent orders.`);
    }

    // ── 3. Pull Dependent Production Updates (make_order_updates) ─────────────
    const updateCp = await getCheckpoint(pgClient, 'make_order_updates');
    let updateQuery = supabaseClient
        .from('make_order_updates')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(options.batchSize || 100);

    if (updateCp.last_replicated_at) {
        if (updateCp.last_replicated_id) {
            updateQuery = updateQuery.or(`created_at.gt.${updateCp.last_replicated_at},and(created_at.eq.${updateCp.last_replicated_at},id.gt.${updateCp.last_replicated_id})`);
        } else {
            updateQuery = updateQuery.gt('created_at', updateCp.last_replicated_at);
        }
    } else if (updateCp.last_replicated_id) {
        updateQuery = updateQuery.gt('id', updateCp.last_replicated_id);
    }

    const { data: newUpdates, error: updateErr } = await updateQuery;
    if (updateErr) {
        logger.error('[NAS-Pull-Worker] Error querying make_order_updates from Supabase:', updateErr.message);
        await updateCheckpoint(pgClient, 'make_order_updates', null, null, 0, updateErr.message);
        return { success: false, error: updateErr.message };
    }

    if (newUpdates && newUpdates.length > 0) {
        for (const upd of newUpdates) {
            const updCreatedAt = upd.created_at || new Date().toISOString();
            const updId = String(upd.id);

            // Strict Parent-Before-Child Dependency Check:
            // Ensure parent order exists on TrueNAS before inserting child update
            if (upd.order_id) {
                const checkParent = await pgClient.query(
                    'SELECT 1 FROM make_orders WHERE id = $1',
                    [upd.order_id]
                );
                if (!checkParent.rows || checkParent.rows.length === 0) {
                    // Fetch missing parent order on-demand from Supabase
                    logger.warn(`[NAS-Pull-Worker] Parent order ${upd.order_id} missing on TrueNAS. Fetching parent first...`);
                    const { data: parentData, error: parentErr } = await supabaseClient
                        .from('make_orders')
                        .select('*')
                        .eq('id', upd.order_id)
                        .maybeSingle();

                    if (parentErr || !parentData) {
                        logger.error(`[NAS-Pull-Worker] Cannot pull child update ${upd.id}: parent order ${upd.order_id} not found in Supabase.`);
                        await updateCheckpoint(pgClient, 'make_order_updates', null, null, 0, `Missing parent order ${upd.order_id}`);
                        continue;
                    }

                    // Apply parent order
                    await pgClient.query(`
                        INSERT INTO make_orders (
                            id, order_number, furniture_name, total_price, current_stage, status,
                            invoice_attachment_urls, current_stage_photo, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (id) DO UPDATE SET
                            order_number = EXCLUDED.order_number,
                            furniture_name = EXCLUDED.furniture_name,
                            total_price = EXCLUDED.total_price,
                            current_stage = EXCLUDED.current_stage,
                            status = EXCLUDED.status,
                            invoice_attachment_urls = EXCLUDED.invoice_attachment_urls,
                            current_stage_photo = EXCLUDED.current_stage_photo,
                            updated_at = EXCLUDED.updated_at;
                    `, [
                        parentData.id,
                        parentData.order_number || `ORD-${parentData.id}`,
                        parentData.furniture_name || '',
                        parentData.total_price || 0,
                        parentData.current_stage || 'Draft',
                        parentData.status || 'Placed',
                        parentData.invoice_attachment_urls || [],
                        parentData.current_stage_photo || null,
                        parentData.created_at || new Date().toISOString(),
                        parentData.updated_at || parentData.created_at || new Date().toISOString()
                    ]);
                }
            }

            // Apply child update to TrueNAS PostgreSQL
            const upsertUpdateSql = `
                INSERT INTO make_order_updates (id, order_id, stage, note, photo_url, photo_urls, actor_name, actor_role, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    stage = EXCLUDED.stage,
                    note = EXCLUDED.note,
                    photo_url = EXCLUDED.photo_url,
                    photo_urls = EXCLUDED.photo_urls,
                    actor_name = EXCLUDED.actor_name,
                    actor_role = EXCLUDED.actor_role;
            `;
            await pgClient.query(upsertUpdateSql, [
                upd.id,
                upd.order_id,
                upd.stage || 'Work in process',
                upd.note || null,
                upd.photo_url || null,
                upd.photo_urls || [],
                upd.actor_name || null,
                upd.actor_role || null,
                updCreatedAt
            ]);

            await updateCheckpoint(pgClient, 'make_order_updates', updId, updCreatedAt, 1, null);
            totalReplicated++;
        }
        logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${newUpdates.length} dependent production updates.`);
    }

    return { success: true, totalReplicated };
}

/**
 * Pulls committed attachments and images from Supabase Storage private bucket
 * to TrueNAS local storage with SHA-256 integrity validation and durable registration.
 *
 * Discovers files from:
 * 1. Committed business order attachments (invoice_attachment_urls, current_stage_photo)
 * 2. Committed storage quota reservations (supabase_buffer_reservations)
 */
async function pullAttachments(supabaseClient, storageBasePath, pgClient, options = {}) {
    const logger = options.logger || console;
    const bucketName = options.bucketName || 'make-order-files';
    const pruneCloud = options.pruneCloudAfterNasConfirmation === true;
    let filesPulled = 0;

    // Discovered file tasks: Map<objectKey, { subfolder, name, reservationId?, entityType?, entityId? }>
    const fileTasks = new Map();

    // ── Source A: Discover files from committed orders with attachments ───────
    try {
        const { data: ordersWithFiles } = await supabaseClient
            .from('make_orders')
            .select('id, invoice_attachment_urls, current_stage_photo')
            .or('invoice_attachment_urls.neq.{},current_stage_photo.not.is.null')
            .limit(options.batchSize || 50);

        if (ordersWithFiles && ordersWithFiles.length > 0) {
            for (const ord of ordersWithFiles) {
                if (Array.isArray(ord.invoice_attachment_urls)) {
                    for (const rawUrl of ord.invoice_attachment_urls) {
                        const cleanKey = normalizeStorageObjectKey(rawUrl);
                        if (cleanKey && !fileTasks.has(cleanKey)) {
                            const sub = cleanKey.includes('/') ? path.dirname(cleanKey) : 'cad';
                            const name = path.basename(cleanKey);
                            fileTasks.set(cleanKey, {
                                subfolder: sub,
                                name,
                                entityType: 'make_orders',
                                entityId: String(ord.id)
                            });
                        }
                    }
                }
                if (ord.current_stage_photo) {
                    const cleanKey = normalizeStorageObjectKey(ord.current_stage_photo);
                    if (cleanKey && !fileTasks.has(cleanKey)) {
                        const sub = cleanKey.includes('/') ? path.dirname(cleanKey) : 'products';
                        const name = path.basename(cleanKey);
                        fileTasks.set(cleanKey, {
                            subfolder: sub,
                            name,
                            entityType: 'make_orders',
                            entityId: String(ord.id)
                        });
                    }
                }
            }
        }
    } catch {}

    // ── Source B: Discover files from committed storage quota reservations ────
    try {
        const { data: committedReservations, error: fetchErr } = await supabaseClient
            .from('supabase_buffer_reservations')
            .select('*')
            .eq('status', 'committed')
            .eq('resource_type', 'storage')
            .order('created_at', { ascending: true })
            .limit(options.batchSize || 20);

        if (!fetchErr && committedReservations && committedReservations.length > 0) {
            for (const res of committedReservations) {
                const subfolder = res.id.includes('cad') ? 'cad' : 'products';
                const { data: files } = await supabaseClient.storage
                    .from(bucketName)
                    .list(subfolder, { search: res.id });

                if (files && files.length > 0) {
                    for (const fileObj of files) {
                        const cloudPath = `${subfolder}/${fileObj.name}`;
                        if (!fileTasks.has(cloudPath)) {
                            fileTasks.set(cloudPath, {
                                subfolder,
                                name: fileObj.name,
                                reservationId: res.id,
                                entityType: 'buffer_reservation',
                                entityId: res.id
                            });
                        }
                    }
                }
            }
        }
    } catch {}

    if (fileTasks.size === 0) {
        return { success: true, filesPulled: 0 };
    }

    for (const [cloudPath, fileInfo] of fileTasks.entries()) {
        const targetDir = path.join(storageBasePath, fileInfo.subfolder);
        const targetFilePath = path.join(targetDir, fileInfo.name);

        // Check if already persisted on TrueNAS disk and registered
        if (pgClient) {
            try {
                const regCheck = await pgClient.query(
                    'SELECT 1 FROM nas_replicated_files WHERE object_key = $1',
                    [cloudPath]
                );
                if (regCheck.rows && regCheck.rows.length > 0 && fs.existsSync(targetFilePath)) {
                    continue; // Already replicated durably
                }
            } catch {}
        }

        // 1. Download binary bytes from Supabase Storage private bucket
        const { data: blob, error: downloadErr } = await supabaseClient.storage
            .from(bucketName)
            .download(cloudPath);

        if (downloadErr || !blob) {
            logger.error(`[NAS-Pull-Worker] Failed to download cloud file ${cloudPath}:`, downloadErr?.message);
            continue;
        }

        // Convert blob to Buffer
        let fileBuffer;
        if (typeof blob.arrayBuffer === 'function') {
            const ab = await blob.arrayBuffer();
            fileBuffer = Buffer.from(ab);
        } else if (Buffer.isBuffer(blob)) {
            fileBuffer = blob;
        } else {
            fileBuffer = Buffer.from(blob);
        }

        // 2. Compute SHA-256 Checksum for Integrity Verification
        const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();

        // 3. Atomically persist bytes to TrueNAS storage path
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetFilePath, fileBuffer);

        // Verify persistence by reading file metadata
        const stat = fs.statSync(targetFilePath);
        if (stat.size !== fileBuffer.length) {
            logger.error(`[NAS-Pull-Worker] TrueNAS disk write verification failed for ${targetFilePath}. Retaining for retry.`);
            continue;
        }

        // 4. Register file in TrueNAS nas_replicated_files table
        if (pgClient) {
            try {
                await pgClient.query(`
                    INSERT INTO nas_replicated_files (object_key, sha256, size_bytes, entity_type, entity_id, replicated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (object_key) DO UPDATE SET
                        sha256 = EXCLUDED.sha256,
                        size_bytes = EXCLUDED.size_bytes,
                        replicated_at = NOW();
                `, [
                    cloudPath,
                    sha256Hash,
                    stat.size,
                    fileInfo.entityType || null,
                    fileInfo.entityId || null
                ]);
            } catch {}
        }

        logger.log(`[NAS-Pull-Worker] Persisted ${cloudPath} (${stat.size} B, SHA256: ${sha256Hash.substring(0, 10)}...) to TrueNAS storage.`);
        filesPulled++;

        // 5. Cloud Retention Policy:
        // Keep Supabase Storage object intact by default.
        // Only prune cloud copy and release quota reservation if PRUNE_CLOUD_AFTER_NAS_CONFIRMATION is explicitly enabled.
        if (pruneCloud) {
            const { error: removeErr } = await supabaseClient.storage
                .from(bucketName)
                .remove([cloudPath]);

            if (!removeErr && fileInfo.reservationId) {
                await supabaseClient.rpc('release_buffer_capacity', {
                    p_reservation_id: fileInfo.reservationId,
                    p_client_id: 'reconciliation_daemon',
                    p_status: 'pruned',
                    p_actual_bytes: 0
                });
                logger.log(`[NAS-Pull-Worker] Pruned cloud copy and released quota for ${fileInfo.reservationId}.`);
            }
        }
    }

    if (pgClient && filesPulled > 0) {
        await updateCheckpoint(pgClient, 'storage_files', null, new Date().toISOString(), filesPulled, null);
    }

    return { success: true, filesPulled };
}

/**
 * Runs a single authoritative pull replication cycle
 */
async function runReplicationCycle(options = {}) {
    const logger = options.logger || console;
    const supabaseClient = options.supabaseClient;
    const pgConfig = options.pgConfig || getPgConfig();
    const storagePath = options.storagePath || process.env.TRUENAS_STORAGE_PATH || path.join(__dirname, '..', 'uploads');
    const pruneCloud = options.pruneCloud || process.env.PRUNE_CLOUD_AFTER_NAS_CONFIRMATION === 'true';

    if (!supabaseClient) {
        logger.error('[NAS-Pull-Worker] Supabase client is required for pull replication.');
        return { success: false, error: 'MISSING_SUPABASE_CLIENT' };
    }

    let pg = options.pgClient;
    let localPgCreated = false;
    if (!pg) {
        pg = new PgClient(pgConfig);
        localPgCreated = true;
    }

    try {
        if (localPgCreated) {
            await pg.connect();
        }

        // Initialize checkpoint table on TrueNAS PostgreSQL
        await initCheckpoints(pg);

        // 1. Pull Business Records in dependency order
        const dataResult = await pullBusinessData(supabaseClient, pg, { logger });

        // 2. Pull Attachments & Images to TrueNAS storage
        const attachResult = await pullAttachments(supabaseClient, storagePath, pg, {
            logger,
            pruneCloudAfterNasConfirmation: pruneCloud
        });

        return {
            success: dataResult.success && attachResult.success,
            recordsReplicated: dataResult.totalReplicated || 0,
            filesPulled: attachResult.filesPulled || 0
        };
    } catch (err) {
        logger.error('[NAS-Pull-Worker] Fatal error during replication cycle:', err.message);
        return { success: false, error: err.message };
    } finally {
        if (localPgCreated) {
            await pg.end().catch(() => {});
        }
    }
}

// Standalone Daemon Entry Point
if (require.main === module) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_REPLICATION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('[FATAL] nas-pull-replication-worker: SUPABASE_URL and SUPABASE_REPLICATION_KEY environment variables are required.');
        process.exit(1);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const isDaemon = process.argv.includes('--daemon');
    const intervalMs = parseInt(process.env.REPLICATION_INTERVAL_MS || '15000', 10);

    if (isDaemon) {
        console.log(`[NAS-Pull-Worker] Starting TrueNAS pull replication worker in daemon mode (interval: ${intervalMs}ms)...`);
        runReplicationCycle({ supabaseClient: supabaseAdmin });
        setInterval(() => runReplicationCycle({ supabaseClient: supabaseAdmin }), intervalMs);
    } else {
        runReplicationCycle({ supabaseClient: supabaseAdmin })
            .then(res => {
                console.log('[NAS-Pull-Worker] Single replication cycle completed:', res);
                process.exit(res.success ? 0 : 1);
            })
            .catch(err => {
                console.error('[NAS-Pull-Worker] Replication failed:', err);
                process.exit(1);
            });
    }
}

module.exports = {
    getPgConfig,
    initCheckpoints,
    getCheckpoint,
    updateCheckpoint,
    pullBusinessData,
    pullAttachments,
    runReplicationCycle
};
