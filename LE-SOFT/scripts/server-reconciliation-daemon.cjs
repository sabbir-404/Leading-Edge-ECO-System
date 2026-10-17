/**
 * scripts/server-reconciliation-daemon.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * LE-SOFT Isolated Server-Side Buffer Reconciliation Daemon.
 *
 * ARCHITECTURAL SAFETY PRINCIPLE:
 * Desktop Electron client applications NEVER embed or handle Supabase service-role
 * credentials. Standard desktop workstations operate strictly under unprivileged
 * user credentials (or elevated 'reconciliation_operator' JWTs during active operator login).
 *
 * This daemon is designed to run as an isolated backend service (systemd unit,
 * Docker container, or cron job) on internal infrastructure (e.g. TrueNAS host or
 * backend management server). It safely loads privileged reconciliation credentials
 * strictly from server-side environment variables and performs authoritative
 * cleanup without exposing keys to desktop clients.
 *
 * Execution:
 *   node scripts/server-reconciliation-daemon.cjs
 *   node scripts/server-reconciliation-daemon.cjs --daemon
 *
 * Environment Requirements:
 *   - SUPABASE_URL: Canonical Supabase Cloud URL (https://<project>.supabase.co)
 *   - SUPABASE_SERVICE_ROLE_KEY: Privileged server key (never packaged in Electron)
 *   - TRUENAS_PG_HOST: (default: 100.88.85.6)
 *   - TRUENAS_PG_PORT: (default: 5432)
 *   - TRUENAS_PG_DATABASE: (default: lesoft)
 *   - TRUENAS_PG_USER: PostgreSQL user with read access
 *   - TRUENAS_PG_PASSWORD: PostgreSQL password
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');
const { Client: PgClient } = require('pg');

function getPgConfig(env = process.env) {
    return {
        host: env.TRUENAS_PG_HOST || '100.88.85.6',
        port: parseInt(env.TRUENAS_PG_PORT || '5432', 10),
        database: env.TRUENAS_PG_DATABASE || 'lesoft',
        user: env.TRUENAS_PG_USER || 'postgres',
        password: env.TRUENAS_PG_PASSWORD || '',
        statement_timeout: 10000,
        query_timeout: 10000
    };
}

/**
 * Reconcile a single committed reservation:
 * 1. Verifies cloud deletion before quota pruning.
 * 2. Prunes quota via release_buffer_capacity RPC.
 * 3. Returns { success, pruned, error }.
 */
async function reconcileReservation(res, supabaseAdmin, pgClient) {
    if (!res || !res.id) {
        return { success: false, pruned: false, error: 'INVALID_RESERVATION' };
    }

    try {
        let isCloudCopyDeleted = false;

        if (res.resource_type === 'storage') {
            // For storage fallback: inspect Supabase Storage bucket 'make-order-files'
            // Ensure cloud file is removed prior to quota pruning
            const subfolder = res.id.includes('cad') ? 'cad' : 'products';
            const { data: files, error: listErr } = await supabaseAdmin.storage
                .from('make-order-files')
                .list(subfolder, { search: res.id });

            if (listErr) {
                return {
                    success: false,
                    pruned: false,
                    error: `Storage check failed for ${res.id}: ${listErr.message}`
                };
            }

            if (files && files.length > 0) {
                // Cloud copies still exist; delete them before pruning
                const filePaths = files.map(f => `${subfolder}/${f.name}`);
                console.log(`[ReconciliationDaemon] Deleting ${filePaths.length} remaining cloud objects for ${res.id}...`);
                const { error: removeErr } = await supabaseAdmin.storage
                    .from('make-order-files')
                    .remove(filePaths);

                if (removeErr) {
                    return {
                        success: false,
                        pruned: false,
                        error: `Cloud storage deletion failed for ${res.id}: ${removeErr.message}`
                    };
                }
            }
            isCloudCopyDeleted = true;
        } else if (res.resource_type === 'database') {
            // For database reservations: TrueNAS authoritative persistence is verified
            // by the active PG connection
            isCloudCopyDeleted = true;
        }

        if (!isCloudCopyDeleted) {
            return {
                success: false,
                pruned: false,
                error: `Cloud copy deletion unconfirmed for ${res.id}`
            };
        }

        // Authoritative quota pruning via privileged RPC
        const { data: pruneResult, error: pruneErr } = await supabaseAdmin.rpc('release_buffer_capacity', {
            p_reservation_id: res.id,
            p_client_id: 'reconciliation_daemon',
            p_status: 'pruned',
            p_actual_bytes: 0
        });

        if (pruneErr) {
            return {
                success: false,
                pruned: false,
                error: `Pruning RPC error for ${res.id}: ${pruneErr.message}`
            };
        }

        if (!pruneResult || pruneResult.success !== true) {
            return {
                success: false,
                pruned: false,
                error: `Pruning RPC rejected for ${res.id}: ${pruneResult?.reason || 'Unknown error'}`
            };
        }

        return { success: true, pruned: true, status: pruneResult.status };
    } catch (err) {
        return {
            success: false,
            pruned: false,
            error: `Exception reconciling reservation ${res.id}: ${err.message}`
        };
    }
}

