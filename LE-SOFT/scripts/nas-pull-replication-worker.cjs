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
 *      child updates, parent specs before child colors) -> apply idempotently to
 *      TrueNAS PostgreSQL -> advance checkpoint per row.
 *    - Files / Images:
 *      Supabase Storage -> pull binary bytes -> compute downloaded SHA-256 -> write
 *      via temporary file and atomic rename -> read back persisted file -> verify
 *      SHA-256 matches -> register in nas_replicated_files -> acknowledge replication.
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

// Concurrency mutex to prevent concurrent replication cycles from racing checkpoints
let isCycleRunning = false;

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
 * Also self-heals required columns and indexes in TrueNAS replica schema.
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

    // Self-healing: ensure TrueNAS PostgreSQL tables have all replicated columns and indexes
    try {
        await pgClient.query(`
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0;
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT 0;
            ALTER TABLE make_orders ALTER COLUMN designer_name DROP NOT NULL;
            ALTER TABLE make_orders ALTER COLUMN designer_name SET DEFAULT 'System';
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS invoice_attachment_urls TEXT[] DEFAULT '{}'::text[];
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS current_stage_photo TEXT;
            ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Placed';
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'In Progress';
            ALTER TABLE make_order_updates ALTER COLUMN status SET DEFAULT 'In Progress';
            ALTER TABLE make_order_updates ALTER COLUMN updated_by SET DEFAULT 'System';
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS actor_name TEXT;
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS actor_role TEXT;
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_url TEXT;
            ALTER TABLE make_order_updates ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}'::text[];
            ALTER TABLE make_product_specifications ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE make_product_specifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_make_specs_updated_at_id ON make_product_specifications (updated_at ASC, id ASC);
            ALTER TABLE make_product_colors ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE make_product_colors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_make_colors_updated_at_id ON make_product_colors (updated_at ASC, id ASC);
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
        const row = res.rows[0];
        if (row.last_replicated_at instanceof Date) {
            row.last_replicated_at = row.last_replicated_at.toISOString();
        } else if (row.last_replicated_at) {
            try {
                row.last_replicated_at = new Date(row.last_replicated_at).toISOString();
            } catch {}
        }
        return row;
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
 * Normalizes raw storage URLs or URIs to a safe, relative object key.
 *
 * Rules:
 * 1. Rejects null, undefined, empty, non-string values.
 * 2. Rejects arbitrary external URLs (e.g. https://evil.com/...) - never treated as trusted storage keys.
 * 3. Strips private bucket prefix (e.g. 'make-order-files/' or 'supabase://make-order-files/').
 * 4. Extracts path from legitimate Supabase storage URLs (/storage/v1/object/(public|sign|authenticated)/<bucket>/...).
 * 5. Rejects directory traversal (../, ..\, absolute paths, drive letters).
 */
function normalizeStorageObjectKey(rawPath, allowedBucket = 'make-order-files') {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let trimmed = rawPath.trim();
    if (!trimmed) return null;

    let key = '';

    // Handle full URLs
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            const bucketPattern = new RegExp(`(?:^|/)${allowedBucket}/(.+)$`, 'i');
            const match = parsed.pathname.match(bucketPattern);
            if (match && match[1]) {
                key = decodeURIComponent(match[1]);
            } else {
                // Reject arbitrary external URLs that do not belong to the authorized bucket
                return null;
            }
        } catch {
            return null;
        }
    } else {
        // Strip custom scheme
        trimmed = trimmed.replace(new RegExp(`^supabase:\/\/${allowedBucket}\/`, 'i'), '');
        // If it starts with /<allowedBucket>/ or <allowedBucket>/
        if (new RegExp(`^\\/?${allowedBucket}\\/`, 'i').test(trimmed)) {
            trimmed = trimmed.replace(new RegExp(`^\\/?${allowedBucket}\\/`, 'i'), '');
        } else if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
            // Absolute filesystem path without bucket prefix -> reject!
            return null;
        }
        trimmed = trimmed.split('?')[0].split('#')[0];
        key = trimmed;
    }

    // Path traversal check and normalization
    const normalized = path.posix.normalize(key);
    if (normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
        return null;
    }

    return normalized || null;
}

/**
 * Pulls committed business data from Supabase Cloud to TrueNAS PostgreSQL in strict dependency order:
 * 1. replication_tombstones (deletions / removals for make_orders, make_order_updates, make_product_specifications, make_product_colors)
 * 2. make_orders (parent orders with mutable field updates & soft deletions)
 * 3. make_order_updates (dependent stage updates with strict parent-before-child ordering)
 * 4. make_product_specifications (parent product specifications with compound watermark & mutable change detection)
 * 5. make_product_colors (dependent product colors with strict parent spec ordering & mutable change detection)
 */
async function pullBusinessData(supabaseClient, pgClient, options = {}) {
    if (supabaseClient && typeof supabaseClient === 'object' && !supabaseClient.from && supabaseClient.supabaseClient) {
        const opts = supabaseClient;
        supabaseClient = opts.supabaseClient;
        pgClient = opts.pgClient;
        options = opts;
    }
    const logger = options.logger || console;
    let totalReplicated = 0;
    let ordersReplicated = 0;
    let updatesReplicated = 0;
    let specsReplicated = 0;
    let colorsReplicated = 0;
    let tombstonesReplicated = 0;
    const streamErrors = new Map();
    const batchSize = options.batchSize || 100;

    const ALLOWED_TOMBSTONE_TABLES = new Set([
        'make_orders',
        'make_order_updates',
        'make_product_specifications',
        'make_product_colors'
    ]);

    // ── 1. Pull Deletion Tombstones ───────────────────────────────────────────
    try {
        let hasMoreTombstones = true;
        let tombPages = 0;
        const maxTombPages = 1000;

        while (hasMoreTombstones && tombPages < maxTombPages) {
            tombPages++;
            const tombCp = await getCheckpoint(pgClient, 'replication_tombstones');
            let tombQuery = supabaseClient
                .from('replication_tombstones')
                .select('*');

            if (tombCp.last_replicated_at) {
                if (tombCp.last_replicated_id) {
                    tombQuery = tombQuery.or(`deleted_at.gt.${tombCp.last_replicated_at},and(deleted_at.eq.${tombCp.last_replicated_at},id.gt.${tombCp.last_replicated_id})`);
                } else {
                    tombQuery = tombQuery.gt('deleted_at', tombCp.last_replicated_at);
                }
            } else if (tombCp.last_replicated_id) {
                tombQuery = tombQuery.gt('id', tombCp.last_replicated_id);
            }

            tombQuery = tombQuery
                .order('deleted_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            const { data: tombstones, error: tombErr } = await tombQuery;
            if (tombErr) {
                if (tombErr.code !== '42P01') {
                    logger.warn('[NAS-Pull-Worker] Tombstone query error:', tombErr.message);
                    streamErrors.set('replication_tombstones', tombErr.message);
                    await updateCheckpoint(pgClient, 'replication_tombstones', null, null, 0, tombErr.message);
                }
                break;
            }

            if (!tombstones || tombstones.length === 0) {
                hasMoreTombstones = false;
                break;
            }

            for (const tomb of tombstones) {
                try {
                    const targetTable = tomb.entity_name || tomb.table_name;
                    const targetId = tomb.record_id || tomb.entity_id;
                    if (targetTable && ALLOWED_TOMBSTONE_TABLES.has(targetTable) && targetId) {
                        await pgClient.query(`DELETE FROM ${targetTable} WHERE id = $1`, [targetId]);
                        logger.log(`[NAS-Pull-Worker] Processed tombstone: deleted ${targetTable} ID ${targetId}`);
                    }
                    const tombAt = tomb.deleted_at || tomb.created_at || new Date().toISOString();
                    await updateCheckpoint(pgClient, 'replication_tombstones', String(tomb.id), tombAt, 1, null);
                    tombstonesReplicated++;
                    totalReplicated++;
                } catch (tombRowErr) {
                    logger.error(`[NAS-Pull-Worker] Error processing tombstone ${tomb.id}:`, tombRowErr.message);
                    streamErrors.set('replication_tombstones', tombRowErr.message);
                    await updateCheckpoint(pgClient, 'replication_tombstones', null, null, 0, tombRowErr.message);
                    hasMoreTombstones = false;
                    break;
                }
            }

            if (tombstones.length < batchSize) {
                hasMoreTombstones = false;
            }
        }
    } catch (tombEx) {
        logger.warn('[NAS-Pull-Worker] Tombstone stream exception:', tombEx.message);
        streamErrors.set('replication_tombstones', tombEx.message);
    }

    // ── 2. Pull Parent Orders (make_orders) with Compound Watermark ───────────
    try {
        let hasMoreOrders = true;
        let orderPages = 0;
        const maxOrderPages = 1000;

        while (hasMoreOrders && orderPages < maxOrderPages) {
            orderPages++;
            const orderCp = await getCheckpoint(pgClient, 'make_orders');
            let orderQuery = supabaseClient
                .from('make_orders')
                .select('*');

            if (orderCp.last_replicated_at) {
                if (orderCp.last_replicated_id) {
                    orderQuery = orderQuery.or(`updated_at.gt.${orderCp.last_replicated_at},and(updated_at.eq.${orderCp.last_replicated_at},id.gt.${orderCp.last_replicated_id})`);
                } else {
                    orderQuery = orderQuery.gt('updated_at', orderCp.last_replicated_at);
                }
            } else if (orderCp.last_replicated_id) {
                orderQuery = orderQuery.gt('id', orderCp.last_replicated_id);
            }

            orderQuery = orderQuery
                .order('updated_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            const { data: newOrders, error: orderErr } = await orderQuery;
            if (orderErr) {
                logger.error('[NAS-Pull-Worker] Error querying make_orders from Supabase:', orderErr.message);
                streamErrors.set('make_orders', orderErr.message);
                await updateCheckpoint(pgClient, 'make_orders', null, null, 0, orderErr.message);
                break;
            }

            if (!newOrders || newOrders.length === 0) {
                hasMoreOrders = false;
                break;
            }

            for (const ord of newOrders) {
                const ordId = String(ord.id);
                const ordUpdatedAt = ord.updated_at || ord.created_at || new Date().toISOString();

                try {
                    // Propagate soft-deletions
                    if (ord.is_deleted === true || ord.status === 'deleted' || ord.deleted_at) {
                        await pgClient.query('DELETE FROM make_orders WHERE id = $1', [ord.id]);
                        await updateCheckpoint(pgClient, 'make_orders', ordId, ordUpdatedAt, 1, null);
                        ordersReplicated++;
                        totalReplicated++;
                        continue;
                    }

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
                        ord.total_price || ord.sale_price || 0,
                        ord.current_stage || ord.stage || 'Draft',
                        ord.status || 'Placed',
                        ord.invoice_attachment_urls || [],
                        ord.current_stage_photo || null,
                        ord.created_at || new Date().toISOString(),
                        ordUpdatedAt
                    ]);

                    await updateCheckpoint(pgClient, 'make_orders', ordId, ordUpdatedAt, 1, null);
                    ordersReplicated++;
                    totalReplicated++;
                } catch (ordRowErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to replicate order ${ord.id}:`, ordRowErr.message);
                    streamErrors.set('make_orders', ordRowErr.message);
                    await updateCheckpoint(pgClient, 'make_orders', null, null, 0, ordRowErr.message).catch(() => {});
                    throw ordRowErr;
                }
            }

            if (newOrders.length < batchSize) {
                hasMoreOrders = false;
            }
        }
        if (ordersReplicated > 0) {
            logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${ordersReplicated} orders.`);
        }
    } catch (orderEx) {
        logger.error('[NAS-Pull-Worker] Order stream exception:', orderEx.message);
        streamErrors.set('make_orders', orderEx.message);
        try {
            await updateCheckpoint(pgClient, 'make_orders', null, null, 0, orderEx.message);
        } catch {}
        if (options.throwOnError !== false) {
            throw orderEx;
        }
    }

    // ── 3. Pull Child Updates (make_order_updates) ────────────────────────────
    try {
        let hasMoreUpdates = true;
        let updatePages = 0;
        const maxUpdatePages = 1000;

        while (hasMoreUpdates && updatePages < maxUpdatePages) {
            updatePages++;
            const updateCp = await getCheckpoint(pgClient, 'make_order_updates');
            let updateQuery = supabaseClient
                .from('make_order_updates')
                .select('*');

            if (updateCp.last_replicated_at) {
                if (updateCp.last_replicated_id) {
                    updateQuery = updateQuery.or(`created_at.gt.${updateCp.last_replicated_at},and(created_at.eq.${updateCp.last_replicated_at},id.gt.${updateCp.last_replicated_id})`);
                } else {
                    updateQuery = updateQuery.gt('created_at', updateCp.last_replicated_at);
                }
            } else if (updateCp.last_replicated_id) {
                updateQuery = updateQuery.gt('id', updateCp.last_replicated_id);
            }

            updateQuery = updateQuery
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            const { data: newUpdates, error: updateErr } = await updateQuery;
            if (updateErr) {
                logger.error('[NAS-Pull-Worker] Error querying make_order_updates from Supabase:', updateErr.message);
                streamErrors.set('make_order_updates', updateErr.message);
                await updateCheckpoint(pgClient, 'make_order_updates', null, null, 0, updateErr.message);
                break;
            }

            if (!newUpdates || newUpdates.length === 0) {
                hasMoreUpdates = false;
                break;
            }

            for (const upd of newUpdates) {
                const updId = String(upd.id);
                const updCreatedAt = upd.created_at || new Date().toISOString();

                try {
                    // Strict parent-before-child ordering: ensure parent order exists on TrueNAS
                    const parentCheck = await pgClient.query('SELECT 1 FROM make_orders WHERE id = $1', [upd.order_id]);
                    if (!parentCheck.rows || parentCheck.rows.length === 0) {
                        const { data: parentData, error: parentErr } = await supabaseClient
                            .from('make_orders')
                            .select('*')
                            .eq('id', upd.order_id)
                            .maybeSingle();

                        if (!parentErr && parentData) {
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
                                parentData.total_price || parentData.sale_price || 0,
                                parentData.current_stage || 'Draft',
                                parentData.status || 'Placed',
                                parentData.invoice_attachment_urls || [],
                                parentData.current_stage_photo || null,
                                parentData.created_at || new Date().toISOString(),
                                parentData.updated_at || parentData.created_at || new Date().toISOString()
                            ]);
                        } else {
                            logger.warn(`[NAS-Pull-Worker] Missing parent order ${upd.order_id} for update ${upd.id}. Halting update stream.`);
                            throw new Error(`Missing parent order ${upd.order_id} for update ${upd.id}`);
                        }
                    }

                    const upsertUpdateSql = `
                        INSERT INTO make_order_updates (
                            id, order_id, stage, note, photo_url, photo_urls, actor_name, actor_role, created_at
                        )
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
                        upd.stage || upd.status || 'In Progress',
                        upd.note || upd.notes || null,
                        upd.photo_url || null,
                        upd.photo_urls || [],
                        upd.actor_name || null,
                        upd.actor_role || null,
                        updCreatedAt
                    ]);

                    await updateCheckpoint(pgClient, 'make_order_updates', updId, updCreatedAt, 1, null);
                    updatesReplicated++;
                    totalReplicated++;
                } catch (updRowErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to replicate order update ${upd.id}:`, updRowErr.message);
                    streamErrors.set('make_order_updates', updRowErr.message);
                    await updateCheckpoint(pgClient, 'make_order_updates', null, null, 0, updRowErr.message);
                    hasMoreUpdates = false;
                    break;
                }
            }

            if (newUpdates.length < batchSize) {
                hasMoreUpdates = false;
            }
        }
        if (updatesReplicated > 0) {
            logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${updatesReplicated} order updates.`);
        }
    } catch (updateEx) {
        logger.error('[NAS-Pull-Worker] Order update stream exception:', updateEx.message);
        streamErrors.set('make_order_updates', updateEx.message);
        try {
            await updateCheckpoint(pgClient, 'make_order_updates', null, null, 0, updateEx.message);
        } catch {}
    }

    // ── 4. Pull Product Specifications (make_product_specifications) ───────────
    try {
        let hasMoreSpecs = true;
        let specPages = 0;
        const maxSpecPages = 1000;

        while (hasMoreSpecs && specPages < maxSpecPages) {
            specPages++;
            const specCp = await getCheckpoint(pgClient, 'make_product_specifications');
            let specQuery = supabaseClient
                .from('make_product_specifications')
                .select('*');

            if (specCp.last_replicated_at) {
                if (specCp.last_replicated_id) {
                    specQuery = specQuery.or(`updated_at.gt.${specCp.last_replicated_at},and(updated_at.eq.${specCp.last_replicated_at},id.gt.${specCp.last_replicated_id})`);
                } else {
                    specQuery = specQuery.gt('updated_at', specCp.last_replicated_at);
                }
            } else if (specCp.last_replicated_id) {
                specQuery = specQuery.gt('id', specCp.last_replicated_id);
            }

            specQuery = specQuery
                .order('updated_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            let { data: newSpecs, error: specErr } = await specQuery;

            // Fallback for legacy environments where updated_at column has not yet been migrated
            if (specErr && (specErr.code === '42703' || specErr.message?.includes('updated_at'))) {
                logger.warn('[NAS-Pull-Worker] make_product_specifications lacks updated_at in Supabase; falling back to id ordering.');
                let fallbackQuery = supabaseClient
                    .from('make_product_specifications')
                    .select('*');
                if (specCp.last_replicated_id) {
                    fallbackQuery = fallbackQuery.gt('id', specCp.last_replicated_id);
                }
                fallbackQuery = fallbackQuery.order('id', { ascending: true }).limit(batchSize);
                const fallbackRes = await fallbackQuery;
                newSpecs = fallbackRes.data;
                specErr = fallbackRes.error;
            }

            if (specErr) {
                logger.error('[NAS-Pull-Worker] Error querying make_product_specifications from Supabase:', specErr.message);
                streamErrors.set('make_product_specifications', specErr.message);
                await updateCheckpoint(pgClient, 'make_product_specifications', null, null, 0, specErr.message);
                break;
            }

            if (!newSpecs || newSpecs.length === 0) {
                hasMoreSpecs = false;
                break;
            }

            for (const sp of newSpecs) {
                const spId = String(sp.id);
                const spUpdatedAt = sp.updated_at || sp.created_at || new Date().toISOString();

                try {
                    // Propagate soft-deletions if flagged
                    if (sp.is_deleted === true || sp.deleted_at) {
                        await pgClient.query('DELETE FROM make_product_specifications WHERE id = $1', [sp.id]);
                        await updateCheckpoint(pgClient, 'make_product_specifications', spId, spUpdatedAt, 1, null);
                        specsReplicated++;
                        totalReplicated++;
                        continue;
                    }

                    const upsertSpecSql = `
                        INSERT INTO make_product_specifications (
                            id, product_id, spec_code, spec_name, spec_details, is_active, image_url, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (id) DO UPDATE SET
                            product_id = EXCLUDED.product_id,
                            spec_code = EXCLUDED.spec_code,
                            spec_name = EXCLUDED.spec_name,
                            spec_details = EXCLUDED.spec_details,
                            is_active = EXCLUDED.is_active,
                            image_url = EXCLUDED.image_url,
                            updated_at = EXCLUDED.updated_at;
                    `;
                    await pgClient.query(upsertSpecSql, [
                        sp.id,
                        sp.product_id || null,
                        sp.spec_code || null,
                        sp.spec_name || '',
                        sp.spec_details || null,
                        sp.is_active !== undefined ? sp.is_active : true,
                        sp.image_url || null,
                        sp.created_at || new Date().toISOString(),
                        spUpdatedAt
                    ]);

                    await updateCheckpoint(pgClient, 'make_product_specifications', spId, spUpdatedAt, 1, null);
                    specsReplicated++;
                    totalReplicated++;
                } catch (spRowErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to replicate specification ${sp.id}:`, spRowErr.message);
                    streamErrors.set('make_product_specifications', spRowErr.message);
                    await updateCheckpoint(pgClient, 'make_product_specifications', null, null, 0, spRowErr.message);
                    hasMoreSpecs = false;
                    break;
                }
            }

            if (newSpecs.length < batchSize) {
                hasMoreSpecs = false;
            }
        }
        if (specsReplicated > 0) {
            logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${specsReplicated} product specifications.`);
        }
    } catch (specEx) {
        logger.error('[NAS-Pull-Worker] Specification stream exception:', specEx.message);
        streamErrors.set('make_product_specifications', specEx.message);
        try {
            await updateCheckpoint(pgClient, 'make_product_specifications', null, null, 0, specEx.message);
        } catch {}
    }

    // ── 5. Pull Product Colors (make_product_colors) ───────────────────────────
    // Strict parent-before-child ordering: If specs failed, skip colors to prevent orphan foreign key errors
    if (!streamErrors.has('make_product_specifications')) {
        try {
            let hasMoreColors = true;
            let colorPages = 0;
            const maxColorPages = 1000;

            while (hasMoreColors && colorPages < maxColorPages) {
                colorPages++;
                const colorCp = await getCheckpoint(pgClient, 'make_product_colors');
                let colorQuery = supabaseClient
                    .from('make_product_colors')
                    .select('*');

                if (colorCp.last_replicated_at) {
                    if (colorCp.last_replicated_id) {
                        colorQuery = colorQuery.or(`updated_at.gt.${colorCp.last_replicated_at},and(updated_at.eq.${colorCp.last_replicated_at},id.gt.${colorCp.last_replicated_id})`);
                    } else {
                        colorQuery = colorQuery.gt('updated_at', colorCp.last_replicated_at);
                    }
                } else if (colorCp.last_replicated_id) {
                    colorQuery = colorQuery.gt('id', colorCp.last_replicated_id);
                }

                colorQuery = colorQuery
                    .order('updated_at', { ascending: true })
                    .order('id', { ascending: true })
                    .limit(batchSize);

                let { data: newColors, error: colorErr } = await colorQuery;

                // Fallback for legacy environments where updated_at column has not yet been migrated
                if (colorErr && (colorErr.code === '42703' || colorErr.message?.includes('updated_at'))) {
                    logger.warn('[NAS-Pull-Worker] make_product_colors lacks updated_at in Supabase; falling back to id ordering.');
                    let fallbackColorQuery = supabaseClient
                        .from('make_product_colors')
                        .select('*');
                    if (colorCp.last_replicated_id) {
                        fallbackColorQuery = fallbackColorQuery.gt('id', colorCp.last_replicated_id);
                    }
                    fallbackColorQuery = fallbackColorQuery.order('id', { ascending: true }).limit(batchSize);
                    const fallbackColorRes = await fallbackColorQuery;
                    newColors = fallbackColorRes.data;
                    colorErr = fallbackColorRes.error;
                }

                if (colorErr) {
                    logger.error('[NAS-Pull-Worker] Error querying make_product_colors from Supabase:', colorErr.message);
                    streamErrors.set('make_product_colors', colorErr.message);
                    await updateCheckpoint(pgClient, 'make_product_colors', null, null, 0, colorErr.message);
                    break;
                }

                if (!newColors || newColors.length === 0) {
                    hasMoreColors = false;
                    break;
                }

                for (const cl of newColors) {
                    const clId = String(cl.id);
                    const clUpdatedAt = cl.updated_at || cl.created_at || new Date().toISOString();

                    try {
                        // Propagate soft-deletions if flagged
                        if (cl.is_deleted === true || cl.deleted_at) {
                            await pgClient.query('DELETE FROM make_product_colors WHERE id = $1', [cl.id]);
                            await updateCheckpoint(pgClient, 'make_product_colors', clId, clUpdatedAt, 1, null);
                            colorsReplicated++;
                            totalReplicated++;
                            continue;
                        }

                        // Maintain parent spec reference validity
                        if (cl.spec_id) {
                            const specCheck = await pgClient.query('SELECT 1 FROM make_product_specifications WHERE id = $1', [cl.spec_id]);
                            if (!specCheck.rows || specCheck.rows.length === 0) {
                                const { data: specData, error: specFetchErr } = await supabaseClient
                                    .from('make_product_specifications')
                                    .select('*')
                                    .eq('id', cl.spec_id)
                                    .maybeSingle();

                                if (!specFetchErr && specData) {
                                    const upsertParentSpecSql = `
                                        INSERT INTO make_product_specifications (
                                            id, product_id, spec_code, spec_name, spec_details, is_active, image_url, created_at, updated_at
                                        )
                                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                                        ON CONFLICT (id) DO UPDATE SET
                                            product_id = EXCLUDED.product_id,
                                            spec_code = EXCLUDED.spec_code,
                                            spec_name = EXCLUDED.spec_name,
                                            spec_details = EXCLUDED.spec_details,
                                            is_active = EXCLUDED.is_active,
                                            image_url = EXCLUDED.image_url,
                                            updated_at = EXCLUDED.updated_at;
                                    `;
                                    await pgClient.query(upsertParentSpecSql, [
                                        specData.id,
                                        specData.product_id || null,
                                        specData.spec_code || null,
                                        specData.spec_name || '',
                                        specData.spec_details || null,
                                        specData.is_active !== undefined ? specData.is_active : true,
                                        specData.image_url || null,
                                        specData.created_at || new Date().toISOString(),
                                        specData.updated_at || specData.created_at || new Date().toISOString()
                                    ]);
                                    logger.log(`[NAS-Pull-Worker] Resolved missing parent spec ${cl.spec_id} on-demand for color ${cl.id}`);
                                } else {
                                    throw new Error(`Missing parent specification ${cl.spec_id} for color ${cl.id}`);
                                }
                            }
                        }

                        const upsertColorSql = `
                            INSERT INTO make_product_colors (
                                id, product_id, spec_id, color_name, color_code, is_active, image_url, created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT (id) DO UPDATE SET
                                product_id = EXCLUDED.product_id,
                                spec_id = EXCLUDED.spec_id,
                                color_name = EXCLUDED.color_name,
                                color_code = EXCLUDED.color_code,
                                is_active = EXCLUDED.is_active,
                                image_url = EXCLUDED.image_url,
                                updated_at = EXCLUDED.updated_at;
                        `;
                        await pgClient.query(upsertColorSql, [
                            cl.id,
                            cl.product_id || null,
                            cl.spec_id || null,
                            cl.color_name || '',
                            cl.color_code || null,
                            cl.is_active !== undefined ? cl.is_active : true,
                            cl.image_url || null,
                            cl.created_at || new Date().toISOString(),
                            clUpdatedAt
                        ]);

                        await updateCheckpoint(pgClient, 'make_product_colors', clId, clUpdatedAt, 1, null);
                        colorsReplicated++;
                        totalReplicated++;
                    } catch (clRowErr) {
                        logger.error(`[NAS-Pull-Worker] Failed to replicate color ${cl.id}:`, clRowErr.message);
                        streamErrors.set('make_product_colors', clRowErr.message);
                        await updateCheckpoint(pgClient, 'make_product_colors', null, null, 0, clRowErr.message);
                        hasMoreColors = false;
                        break;
                    }
                }

                if (newColors.length < batchSize) {
                    hasMoreColors = false;
                }
            }
            if (colorsReplicated > 0) {
                logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${colorsReplicated} product colors.`);
            }
        } catch (colorEx) {
            logger.error('[NAS-Pull-Worker] Color stream exception:', colorEx.message);
            streamErrors.set('make_product_colors', colorEx.message);
            try {
                await updateCheckpoint(pgClient, 'make_product_colors', null, null, 0, colorEx.message);
            } catch {}
        }
    } else {
        logger.warn('[NAS-Pull-Worker] Skipping color replication because parent specifications stream encountered errors.');
    }

    return {
        success: streamErrors.size === 0,
        totalReplicated,
        ordersReplicated,
        updatesReplicated,
        specsReplicated,
        colorsReplicated,
        tombstonesReplicated,
        errors: streamErrors.size > 0 ? Object.fromEntries(streamErrors) : undefined
    };
}

/**
 * Discovers and paginates image/file references from a database table.
 * Paginates deterministically by id until exhaustion, ensuring records beyond page 1
 * are never missed.
 */
async function discoverFromTable(client, config, fileTasks, logger, bucketName) {
    const { table, select, filterFn, batchSize = 50, extractUrls } = config;
    let lastId = 0;
    let hasMore = true;
    let pages = 0;
    const maxPages = 1000;

    while (hasMore && pages < maxPages) {
        pages++;
        let q = client.from(table).select(select);
        if (filterFn) {
            q = filterFn(q);
        }
        if (lastId > 0) {
            q = q.gt('id', lastId);
        }
        q = q.order('id', { ascending: true }).limit(batchSize);

        const { data, error } = await q;
        if (error) {
            logger.warn(`[NAS-Pull-Worker] Attachment discovery query failed on ${table}:`, error.message);
            return { error: error.message };
        }

        if (!data || data.length === 0) {
            hasMore = false;
            break;
        }

        for (const row of data) {
            extractUrls(row, fileTasks, bucketName);
            const numId = Number(row.id);
            if (!isNaN(numId) && numId > lastId) {
                lastId = numId;
            }
        }

        if (data.length < batchSize) {
            hasMore = false;
        }
    }

    return { success: true };
}

/**
 * Pulls committed attachments and images from Supabase Storage private bucket
 * to TrueNAS local storage with SHA-256 integrity validation and durable registration.
 *
 * Verifies files through:
 * 1. Download binary bytes from Supabase Storage.
 * 2. Calculate SHA-256 hash of downloaded bytes.
 * 3. Persist bytes using a safe temporary-file-and-rename strategy.
 * 4. Read the persisted file back and calculate its SHA-256 hash.
 * 5. Compare downloaded-byte and persisted-file hashes.
 * 6. Register object in nas_replicated_files ONLY after verification succeeds.
 * 7. Preserve cloud object and retryable state on any failure.
 */
async function pullAttachments(supabaseClient, storageBasePath, pgClient, options = {}) {
    if (supabaseClient && typeof supabaseClient === 'object' && !supabaseClient.storage && supabaseClient.supabaseClient) {
        const opts = supabaseClient;
        supabaseClient = opts.supabaseClient;
        storageBasePath = opts.storageBasePath || opts.storagePath;
        pgClient = opts.pgClient;
        options = opts;
    }
    const logger = options.logger || console;
    const bucketName = options.bucketName || 'make-order-files';
    const pruneCloud = options.pruneCloud === true || options.pruneCloudAfterNasConfirmation === true;
    const batchSize = options.batchSize || 50;
    let filesPulled = 0;
    const failedFiles = [];
    const discoveryErrors = [];

    // Discovered file tasks: Map<objectKey, { subfolder, name, reservationId?, entityType?, entityId?, expectedSha256? }>
    const fileTasks = new Map();

    // ── Source A: Discover files from committed make_orders (paginated) ───────
    try {
        const resA = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_orders',
                select: 'id, invoice_attachment_urls, current_stage_photo',
                filterFn: q => q.or('invoice_attachment_urls.neq.{},current_stage_photo.not.is.null'),
                batchSize,
                extractUrls: (ord, tasks, bucket) => {
                    if (Array.isArray(ord.invoice_attachment_urls)) {
                        for (const rawUrl of ord.invoice_attachment_urls) {
                            const cleanKey = normalizeStorageObjectKey(rawUrl, bucket);
                            if (cleanKey && !tasks.has(cleanKey)) {
                                tasks.set(cleanKey, {
                                    subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'cad',
                                    name: path.basename(cleanKey),
                                    entityType: 'make_orders',
                                    entityId: String(ord.id)
                                });
                            }
                        }
                    }
                    if (ord.current_stage_photo) {
                        const cleanKey = normalizeStorageObjectKey(ord.current_stage_photo, bucket);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                name: path.basename(cleanKey),
                                entityType: 'make_orders',
                                entityId: String(ord.id)
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName
        );
        if (resA && resA.error) {
            discoveryErrors.push({ source: 'make_orders', error: resA.error });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from make_orders attachments failed:', e.message);
        discoveryErrors.push({ source: 'make_orders', error: e.message });
    }

    // ── Source B: Discover files from make_order_updates (paginated) ───────────
    try {
        const resB = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_order_updates',
                select: 'id, photo_url, photo_urls',
                batchSize,
                extractUrls: (upd, tasks, bucket) => {
                    if (upd.photo_url) {
                        const cleanKey = normalizeStorageObjectKey(upd.photo_url, bucket);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                name: path.basename(cleanKey),
                                entityType: 'make_order_updates',
                                entityId: String(upd.id)
                            });
                        }
                    }
                    if (Array.isArray(upd.photo_urls)) {
                        for (const rawUrl of upd.photo_urls) {
                            const cleanKey = normalizeStorageObjectKey(rawUrl, bucket);
                            if (cleanKey && !tasks.has(cleanKey)) {
                                tasks.set(cleanKey, {
                                    subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                    name: path.basename(cleanKey),
                                    entityType: 'make_order_updates',
                                    entityId: String(upd.id)
                                });
                            }
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName
        );
        if (resB && resB.error) {
            discoveryErrors.push({ source: 'make_order_updates', error: resB.error });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from make_order_updates attachments failed:', e.message);
        discoveryErrors.push({ source: 'make_order_updates', error: e.message });
    }

    // ── Source C: Discover committed buffer reservations (supabase_buffer_reservations)
    try {
        const { data: committedReservations, error: resErr } = await supabaseClient
            .from('supabase_buffer_reservations')
            .select('*')
            .eq('status', 'committed')
            .eq('resource_type', 'storage')
            .limit(batchSize);

        if (resErr) {
            if (resErr.code !== '42P01') {
                logger.warn('[NAS-Pull-Worker] Buffer reservations discovery query error:', resErr.message);
                discoveryErrors.push({ source: 'supabase_buffer_reservations', error: resErr.message });
            }
        } else if (committedReservations && committedReservations.length > 0) {
            for (const res of committedReservations) {
                const foldersToCheck = res.target_folder ? [res.target_folder] : ['cad', 'products', 'specs', 'colors'];
                for (const subfolder of foldersToCheck) {
                    const { data: files, error: listErr } = await supabaseClient.storage
                        .from(bucketName)
                        .list(subfolder, { limit: 100 });

                    if (listErr) {
                        logger.warn(`[NAS-Pull-Worker] Storage list failed for ${subfolder}:`, listErr.message);
                        discoveryErrors.push({ source: `storage_list_${subfolder}`, error: listErr.message });
                    } else if (files && files.length > 0) {
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
        }
    } catch (resEx) {
        logger.warn('[NAS-Pull-Worker] Buffer reservations stream exception:', resEx.message);
        discoveryErrors.push({ source: 'supabase_buffer_reservations', error: resEx.message });
    }

    // ── Source D: Discover specification drawings (make_product_specifications, paginated)
    try {
        const resD = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_product_specifications',
                select: 'id, image_url',
                filterFn: q => q.not('image_url', 'is', null),
                batchSize,
                extractUrls: (sp, tasks, bucket) => {
                    if (sp.image_url) {
                        const cleanKey = normalizeStorageObjectKey(sp.image_url, bucket);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'specs',
                                name: path.basename(cleanKey),
                                entityType: 'make_product_specifications',
                                entityId: String(sp.id)
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName
        );
        if (resD && resD.error) {
            discoveryErrors.push({ source: 'make_product_specifications', error: resD.error });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from specifications images failed:', e.message);
        discoveryErrors.push({ source: 'make_product_specifications', error: e.message });
    }

    // ── Source E: Discover color swatch images (make_product_colors, paginated) ─
    try {
        const resE = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_product_colors',
                select: 'id, image_url',
                filterFn: q => q.not('image_url', 'is', null),
                batchSize,
                extractUrls: (cl, tasks, bucket) => {
                    if (cl.image_url) {
                        const cleanKey = normalizeStorageObjectKey(cl.image_url, bucket);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'colors',
                                name: path.basename(cleanKey),
                                entityType: 'make_product_colors',
                                entityId: String(cl.id)
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName
        );
        if (resE && resE.error) {
            discoveryErrors.push({ source: 'make_product_colors', error: resE.error });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from colors images failed:', e.message);
        discoveryErrors.push({ source: 'make_product_colors', error: e.message });
    }

    if (fileTasks.size === 0) {
        return { success: discoveryErrors.length === 0, filesPulled: 0, errors: discoveryErrors };
    }

    // ── Process and Verify Discovered Files ────────────────────────────────────
    for (const [cloudPath, fileInfo] of fileTasks.entries()) {
        const targetDir = path.join(storageBasePath, fileInfo.subfolder);
        const targetFilePath = path.join(targetDir, fileInfo.name);
        const tempFilePath = path.join(targetDir, `.${fileInfo.name}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`);

        // Check if already persisted and verified in TrueNAS database and filesystem
        if (pgClient) {
            try {
                const regCheck = await pgClient.query(
                    'SELECT 1 FROM nas_replicated_files WHERE object_key = $1',
                    [cloudPath]
                );
                if (regCheck.rows && regCheck.rows.length > 0 && fs.existsSync(targetFilePath)) {
                    continue; // Already replicated durably and verified
                }
            } catch {}
        }

        try {
            // Step 1: Download binary bytes from Supabase Storage private bucket
            const { data: blob, error: downloadErr } = await supabaseClient.storage
                .from(bucketName)
                .download(cloudPath);

            if (downloadErr || !blob) {
                throw new Error(`Download failed for ${cloudPath}: ${downloadErr?.message || 'Empty response'}`);
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

            // Step 2: Calculate SHA-256 hash of downloaded bytes
            const downloadedSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();

            // Compare with expected SHA-256 if supplied
            if (fileInfo.expectedSha256 && fileInfo.expectedSha256.toUpperCase() !== downloadedSha256) {
                throw new Error(`Expected checksum mismatch for ${cloudPath}: expected ${fileInfo.expectedSha256}, downloaded ${downloadedSha256}`);
            }

            // Step 3: Persist bytes using safe temporary-file-and-rename strategy
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(tempFilePath, fileBuffer);

            // Step 4: Read persisted file back and calculate its SHA-256 hash
            const persistedBytes = fs.readFileSync(tempFilePath);
            const persistedSha256 = crypto.createHash('sha256').update(persistedBytes).digest('hex').toUpperCase();

            // Step 5: Compare downloaded-byte and persisted-file hashes and sizes
            if (downloadedSha256 !== persistedSha256 || persistedBytes.length !== fileBuffer.length) {
                throw new Error(`Integrity verification failed for ${cloudPath}: downloaded SHA ${downloadedSha256} !== persisted SHA ${persistedSha256}`);
            }

            // Safe atomic rename
            fs.renameSync(tempFilePath, targetFilePath);

            // Step 6: Register object in nas_replicated_files ONLY after verification succeeds
            if (pgClient) {
                await pgClient.query(`
                    INSERT INTO nas_replicated_files (object_key, sha256, size_bytes, entity_type, entity_id, replicated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (object_key) DO UPDATE SET
                        sha256 = EXCLUDED.sha256,
                        size_bytes = EXCLUDED.size_bytes,
                        replicated_at = NOW();
                `, [
                    cloudPath,
                    persistedSha256,
                    persistedBytes.length,
                    fileInfo.entityType || null,
                    fileInfo.entityId || null
                ]);
            }

            logger.log(`[NAS-Pull-Worker] Persisted and verified ${cloudPath} (${persistedBytes.length} B, SHA256: ${persistedSha256.substring(0, 10)}...) to TrueNAS storage.`);
            filesPulled++;

            // Step 7: Cloud Retention: Prune cloud object ONLY if explicitly enabled
            if (pruneCloud) {
                try {
                    await supabaseClient.storage.from(bucketName).remove([cloudPath]);
                    logger.log(`[NAS-Pull-Worker] Cloud buffer pruned after TrueNAS confirmation: ${cloudPath}`);
                } catch (pruneErr) {
                    logger.warn(`[NAS-Pull-Worker] Failed to prune cloud object ${cloudPath}:`, pruneErr.message);
                }

                if (fileInfo.reservationId) {
                    try {
                        await supabaseClient.rpc('release_buffer_capacity', {
                            p_reservation_id: fileInfo.reservationId,
                            p_client_id: 'reconciliation_daemon',
                            p_status: 'pruned',
                            p_actual_bytes: 0
                        });
                        logger.log(`[NAS-Pull-Worker] Pruned cloud copy and released quota for ${fileInfo.reservationId}.`);
                    } catch {}
                }
            }
        } catch (fileErr) {
            // Clean up temporary file on failure
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch {}
            }
            logger.error(`[NAS-Pull-Worker] File replication failed for ${cloudPath}:`, fileErr.message);
            failedFiles.push({ cloudPath, error: fileErr.message });
            // Cloud object preserved and retryable on next cycle
        }
    }

    if (pgClient && failedFiles.length === 0 && discoveryErrors.length === 0) {
        await updateCheckpoint(pgClient, 'storage_files', null, new Date().toISOString(), filesPulled, null);
    }

    return {
        success: failedFiles.length === 0 && discoveryErrors.length === 0,
        filesPulled,
        replicatedCount: filesPulled,
        errors: [...failedFiles, ...discoveryErrors]
    };
}

/**
 * Runs a single authoritative pull replication cycle
 */
async function runReplicationCycle(options = {}) {
    const logger = options.logger || console;

    // Mutex check: prevent concurrent cycle execution
    if (isCycleRunning && !options.bypassLock) {
        logger.warn('[NAS-Pull-Worker] Previous replication cycle still running. Skipping to prevent checkpoint races.');
        return { success: true, skipped: true };
    }

    isCycleRunning = true;

    const supabaseClient = options.supabaseClient;
    const pgConfig = options.pgConfig || getPgConfig();
    const storagePath = options.storagePath || process.env.TRUENAS_STORAGE_PATH || path.join(__dirname, '..', 'uploads');
    const pruneCloud = options.pruneCloud || process.env.PRUNE_CLOUD_AFTER_NAS_CONFIRMATION === 'true';

    if (!supabaseClient) {
        isCycleRunning = false;
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
        const dataResult = await pullBusinessData(supabaseClient, pg, {
            logger,
            batchSize: options.batchSize,
            throwOnError: false
        });

        // 2. Pull Attachments & Images to TrueNAS storage
        const attachResult = await pullAttachments(supabaseClient, storagePath, pg, {
            logger,
            batchSize: options.batchSize,
            pruneCloudAfterNasConfirmation: pruneCloud
        });

        const overallSuccess = dataResult.success && attachResult.success;

        return {
            success: overallSuccess,
            recordsReplicated: dataResult.totalReplicated || 0,
            filesPulled: attachResult.filesPulled || 0,
            errors: {
                ...(dataResult.errors ? { businessData: dataResult.errors } : {}),
                ...(attachResult.errors && attachResult.errors.length > 0 ? { attachments: attachResult.errors } : {})
            }
        };
    } catch (err) {
        logger.error('[NAS-Pull-Worker] Fatal error during replication cycle:', err.message);
        return { success: false, error: err.message };
    } finally {
        isCycleRunning = false;
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
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: false
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
    normalizeStorageObjectKey,
    pullBusinessData,
    pullAttachments,
    runReplicationCycle
};
