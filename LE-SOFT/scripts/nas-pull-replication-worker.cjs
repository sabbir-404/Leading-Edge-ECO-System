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
            source_updated_at TIMESTAMPTZ,
            replicated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS nas_replication_id_map (
            entity_type VARCHAR(50) NOT NULL,
            source_id VARCHAR(100) NOT NULL,
            target_id BIGINT NOT NULL,
            natural_key VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (entity_type, source_id)
        );
        CREATE INDEX IF NOT EXISTS idx_nas_id_map_lookup 
            ON nas_replication_id_map (entity_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_nas_id_map_natural 
            ON nas_replication_id_map (entity_type, natural_key);
    `;
    await pgClient.query(ddl);

    // Self-healing: ensure TrueNAS PostgreSQL tables have all replicated columns and indexes
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
        CREATE TABLE IF NOT EXISTS make_product_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            code VARCHAR(50),
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS make_products (
            id BIGSERIAL PRIMARY KEY,
            product_code VARCHAR(50) UNIQUE NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            description TEXT,
            main_image TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_by VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS category_id INTEGER;
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS max_discount_type VARCHAR(20) DEFAULT 'percent';
        ALTER TABLE make_products ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14, 2) DEFAULT 0.00;
        CREATE INDEX IF NOT EXISTS idx_make_products_updated_at_id ON make_products (updated_at ASC, id ASC);
        ALTER TABLE make_product_specifications ADD COLUMN IF NOT EXISTS image_url TEXT;
        ALTER TABLE make_product_specifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        CREATE INDEX IF NOT EXISTS idx_make_specs_updated_at_id ON make_product_specifications (updated_at ASC, id ASC);
        ALTER TABLE make_product_colors ADD COLUMN IF NOT EXISTS image_url TEXT;
        ALTER TABLE make_product_colors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        CREATE INDEX IF NOT EXISTS idx_make_colors_updated_at_id ON make_product_colors (updated_at ASC, id ASC);
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS final_price NUMERIC(14, 2) DEFAULT NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS money_received NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS amount_due NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS production_hold BOOLEAN DEFAULT FALSE;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS hold_reason TEXT NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_status VARCHAR(50) DEFAULT 'none';
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_requested_by VARCHAR(100) NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_requested_at TIMESTAMPTZ NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_decision_by VARCHAR(100) NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_decision_at TIMESTAMPTZ NULL;
        ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS admin_approval_notes TEXT NULL;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) DEFAULT 0.00;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS final_item_price NUMERIC(14, 2) DEFAULT NULL;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS max_discount_type VARCHAR(20) DEFAULT NULL;
        ALTER TABLE make_order_items ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC(14, 2) DEFAULT NULL;
        CREATE TABLE IF NOT EXISTS make_order_payments (
            id BIGSERIAL PRIMARY KEY,
            order_id BIGINT NOT NULL,
            amount NUMERIC(14, 2) NOT NULL,
            payment_method VARCHAR(50) DEFAULT 'CASH',
            reference VARCHAR(100) NULL,
            notes TEXT NULL,
            received_by VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_make_order_payments_order_id ON make_order_payments(order_id);
        ALTER TABLE nas_replicated_files ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
    `);
}

/**
 * Gets checkpoint for a specific table or stream
 */