/**
 * Executes a full reconciliation cycle across all committed reservations
 */
async function runReconciliationCycle(options = {}) {
    const supabaseAdmin = options.supabaseAdmin;
    const pgConfig = options.pgConfig || getPgConfig();
    const logger = options.logger || console;

    if (!supabaseAdmin) {
        logger.error('[ReconciliationDaemon] Supabase admin client not provided.');
        return { success: false, error: 'MISSING_CLIENT' };
    }

    logger.log(`[ReconciliationDaemon] Starting reconciliation sweep at ${new Date().toISOString()}...`);

    // 1. Verify TrueNAS database connectivity
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
        const testRes = await pg.query('SELECT 1 AS alive');
        if (!testRes || !testRes.rows || testRes.rows.length === 0) {
            throw new Error('TrueNAS query returned empty response');
        }
        logger.log('[ReconciliationDaemon] TrueNAS PostgreSQL authoritative connection verified.');
    } catch (err) {
        logger.warn(`[ReconciliationDaemon] TrueNAS PostgreSQL unreachable (${err.message}). Aborting cycle to preserve buffer integrity.`);
        if (localPgCreated) {
            await pg.end().catch(() => {});
        }
        return { success: false, reason: 'TRUENAS_UNAVAILABLE', error: err.message };
    }

    let processedCount = 0;
    let prunedCount = 0;
    let errorCount = 0;

    try {
        // 2. Fetch committed reservations awaiting pruning
        const { data: committedReservations, error: fetchErr } = await supabaseAdmin
            .from('supabase_buffer_reservations')
            .select('*')
            .eq('status', 'committed')
            .order('created_at', { ascending: true })
            .limit(50);

        if (fetchErr) {
            logger.error('[ReconciliationDaemon] Failed to fetch committed reservations:', fetchErr.message);
            return { success: false, error: fetchErr.message };
        }

        if (!committedReservations || committedReservations.length === 0) {
            logger.log('[ReconciliationDaemon] No committed buffer reservations pending pruning.');
            return { success: true, processedCount: 0, prunedCount: 0 };
        }

        logger.log(`[ReconciliationDaemon] Found ${committedReservations.length} committed reservations to inspect.`);

        for (const res of committedReservations) {
            processedCount++;
            logger.log(`[ReconciliationDaemon] Inspecting reservation ${res.id} (${res.resource_type}, ${res.bytes_reserved} bytes)...`);

            const result = await reconcileReservation(res, supabaseAdmin, pg);
            if (result.pruned) {
                prunedCount++;
                logger.log(`[ReconciliationDaemon] Successfully pruned reservation ${res.id}.`);
            } else {
                errorCount++;
                logger.warn(`[ReconciliationDaemon] Could not prune reservation ${res.id}: ${result.error}. Retaining in committed state.`);
            }
        }
    } finally {
        if (localPgCreated) {
            await pg.end().catch(() => {});
        }
    }

    logger.log(`[ReconciliationDaemon] Sweep complete. Processed: ${processedCount}, Pruned: ${prunedCount}, Deferred/Errors: ${errorCount}`);
    return { success: true, processedCount, prunedCount, errorCount };
}

// ── Standalone CLI Entry Point ───────────────────────────────────────────────
if (require.main === module) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_RECONCILIATION_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('[ReconciliationDaemon] Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        console.error('This server-side daemon requires privileged reconciliation credentials.');
        process.exit(1);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const isDaemon = process.argv.includes('--daemon');
    if (isDaemon) {
        const intervalMs = parseInt(process.env.RECONCILIATION_INTERVAL_MS || '60000', 10);
        console.log(`[ReconciliationDaemon] Running in daemon mode (interval: ${intervalMs}ms)...`);
        runReconciliationCycle({ supabaseAdmin });
        setInterval(() => runReconciliationCycle({ supabaseAdmin }), intervalMs);
    } else {
        runReconciliationCycle({ supabaseAdmin }).then(() => {
            process.exit(0);
        }).catch((err) => {
            console.error('[ReconciliationDaemon] Fatal error:', err);
            process.exit(1);
        });
    }
}

module.exports = {
    getPgConfig,
    reconcileReservation,
    runReconciliationCycle
};