async function getCheckpoint(pgClient, tableName) {
    // Keep PostgreSQL's full microsecond precision. node-postgres normally parses
    // TIMESTAMPTZ into a JavaScript Date, which only retains milliseconds; truncating
    // a watermark can make an already-processed row with fractional microseconds
    // appear newer and be selected forever.
    const res = await pgClient.query(
        `
        SELECT
            table_name,
            last_replicated_id,
            CASE
                WHEN last_replicated_at IS NULL THEN NULL
                ELSE to_char(
                    last_replicated_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                )
            END AS last_replicated_at,
            items_replicated,
            last_error,
            updated_at
        FROM nas_replication_checkpoints
        WHERE table_name = $1
        `,
        [tableName]
    );
    if (res.rows && res.rows.length > 0) {
        // last_replicated_at is deliberately returned as text by SQL. Do not pass
        // it through Date/toISOString(), which would discard the final 3 digits.
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
 * Normalizes raw storage URLs or URIs to a safe, relative object key.
 *
 * Rules:
 * 1. Rejects null, undefined, empty, non-string values.
 * 2. Rejects arbitrary external URLs (e.g. https://evil.com/...) - never treated as trusted storage keys.
 *    Verifies that the origin matches the configured Supabase origin or allowed hosts.
 * 3. Enforces valid Supabase Storage URL pathname structure:
 *    /storage/v1/object/(public|sign|authenticated)/<bucket>/<path>
 * 4. Strips private bucket prefix (e.g. 'make-order-files/' or 'supabase://make-order-files/').
 * 5. Rejects directory traversal (../, ..\, %2e%2e, absolute paths, drive letters, null bytes).
 * 6. Safely handles malformed percent-encoding without crashing.
 */
function normalizeStorageObjectKey(rawPath, allowedBucket = 'make-order-files', options = {}) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let trimmed = rawPath.trim();
    if (!trimmed) return null;

    let key = '';

    // Handle full URLs
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);

            // Origin validation
            const allowedOrigins = new Set();
            if (options.expectedOrigin) {
                try { allowedOrigins.add(new URL(options.expectedOrigin).origin.toLowerCase()); } catch {}
            }
            if (options.supabaseUrl) {
                try { allowedOrigins.add(new URL(options.supabaseUrl).origin.toLowerCase()); } catch {}
            }
            if (process.env.SUPABASE_URL) {
                try { allowedOrigins.add(new URL(process.env.SUPABASE_URL).origin.toLowerCase()); } catch {}
            }
            if (process.env.VITE_SUPABASE_URL) {
                try { allowedOrigins.add(new URL(process.env.VITE_SUPABASE_URL).origin.toLowerCase()); } catch {}
            }

            const parsedOrigin = parsed.origin.toLowerCase();
            // Full URLs are accepted only when their origin exactly matches the
            // configured Supabase endpoint. Do not trust arbitrary *.supabase.co
            // subdomains: another tenant is not this project's storage authority.
            const isAllowedOrigin = allowedOrigins.size > 0 && allowedOrigins.has(parsedOrigin);

            if (!isAllowedOrigin) {
                // Reject arbitrary external hosts that do not match configured Supabase endpoint
                return null;
            }

            // Must match standard Supabase Storage URL structure
            const bucketPattern = new RegExp(`^\\/storage\\/v1\\/object\\/(?:public|sign|authenticated)\\/${allowedBucket}\\/(.+)$`, 'i');
            const match = parsed.pathname.match(bucketPattern);
            if (match && match[1]) {
                try {
                    key = decodeURIComponent(match[1]);
                } catch {
                    return null; // Malformed percent-encoding
                }
            } else {
                // Reject arbitrary URL paths that do not adhere to the Supabase Storage contract
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
        try {
            key = decodeURIComponent(trimmed);
        } catch {
            return null;
        }
    }

    // Traversal check: reject null bytes, encoded traversal (%2e%2e, %00)
    if (key.includes('\0') || /%00/i.test(key) || /%2e/i.test(key)) {
        return null;
    }

    // Traversal components check: reject any ".." segment in raw or decoded key
    if (/(?:^|\/|\\)\.\.(?:\/|\\|$)/.test(key) || /(?:^|\/|\\)\.\.(?:\/|\\|$)/.test(trimmed)) {
        return null;
    }

    // Path traversal check and normalization
    const normalized = path.posix.normalize(key);
    if (normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
        return null;
    }

    return normalized || null;
}

/**
 * Returns true only for errors indicating that a referenced column is absent from
 * the source schema/schema cache. Authentication, network, RLS, and other failures
 * must not be hidden by falling back to a weaker query.
 */
function isMissingColumnError(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const message = String(error.message || '').toLowerCase();
    return code === '42703' ||
        code === 'PGRST204' ||
        (message.includes('column') &&
            /(does not exist|not found|could not find|schema cache)/.test(message));
}

/**
 * Module-level schema capability and projection cache.
 * Caches the negotiated compatible projection or column availability per table
 * for the lifetime of the worker, preventing repeated failing queries and noisy
 * warnings on every 15-second polling cycle.
 *
 * Cache entries: Map<cacheKey, { variantIndex: number, lastLoggedVariantIndex?: number }>
 */
const schemaCapabilityCache = new Map();

function getSchemaCapabilityCache() {
    return schemaCapabilityCache;
}

function clearSchemaCapabilityCache() {
    schemaCapabilityCache.clear();
}

/**
 * Look up persistent source-to-target entity mapping.
 */
async function getIdMapping(pgClient, entityType, sourceId) {
    if (!sourceId) return null;
    try {
        const res = await pgClient.query(
            'SELECT target_id FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2',
            [entityType, String(sourceId)]
        );
        if (res.rows && res.rows.length > 0) {
            return Number(res.rows[0].target_id);
        }
    } catch {
        // Table not ready or initialized
    }
    return null;
}

/**
 * Record durable source-to-target entity mapping.
 */
async function recordIdMapping(pgClient, entityType, sourceId, targetId, naturalKey = null) {
    if (!sourceId || targetId === undefined || targetId === null) return;
    try {
        await pgClient.query(`
            INSERT INTO nas_replication_id_map (entity_type, source_id, target_id, natural_key, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (entity_type, source_id) DO UPDATE SET
                target_id = EXCLUDED.target_id,
                natural_key = EXCLUDED.natural_key,
                updated_at = NOW();
        `, [entityType, String(sourceId), targetId, naturalKey ? String(naturalKey) : null]);
    } catch {
        // Non-fatal if table not initialized yet
    }
}

/**
 * Resolves the true TrueNAS product ID for a given Supabase Cloud product ID.
 * Pulls the authoritative parent product on demand if not yet replicated.
 */
async function resolveTargetProductId(pgClient, supabaseClient, sourceProductId, logger = console) {
    if (!sourceProductId) return null;
    const sourceProdIdStr = String(sourceProductId);

    // 1. Check ID map table
    const mapped = await getIdMapping(pgClient, 'make_products', sourceProdIdStr);
    if (mapped) return mapped;

    // 2. Fetch authoritative product from Cloud
    const { data: prodData, error: prodErr } = await supabaseClient
        .from('make_products')
        .select('*')
        .eq('id', sourceProductId)
        .maybeSingle();

    if (prodErr) {
        throw new Error(`Failed to query parent product ${sourceProductId} from Supabase: ${prodErr.message}`);
    }

    if (!prodData) {
        logger.warn(`[NAS-Pull-Worker] Missing parent product ${sourceProductId} in Supabase Cloud.`);
        throw new Error(`Missing parent product ${sourceProductId}`);
    }

    // 3. Upsert product into TrueNAS (this populates nas_replication_id_map and returns targetId)
    const { targetId } = await upsertProductRecord(pgClient, supabaseClient, prodData, logger);
    return targetId;
}

/**
 * Resolves the true TrueNAS specification ID for a given Supabase Cloud specification ID.
 * Pulls the authoritative parent specification on demand if not yet replicated.
 */
async function resolveTargetSpecId(pgClient, supabaseClient, sourceSpecId, logger = console) {
    if (!sourceSpecId) return null;
    const sourceSpecIdStr = String(sourceSpecId);

    const mapped = await getIdMapping(pgClient, 'make_product_specifications', sourceSpecIdStr);
    if (mapped) return mapped;

    const { data: specData, error: specErr } = await supabaseClient
        .from('make_product_specifications')
        .select('*')
        .eq('id', sourceSpecId)
        .maybeSingle();

    if (specErr) {
        throw new Error(`Failed to query parent specification ${sourceSpecId} from Supabase: ${specErr.message}`);
    }

    if (!specData) {
        logger.warn(`[NAS-Pull-Worker] Missing parent specification ${sourceSpecId} in Supabase Cloud.`);
        throw new Error(`Missing parent specification ${sourceSpecId}`);
    }

    const { targetId } = await upsertSpecificationRecord(pgClient, supabaseClient, specData, logger);
    return targetId;
}

/**
 * Ensures an authoritative product category exists on TrueNAS PostgreSQL.
 * Matches by name/code before inserting to prevent unique-constraint violations.
 * Records source-to-target category mapping and returns resolved target category ID.
 */
async function ensureProductCategory(pgClient, supabaseClient, categoryId, categoryName, logger = console) {
    if (!categoryId) {
        return null;
    }
    const sourceCatIdStr = String(categoryId);

    // 1. Check if mapping already exists in nas_replication_id_map
    const mappedId = await getIdMapping(pgClient, 'make_product_categories', sourceCatIdStr);
    if (mappedId) {
        return mappedId;
    }

    // 2. Check if category exists directly on TrueNAS with matching id
    const idCheck = await pgClient.query('SELECT id, name, code FROM make_product_categories WHERE id = $1', [categoryId]);
    if (idCheck.rows && idCheck.rows.length > 0) {
        const row = idCheck.rows[0];
        if (!categoryName || row.name.toLowerCase() === categoryName.trim().toLowerCase()) {
            await recordIdMapping(pgClient, 'make_product_categories', sourceCatIdStr, row.id, row.name);
            return row.id;
        }
    }

    // 3. Check if category exists on TrueNAS by name or code if categoryName is provided
    if (categoryName) {
        const nameCheck = await pgClient.query(
            'SELECT id, name, code FROM make_product_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
            [categoryName]
        );
        if (nameCheck.rows && nameCheck.rows.length > 0) {
            const row = nameCheck.rows[0];
            await recordIdMapping(pgClient, 'make_product_categories', sourceCatIdStr, row.id, row.name);
            return row.id;
        }
    }

    // 4. Query authoritative category from Supabase Cloud
    const { data: catData, error: catErr } = await supabaseClient
        .from('make_product_categories')
        .select('*')
        .eq('id', categoryId)
        .maybeSingle();

    if (catErr) {
        throw new Error(`Failed to query parent category ${categoryId} from Supabase: ${catErr.message}`);
    }

    if (!catData) {
        // If categoryName is provided, check if TrueNAS has it by name as fallback
        if (categoryName) {
            const nameCheck = await pgClient.query(
                'SELECT id, name, code FROM make_product_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
                [categoryName]
            );
            if (nameCheck.rows && nameCheck.rows.length > 0) {
                const row = nameCheck.rows[0];
                await recordIdMapping(pgClient, 'make_product_categories', sourceCatIdStr, row.id, row.name);
                return row.id;
            }
        }
        logger.warn(`[NAS-Pull-Worker] Missing parent category ${categoryId} in Supabase Cloud. Halting category resolution.`);
        throw new Error(`Missing parent category ${categoryId}`);
    }

    // 5. With authoritative catData: check if TrueNAS has matching category by name or code
    const matchCheck = await pgClient.query(
        'SELECT id, name FROM make_product_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) OR (code IS NOT NULL AND code = $2)',
        [catData.name, catData.code || '']
    );
    if (matchCheck.rows && matchCheck.rows.length > 0) {
        const matched = matchCheck.rows[0];
        await recordIdMapping(pgClient, 'make_product_categories', sourceCatIdStr, matched.id, catData.name);
        return matched.id;
    }

    // 6. Category does not exist on TrueNAS: insert it
    const freeCheck = await pgClient.query('SELECT 1 FROM make_product_categories WHERE id = $1', [catData.id]);
    let targetCatId;
    if (!freeCheck.rows || freeCheck.rows.length === 0) {
        await pgClient.query(`
            INSERT INTO make_product_categories (id, name, code, description, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (name) DO UPDATE SET
                code = EXCLUDED.code,
                description = EXCLUDED.description,
                is_active = EXCLUDED.is_active;
        `, [
            catData.id,
            catData.name,
            catData.code || null,
            catData.description || null,
            catData.is_active !== undefined ? catData.is_active : true,
            catData.created_at || new Date().toISOString()
        ]);
        targetCatId = catData.id;
    } else {
        const insertRes = await pgClient.query(`
            INSERT INTO make_product_categories (name, code, description, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `, [
            catData.name,
            catData.code || null,
            catData.description || null,
            catData.is_active !== undefined ? catData.is_active : true,
            catData.created_at || new Date().toISOString()
        ]);
        targetCatId = insertRes.rows[0].id;
    }

    await recordIdMapping(pgClient, 'make_product_categories', sourceCatIdStr, targetCatId, catData.name);
    logger.log(`[NAS-Pull-Worker] Replicated authoritative parent category ${catData.id} (${catData.name}) -> TrueNAS category ${targetCatId}.`);
    return targetCatId;
}

/**
 * Resolves the true TrueNAS order ID for a given Supabase Cloud order ID.
 * Resolves via nas_replication_id_map, natural key order_number matching,
 * and parent order fetching if not yet replicated.
 */
async function resolveTargetOrderId(pgClient, supabaseClient, sourceOrderId, logger = console) {
    if (!sourceOrderId) return null;
    const sourceOrdIdStr = String(sourceOrderId);

    // 1. Check ID map table
    const mapped = await getIdMapping(pgClient, 'make_orders', sourceOrdIdStr);
    if (mapped) return mapped;

    // 2. Fetch authoritative order from Supabase
    const { data: ordData, error: ordErr } = await supabaseClient
        .from('make_orders')
        .select('*')
        .eq('id', sourceOrderId)
        .maybeSingle();

    if (ordErr || !ordData) {
        throw new Error(`Failed to query parent order ${sourceOrderId} from Supabase: ${ordErr ? ordErr.message : 'Not found'}`);
    }

    const { targetId } = await upsertOrderRecord(pgClient, supabaseClient, ordData, logger);
    return targetId;
}

/**
 * Idempotently applies a make_orders record to TrueNAS PostgreSQL with schema compatibility.
 * Reconciles order_number natural keys without destroying conflicting local IDs.
 * Records source-to-target order mapping and returns resolved target order ID.
 */
async function upsertOrderRecord(pgClient, supabaseClient, ord, logger = console) {
    const sourceOrdIdStr = String(ord.id);
    const ordNumber = ord.order_number || `ORD-${ord.id}`;
    const ordUpdatedAt = ord.updated_at || ord.created_at || new Date().toISOString();

    // Propagate soft-deletions safely via ID mapping
    if (ord.is_deleted === true || ord.status === 'deleted' || ord.deleted_at) {
        const targetId = await getIdMapping(pgClient, 'make_orders', sourceOrdIdStr);
        if (!targetId) {
            logger.warn(`[NAS-Pull-Worker] Skipping soft-delete for order ${sourceOrdIdStr}: no NAS ID mapping.`);
            return { deleted: false, skipped: true, reason: 'UNMAPPED_SOFT_DELETE' };
        }
        await pgClient.query('DELETE FROM make_order_items WHERE order_id = $1', [targetId]);
        await pgClient.query('DELETE FROM make_order_updates WHERE order_id = $1', [targetId]);
        await pgClient.query('DELETE FROM make_orders WHERE id = $1', [targetId]);
        await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_orders', sourceOrdIdStr]);
        return { deleted: true, targetId };
    }

    // Identity Resolution:
    let targetId = await getIdMapping(pgClient, 'make_orders', sourceOrdIdStr);
    let isExistingOnTarget = false;

    // Check if target order exists with matching order_number natural key
    if (!targetId && ordNumber) {
        const numCheck = await pgClient.query(
            'SELECT id, order_number FROM make_orders WHERE order_number = $1',
            [ordNumber]
        );
        if (numCheck.rows && numCheck.rows.length > 0) {
            targetId = numCheck.rows[0].id;
            isExistingOnTarget = true;
            logger.log(`[NAS-Pull-Worker] Mapped source order ${ord.id} (${ordNumber}) to existing TrueNAS order ID ${targetId}`);
        }
    }

    // If not mapped by order_number, check if target row exists with id = ord.id
    if (!targetId) {
        const idCheck = await pgClient.query(
            'SELECT id, order_number FROM make_orders WHERE id = $1',
            [ord.id]
        );
        if (idCheck.rows && idCheck.rows.length > 0) {
            const existingRow = idCheck.rows[0];
            if (existingRow.order_number === ordNumber) {
                targetId = ord.id;
                isExistingOnTarget = true;
            } else {
                // ID collision with a DIFFERENT order!
                // (e.g. Supabase ID 15 is 'LE-ORD-20260909-JTYN' while TrueNAS ID 15 is 'MAKE-2026-613437')
                // Do NOT overwrite existingRow! Allocate a new target ID using sequence.
                logger.warn(`[NAS-Pull-Worker] ID collision: source order ${ord.id} (${ordNumber}) collides with target ID ${existingRow.id} (${existingRow.order_number}). Allocating distinct TrueNAS ID.`);
                targetId = null;
                isExistingOnTarget = false;
            }
        } else {
            // Target ID is free and order_number does not collide
            targetId = ord.id;
            isExistingOnTarget = false;
        }
    } else {
        isExistingOnTarget = true;
    }

    if (isExistingOnTarget && targetId) {
        // Update existing TrueNAS order
        const updateSql = `
            UPDATE make_orders SET
                order_number = $1,
                furniture_name = $2,
                total_price = $3,
                sale_price = $4,
                current_stage = $5,
                status = $6,
                invoice_attachment_urls = $7,
                current_stage_photo = $8,
                updated_at = $9
            WHERE id = $10;
        `;
        await pgClient.query(updateSql, [
            ordNumber,
            ord.furniture_name || '',
            ord.total_price || ord.sale_price || 0,
            ord.sale_price || ord.total_price || 0,
            ord.current_stage || ord.stage || 'Draft',
            ord.status || 'Placed',
            ord.invoice_attachment_urls || [],
            ord.current_stage_photo || null,
            ordUpdatedAt,
            targetId
        ]);
    } else if (targetId !== null) {
        // Free ID match: insert with explicit ID and advance sequence if needed
        const insertSql = `
            INSERT INTO make_orders (
                id, order_number, furniture_name, total_price, sale_price, current_stage, status,
                invoice_attachment_urls, current_stage_photo, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
        `;
        await pgClient.query(insertSql, [
            targetId,
            ordNumber,
            ord.furniture_name || '',
            ord.total_price || ord.sale_price || 0,
            ord.sale_price || ord.total_price || 0,
            ord.current_stage || ord.stage || 'Draft',
            ord.status || 'Placed',
            ord.invoice_attachment_urls || [],
            ord.current_stage_photo || null,
            ord.created_at || new Date().toISOString(),
            ordUpdatedAt
        ]);
        // Advance sequence past targetId so future local inserts don't collide
        await pgClient.query(`
            SELECT setval(
                pg_get_serial_sequence('make_orders', 'id'),
                GREATEST((SELECT COALESCE(MAX(id), 1) FROM make_orders), $1)
            )
        `, [targetId]).catch(() => {});
    } else {
        // Target ID was null because of collision: insert using sequence DEFAULT
        const insertGenSql = `
            INSERT INTO make_orders (
                order_number, furniture_name, total_price, sale_price, current_stage, status,
                invoice_attachment_urls, current_stage_photo, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id;
        `;
        const insRes = await pgClient.query(insertGenSql, [
            ordNumber,
            ord.furniture_name || '',
            ord.total_price || ord.sale_price || 0,
            ord.sale_price || ord.total_price || 0,
            ord.current_stage || ord.stage || 'Draft',
            ord.status || 'Placed',
            ord.invoice_attachment_urls || [],
            ord.current_stage_photo || null,
            ord.created_at || new Date().toISOString(),
            ordUpdatedAt
        ]);
        targetId = insRes.rows[0].id;
        logger.log(`[NAS-Pull-Worker] Inserted colliding source order ${ord.id} (${ordNumber}) as new TrueNAS order ID ${targetId}`);
    }

    // Durable source-to-target entity mapping
    await recordIdMapping(pgClient, 'make_orders', sourceOrdIdStr, targetId, ordNumber);

    return { targetId, deleted: false };
}

/**
 * Idempotently applies a make_products record to TrueNAS PostgreSQL with schema compatibility.
 * Reconciles product_code natural keys without destroying conflicting local IDs.
 * Records source-to-target product mapping and returns resolved target product ID.
 */
async function upsertProductRecord(pgClient, supabaseClient, prod, logger = console) {
    const sourceProdIdStr = String(prod.id);

    if (prod.is_deleted === true || prod.status === 'deleted' || prod.deleted_at) {
        const targetId = await getIdMapping(pgClient, 'make_products', sourceProdIdStr);
        if (!targetId) {
            logger.warn(`[NAS-Pull-Worker] Skipping soft-delete for product ${sourceProdIdStr}: no NAS ID mapping.`);
            return { deleted: false, skipped: true, reason: 'UNMAPPED_SOFT_DELETE' };
        }
        await pgClient.query('DELETE FROM make_product_colors WHERE product_id = $1', [targetId]);
        await pgClient.query('DELETE FROM make_product_specifications WHERE product_id = $1', [targetId]);
        await pgClient.query('DELETE FROM make_products WHERE id = $1', [targetId]);
        await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_products', sourceProdIdStr]);
        return { deleted: true, targetId };
    }

    // Ensure parent category exists on TrueNAS without inventing placeholder data
    let targetCategoryId = null;
    if (prod.category_id) {
        targetCategoryId = await ensureProductCategory(pgClient, supabaseClient, prod.category_id, prod.category, logger);
    }

    // Identity Resolution:
    let targetId = await getIdMapping(pgClient, 'make_products', sourceProdIdStr);
    let isExistingOnTarget = false;

    // Check if target product exists with matching product_code
    if (!targetId && prod.product_code) {
        const codeCheck = await pgClient.query(
            'SELECT id, product_code, product_name FROM make_products WHERE product_code = $1',
            [prod.product_code]
        );
        if (codeCheck.rows && codeCheck.rows.length > 0) {
            targetId = codeCheck.rows[0].id;
            isExistingOnTarget = true;
            logger.log(`[NAS-Pull-Worker] Mapped source product ${prod.id} (${prod.product_code}) to existing TrueNAS product ID ${targetId}`);
        }
    }

    // If not mapped by code, check if target row exists with id = prod.id
    if (!targetId) {
        const idCheck = await pgClient.query(
            'SELECT id, product_code, product_name FROM make_products WHERE id = $1',
            [prod.id]
        );
        if (idCheck.rows && idCheck.rows.length > 0) {
            const existingRow = idCheck.rows[0];
            if (existingRow.product_code === prod.product_code) {
                targetId = prod.id;
                isExistingOnTarget = true;
            } else {
                // ID collision with a DIFFERENT product (e.g. Target ID 5 is '1000' while source ID 5 is 'LE-CT-03')
                // Do NOT overwrite existingRow! Allocate a new target ID using sequence.
                logger.warn(`[NAS-Pull-Worker] ID collision: source product ${prod.id} (${prod.product_code}) collides with target ID ${existingRow.id} (${existingRow.product_code}). Allocating distinct TrueNAS ID.`);
                targetId = null;
                isExistingOnTarget = false;
            }
        } else {
            // Target ID is free and product_code does not collide
            targetId = prod.id;
            isExistingOnTarget = false;
        }
    } else {
        isExistingOnTarget = true;
    }

    const prodUpdatedAt = prod.updated_at || prod.created_at || new Date().toISOString();

    if (isExistingOnTarget && targetId) {
        // UPDATE existing target product row
        const fullUpdateSql = `
            UPDATE make_products SET
                product_code = $1,
                product_name = $2,
                description = $3,
                main_image = $4,
                is_active = $5,
                created_by = $6,
                category = $7,
                category_id = $8,
                cost_price = $9,
                sale_price = $10,
                max_discount_type = $11,
                max_discount_value = $12,
                updated_at = $13
            WHERE id = $14
        `;
        const fallbackUpdateSql = `
            UPDATE make_products SET
                product_code = $1,
                product_name = $2,
                description = $3,
                main_image = $4,
                is_active = $5,
                created_by = $6,
                category = $7,
                category_id = $8,
                updated_at = $9
            WHERE id = $10
        `;
        const baseUpdateSql = `
            UPDATE make_products SET
                product_code = $1,
                product_name = $2,
                description = $3,
                main_image = $4,
                is_active = $5,
                created_by = $6,
                updated_at = $7
            WHERE id = $8
        `;

        try {
            await pgClient.query(fullUpdateSql, [
                prod.product_code || `PROD-${targetId}`,
                prod.product_name || '',
                prod.description || null,
                prod.main_image || null,
                prod.is_active !== undefined ? prod.is_active : true,
                prod.created_by || null,
                prod.category || null,
                targetCategoryId,
                prod.cost_price !== undefined ? prod.cost_price : 0,
                prod.sale_price !== undefined ? prod.sale_price : 0,
                prod.max_discount_type || 'percent',
                prod.max_discount_value !== undefined ? prod.max_discount_value : 0,
                prodUpdatedAt,
                targetId
            ]);
        } catch (sqlErr) {
            if (isMissingColumnError(sqlErr)) {
                logger.warn(`[NAS-Pull-Worker] make_products table missing pricing columns on TrueNAS (${sqlErr.message}). Retrying update with base product columns.`);
                try {
                    await pgClient.query(fallbackUpdateSql, [
                        prod.product_code || `PROD-${targetId}`,
                        prod.product_name || '',
                        prod.description || null,
                        prod.main_image || null,
                        prod.is_active !== undefined ? prod.is_active : true,
                        prod.created_by || null,
                        prod.category || null,
                        targetCategoryId,
                        prodUpdatedAt,
                        targetId
                    ]);
                } catch (fallbackErr) {
                    if (isMissingColumnError(fallbackErr)) {
                        logger.warn(`[NAS-Pull-Worker] make_products table missing category columns on TrueNAS (${fallbackErr.message}). Retrying update with minimal product schema.`);
                        await pgClient.query(baseUpdateSql, [
                            prod.product_code || `PROD-${targetId}`,
                            prod.product_name || '',
                            prod.description || null,
                            prod.main_image || null,
                            prod.is_active !== undefined ? prod.is_active : true,
                            prod.created_by || null,
                            prodUpdatedAt,
                            targetId
                        ]);
                    } else {
                        throw fallbackErr;
                    }
                }
            } else {
                throw sqlErr;
            }
        }
    } else {
        // INSERT new product row on TrueNAS
        if (targetId) {
            const fullInsertSql = `
                INSERT INTO make_products (
                    id, product_code, product_name, description, main_image,
                    is_active, created_by, category, category_id,
                    cost_price, sale_price, max_discount_type, max_discount_value,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (id) DO UPDATE SET
                    product_code = EXCLUDED.product_code,
                    product_name = EXCLUDED.product_name,
                    description = EXCLUDED.description,
                    main_image = EXCLUDED.main_image,
                    is_active = EXCLUDED.is_active,
                    created_by = EXCLUDED.created_by,
                    category = EXCLUDED.category,
                    category_id = EXCLUDED.category_id,
                    cost_price = EXCLUDED.cost_price,
                    sale_price = EXCLUDED.sale_price,
                    max_discount_type = EXCLUDED.max_discount_type,
                    max_discount_value = EXCLUDED.max_discount_value,
                    updated_at = EXCLUDED.updated_at
                RETURNING id;
            `;
            const fallbackInsertSql = `
                INSERT INTO make_products (
                    id, product_code, product_name, description, main_image,
                    is_active, created_by, category, category_id,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    product_code = EXCLUDED.product_code,
                    product_name = EXCLUDED.product_name,
                    description = EXCLUDED.description,
                    main_image = EXCLUDED.main_image,
                    is_active = EXCLUDED.is_active,
                    created_by = EXCLUDED.created_by,
                    category = EXCLUDED.category,
                    category_id = EXCLUDED.category_id,
                    updated_at = EXCLUDED.updated_at
                RETURNING id;
            `;
            const baseInsertSql = `
                INSERT INTO make_products (
                    id, product_code, product_name, description, main_image,
                    is_active, created_by, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    product_code = EXCLUDED.product_code,
                    product_name = EXCLUDED.product_name,
                    description = EXCLUDED.description,
                    main_image = EXCLUDED.main_image,
                    is_active = EXCLUDED.is_active,
                    created_by = EXCLUDED.created_by,
                    updated_at = EXCLUDED.updated_at
                RETURNING id;
            `;

            try {
                const res = await pgClient.query(fullInsertSql, [
                    targetId,
                    prod.product_code || `PROD-${targetId}`,
                    prod.product_name || '',
                    prod.description || null,
                    prod.main_image || null,
                    prod.is_active !== undefined ? prod.is_active : true,
                    prod.created_by || null,
                    prod.category || null,
                    targetCategoryId,
                    prod.cost_price !== undefined ? prod.cost_price : 0,
                    prod.sale_price !== undefined ? prod.sale_price : 0,
                    prod.max_discount_type || 'percent',
                    prod.max_discount_value !== undefined ? prod.max_discount_value : 0,
                    prod.created_at || new Date().toISOString(),
                    prodUpdatedAt
                ]);
                targetId = res.rows[0].id;
            } catch (sqlErr) {
                if (isMissingColumnError(sqlErr)) {
                    logger.warn(`[NAS-Pull-Worker] make_products table missing pricing columns on TrueNAS (${sqlErr.message}). Retrying insert with base product columns.`);
                    try {
                        const res = await pgClient.query(fallbackInsertSql, [
                            targetId,
                            prod.product_code || `PROD-${targetId}`,
                            prod.product_name || '',
                            prod.description || null,
                            prod.main_image || null,
                            prod.is_active !== undefined ? prod.is_active : true,
                            prod.created_by || null,
                            prod.category || null,
                            targetCategoryId,
                            prod.created_at || new Date().toISOString(),
                            prodUpdatedAt
                        ]);
                        targetId = res.rows[0].id;
                    } catch (fallbackErr) {
                        if (isMissingColumnError(fallbackErr)) {
                            logger.warn(`[NAS-Pull-Worker] make_products table missing category columns on TrueNAS (${fallbackErr.message}). Retrying insert with minimal product schema.`);
                            const res = await pgClient.query(baseInsertSql, [
                                targetId,
                                prod.product_code || `PROD-${targetId}`,
                                prod.product_name || '',
                                prod.description || null,
                                prod.main_image || null,
                                prod.is_active !== undefined ? prod.is_active : true,
                                prod.created_by || null,
                                prod.created_at || new Date().toISOString(),
                                prodUpdatedAt
                            ]);
                            targetId = res.rows[0].id;
                        } else {
                            throw fallbackErr;
                        }
                    }
                } else {
                    throw sqlErr;
                }
            }
        } else {
            // Allocate new target ID via sequence
            const fullInsertSeqSql = `
                INSERT INTO make_products (
                    product_code, product_name, description, main_image,
                    is_active, created_by, category, category_id,
                    cost_price, sale_price, max_discount_type, max_discount_value,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id;
            `;
            const fallbackInsertSeqSql = `
                INSERT INTO make_products (
                    product_code, product_name, description, main_image,
                    is_active, created_by, category, category_id,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id;
            `;
            const baseInsertSeqSql = `
                INSERT INTO make_products (
                    product_code, product_name, description, main_image,
                    is_active, created_by, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;

            try {
                const res = await pgClient.query(fullInsertSeqSql, [
                    prod.product_code || `PROD-NEW-${Date.now()}`,
                    prod.product_name || '',
                    prod.description || null,
                    prod.main_image || null,
                    prod.is_active !== undefined ? prod.is_active : true,
                    prod.created_by || null,
                    prod.category || null,
                    targetCategoryId,
                    prod.cost_price !== undefined ? prod.cost_price : 0,
                    prod.sale_price !== undefined ? prod.sale_price : 0,
                    prod.max_discount_type || 'percent',
                    prod.max_discount_value !== undefined ? prod.max_discount_value : 0,
                    prod.created_at || new Date().toISOString(),
                    prodUpdatedAt
                ]);
                targetId = res.rows[0].id;
            } catch (sqlErr) {
                if (isMissingColumnError(sqlErr)) {
                    logger.warn(`[NAS-Pull-Worker] make_products table missing pricing columns on TrueNAS (${sqlErr.message}). Retrying insert with base product columns.`);
                    try {
                        const res = await pgClient.query(fallbackInsertSeqSql, [
                            prod.product_code || `PROD-NEW-${Date.now()}`,
                            prod.product_name || '',
                            prod.description || null,
                            prod.main_image || null,
                            prod.is_active !== undefined ? prod.is_active : true,
                            prod.created_by || null,
                            prod.category || null,
                            targetCategoryId,
                            prod.created_at || new Date().toISOString(),
                            prodUpdatedAt
                        ]);
                        targetId = res.rows[0].id;
                    } catch (fallbackErr) {
                        if (isMissingColumnError(fallbackErr)) {
                            logger.warn(`[NAS-Pull-Worker] make_products table missing category columns on TrueNAS (${fallbackErr.message}). Retrying insert with minimal product schema.`);
                            const res = await pgClient.query(baseInsertSeqSql, [
                                prod.product_code || `PROD-NEW-${Date.now()}`,
                                prod.product_name || '',
                                prod.description || null,
                                prod.main_image || null,
                                prod.is_active !== undefined ? prod.is_active : true,
                                prod.created_by || null,
                                prod.created_at || new Date().toISOString(),
                                prodUpdatedAt
                            ]);
                            targetId = res.rows[0].id;
                        } else {
                            throw fallbackErr;
                        }
                    }
                } else {
                    throw sqlErr;
                }
            }
        }
    }

    await recordIdMapping(pgClient, 'make_products', sourceProdIdStr, targetId, prod.product_code);
    return { success: true, targetId };
}

/**
 * Idempotently applies a make_product_specifications record to TrueNAS PostgreSQL.
 * Resolves parent product reference to the true TrueNAS product ID.
 * Records source-to-target specification mapping and returns resolved target specification ID.
 */
async function upsertSpecificationRecord(pgClient, supabaseClient, sp, logger = console) {
    const sourceSpecIdStr = String(sp.id);

    if (sp.is_deleted === true || sp.deleted_at) {
        const targetSpecId = await getIdMapping(pgClient, 'make_product_specifications', sourceSpecIdStr);
        if (!targetSpecId) {
            logger.warn(`[NAS-Pull-Worker] Skipping soft-delete for specification ${sourceSpecIdStr}: no NAS ID mapping.`);
            return { deleted: false, skipped: true, reason: 'UNMAPPED_SOFT_DELETE' };
        }
        await pgClient.query('DELETE FROM make_product_colors WHERE spec_id = $1', [targetSpecId]);
        await pgClient.query('DELETE FROM make_product_specifications WHERE id = $1', [targetSpecId]);
        await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_product_specifications', sourceSpecIdStr]);
        return { deleted: true, targetId: targetSpecId };
    }

    // Ensure parent product exists on TrueNAS and resolve its target ID
    let targetProductId = null;
    if (sp.product_id) {
        try {
            targetProductId = await resolveTargetProductId(pgClient, supabaseClient, sp.product_id, logger);
        } catch (resolveErr) {
            throw new Error(`Missing parent product ${sp.product_id} for specification ${sp.id}`);
        }
        if (!targetProductId) {
            throw new Error(`Missing parent product ${sp.product_id} for specification ${sp.id}`);
        }
    }

    let targetSpecId = await getIdMapping(pgClient, 'make_product_specifications', sourceSpecIdStr);
    let isExistingOnTarget = false;

    if (!targetSpecId) {
        if (sp.spec_code) {
            const codeCheck = await pgClient.query(
                'SELECT id, product_id, spec_code, spec_name FROM make_product_specifications WHERE product_id = $1 AND spec_code = $2',
                [targetProductId, sp.spec_code]
            );
            if (codeCheck.rows && codeCheck.rows.length > 0) {
                targetSpecId = codeCheck.rows[0].id;
                isExistingOnTarget = true;
            }
        }
        if (!targetSpecId) {
            const idCheck = await pgClient.query(
                'SELECT id, product_id, spec_code, spec_name FROM make_product_specifications WHERE id = $1',
                [sp.id]
            );
            if (idCheck.rows && idCheck.rows.length > 0) {
                const existingRow = idCheck.rows[0];
                if (Number(existingRow.product_id) === Number(targetProductId) && (existingRow.spec_code === sp.spec_code || existingRow.spec_name === sp.spec_name)) {
                    targetSpecId = sp.id;
                    isExistingOnTarget = true;
                } else {
                    targetSpecId = null; // allocate new ID
                    isExistingOnTarget = false;
                }
            } else {
                targetSpecId = sp.id;
                isExistingOnTarget = false;
            }
        }
    } else {
        isExistingOnTarget = true;
    }

    const spUpdatedAt = sp.updated_at || sp.created_at || new Date().toISOString();

    if (isExistingOnTarget && targetSpecId) {
        await pgClient.query(`
            UPDATE make_product_specifications SET
                product_id = $1,
                spec_code = $2,
                spec_name = $3,
                spec_details = $4,
                is_active = $5,
                image_url = $6,
                updated_at = $7
            WHERE id = $8
        `, [
            targetProductId,
            sp.spec_code || null,
            sp.spec_name || '',
            sp.spec_details || null,
            sp.is_active !== undefined ? sp.is_active : true,
            sp.image_url || null,
            spUpdatedAt,
            targetSpecId
        ]);
    } else if (targetSpecId) {
        const res = await pgClient.query(`
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
                updated_at = EXCLUDED.updated_at
            RETURNING id;
        `, [
            targetSpecId,
            targetProductId,
            sp.spec_code || null,
            sp.spec_name || '',
            sp.spec_details || null,
            sp.is_active !== undefined ? sp.is_active : true,
            sp.image_url || null,
            sp.created_at || new Date().toISOString(),
            spUpdatedAt
        ]);
        targetSpecId = res.rows[0].id;
    } else {
        const res = await pgClient.query(`
            INSERT INTO make_product_specifications (
                product_id, spec_code, spec_name, spec_details, is_active, image_url, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `, [
            targetProductId,
            sp.spec_code || null,
            sp.spec_name || '',
            sp.spec_details || null,
            sp.is_active !== undefined ? sp.is_active : true,
            sp.image_url || null,
            sp.created_at || new Date().toISOString(),
            spUpdatedAt
        ]);
        targetSpecId = res.rows[0].id;
    }

    await recordIdMapping(pgClient, 'make_product_specifications', sourceSpecIdStr, targetSpecId, sp.spec_code || sp.spec_name);
    return { success: true, targetId: targetSpecId };
}

/**
 * Idempotently applies a make_product_colors record to TrueNAS PostgreSQL.
 * Resolves parent product and spec references to the true TrueNAS IDs.
 * Records source-to-target color mapping and returns resolved target color ID.
 */
async function upsertColorRecord(pgClient, supabaseClient, cl, logger = console) {
    const sourceColorIdStr = String(cl.id);

    if (cl.is_deleted === true || cl.deleted_at) {
        const targetColorId = await getIdMapping(pgClient, 'make_product_colors', sourceColorIdStr);
        if (!targetColorId) {
            logger.warn(`[NAS-Pull-Worker] Skipping soft-delete for color ${sourceColorIdStr}: no NAS ID mapping.`);
            return { deleted: false, skipped: true, reason: 'UNMAPPED_SOFT_DELETE' };
        }
        await pgClient.query('DELETE FROM make_product_colors WHERE id = $1', [targetColorId]);
        await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_product_colors', sourceColorIdStr]);
        return { deleted: true, targetId: targetColorId };
    }

    let targetProductId = null;
    if (cl.product_id) {
        try {
            targetProductId = await resolveTargetProductId(pgClient, supabaseClient, cl.product_id, logger);
        } catch (resolveErr) {
            throw new Error(`Missing parent product ${cl.product_id} for color ${cl.id}`);
        }
    }

    let targetSpecId = null;
    if (cl.spec_id) {
        try {
            targetSpecId = await resolveTargetSpecId(pgClient, supabaseClient, cl.spec_id, logger);
        } catch (resolveErr) {
            throw new Error(`Missing parent specification ${cl.spec_id} for color ${cl.id}`);
        }
    }

    let targetColorId = await getIdMapping(pgClient, 'make_product_colors', sourceColorIdStr);
    let isExistingOnTarget = false;

    if (!targetColorId) {
        if (cl.color_name) {
            const nameCheck = await pgClient.query(
                'SELECT id, product_id, spec_id, color_name FROM make_product_colors WHERE product_id = $1 AND color_name = $2',
                [targetProductId, cl.color_name]
            );
            if (nameCheck.rows && nameCheck.rows.length > 0) {
                targetColorId = nameCheck.rows[0].id;
                isExistingOnTarget = true;
                if (!targetSpecId && nameCheck.rows[0].spec_id) {
                    targetSpecId = nameCheck.rows[0].spec_id;
                }
            }
        }
        if (!targetColorId) {
            const idCheck = await pgClient.query(
                'SELECT id, product_id, spec_id, color_name FROM make_product_colors WHERE id = $1',
                [cl.id]
            );
            if (idCheck.rows && idCheck.rows.length > 0) {
                const existingRow = idCheck.rows[0];
                if (Number(existingRow.product_id) === Number(targetProductId) && existingRow.color_name === cl.color_name) {
                    targetColorId = cl.id;
                    isExistingOnTarget = true;
                    if (!targetSpecId && existingRow.spec_id) {
                        targetSpecId = existingRow.spec_id;
                    }
                } else {
                    targetColorId = null;
                    isExistingOnTarget = false;
                }
            } else {
                targetColorId = cl.id;
                isExistingOnTarget = false;
            }
        }
    } else {
        isExistingOnTarget = true;
    }

    const clUpdatedAt = cl.updated_at || cl.created_at || new Date().toISOString();

    if (isExistingOnTarget && targetColorId) {
        await pgClient.query(`
            UPDATE make_product_colors SET
                product_id = $1,
                spec_id = $2,
                color_name = $3,
                color_code = $4,
                is_active = $5,
                image_url = $6,
                updated_at = $7
            WHERE id = $8
        `, [
            targetProductId,
            targetSpecId,
            cl.color_name || '',
            cl.color_code || null,
            cl.is_active !== undefined ? cl.is_active : true,
            cl.image_url || null,
            clUpdatedAt,
            targetColorId
        ]);
    } else if (targetColorId) {
        const res = await pgClient.query(`
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
                updated_at = EXCLUDED.updated_at
            RETURNING id;
        `, [
            targetColorId,
            targetProductId,
            targetSpecId,
            cl.color_name || '',
            cl.color_code || null,
            cl.is_active !== undefined ? cl.is_active : true,
            cl.image_url || null,
            cl.created_at || new Date().toISOString(),
            clUpdatedAt
        ]);
        targetColorId = res.rows[0].id;
    } else {
        const res = await pgClient.query(`
            INSERT INTO make_product_colors (
                product_id, spec_id, color_name, color_code, is_active, image_url, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `, [
            targetProductId,
            targetSpecId,
            cl.color_name || '',
            cl.color_code || null,
            cl.is_active !== undefined ? cl.is_active : true,
            cl.image_url || null,
            cl.created_at || new Date().toISOString(),
            clUpdatedAt
        ]);
        targetColorId = res.rows[0].id;
    }

    await recordIdMapping(pgClient, 'make_product_colors', sourceColorIdStr, targetColorId, cl.color_name);
    return { success: true, targetId: targetColorId };
}

/**
 * Pulls committed business data from Supabase Cloud to TrueNAS PostgreSQL in strict dependency order:
 * 1. replication_tombstones (deletions / removals for make_orders, make_order_updates, make_products, make_product_specifications, make_product_colors)
 * 2. make_orders (parent orders with mutable field updates & soft deletions)
 * 3. make_order_updates (dependent stage updates with strict parent-before-child ordering)
 * 4. make_products (parent products with compound watermark, schema fallback, & category verification)
 * 5. make_product_specifications (product specifications with compound watermark & on-demand parent product resolution)
 * 6. make_product_colors (dependent product colors with strict parent spec/product ordering & mutable change detection)
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
    let orderItemsReplicated = 0;
    let updatesReplicated = 0;
    let productsReplicated = 0;
    let specsReplicated = 0;
    let colorsReplicated = 0;
    let tombstonesReplicated = 0;
    const streamErrors = new Map();
    const batchSize = options.batchSize || 100;

    const ALLOWED_TOMBSTONE_TABLES = new Set([
        'make_orders',
        'make_order_items',
        'make_order_updates',
        'make_products',
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
                        // Anti-Forgery Check:
                        // Query authoritative Supabase Cloud. If the row still exists in Supabase,
                        // this tombstone is forged, stale, or premature. It MUST NOT delete the TrueNAS replica row.
                        const { data: sourceRow, error: sourceErr } = await supabaseClient
                            .from(targetTable)
                            .select('id')
                            .eq('id', targetId)
                            .maybeSingle();

                        if (sourceErr) {
                            // Fail closed: an inability to confirm authoritative source state
                            // must never be interpreted as proof that the row was deleted.
                            throw new Error(`Unable to validate tombstone for ${targetTable} ID ${targetId}: ${sourceErr.message || 'unknown Supabase query error'}`);
                        }

                        if (sourceRow && String(sourceRow.id) === String(targetId)) {
                            // Ignore a forged/stale tombstone but advance its cursor so one
                            // invalid row cannot block all later legitimate tombstones.
                            const reason = `FORGED_TOMBSTONE_REJECTED: ${targetTable} ID ${targetId} still exists in Supabase`;
                            logger.error(`[SECURITY ALERT] ${reason}. Skipping deletion on TrueNAS.`);
                            streamErrors.set('replication_tombstones', reason);
                            const tombAt = tomb.deleted_at || tomb.created_at || new Date().toISOString();
                            await updateCheckpoint(pgClient, 'replication_tombstones', String(tomb.id), tombAt, 1, reason);
                            tombstonesReplicated++;
                            totalReplicated++;
                            continue;
                        }

                        // A cloud numeric ID is not a safe NAS ID: the databases allocate
                        // IDs independently. Tombstones have no source row to reconcile by
                        // natural key, so destructive operations require a persisted map.
                        let resolvedTargetId = targetId;
                        const mappedEntityTables = ['make_products', 'make_product_specifications', 'make_product_colors', 'make_product_categories', 'make_orders', 'make_order_items', 'make_order_updates'];
                        if (mappedEntityTables.includes(targetTable)) {
                            const mapped = await getIdMapping(pgClient, targetTable, String(targetId));
                            if (!mapped) {
                                const reason = `UNMAPPED_TOMBSTONE_SKIPPED: ${targetTable} source ID ${targetId} has no NAS ID mapping`;
                                logger.warn(`[NAS-Pull-Worker] ${reason}; preserving NAS rows.`);
                                streamErrors.set('replication_tombstones', reason);
                                const tombAt = tomb.deleted_at || tomb.created_at || new Date().toISOString();
                                await updateCheckpoint(pgClient, 'replication_tombstones', String(tomb.id), tombAt, 1, reason);
                                tombstonesReplicated++;
                                totalReplicated++;
                                continue;
                            }
                            resolvedTargetId = mapped;
                        }

                        // Foreign-key safe deletion in parent-before-child order
                        if (targetTable === 'make_orders') {
                            await pgClient.query('DELETE FROM make_order_items WHERE order_id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM make_order_updates WHERE order_id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM make_orders WHERE id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_orders', String(targetId)]);
                        } else if (targetTable === 'make_order_items') {
                            await pgClient.query('DELETE FROM make_order_items WHERE id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_order_items', String(targetId)]);
                        } else if (targetTable === 'make_products') {
                            await pgClient.query('DELETE FROM make_product_colors WHERE product_id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM make_product_specifications WHERE product_id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM make_products WHERE id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_products', String(targetId)]);
                        } else if (targetTable === 'make_product_specifications') {
                            await pgClient.query('DELETE FROM make_product_colors WHERE spec_id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM make_product_specifications WHERE id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_product_specifications', String(targetId)]);
                        } else if (targetTable === 'make_product_colors') {
                            await pgClient.query('DELETE FROM make_product_colors WHERE id = $1', [resolvedTargetId]);
                            await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_product_colors', String(targetId)]);
                        } else {
                            await pgClient.query(`DELETE FROM ${targetTable} WHERE id = $1`, [resolvedTargetId]);
                        }
                        logger.log(`[NAS-Pull-Worker] Processed verified tombstone: deleted ${targetTable} source ID ${targetId} (target ID ${resolvedTargetId})`);
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
                    // Propagate soft-deletions safely via ID mapping
                    if (ord.is_deleted === true || ord.status === 'deleted' || ord.deleted_at) {
                        const targetId = await getIdMapping(pgClient, 'make_orders', ordId);
                        if (!targetId) {
                            logger.warn(`[NAS-Pull-Worker] Skipping soft-delete for order ${ordId}: no NAS ID mapping.`);
                            await updateCheckpoint(pgClient, 'make_orders', ordId, ordUpdatedAt, 1, 'UNMAPPED_SOFT_DELETE');
                            ordersReplicated++;
                            totalReplicated++;
                            continue;
                        }
                        await pgClient.query('DELETE FROM make_order_items WHERE order_id = $1', [targetId]);
                        await pgClient.query('DELETE FROM make_order_updates WHERE order_id = $1', [targetId]);
                        await pgClient.query('DELETE FROM make_orders WHERE id = $1', [targetId]);
                        await pgClient.query('DELETE FROM nas_replication_id_map WHERE entity_type = $1 AND source_id = $2', ['make_orders', ordId]);
                        await updateCheckpoint(pgClient, 'make_orders', ordId, ordUpdatedAt, 1, null);
                        ordersReplicated++;
                        totalReplicated++;
                        continue;
                    }

                    await upsertOrderRecord(pgClient, supabaseClient, ord, logger);

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

    // ── 2b. Pull Child Line Items (make_order_items) ─────────────────────────
    try {
        let hasMoreItems = true;
        let itemPages = 0;
        const maxItemPages = 1000;

        while (hasMoreItems && itemPages < maxItemPages) {
            itemPages++;
            const itemCp = await getCheckpoint(pgClient, 'make_order_items');
            let itemQuery = supabaseClient
                .from('make_order_items')
                .select('*');

            if (itemCp.last_replicated_at) {
                if (itemCp.last_replicated_id) {
                    itemQuery = itemQuery.or(`created_at.gt.${itemCp.last_replicated_at},and(created_at.eq.${itemCp.last_replicated_at},id.gt.${itemCp.last_replicated_id})`);
                } else {
                    itemQuery = itemQuery.gt('created_at', itemCp.last_replicated_at);
                }
            } else if (itemCp.last_replicated_id) {
                itemQuery = itemQuery.gt('id', itemCp.last_replicated_id);
            }

            itemQuery = itemQuery
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            const { data: newItems, error: itemErr } = await itemQuery;
            if (itemErr) {
                logger.error('[NAS-Pull-Worker] Error querying make_order_items from Supabase:', itemErr.message);
                streamErrors.set('make_order_items', itemErr.message);
                await updateCheckpoint(pgClient, 'make_order_items', null, null, 0, itemErr.message);
                break;
            }

            if (!newItems || newItems.length === 0) {
                hasMoreItems = false;
                break;
            }

            for (const itm of newItems) {
                const itmId = String(itm.id);
                const itmCreatedAt = itm.created_at || new Date().toISOString();

                try {
                    // Resolve parent order ID via mapping
                    const targetOrderId = await resolveTargetOrderId(pgClient, supabaseClient, itm.order_id, logger);
                    if (!targetOrderId) {
                        logger.warn(`[NAS-Pull-Worker] Missing parent order ${itm.order_id} for order item ${itm.id}. Halting item stream.`);
                        throw new Error(`Missing parent order ${itm.order_id} for item ${itm.id}`);
                    }

                    // Resolve related product, spec, color if present
                    const targetProdId = itm.product_id ? await getIdMapping(pgClient, 'make_products', String(itm.product_id)) : null;
                    const targetSpecId = itm.spec_id ? await getIdMapping(pgClient, 'make_product_specifications', String(itm.spec_id)) : null;
                    const targetColorId = itm.color_id ? await getIdMapping(pgClient, 'make_product_colors', String(itm.color_id)) : null;

                    let targetItemId = await getIdMapping(pgClient, 'make_order_items', itmId);
                    if (!targetItemId) {
                        const exCheck = await pgClient.query('SELECT id, order_id FROM make_order_items WHERE id = $1', [itm.id]);
                        if (exCheck.rows && exCheck.rows.length > 0) {
                            if (exCheck.rows[0].order_id === targetOrderId) {
                                targetItemId = itm.id;
                            } else {
                                targetItemId = null;
                            }
                        } else {
                            targetItemId = itm.id;
                        }
                    }

                    if (targetItemId) {
                        await pgClient.query(`
                            INSERT INTO make_order_items (
                                id, order_id, product_id, spec_id, color_id, product_name, spec_name,
                                size_label, color_name, quantity, item_cost_price, item_sale_price,
                                is_customized, custom_dimensions, technical_drawing_url, created_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                            ON CONFLICT (id) DO UPDATE SET
                                order_id = EXCLUDED.order_id,
                                product_id = EXCLUDED.product_id,
                                spec_id = EXCLUDED.spec_id,
                                color_id = EXCLUDED.color_id,
                                product_name = EXCLUDED.product_name,
                                spec_name = EXCLUDED.spec_name,
                                size_label = EXCLUDED.size_label,
                                color_name = EXCLUDED.color_name,
                                quantity = EXCLUDED.quantity,
                                item_cost_price = EXCLUDED.item_cost_price,
                                item_sale_price = EXCLUDED.item_sale_price,
                                is_customized = EXCLUDED.is_customized,
                                custom_dimensions = EXCLUDED.custom_dimensions,
                                technical_drawing_url = EXCLUDED.technical_drawing_url;
                        `, [
                            targetItemId,
                            targetOrderId,
                            targetProdId || itm.product_id || null,
                            targetSpecId || itm.spec_id || null,
                            targetColorId || itm.color_id || null,
                            itm.product_name || '',
                            itm.spec_name || '',
                            itm.size_label || itm.dimensions_text || '',
                            itm.color_name || '',
                            itm.quantity || 1,
                            itm.item_cost_price || 0,
                            itm.item_sale_price || null,
                            itm.is_customized || false,
                            itm.custom_dimensions || null,
                            itm.technical_drawing_url || null,
                            itmCreatedAt
                        ]);
                    } else {
                        const insRes = await pgClient.query(`
                            INSERT INTO make_order_items (
                                order_id, product_id, spec_id, color_id, product_name, spec_name,
                                size_label, color_name, quantity, item_cost_price, item_sale_price,
                                is_customized, custom_dimensions, technical_drawing_url, created_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                            RETURNING id;
                        `, [
                            targetOrderId,
                            targetProdId || itm.product_id || null,
                            targetSpecId || itm.spec_id || null,
                            targetColorId || itm.color_id || null,
                            itm.product_name || '',
                            itm.spec_name || '',
                            itm.size_label || itm.dimensions_text || '',
                            itm.color_name || '',
                            itm.quantity || 1,
                            itm.item_cost_price || 0,
                            itm.item_sale_price || null,
                            itm.is_customized || false,
                            itm.custom_dimensions || null,
                            itm.technical_drawing_url || null,
                            itmCreatedAt
                        ]);
                        targetItemId = insRes.rows[0].id;
                    }

                    await recordIdMapping(pgClient, 'make_order_items', itmId, targetItemId);
                    await updateCheckpoint(pgClient, 'make_order_items', itmId, itmCreatedAt, 1, null);
                    orderItemsReplicated++;
                    totalReplicated++;
                } catch (itmRowErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to replicate order item ${itm.id}:`, itmRowErr.message);
                    streamErrors.set('make_order_items', itmRowErr.message);
                    await updateCheckpoint(pgClient, 'make_order_items', null, null, 0, itmRowErr.message).catch(() => {});
                    throw itmRowErr;
                }
            }

            if (newItems.length < batchSize) {
                hasMoreItems = false;
            }
        }
        if (orderItemsReplicated > 0) {
            logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${orderItemsReplicated} order line items.`);
        }
    } catch (itemEx) {
        logger.error('[NAS-Pull-Worker] Order item stream exception:', itemEx.message);
        streamErrors.set('make_order_items', itemEx.message);
        try {
            await updateCheckpoint(pgClient, 'make_order_items', null, null, 0, itemEx.message);
        } catch {}
        if (options.throwOnError !== false) {
            throw itemEx;
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
                    // Strict parent-before-child ordering: resolve parent order via ID map / upsert
                    const targetOrderId = await resolveTargetOrderId(pgClient, supabaseClient, upd.order_id, logger);
                    if (!targetOrderId) {
                        logger.warn(`[NAS-Pull-Worker] Missing parent order ${upd.order_id} for update ${upd.id}. Halting update stream.`);
                        throw new Error(`Missing parent order ${upd.order_id} for update ${upd.id}`);
                    }

                    const updateValues = [
                        targetOrderId,
                        upd.stage || upd.status || 'In Progress',
                        upd.note || upd.notes || null,
                        upd.photo_url || null,
                        upd.photo_urls || [],
                        upd.actor_name || null,
                        upd.actor_role || null,
                        updCreatedAt
                    ];
                    let targetUpdateId = await getIdMapping(pgClient, 'make_order_updates', updId);

                    if (!targetUpdateId) {
                        // Reuse a same-numbered target row only when its complete business
                        // identity matches. Otherwise allocate a NAS ID; source and target
                        // sequences are independent and numeric collisions are possible.
                        const existing = await pgClient.query(
                            'SELECT id, order_id, stage, note, photo_url, photo_urls, actor_name, actor_role, created_at FROM make_order_updates WHERE id = $1',
                            [upd.id]
                        );
                        const row = existing.rows && existing.rows[0];
                        const sameIdentity = row &&
                            String(row.order_id) === String(targetOrderId) &&
                            String(row.stage || '') === String(updateValues[1] || '') &&
                            String(row.note || '') === String(updateValues[2] || '') &&
                            String(row.photo_url || '') === String(updateValues[3] || '') &&
                            JSON.stringify(row.photo_urls || []) === JSON.stringify(updateValues[4] || []) &&
                            String(row.actor_name || '') === String(updateValues[5] || '') &&
                            String(row.actor_role || '') === String(updateValues[6] || '') &&
                            new Date(row.created_at).getTime() === new Date(updCreatedAt).getTime();

                        if (sameIdentity) {
                            targetUpdateId = Number(row.id);
                        } else if (!row) {
                            targetUpdateId = Number(upd.id);
                        } else {
                            const inserted = await pgClient.query(
                                `INSERT INTO make_order_updates (
                                    order_id, stage, note, photo_url, photo_urls, actor_name, actor_role, created_at
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                                updateValues
                            );
                            targetUpdateId = Number(inserted.rows?.[0]?.id);
                        }
                    }

                    if (!targetUpdateId) {
                        throw new Error(`Could not allocate a NAS ID for order update ${upd.id}`);
                    }

                    const upsertUpdateSql = `
                        INSERT INTO make_order_updates (
                            id, order_id, stage, note, photo_url, photo_urls, actor_name, actor_role, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (id) DO UPDATE SET
                            order_id = EXCLUDED.order_id,
                            stage = EXCLUDED.stage,
                            note = EXCLUDED.note,
                            photo_url = EXCLUDED.photo_url,
                            photo_urls = EXCLUDED.photo_urls,
                            actor_name = EXCLUDED.actor_name,
                            actor_role = EXCLUDED.actor_role;
                    `;
                    await pgClient.query(upsertUpdateSql, [targetUpdateId, ...updateValues]);

                    await recordIdMapping(pgClient, 'make_order_updates', updId, targetUpdateId, `${targetOrderId}:${updCreatedAt}`);

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

    // ── 4. Pull Products (make_products) with Compound Watermark ──────────────
    try {
        let hasMoreProducts = true;
        let productPages = 0;
        const maxProductPages = 1000;

        while (hasMoreProducts && productPages < maxProductPages) {
            productPages++;
            const prodCp = await getCheckpoint(pgClient, 'make_products');
            let prodQuery = supabaseClient
                .from('make_products')
                .select('*');

            if (prodCp.last_replicated_at) {
                if (prodCp.last_replicated_id) {
                    prodQuery = prodQuery.or(`updated_at.gt.${prodCp.last_replicated_at},and(updated_at.eq.${prodCp.last_replicated_at},id.gt.${prodCp.last_replicated_id})`);
                } else {
                    prodQuery = prodQuery.gt('updated_at', prodCp.last_replicated_at);
                }
            } else if (prodCp.last_replicated_id) {
                prodQuery = prodQuery.gt('id', prodCp.last_replicated_id);
            }

            prodQuery = prodQuery
                .order('updated_at', { ascending: true })
                .order('id', { ascending: true })
                .limit(batchSize);

            let { data: newProducts, error: prodErr } = await prodQuery;

            // Fallback for legacy environments where updated_at column has not yet been migrated
            if (prodErr && isMissingColumnError(prodErr)) {
                logger.warn('[NAS-Pull-Worker] make_products lacks updated_at in Supabase; falling back to id ordering.');
                let fallbackQuery = supabaseClient
                    .from('make_products')
                    .select('*');
                if (prodCp.last_replicated_id) {
                    fallbackQuery = fallbackQuery.gt('id', prodCp.last_replicated_id);
                }
                fallbackQuery = fallbackQuery.order('id', { ascending: true }).limit(batchSize);
                const fallbackRes = await fallbackQuery;
                newProducts = fallbackRes.data;
                prodErr = fallbackRes.error;
            }

            if (prodErr) {
                logger.error('[NAS-Pull-Worker] Error querying make_products from Supabase:', prodErr.message);
                streamErrors.set('make_products', prodErr.message);
                await updateCheckpoint(pgClient, 'make_products', null, null, 0, prodErr.message);
                break;
            }

            if (!newProducts || newProducts.length === 0) {
                hasMoreProducts = false;
                break;
            }

            for (const prod of newProducts) {
                const prodId = String(prod.id);
                const prodUpdatedAt = prod.updated_at || prod.created_at || new Date().toISOString();

                try {
                    await upsertProductRecord(pgClient, supabaseClient, prod, logger);
                    await updateCheckpoint(pgClient, 'make_products', prodId, prodUpdatedAt, 1, null);
                    productsReplicated++;
                    totalReplicated++;
                } catch (prodRowErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to replicate product ${prod.id}:`, prodRowErr.message);
                    streamErrors.set('make_products', prodRowErr.message);
                    await updateCheckpoint(pgClient, 'make_products', null, null, 0, prodRowErr.message);
                    hasMoreProducts = false;
                    break;
                }
            }

            if (newProducts.length < batchSize) {
                hasMoreProducts = false;
            }
        }
        if (productsReplicated > 0) {
            logger.log(`[NAS-Pull-Worker] Successfully pulled and applied ${productsReplicated} products.`);
        }
    } catch (productEx) {
        logger.error('[NAS-Pull-Worker] Product stream exception:', productEx.message);
        streamErrors.set('make_products', productEx.message);
        try {
            await updateCheckpoint(pgClient, 'make_products', null, null, 0, productEx.message);
        } catch {}
    }

    // ── 5. Pull Product Specifications (make_product_specifications) ───────────
    if (!streamErrors.has('make_products')) {
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
                if (specErr && isMissingColumnError(specErr)) {
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
                        await upsertSpecificationRecord(pgClient, supabaseClient, sp, logger);
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
    } else {
        logger.warn('[NAS-Pull-Worker] Skipping specification replication because parent products stream encountered errors.');
    }

    // ── 6. Pull Product Colors (make_product_colors) ───────────────────────────
    // Strict parent-before-child ordering: If products or specs failed, skip colors to prevent orphan foreign key errors
    if (!streamErrors.has('make_product_specifications') && !streamErrors.has('make_products')) {
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
                if (colorErr && isMissingColumnError(colorErr)) {
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
                        await upsertColorRecord(pgClient, supabaseClient, cl, logger);
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
        logger.warn('[NAS-Pull-Worker] Skipping color replication because parent specifications or products stream encountered errors.');
    }

    return {
        success: streamErrors.size === 0,
        totalReplicated,
        ordersReplicated,
        updatesReplicated,
        productsReplicated,
        specsReplicated,
        colorsReplicated,
        tombstonesReplicated,
        errors: streamErrors.size > 0 ? Object.fromEntries(streamErrors) : undefined
    };
}


/**
 * Discovers and paginates image/file references from a database table.
 * Supports durable resumable pagination cursor (discovery_<table_name>) and handles
 * page caps truthfully without permanent starvation. Query variants allow compatibility
 * with hosted schemas that have not yet received every optional attachment column.
 */
async function discoverFromTable(client, config, fileTasks, logger, bucketName, pgClient) {
    const { table, select, filterFn, queryVariants: configuredQueryVariants, batchSize = 50, extractUrls, maxPages } = config;
    const queryVariants = Array.isArray(configuredQueryVariants) && configuredQueryVariants.length > 0
        ? configuredQueryVariants
        : [{ select, filterFn }];
    const cacheKey = `discovery:${table}`;
    let cachedState = schemaCapabilityCache.get(cacheKey);

    // If memory cache is empty, check durable PostgreSQL checkpoint to survive container/process restarts
    if ((!cachedState || typeof cachedState.variantIndex !== 'number') && pgClient) {
        try {
            const dbCap = await getCheckpoint(pgClient, `schema_capability_${table}`);
            if (dbCap && dbCap.last_replicated_id !== null && dbCap.last_replicated_id !== undefined) {
                const savedIdx = Number(dbCap.last_replicated_id);
                if (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < queryVariants.length) {
                    cachedState = { variantIndex: savedIdx, persistedIdx: savedIdx };
                    schemaCapabilityCache.set(cacheKey, cachedState);
                }
            }
        } catch (dbCapErr) {
            // Silently ignore checkpoint read errors
        }
    }

    let queryVariantIndex = (cachedState && typeof cachedState.variantIndex === 'number' && cachedState.variantIndex < queryVariants.length)
        ? cachedState.variantIndex
        : 0;
    let lastId = 0;
    const checkpointKey = `discovery_${table}`;

    if (pgClient) {
        try {
            const cp = await getCheckpoint(pgClient, checkpointKey);
            if (cp && cp.last_replicated_id) {
                const parsedId = Number(cp.last_replicated_id);
                if (!isNaN(parsedId) && parsedId > 0) {
                    lastId = parsedId;
                }
            }
        } catch (cpErr) {
            logger.warn(`[NAS-Pull-Worker] Failed to load discovery checkpoint for ${table}:`, cpErr.message);
        }
    }

    let hasMore = true;
    let pages = 0;
    const effectiveMaxPages = (typeof maxPages === 'number' && maxPages > 0) ? maxPages : 1000;

    while (hasMore && pages < effectiveMaxPages) {
        pages++;
        let queryResult = null;

        // Retry only schema-column errors with an explicit compatible projection.
        // Do not turn network/auth/RLS failures into apparent empty results.
        while (queryVariantIndex < queryVariants.length) {
            const variant = queryVariants[queryVariantIndex];
            let q = client.from(table).select(variant.select || select);
            const variantFilterFn = Object.prototype.hasOwnProperty.call(variant, 'filterFn')
                ? variant.filterFn
                : filterFn;
            if (variantFilterFn) {
                q = variantFilterFn(q);
            }
            if (lastId > 0) {
                q = q.gt('id', lastId);
            }
            q = q.order('id', { ascending: true }).limit(batchSize);

            queryResult = await q;

            // Handle genuine missing column error: log once per variant, advance, and cache
            if (queryResult.error &&
                isMissingColumnError(queryResult.error) &&
                queryVariantIndex < queryVariants.length - 1) {
                const currentState = schemaCapabilityCache.get(cacheKey) || {};
                if (currentState.lastLoggedVariantIndex !== queryVariantIndex) {
                    logger.warn(
                        `[NAS-Pull-Worker] Source schema mismatch on ${table} using "${variant.select || select}": ${queryResult.error.message}. Retrying with a compatible column set.`
                    );
                    currentState.lastLoggedVariantIndex = queryVariantIndex;
                }
                queryVariantIndex++;
                currentState.variantIndex = queryVariantIndex;
                schemaCapabilityCache.set(cacheKey, currentState);
                continue;
            }

            // On success (no error and data returned as array/object): cache and persist
            if (!queryResult.error && queryResult.data !== undefined && queryResult.data !== null) {
                const currentState = schemaCapabilityCache.get(cacheKey) || {};
                currentState.variantIndex = queryVariantIndex;
                schemaCapabilityCache.set(cacheKey, currentState);

                if (pgClient && currentState.persistedIdx !== queryVariantIndex) {
                    currentState.persistedIdx = queryVariantIndex;
                    await updateCheckpoint(
                        pgClient,
                        `schema_capability_${table}`,
                        String(queryVariantIndex),
                        new Date().toISOString(),
                        queryVariantIndex,
                        null
                    ).catch(() => {});
                }
            } else if (queryResult.error && isMissingColumnError(queryResult.error)) {
                // All fallback variants exhausted or unrecoverable schema mismatch
                schemaCapabilityCache.delete(cacheKey);
                if (pgClient) {
                    await updateCheckpoint(pgClient, `schema_capability_${table}`, null, new Date().toISOString(), 0, queryResult.error.message).catch(() => {});
                }
            }
            break;
        }

        const data = queryResult?.data;
        const error = queryResult?.error;
        if (error) {
            logger.error(`[NAS-Pull-Worker] Attachment discovery query failed on ${table}:`, error.message);
            if (pgClient) {
                await updateCheckpoint(pgClient, checkpointKey, lastId > 0 ? String(lastId) : null, new Date().toISOString(), 0, error.message).catch(() => {});
            }
            return { success: false, error: error.message };
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

    if (hasMore && pages >= effectiveMaxPages) {
        logger.warn(`[NAS-Pull-Worker] Discovery pagination cap reached on ${table} (${pages} pages processed, lastId: ${lastId}). Saving checkpoint to resume next cycle.`);
        if (pgClient) {
            try {
                await updateCheckpoint(pgClient, checkpointKey, String(lastId), new Date().toISOString(), pages, 'PAGINATION_CAP_REACHED');
            } catch (upErr) {
                logger.error(`[NAS-Pull-Worker] Failed to save discovery checkpoint for ${table}:`, upErr.message);
            }
        }
        return {
            success: false,
            partial: true,
            reachedCap: true,
            lastId,
            hasMore: true,
            error: `PAGINATION_CAP_REACHED on ${table} at ID ${lastId}`
        };
    }

    // Exhausted all records in this table: reset checkpoint to 0 so future cycles
    // sweep from the beginning and detect changed references on already-seen rows.
    if (!hasMore && pgClient) {
        try {
            await updateCheckpoint(pgClient, checkpointKey, '0', new Date().toISOString(), 0, null);
        } catch (resetErr) {
            logger.error(`[NAS-Pull-Worker] Failed to reset discovery checkpoint for ${table}:`, resetErr.message);
            return {
                success: false,
                lastId,
                error: `DISCOVERY_CHECKPOINT_RESET_FAILED for ${table}: ${resetErr.message}`
            };
        }
    }

    return { success: true, lastId };
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
    const urlOpts = {
        supabaseUrl: supabaseClient?.supabaseUrl,
        expectedOrigin: options.expectedOrigin
    };
    let filesPulled = 0;
    const failedFiles = [];
    const discoveryErrors = [];

    // Discovered file tasks: Map<objectKey, { subfolder, name, reservationId?, entityType?, entityId?, expectedSha256?, cloudSize?, cloudUpdatedAt? }>
    const fileTasks = new Map();

    // ── Source A: Discover files from committed make_orders (paginated) ───────
    try {
        const resA = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_orders',
                queryVariants: [
                    {
                        select: 'id, invoice_attachment_urls, current_stage_photo, updated_at',
                        filterFn: q => q.or('invoice_attachment_urls.neq.{},current_stage_photo.not.is.null')
                    },
                    {
                        select: 'id, invoice_attachment_urls, updated_at',
                        filterFn: q => q.neq('invoice_attachment_urls', '{}')
                    },
                    {
                        select: 'id, invoice_attachment_urls, created_at',
                        filterFn: q => q.neq('invoice_attachment_urls', '{}')
                    },
                    {
                        select: 'id, invoice_attachment_urls, current_stage_photo, created_at',
                        filterFn: q => q.or('invoice_attachment_urls.neq.{},current_stage_photo.not.is.null')
                    }
                ],
                batchSize,
                maxPages: options.maxDiscoveryPages,
                extractUrls: (ord, tasks, bucket) => {
                    if (Array.isArray(ord.invoice_attachment_urls)) {
                        for (const rawUrl of ord.invoice_attachment_urls) {
                            const cleanKey = normalizeStorageObjectKey(rawUrl, bucket, urlOpts);
                            if (cleanKey && !tasks.has(cleanKey)) {
                                tasks.set(cleanKey, {
                                    subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'cad',
                                    name: path.basename(cleanKey),
                                    entityType: 'make_orders',
                                    entityId: String(ord.id),
                                    cloudUpdatedAt: ord.updated_at
                                });
                            }
                        }
                    }
                    if (ord.current_stage_photo) {
                        const cleanKey = normalizeStorageObjectKey(ord.current_stage_photo, bucket, urlOpts);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                name: path.basename(cleanKey),
                                entityType: 'make_orders',
                                entityId: String(ord.id),
                                cloudUpdatedAt: ord.updated_at
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName,
            pgClient
        );
        if (resA && (!resA.success || resA.error)) {
            discoveryErrors.push({ source: 'make_orders', error: resA.error, partial: resA.partial, reachedCap: resA.reachedCap });
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
                queryVariants: [
                    { select: 'id, photo_url, photo_urls, updated_at, created_at' },
                    { select: 'id, photo_url, photo_urls, created_at' }
                ],
                batchSize,
                maxPages: options.maxDiscoveryPages,
                extractUrls: (upd, tasks, bucket) => {
                    const updateTime = upd.updated_at || upd.created_at;
                    if (upd.photo_url) {
                        const cleanKey = normalizeStorageObjectKey(upd.photo_url, bucket, urlOpts);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                name: path.basename(cleanKey),
                                entityType: 'make_order_updates',
                                entityId: String(upd.id),
                                cloudUpdatedAt: updateTime
                            });
                        }
                    }
                    if (Array.isArray(upd.photo_urls)) {
                        for (const rawUrl of upd.photo_urls) {
                            const cleanKey = normalizeStorageObjectKey(rawUrl, bucket, urlOpts);
                            if (cleanKey && !tasks.has(cleanKey)) {
                                tasks.set(cleanKey, {
                                    subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                    name: path.basename(cleanKey),
                                    entityType: 'make_order_updates',
                                    entityId: String(upd.id),
                                    cloudUpdatedAt: updateTime
                                });
                            }
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName,
            pgClient
        );
        if (resB && (!resB.success || resB.error)) {
            discoveryErrors.push({ source: 'make_order_updates', error: resB.error, partial: resB.partial, reachedCap: resB.reachedCap });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from make_order_updates attachments failed:', e.message);
        discoveryErrors.push({ source: 'make_order_updates', error: e.message });
    }

    // ── Source C: Discover committed buffer reservations (supabase_buffer_reservations)
    // A committed quota reservation does not itself identify a Storage object: the
    // reservation table has no authoritative object-key column. Never infer ownership
    // merely from a shared folder. A reservation may be attached to a file only when
    // exactly one listed object explicitly identifies it by a bounded filename prefix
    // (reservationId, reservationId_..., reservationId....) or trusted object metadata.
    // If listing was incomplete or multiple objects match, the objects remain pullable
    // but are deliberately marked non-prunable.
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
                const reservationId = String(res.id || '').trim();
                if (!reservationId) {
                    logger.warn('[NAS-Pull-Worker] Skipping buffer reservation without a valid ID.');
                    continue;
                }

                const foldersToCheck = res.target_folder ? [String(res.target_folder)] : ['cad', 'products', 'specs', 'colors'];
                const reservationObjects = [];
                let scanIncomplete = false;

                for (const subfolder of foldersToCheck) {
                    const { data: files, error: listErr } = await supabaseClient.storage
                        .from(bucketName)
                        .list(subfolder, { limit: 100 });

                    if (listErr) {
                        scanIncomplete = true;
                        logger.warn(`[NAS-Pull-Worker] Storage list failed for ${subfolder}:`, listErr.message);
                        discoveryErrors.push({ source: `storage_list_${subfolder}`, error: listErr.message });
                        continue;
                    }

                    for (const fileObj of files || []) {
                        const fileName = String(fileObj.name || '');
                        const metadataReservationId = fileObj.user_metadata?.reservation_id
                            ?? fileObj.metadata?.reservation_id
                            ?? fileObj.metadata?.reservationId;
                        const hasBoundedReservationPrefix = fileName === reservationId
                            || fileName.startsWith(`${reservationId}_`)
                            || fileName.startsWith(`${reservationId}.`);

                        if (String(metadataReservationId ?? '') !== reservationId && !hasBoundedReservationPrefix) {
                            continue;
                        }

                        reservationObjects.push({
                            subfolder,
                            fileObj,
                            cloudPath: `${subfolder}/${fileName}`
                        });
                    }
                }

                if (reservationObjects.length > 1) {
                    logger.warn(
                        `[NAS-Pull-Worker] Reservation ${reservationId} matched ${reservationObjects.length} Storage objects; all matching objects are retained in cloud because the reservation-to-object mapping is ambiguous.`
                    );
                }

                const canSafelyPrune = !scanIncomplete && reservationObjects.length === 1;
                for (const { subfolder, fileObj, cloudPath } of reservationObjects) {
                    if (fileTasks.has(cloudPath)) {
                        // An order/catalog discovery already owns this object. Preserve that
                        // authoritative entity association and never reclassify it as temporary.
                        continue;
                    }

                    fileTasks.set(cloudPath, {
                        subfolder,
                        name: fileObj.name,
                        reservationId: canSafelyPrune ? reservationId : null,
                        entityType: canSafelyPrune ? 'buffer_reservation' : 'buffer_reservation_unverified',
                        entityId: reservationId,
                        cloudSize: fileObj.metadata?.size,
                        cloudUpdatedAt: fileObj.updated_at
                    });
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
                select: 'id, image_url, updated_at, created_at',
                filterFn: q => q.not('image_url', 'is', null),
                batchSize,
                maxPages: options.maxDiscoveryPages,
                extractUrls: (sp, tasks, bucket) => {
                    if (sp.image_url) {
                        const cleanKey = normalizeStorageObjectKey(sp.image_url, bucket, urlOpts);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'specs',
                                name: path.basename(cleanKey),
                                entityType: 'make_product_specifications',
                                entityId: String(sp.id),
                                cloudUpdatedAt: sp.updated_at || sp.created_at
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName,
            pgClient
        );
        if (resD && (!resD.success || resD.error)) {
            discoveryErrors.push({ source: 'make_product_specifications', error: resD.error, partial: resD.partial, reachedCap: resD.reachedCap });
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
                select: 'id, image_url, updated_at, created_at',
                filterFn: q => q.not('image_url', 'is', null),
                batchSize,
                maxPages: options.maxDiscoveryPages,
                extractUrls: (cl, tasks, bucket) => {
                    if (cl.image_url) {
                        const cleanKey = normalizeStorageObjectKey(cl.image_url, bucket, urlOpts);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'colors',
                                name: path.basename(cleanKey),
                                entityType: 'make_product_colors',
                                entityId: String(cl.id),
                                cloudUpdatedAt: cl.updated_at || cl.created_at
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName,
            pgClient
        );
        if (resE && (!resE.success || resE.error)) {
            discoveryErrors.push({ source: 'make_product_colors', error: resE.error, partial: resE.partial, reachedCap: resE.reachedCap });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from colors images failed:', e.message);
        discoveryErrors.push({ source: 'make_product_colors', error: e.message });
    }

    // ── Source F: Discover product catalog images (make_products, paginated) ─
    try {
        const resF = await discoverFromTable(
            supabaseClient,
            {
                table: 'make_products',
                select: 'id, main_image, updated_at, created_at',
                filterFn: q => q.not('main_image', 'is', null),
                batchSize,
                maxPages: options.maxDiscoveryPages,
                extractUrls: (prod, tasks, bucket) => {
                    if (prod.main_image) {
                        const cleanKey = normalizeStorageObjectKey(prod.main_image, bucket, urlOpts);
                        if (cleanKey && !tasks.has(cleanKey)) {
                            tasks.set(cleanKey, {
                                subfolder: cleanKey.includes('/') ? path.dirname(cleanKey) : 'products',
                                name: path.basename(cleanKey),
                                entityType: 'make_products',
                                entityId: String(prod.id),
                                cloudUpdatedAt: prod.updated_at || prod.created_at
                            });
                        }
                    }
                }
            },
            fileTasks,
            logger,
            bucketName,
            pgClient
        );
        if (resF && (!resF.success || resF.error)) {
            discoveryErrors.push({ source: 'make_products', error: resF.error, partial: resF.partial, reachedCap: resF.reachedCap });
        }
    } catch (e) {
        logger.warn('[NAS-Pull-Worker] Discovery from product images failed:', e.message);
        discoveryErrors.push({ source: 'make_products', error: e.message });
    }

    if (fileTasks.size === 0) {
        const hasReachedCap = discoveryErrors.some(e => e.reachedCap || (typeof e.error === 'string' && e.error.includes('PAGINATION_CAP_REACHED')));
        return {
            success: discoveryErrors.length === 0,
            reachedCap: hasReachedCap,
            partial: hasReachedCap,
            filesPulled: 0,
            replicatedCount: 0,
            errors: discoveryErrors
        };
    }

    // ── Process and Verify Discovered Files ────────────────────────────────────
    for (const [cloudPath, fileInfo] of fileTasks.entries()) {
        const targetDir = path.join(storageBasePath, fileInfo.subfolder);
        const targetFilePath = path.join(targetDir, fileInfo.name);
        const tempFilePath = path.join(targetDir, `.${fileInfo.name}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`);

        // Check if already persisted and verified in TrueNAS database and filesystem
        let skipDownload = false;
        if (pgClient) {
            try {
                const regCheck = await pgClient.query(
                    'SELECT object_key, sha256, size_bytes, replicated_at, source_updated_at FROM nas_replicated_files WHERE object_key = $1',
                    [cloudPath]
                );
                if (regCheck.rows && regCheck.rows.length > 0) {
                    const regRow = regCheck.rows[0];
                    const regSha = regRow.sha256 ? String(regRow.sha256).toUpperCase() : null;
                    const regSize = Number(regRow.size_bytes);

                    if (fs.existsSync(targetFilePath)) {
                        const stat = fs.statSync(targetFilePath);
                        if (stat.size === regSize) {
                            const diskBytes = fs.readFileSync(targetFilePath);
                            const diskSha = crypto.createHash('sha256').update(diskBytes).digest('hex').toUpperCase();

                            if (diskSha === regSha) {
                                // On-disk file is fully intact and matches registered checksum.
                                // Now check for same-key replacement in cloud:
                                let isSameKeyReplaced = false;

                                if (fileInfo.expectedSha256 && fileInfo.expectedSha256.toUpperCase() !== regSha) {
                                    isSameKeyReplaced = true;
                                    logger.warn(`[NAS-Pull-Worker] Same-key replacement detected for ${cloudPath}: expected SHA changed from ${regSha} to ${fileInfo.expectedSha256.toUpperCase()}`);
                                }

                                if (fileInfo.cloudSize !== undefined && Number(fileInfo.cloudSize) !== regSize) {
                                    isSameKeyReplaced = true;
                                    logger.warn(`[NAS-Pull-Worker] Same-key replacement detected for ${cloudPath}: cloud size changed from ${regSize} to ${fileInfo.cloudSize}`);
                                }

                                if (fileInfo.cloudUpdatedAt) {
                                    const cloudTime = new Date(fileInfo.cloudUpdatedAt).getTime();
                                    const sourceTime = regRow.source_updated_at
                                        ? new Date(regRow.source_updated_at).getTime()
                                        : Number.NaN;
                                    // Compare source metadata to the last source timestamp, not
                                    // to NAS replicated_at (the clocks may differ and cause loops).
                                    if (Number.isFinite(cloudTime) &&
                                        (!Number.isFinite(sourceTime) || cloudTime > sourceTime)) {
                                        isSameKeyReplaced = true;
                                        logger.warn(`[NAS-Pull-Worker] Source metadata changed for ${cloudPath}: updated_at ${fileInfo.cloudUpdatedAt} is newer than registered source timestamp ${regRow.source_updated_at || 'unknown'}`);
                                    }
                                }

                                const revalidateIntervalMs = options.revalidationIntervalMs !== undefined
                                    ? options.revalidationIntervalMs
                                    : 24 * 60 * 60 * 1000;
                                if (options.forceRevalidate || (regRow.replicated_at && (Date.now() - new Date(regRow.replicated_at).getTime() >= revalidateIntervalMs))) {
                                    isSameKeyReplaced = true;
                                    logger.log(`[NAS-Pull-Worker] Revalidation triggered for ${cloudPath}. Re-downloading from cloud.`);
                                }

                                if (!isSameKeyReplaced && !options.forceRevalidate) {
                                    skipDownload = true;
                                }
                            } else {
                                logger.warn(`[NAS-Pull-Worker] Corrupted file on disk for ${cloudPath}: disk SHA ${diskSha} !== registered SHA ${regSha}. Re-downloading to repair.`);
                            }
                        } else {
                            logger.warn(`[NAS-Pull-Worker] Corrupted file size on disk for ${cloudPath}: disk size ${stat.size} !== registered size ${regSize}. Re-downloading to repair.`);
                        }
                    } else {
                        logger.warn(`[NAS-Pull-Worker] Registered file missing from disk for ${cloudPath}: ${targetFilePath}. Re-downloading to restore.`);
                    }
                }
            } catch (regErr) {
                logger.error(`[NAS-Pull-Worker] Error checking registry for ${cloudPath}:`, regErr.message);
                throw regErr;
            }
        }

        if (skipDownload) {
            continue; // Already replicated durably, verified on physical disk, and unchanged in cloud
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
                    INSERT INTO nas_replicated_files (object_key, sha256, size_bytes, entity_type, entity_id, source_updated_at, replicated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (object_key) DO UPDATE SET
                        sha256 = EXCLUDED.sha256,
                        size_bytes = EXCLUDED.size_bytes,
                        entity_type = COALESCE(EXCLUDED.entity_type, nas_replicated_files.entity_type),
                        entity_id = COALESCE(EXCLUDED.entity_id, nas_replicated_files.entity_id),
                        source_updated_at = COALESCE(EXCLUDED.source_updated_at, nas_replicated_files.source_updated_at),
                        replicated_at = NOW();
                `, [
                    cloudPath,
                    persistedSha256,
                    persistedBytes.length,
                    fileInfo.entityType || null,
                    fileInfo.entityId || null,
                    fileInfo.cloudUpdatedAt || null
                ]);
            }

            logger.log(`[NAS-Pull-Worker] Persisted and verified ${cloudPath} (${persistedBytes.length} B, SHA256: ${persistedSha256.substring(0, 10)}...) to TrueNAS storage.`);
            filesPulled++;

            // Step 7: Cloud Retention: Prune cloud object ONLY if explicitly enabled
            // Only explicitly committed buffer-reservation objects may be pruned.
            // Authoritative order/catalog attachments and images remain in Supabase.
            if (pruneCloud && fileInfo.entityType === 'buffer_reservation' && fileInfo.reservationId) {
                try {
                    const { error: removeError } = await supabaseClient.storage.from(bucketName).remove([cloudPath]);
                    if (removeError) {
                        throw new Error(`Storage removal failed: ${removeError.message}`);
                    }
                    logger.log(`[NAS-Pull-Worker] Cloud buffer pruned after verified TrueNAS persistence: ${cloudPath}`);

                    const { data: releaseData, error: releaseError } = await supabaseClient.rpc('release_buffer_capacity', {
                        p_reservation_id: fileInfo.reservationId,
                        p_client_id: 'reconciliation_daemon',
                        p_status: 'pruned',
                        p_actual_bytes: 0
                    });
                    if (releaseError || releaseData?.success === false) {
                        const message = releaseError?.message || 'Quota release RPC reported failure';
                        logger.error(`[NAS-Pull-Worker] Cloud object was pruned but quota release failed for reservation ${fileInfo.reservationId}: ${message}`);
                        failedFiles.push({ cloudPath, error: `QUOTA_RELEASE_FAILED after cloud prune: ${message}` });
                    } else {
                        logger.log(`[NAS-Pull-Worker] Released quota for pruned buffer reservation ${fileInfo.reservationId}.`);
                    }
                } catch (pruneErr) {
                    logger.error(`[NAS-Pull-Worker] Failed to prune cloud buffer object ${cloudPath}:`, pruneErr.message);
                    failedFiles.push({ cloudPath, error: `CLOUD_PRUNE_FAILED: ${pruneErr.message}` });
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

    const hasReachedCap = discoveryErrors.some(e => e.reachedCap || (typeof e.error === 'string' && e.error.includes('PAGINATION_CAP_REACHED')));

    return {
        success: failedFiles.length === 0 && discoveryErrors.length === 0,
        reachedCap: hasReachedCap,
        partial: hasReachedCap,
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
    const pruneCloud = options.pruneCloud !== undefined
        ? options.pruneCloud === true
        : process.env.PRUNE_CLOUD_AFTER_NAS_CONFIRMATION === 'true';

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
        try {
            await initCheckpoints(pg);
        } catch (initErr) {
            logger.error('[NAS-Pull-Worker] Failed to initialize checkpoints and schema:', initErr.message);
            return {
                success: false,
                error: `SCHEMA_INIT_FAILED: ${initErr.message}`
            };
        }

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

    const isDaemon = process.argv.includes('--daemon') || process.env.DAEMON === 'true' || (Boolean(process.env.REPLICATION_INTERVAL_MS) && !process.argv.includes('--once'));
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
    isMissingColumnError,
    getIdMapping,
    recordIdMapping,
    resolveTargetProductId,
    resolveTargetSpecId,
    ensureProductCategory,
    resolveTargetOrderId,
    upsertOrderRecord,
    upsertProductRecord,
    upsertSpecificationRecord,
    upsertColorRecord,
    discoverFromTable,
    pullBusinessData,
    pullAttachments,
    runReplicationCycle,
    schemaCapabilityCache,
    getSchemaCapabilityCache,
    clearSchemaCapabilityCache
};
