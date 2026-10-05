/**
 * DatabaseFailoverEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Dual-Database Failover, Circuit Breaker, Durability & Reconciliation Engine.
 *
 * Architecture Principles:
 *  - Primary / Authoritative Master: NAS PostgreSQL (PostgREST at 100.88.85.6:3001,
 *    local LAN 192.168.1.14:3001, or Cloudflare Tunnel db.lenas.me).
 *  - Secondary / Emergency Fallback: Supabase Cloud.
 *  - Fast Parallel Health Detection: Resolves active connection within ~1000ms.
 *  - Circuit Breaker: Automatically trips to DEGRADED_FALLBACK on consecutive NAS
 *    failures, preventing 30-120s TCP timeouts from freezing the UI.
 *  - Seamless Query Failover: Transient NAS read/write failures transparently fall
 *    back to Supabase Cloud so the user never sees "Failed to load product".
 *  - Bidirectional Durability:
 *      * Supabase -> NAS: Offline writes & deletes are persisted to fallback_write_journal.json
 *        and idempotently reconciled upon NAS restoration.
 *      * NAS -> Supabase: Cloud mirroring failures are persisted to cloud_mirror_retry_journal.json
 *        and retried automatically until acknowledged.
 *  - Automated Bootstrap & Freshness Tracking: Automatically initializes a cold Supabase
 *    fallback dataset from NAS master and tracks mirror freshness timestamps.
 *  - Safe Insert / Update / Delete Reconciliation: Prevents recreation of deleted entities
 *    and guarantees idempotency using authoritative IDs and timestamps.
 *  - Bounded Fallback Dataset (~1 GB): Automatically maintains Supabase Cloud dataset
 *    within ~1 GB by retaining essential master data, active orders, and recent items,
 *    with enforceable warning thresholds (800 MB warning, 950 MB critical), without
 *    ever deleting data from the authoritative NAS master.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

export type DatabaseTarget = 'nas' | 'supabase';
export type CircuitBreakerState = 'healthy' | 'degraded' | 'recovering' | 'offline';
export type ConnectionTier = 'nas_local' | 'nas_tunnel' | 'nas_public' | 'supabase';

export interface DatabaseMetrics {
    totalQueries: number;
    nasQueries: number;
    supabaseQueries: number;
    failedNasQueries: number;
    failoverQueries: number;
    reconciledWrites: number;
    lastQueryDurationMs: number;
}

export interface DatabaseLatencyStats {
    lastLatencyMs: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    cooldownRemainingMs: number;
}

export interface FallbackFreshnessInfo {
    isFallbackReady: boolean;
    lastSuccessfulMirrorTime: number | null;
    lastBootstrapTime: number | null;
    productCount: number;
    categoryCount: number;
    orderCount: number;
    pendingMirrorRetriesCount: number;
    storageUsageMb: number;
    storageLimitMb: number;
    storageWarningState: 'ok' | 'warning' | 'critical';
}

export interface DatabaseStatus {
    activeTarget: DatabaseTarget;
    circuitState: CircuitBreakerState;
    connectionTier: ConnectionTier;
    activeNasUrl: string | null;
    isNasReachable: boolean;
    consecutiveFailures: number;
    pendingReconciliationCount: number;
    pendingMirrorRetriesCount: number;
    lastHealthCheckTime: number;
    metrics: DatabaseMetrics;
    freshness: FallbackFreshnessInfo;
    latencyStats?: DatabaseLatencyStats;
}

export interface FallbackJournalEntry {
    id: string;
    timestamp: number;
    table: string;
    operation: 'insert' | 'update' | 'upsert' | 'delete';
    primaryKey?: { name: string; value: any };
    data?: any;
    filter?: { column: string; value: any }[];
    status: 'pending' | 'reconciled' | 'failed';
    reconciledAt?: number;
    retryCount: number;
    error?: string;
}

export interface DurableMirrorRetryEntry {
    id: string;
    timestamp: number;
    table: string;
    operation: 'insert' | 'update' | 'upsert' | 'delete';
    primaryKey?: { name: string; value: any };
    data?: any;
    filter?: { column: string; value: any }[];
    retryCount: number;
    error?: string;
}

export class DatabaseFailoverEngine {
    private static instance: DatabaseFailoverEngine | null = null;

    private nasClient: SupabaseClient | null = null;
    private supabaseClient: SupabaseClient | null = null;
    private supabaseAdmin: SupabaseClient | null = null;
    private onRecreateNasClient?: (url: string) => void;

    private circuitState: CircuitBreakerState = 'healthy';
    private connectionTier: ConnectionTier = 'supabase';
    private activeTarget: DatabaseTarget = 'supabase';
    private activeNasUrl: string | null = null;
    private lastWorkingNasUrl: string | null = null;
    private connectionStatePath: string;

    private isNasReachable = false;
    private consecutiveFailures = 0;
    private readonly MAX_CONSECUTIVE_FAILURES = 2; // Require 2 consecutive failures before degrading to avoid false-positive on single transient timeout

    // Session-level guard to prevent endless bootstrap storms on client installations
    private lastBootstrapAttemptTime = 0;
    private readonly BOOTSTRAP_THROTTLE_MS = 3600_000; // 1 hour minimum between bootstrap attempts
    private isBackgroundBootstrap = false; // When true, NAS read failures are not recorded as health failures

    private lastHealthCheckTime = 0;
    private lastLatencyMs = 0;
    private avgLatencyMs = 0;
    private latencyHistory: number[] = [];
    private cooldownUntil = 0;
    private cooldownDurationMs = 30_000; // 30s initial cooldown
    private errorCount = 0;

    private healthProbeTimer: ReturnType<typeof setInterval> | null = null;
    private retentionTimer: ReturnType<typeof setInterval> | null = null;
    private mirrorRetryTimer: ReturnType<typeof setInterval> | null = null;

    private isProbing = false;
    private isReconciling = false;
    private isBootstrapping = false;
    private isRetryingMirror = false;

    private journalPath: string;
    private mirrorJournalPath: string;
    private freshnessPath: string;

    private journalEntries: FallbackJournalEntry[] = [];
    private mirrorRetryEntries: DurableMirrorRetryEntry[] = [];

    private freshnessData: {
        lastSuccessfulMirrorTime: number | null;
        lastBootstrapTime: number | null;
        productCount: number;
        categoryCount: number;
        orderCount: number;
        storageUsageMb: number;
    } = {
        lastSuccessfulMirrorTime: null,
        lastBootstrapTime: null,
        productCount: 0,
        categoryCount: 0,
        orderCount: 0,
        storageUsageMb: 0
    };

    private metrics: DatabaseMetrics = {
        totalQueries: 0,
        nasQueries: 0,
        supabaseQueries: 0,
        failedNasQueries: 0,
        failoverQueries: 0,
        reconciledWrites: 0,
        lastQueryDurationMs: 0
    };

    private constructor() {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.journalPath = path.join(userData, 'fallback_write_journal.json');
        this.mirrorJournalPath = path.join(userData, 'cloud_mirror_retry_journal.json');
        this.freshnessPath = path.join(userData, 'fallback_freshness.json');
        this.connectionStatePath = path.join(userData, 'nas_connection.json');

        this.loadJournal();
        this.loadMirrorJournal();
        this.loadFreshness();
        this.loadNasConnectionState();
    }

    private loadNasConnectionState(): void {
        try {
            if (fs.existsSync(this.connectionStatePath)) {
                const raw = fs.readFileSync(this.connectionStatePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.lastWorkingNasUrl) {
                    this.lastWorkingNasUrl = parsed.lastWorkingNasUrl;
                    this.activeNasUrl = parsed.lastWorkingNasUrl;
                }
                if (parsed.tier) {
                    this.connectionTier = parsed.tier;
                }
            }
        } catch {}
    }

    private saveNasConnectionState(): void {
        try {
            fs.mkdirSync(path.dirname(this.connectionStatePath), { recursive: true });
            fs.writeFileSync(this.connectionStatePath, JSON.stringify({
                lastWorkingNasUrl: this.lastWorkingNasUrl,
                tier: this.connectionTier,
                updatedAt: Date.now()
            }, null, 2), 'utf-8');
        } catch {}
    }

    public static getInstance(): DatabaseFailoverEngine {
        if (!DatabaseFailoverEngine.instance) {
            DatabaseFailoverEngine.instance = new DatabaseFailoverEngine();
        }
        return DatabaseFailoverEngine.instance;
    }

    public getLastWorkingNasUrl(): string | null {
        return this.lastWorkingNasUrl;
    }

    // ── Client Registry ──────────────────────────────────────────────────────────
    public registerClients(clients: {
        nas: SupabaseClient | null;
        supabase: SupabaseClient | null;
        supabaseAdmin: SupabaseClient | null;
        onRecreateNasClient?: (url: string) => void;
    }): void {
        this.nasClient = clients.nas;
        this.supabaseClient = clients.supabase;
        this.supabaseAdmin = clients.supabaseAdmin;
        if (clients.onRecreateNasClient) {
            this.onRecreateNasClient = clients.onRecreateNasClient;
        }
    }

    public getActiveClient(): SupabaseClient {
        const inCooldown = Date.now() < this.cooldownUntil;
        // If degraded, offline, or during cooldown, return Supabase fallback immediately without stalling
        if (this.circuitState === 'degraded' || this.circuitState === 'offline' || inCooldown) {
            if (this.supabaseClient) {
                return this.supabaseClient;
            }
        }
        if ((this.circuitState === 'healthy' || this.circuitState === 'recovering') && this.nasClient) {
            return this.nasClient;
        }
        if (this.supabaseClient) {
            return this.supabaseClient;
        }
        if (this.nasClient) {
            return this.nasClient;
        }
        throw new Error('No database client available.');
    }

    public logDiagnostic(payload: {
        event: 'FAILOVER' | 'RECONCILE' | 'MIRROR_RETRY' | 'BOOTSTRAP' | 'RETENTION' | 'QUERY';
        activeDb: DatabaseTarget;
        operation?: string;
        table?: string;
        reason?: string;
        durationMs?: number;
        retryCount?: number;
        syncStatus?: string;
        reconciliationResult?: { reconciled: number; failed: number };
        error?: string;
    }): void {
        const cleanPayload = {
            timestamp: new Date().toISOString(),
            ...payload
        };
        console.log(`[DB:DIAGNOSTIC] ${JSON.stringify(cleanPayload)}`);

        // Forward significant database events & failures to TelemetryEngine
        try {
            const { TelemetryEngine } = require('./telemetry/TelemetryEngine');
            if (payload.error || payload.reason || payload.event === 'FAILOVER' || (payload.reconciliationResult && payload.reconciliationResult.failed > 0)) {
                TelemetryEngine.getInstance().reportDatabaseError({
                    event: payload.event,
                    activeDb: payload.activeDb,
                    databaseState: this.circuitState,
                    failoverReason: payload.reason,
                    operation: payload.operation || payload.table,
                    durationMs: payload.durationMs,
                    retryCount: payload.retryCount,
                    error: payload.error || payload.reason || `Database event: ${payload.event}`,
                    metadata: {
                        table: payload.table,
                        syncStatus: payload.syncStatus,
                        reconciliationResult: payload.reconciliationResult
                    },
                    severity: (payload.error || (payload.reconciliationResult && payload.reconciliationResult.failed > 0)) ? 'error' : 'warning'
                });
            }
        } catch {}
    }

    public getStatus(): DatabaseStatus {
        const usageMb = this.freshnessData.storageUsageMb;
        let warningState: 'ok' | 'warning' | 'critical' = 'ok';
        if (usageMb >= 950) warningState = 'critical';
        else if (usageMb >= 800) warningState = 'warning';

        // Stricter Fallback-Ready determination: requires categories, products, orders, and verified mirror timestamp
        const isFallbackReady = this.freshnessData.categoryCount > 0 && 
                                this.freshnessData.productCount > 0 &&
                                (this.freshnessData.orderCount > 0 || this.freshnessData.lastBootstrapTime !== null) &&
                                this.freshnessData.lastSuccessfulMirrorTime !== null;

        return {
            activeTarget: this.activeTarget,
            circuitState: this.circuitState,
            connectionTier: this.connectionTier,
            activeNasUrl: this.activeNasUrl,
            isNasReachable: this.isNasReachable,
            consecutiveFailures: this.consecutiveFailures,
            pendingReconciliationCount: this.getPendingJournalEntries().length,
            pendingMirrorRetriesCount: this.mirrorRetryEntries.length,
            lastHealthCheckTime: this.lastHealthCheckTime,
            metrics: { ...this.metrics },
            freshness: {
                isFallbackReady,
                lastSuccessfulMirrorTime: this.freshnessData.lastSuccessfulMirrorTime,
                lastBootstrapTime: this.freshnessData.lastBootstrapTime,
                productCount: this.freshnessData.productCount,
                categoryCount: this.freshnessData.categoryCount,
                orderCount: this.freshnessData.orderCount,
                pendingMirrorRetriesCount: this.mirrorRetryEntries.length,
                storageUsageMb: usageMb,
                storageLimitMb: 1024,
                storageWarningState: warningState
            },
            latencyStats: {
                lastLatencyMs: this.lastLatencyMs,
                avgLatencyMs: this.avgLatencyMs,
                p95LatencyMs: this.latencyHistory.length > 0 
                    ? [...this.latencyHistory].sort((a, b) => a - b)[Math.floor(this.latencyHistory.length * 0.95)] || this.lastLatencyMs 
                    : this.lastLatencyMs,
                cooldownRemainingMs: Math.max(0, this.cooldownUntil - Date.now())
            }
        };
    }

    private broadcastStatus(): void {
        const status = this.getStatus();
        try {
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('db-status-changed', status);
                }
            });
        } catch {}
    }

    // ── Fast Parallel Health Checking ────────────────────────────────────────────
    /**
     * Pings a specific URL with a bounded timeout using HEAD to avoid downloading schema bodies.
     */
    private async pingUrl(url: string, timeoutMs = 1200, headers: Record<string, string> = {}): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers
            });
            clearTimeout(timeoutId);
            return res.ok;
        } catch {
            return false;
        }
    }

    /**
     * Resolves the fastest responding NAS candidate concurrently.
     * Prioritizes the last known working URL to resolve in <100ms when healthy.
     */
    public async checkNasConnectivity(candidates: {
        localUrl?: string;
        tunnelUrl?: string;
        publicUrl?: string;
        cfHeaders?: Record<string, string>;
    }): Promise<boolean> {
        if (this.isProbing) return this.isNasReachable;
        this.isProbing = true;

        const cfHeaders = candidates.cfHeaders || {};
        const local = candidates.localUrl || 'http://192.168.1.14:3001';
        const pub = candidates.publicUrl || 'http://100.88.85.6:3001';
        const tunnel = candidates.tunnelUrl;

        // 1. Fast check: If last working URL is known, test it first with tight timeout (800ms)
        if (this.lastWorkingNasUrl) {
            const headers = this.lastWorkingNasUrl.startsWith('https://') ? cfHeaders : {};
            const t0 = Date.now();
            const alive = await this.pingUrl(this.lastWorkingNasUrl, 800, headers);
            if (alive) {
                const latency = Date.now() - t0;
                this.handleNasReachable(this.lastWorkingNasUrl, this.deriveTier(this.lastWorkingNasUrl, local, tunnel || '', pub), latency);
                this.isProbing = false;
                return true;
            }
        }

        // 2. Parallel race across candidate endpoints with bounded timeout (max 1200ms)
        const tests = [
            { url: local, tier: 'nas_local' as ConnectionTier, headers: {}, timeout: 600 },
            { url: pub, tier: 'nas_public' as ConnectionTier, headers: {}, timeout: 1000 },
            ...(tunnel ? [{ url: tunnel, tier: 'nas_tunnel' as ConnectionTier, headers: cfHeaders, timeout: 1200 }] : [])
        ];

        try {
            const t0 = Date.now();
            const winner = await Promise.any(
                tests.map(async t => {
                    const ok = await this.pingUrl(t.url, t.timeout, t.headers);
                    if (ok) return t;
                    throw new Error(`Offline: ${t.url}`);
                })
            );

            const latency = Date.now() - t0;
            this.handleNasReachable(winner.url, winner.tier, latency);
            this.isProbing = false;
            return true;
        } catch {
            this.handleNasUnreachable();
            this.isProbing = false;
            return false;
        }
    }

    private deriveTier(url: string, local: string, tunnel: string, pub: string): ConnectionTier {
        if (url === local) return 'nas_local';
        if (tunnel && url === tunnel) return 'nas_tunnel';
        return 'nas_public';
    }

    private handleNasReachable(url: string, tier: ConnectionTier, latency = 0): void {
        this.isNasReachable = true;
        this.activeNasUrl = url;
        this.lastWorkingNasUrl = url;
        this.connectionTier = tier;
        this.lastHealthCheckTime = Date.now();
        this.saveNasConnectionState();

        // Immediately update nasClient to the newly reachable candidate URL before verifying recovery
        if (this.onRecreateNasClient) {
            try {
                this.onRecreateNasClient(url);
            } catch (e: any) {
                console.warn('[DB:FAILOVER] Error updating nasClient to reachable URL:', e.message);
            }
        }

        const wasDegraded = this.circuitState === 'degraded' || this.circuitState === 'offline';
        this.consecutiveFailures = 0;

        if (latency > 0) {
            this.lastLatencyMs = latency;
            this.latencyHistory.push(latency);
            if (this.latencyHistory.length > 50) this.latencyHistory.shift();
            this.avgLatencyMs = Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length);
        }

        if (wasDegraded) {
            console.log(`[DB:FAILOVER] NAS ping succeeded via ${tier} (${url}). Entering RECOVERING state.`);
            this.circuitState = 'recovering';
            this.broadcastStatus();

            // Verify recovery with a real lightweight request before restoring as primary
            this.verifyAndRecoverNas().catch(err => {
                console.warn('[DB:FAILOVER] Recovery verification failed:', err.message);
            });
        } else if (this.circuitState === 'healthy') {
            this.activeTarget = 'nas';
        }

        // Check if Supabase Cloud fallback needs initial bootstrap (only when supabaseAdmin is available)
        if (this.supabaseAdmin) {
            this.checkAndBootstrapFallbackIfEmpty().catch(() => {});
        }
    }

    /**
     * Verifies NAS recovery with an actual real database query, reconciles pending fallback
     * writes, and restores NAS as primary.
     * Probes make_products first as the authoritative MAKE table, with fallback to companies.
     */
    public async verifyAndRecoverNas(): Promise<boolean> {
        if (!this.nasClient) return false;
        try {
            console.log('[DB:RECOVERY] Verifying NAS with real lightweight query...');
            const t0 = Date.now();

            let queryError: any = null;
            let success = false;

            // 1. Try make_products first as authoritative MAKE table
            try {
                const res = await this.nasClient.from('make_products')?.select?.('id')?.limit?.(1);
                if (res && !res.error && res.data) {
                    success = true;
                } else if (res?.error) {
                    queryError = res.error;
                }
            } catch (err: any) {
                queryError = err;
            }

            // 2. Fallback check on companies
            if (!success) {
                try {
                    const res = await this.nasClient.from('companies')?.select?.('id')?.limit?.(1);
                    if (res && !res.error && res.data) {
                        success = true;
                    } else if (res?.error) {
                        queryError = res.error;
                    }
                } catch (err: any) {
                    queryError = err;
                }
            }

            if (!success) {
                console.warn('[DB:RECOVERY] NAS real query failed:', queryError?.message || 'unknown error');
                return false;
            }

            const duration = Date.now() - t0;
            console.log(`[DB:RECOVERY] NAS verified healthy in ${duration}ms.`);
            this.recordNasSuccess(duration);

            // Reconcile pending writes
            if (this.getPendingJournalEntries().length > 0) {
                console.log('[DB:RECOVERY] Reconciling pending fallback writes before restoring primary...');
                await this.reconcileFallbackWrites();
            }

            this.circuitState = 'healthy';
            this.activeTarget = 'nas';
            this.cooldownUntil = 0;
            this.broadcastStatus();
            return true;
        } catch (err: any) {
            console.warn('[DB:RECOVERY] Verification exception:', err.message);
            return false;
        }
    }

    private handleNasUnreachable(): void {
        this.isNasReachable = false;
        this.activeNasUrl = null;
        this.connectionTier = 'supabase';
        this.lastHealthCheckTime = Date.now();

        if (this.circuitState === 'healthy' || this.circuitState === 'recovering') {
            console.warn('[DB:FAILOVER] NAS health check failed. Switching circuit breaker to DEGRADED_FALLBACK.');
            this.circuitState = 'degraded';
            this.activeTarget = 'supabase';
            this.cooldownUntil = Date.now() + this.cooldownDurationMs;
            this.broadcastStatus();
        }
    }

    public startBackgroundMonitoring(getCandidates: () => {
        localUrl?: string;
        tunnelUrl?: string;
        publicUrl?: string;
        cfHeaders?: Record<string, string>;
    }): void {
        this.stopBackgroundMonitoring();

        // Immediate check
        this.checkNasConnectivity(getCandidates()).catch(() => {});

        // Probe every 10 seconds (responsive detection of recovery)
        this.healthProbeTimer = setInterval(() => {
            this.checkNasConnectivity(getCandidates()).catch(() => {});
        }, 10000);

        // Process durable mirror retries every 20 seconds
        this.mirrorRetryTimer = setInterval(() => {
            this.processPendingMirrorRetries().catch(() => {});
        }, 20000);

        // Run Supabase ~1 GB retention maintenance once every 6 hours
        this.retentionTimer = setInterval(() => {
            this.maintainSupabaseRetention().catch(() => {});
        }, 6 * 3600 * 1000);

        console.log('[DB:FAILOVER] Background health monitor & durability timers started.');
    }

    public stopBackgroundMonitoring(): void {
        if (this.healthProbeTimer) {
            clearInterval(this.healthProbeTimer);
            this.healthProbeTimer = null;
        }
        if (this.mirrorRetryTimer) {
            clearInterval(this.mirrorRetryTimer);
            this.mirrorRetryTimer = null;
        }
        if (this.retentionTimer) {
            clearInterval(this.retentionTimer);
            this.retentionTimer = null;
        }
    }

    // ── Circuit Breaker Actions ──────────────────────────────────────────────────
    public recordNasFailure(err: any): void {
        // GUARD: Background bootstrap reads must not degrade primary NAS health
        if (this.isBackgroundBootstrap) {
            console.warn('[DB:FAILOVER] Ignoring NAS failure during background bootstrap (not penalizing primary health):', err?.message || 'unknown');
            return;
        }

        this.consecutiveFailures++;
        this.metrics.failedNasQueries++;

        // Classify failure type: hard failures trip immediately, timeouts require consecutive threshold
        const isHardFailure = err?.message && (
            err.message.includes('ECONNREFUSED') ||
            err.message.includes('HTML response') ||
            err.message.includes('proxy/gateway') ||
            err.message.includes('authorization rejected') ||
            err.message.includes('502') ||
            err.message.includes('503') ||
            err.message.includes('504')
        );

        const isTimeoutOrTransient = (err?.message && (
            err.message.includes('fetch failed') ||
            err.message.includes('ETIMEDOUT') ||
            err.message.includes('network') ||
            err.message.includes('timeout') ||
            err.message.includes('Connection')
        )) || err?.code === 'PGRST000';

        // Adaptive cooldown (30s to 120s) preventing dead connection stall on flapping
        const backoffStep = Math.min(4, Math.max(0, this.consecutiveFailures - 1));
        this.cooldownDurationMs = Math.min(120_000, 30_000 * Math.pow(1.5, backoffStep));
        this.cooldownUntil = Date.now() + this.cooldownDurationMs;

        // Invalidate stale tunnel URL if failure was due to an HTML proxy block
        if (err?.message && (err.message.includes('HTML response') || err.message.includes('proxy/gateway'))) {
            if (this.lastWorkingNasUrl && this.lastWorkingNasUrl.startsWith('https://')) {
                console.warn('[DB:FAILOVER] Invalidating blocked tunnel URL from lastWorkingNasUrl cache:', this.lastWorkingNasUrl);
                this.lastWorkingNasUrl = null;
                this.saveNasConnectionState();
            }
        }

        // CIRCUIT BREAKER DECISION:
        // Hard failures (ECONNREFUSED, proxy block, 5xx) trip immediately on the first occurrence.
        // Timeouts/transient errors require consecutiveFailures >= MAX_CONSECUTIVE_FAILURES (2).
        const shouldTrip = isHardFailure || (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && (isTimeoutOrTransient || !err?.message));

        if (shouldTrip) {
            if (this.circuitState === 'healthy' || this.circuitState === 'recovering') {
                console.warn(`[DB:FAILOVER] Circuit breaker tripped to DEGRADED_FALLBACK (failures: ${this.consecutiveFailures}, cooldown: ${Math.round(this.cooldownDurationMs / 1000)}s, reason: ${err?.message || 'unknown'}).`);
                this.circuitState = 'degraded';
                this.activeTarget = 'supabase';
                this.isNasReachable = false;
                this.broadcastStatus();

                try {
                    const { TelemetryEngine } = require('./telemetry/TelemetryEngine');
                    TelemetryEngine.getInstance().reportDatabaseError({
                        event: 'CIRCUIT_BREAKER_TRIPPED',
                        activeDb: 'supabase',
                        databaseState: 'degraded',
                        failoverReason: err?.message || 'Consecutive NAS failures or network error',
                        operation: 'CIRCUIT_BREAKER',
                        retryCount: this.consecutiveFailures,
                        error: err || 'Circuit breaker tripped to DEGRADED_FALLBACK',
                        severity: 'warning'
                    });
                } catch {}
            }
        }
    }

    public recordNasSuccess(durationMs?: number): void {
        this.consecutiveFailures = 0;
        this.cooldownUntil = 0;
        this.cooldownDurationMs = 30_000;

        if (typeof durationMs === 'number' && durationMs >= 0) {
            this.lastLatencyMs = durationMs;
            this.latencyHistory.push(durationMs);
            if (this.latencyHistory.length > 30) {
                this.latencyHistory.shift();
            }
            this.avgLatencyMs = Math.round(
                this.latencyHistory.reduce((sum, val) => sum + val, 0) / this.latencyHistory.length
            );
        }

        if (this.circuitState === 'recovering') {
            this.circuitState = 'healthy';
            this.activeTarget = 'nas';
            this.broadcastStatus();
        }
    }

    // ── Query Execution with Automatic Failover ──────────────────────────────────
    /**
     * Executes a read query. If NAS is eligible, attempts on NAS with bounded timeout (6000ms).
     * If degraded, offline, in cooldown, or on failure/timeout, automatically falls back to Supabase.
     */
    public async executeRead<T>(
        queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: any }>,
        queryDesc = 'read'
    ): Promise<{ data: T | null; error: any; databaseUsed: DatabaseTarget }> {
        this.metrics.totalQueries++;
        const t0 = Date.now();

        const isCooldownActive = Date.now() < this.cooldownUntil;
        const canTryNas = this.nasClient &&
            (this.circuitState === 'healthy' || (this.circuitState === 'recovering' && !isCooldownActive));

        // 1. If NAS is eligible, attempt on NAS first with bounded timeout (6000ms)
        if (canTryNas && this.nasClient) {
            this.metrics.nasQueries++;
            try {
                const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error(`NAS read timeout (6000ms) on ${queryDesc}`)), 6000)
                );

                const res = await Promise.race([queryFn(this.nasClient), timeoutPromise]);
                const duration = Date.now() - t0;
                this.metrics.lastQueryDurationMs = duration;

                if (!res.error) {
                    this.recordNasSuccess(duration);
                    return { data: res.data, error: null, databaseUsed: 'nas' };
                }

                // If it's a data-level query error (e.g. invalid column/filter, not connection/timeout), return directly
                if (res.error?.code && !['ECONNREFUSED', 'ETIMEDOUT', 'PGRST000'].includes(res.error.code)) {
                    return { data: res.data, error: res.error, databaseUsed: 'nas' };
                }

                this.recordNasFailure(res.error);
            } catch (err: any) {
                this.recordNasFailure(err);
            }
        }

        // 2. Fallback to Supabase Cloud
        if (!this.supabaseClient) {
            return { data: null, error: new Error('Supabase fallback client is not configured'), databaseUsed: 'supabase' };
        }

        this.metrics.supabaseQueries++;
        this.metrics.failoverQueries++;
        const remainingCooldown = Math.max(0, this.cooldownUntil - Date.now());
        console.warn(`[DB:FAILOVER] Routing ${queryDesc} to Supabase Cloud fallback (cooldown remaining: ${remainingCooldown}ms).`);

        try {
            const res = await queryFn(this.supabaseClient);
            const duration = Date.now() - t0;
            this.metrics.lastQueryDurationMs = duration;
            return { data: res.data, error: res.error, databaseUsed: 'supabase' };
        } catch (err: any) {
            return { data: null, error: err, databaseUsed: 'supabase' };
        }
    }

    /**
     * Executes a write query.
     * When NAS is eligible: writes to NAS (bounded 3000ms), then mirrors async to Supabase Cloud (with durable retry journal).
     * When in fallback/cooldown: writes to Supabase Cloud and logs to Fallback Write Journal for recovery.
     */
    public async executeWrite<T>(
        writeFn: (client: SupabaseClient) => Promise<{ data: T | null; error: any }>,
        metadata: {
            table: string;
            operation: 'insert' | 'update' | 'upsert' | 'delete';
            primaryKey?: { name: string; value: any };
            data?: any;
            filter?: { column: string; value: any }[];
        },
        writeDesc = 'write'
    ): Promise<{ data: T | null; error: any; databaseUsed: DatabaseTarget }> {
        this.metrics.totalQueries++;
        const t0 = Date.now();

        const isCooldownActive = Date.now() < this.cooldownUntil;
        const canTryNas = this.nasClient &&
            (this.circuitState === 'healthy' || (this.circuitState === 'recovering' && !isCooldownActive));

        // 1. Primary path: NAS is eligible
        if (canTryNas && this.nasClient) {
            this.metrics.nasQueries++;
            let res: { data: T | null; error: any };

            try {
                const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error(`NAS write timeout (3000ms) on ${writeDesc}`)), 3000)
                );

                res = await Promise.race([writeFn(this.nasClient), timeoutPromise]);
            } catch (err: any) {
                this.recordNasFailure(err);

                // AMBIGUOUS TIMEOUT GUARD:
                // Write was dispatched to NAS, but response was lost or timed out (>3000ms).
                // The database server MAY have committed the transaction!
                // To avoid duplicate product/order creation (split-brain duplicate writes),
                // we must NEVER autonomously replay this write to Supabase Cloud.
                console.error(`[DB:FAILOVER] Ambiguous write timeout on NAS for ${writeDesc} (${metadata.table}). Preventing duplicate replay to Supabase.`);
                
                // Durable record of ambiguous write for verification upon reconnection
                this.journalWrite({
                    table: metadata.table,
                    operation: metadata.operation,
                    primaryKey: metadata.primaryKey,
                    data: metadata.data,
                    filter: metadata.filter
                });

                return {
                    data: null,
                    error: new Error(`NAS write timeout on ${writeDesc}: operation sent to primary database but response timed out. Replay halted to prevent duplicate mutations.`),
                    databaseUsed: 'nas'
                };
            }

            const duration = Date.now() - t0;
            this.metrics.lastQueryDurationMs = duration;

            if (!res.error) {
                this.recordNasSuccess(duration);

                // Asynchronously mirror write to Supabase Cloud with durable retry protection
                const cloudClient = this.supabaseAdmin || this.supabaseClient;
                if (cloudClient) {
                    this.mirrorWriteToCloud(cloudClient, metadata, res.data || metadata.data).catch(e => {
                        console.warn(`[DB:SYNC] Async cloud mirror failed for ${metadata.table}, saving to mirror retry journal:`, e.message);
                        this.journalMirrorRetry({
                            table: metadata.table,
                            operation: metadata.operation,
                            primaryKey: metadata.primaryKey,
                            data: res.data || metadata.data,
                            filter: metadata.filter
                        });
                    });
                }

                return { data: res.data, error: null, databaseUsed: 'nas' };
            }

            // If NAS returned an application-level SQL error (e.g. constraint violation, schema error),
            // do not fail over to Supabase — return the database error to the caller.
            const isPgError = res.error?.code || res.error?.details || res.error?.hint;
            if (isPgError) {
                return { data: null, error: res.error, databaseUsed: 'nas' };
            }

            // For non-timeout transport errors returned in res.error
            this.recordNasFailure(res.error);
            return {
                data: null,
                error: res.error,
                databaseUsed: 'nas'
            };
        }

        // 2. Fallback path: Write to Supabase Cloud + Journal for reconciliation
        if (!this.supabaseClient) {
            return { data: null, error: new Error('Supabase fallback client is not configured'), databaseUsed: 'supabase' };
        }

        this.metrics.supabaseQueries++;
        this.metrics.failoverQueries++;
        console.warn(`[DB:FAILOVER] Executing write ${writeDesc} on Supabase Cloud fallback and journaling for reconciliation.`);

        try {
            const targetClient = this.supabaseAdmin || this.supabaseClient;
            const res = await writeFn(targetClient);
            const duration = Date.now() - t0;
            this.metrics.lastQueryDurationMs = duration;

            if (!res.error) {
                // Record into Fallback Write Journal for future reconciliation to NAS
                this.journalWrite({
                    table: metadata.table,
                    operation: metadata.operation,
                    primaryKey: metadata.primaryKey,
                    data: res.data || metadata.data,
                    filter: metadata.filter
                });
            }

            return { data: res.data, error: res.error, databaseUsed: 'supabase' };
        } catch (err: any) {
            return { data: null, error: err, databaseUsed: 'supabase' };
        }
    }

    private async mirrorWriteToCloud(client: SupabaseClient, meta: any, savedData: any): Promise<void> {
        const { table, operation } = meta;
        if (operation === 'insert' || operation === 'update' || operation === 'upsert') {
            if (savedData) {
                const { error } = await client.from(table).upsert(savedData);
                if (error) throw error;
            }
        } else if (operation === 'delete') {
            if (meta.primaryKey) {
                const { error } = await client.from(table).delete().eq(meta.primaryKey.name, meta.primaryKey.value);
                if (error) throw error;
            } else if (meta.filter && meta.filter.length > 0) {
                let q = client.from(table).delete();
                for (const f of meta.filter) {
                    q = q.eq(f.column, f.value);
                }
                const { error } = await q;
                if (error) throw error;
            }
        }
        this.freshnessData.lastSuccessfulMirrorTime = Date.now();
        this.persistFreshness();
    }

    // ── Durable Mirror Retry Journal (NAS -> Supabase) ───────────────────────────
    private loadMirrorJournal(): void {
        try {
            if (fs.existsSync(this.mirrorJournalPath)) {
                this.mirrorRetryEntries = JSON.parse(fs.readFileSync(this.mirrorJournalPath, 'utf-8'));
            } else {
                this.mirrorRetryEntries = [];
            }
        } catch (e: any) {
            this.mirrorRetryEntries = [];
        }
    }

    private persistMirrorJournal(): void {
        try {
            fs.mkdirSync(path.dirname(this.mirrorJournalPath), { recursive: true });
            fs.writeFileSync(this.mirrorJournalPath, JSON.stringify(this.mirrorRetryEntries, null, 2), { encoding: 'utf-8', mode: 0o600 });
        } catch (e: any) {
            console.error('[DB:JOURNAL] Failed to persist mirror retry journal:', e.message);
        }
    }

    public journalMirrorRetry(entry: Omit<DurableMirrorRetryEntry, 'id' | 'timestamp' | 'retryCount'>): void {
        const item: DurableMirrorRetryEntry = {
            id: `mr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            retryCount: 0,
            ...entry
        };
        this.mirrorRetryEntries.push(item);
        this.persistMirrorJournal();
        this.broadcastStatus();
    }

    public async processPendingMirrorRetries(): Promise<{ succeeded: number; failed: number }> {
        const client = this.supabaseAdmin || this.supabaseClient;
        if (!client || this.mirrorRetryEntries.length === 0 || this.isRetryingMirror) {
            return { succeeded: 0, failed: 0 };
        }

        this.isRetryingMirror = true;
        let succeeded = 0;
        let failed = 0;
        const remaining: DurableMirrorRetryEntry[] = [];

        for (const item of this.mirrorRetryEntries) {
            try {
                await this.mirrorWriteToCloud(client, item, item.data);
                succeeded++;
            } catch (err: any) {
                item.retryCount++;
                item.error = err.message;
                remaining.push(item);
                failed++;
            }
        }

        this.mirrorRetryEntries = remaining;
        this.persistMirrorJournal();
        this.isRetryingMirror = false;
        this.broadcastStatus();
        return { succeeded, failed };
    }

    // ── Freshness & Bootstrap Engine ─────────────────────────────────────────────
    private loadFreshness(): void {
        try {
            if (fs.existsSync(this.freshnessPath)) {
                this.freshnessData = JSON.parse(fs.readFileSync(this.freshnessPath, 'utf-8'));
            }
        } catch {}
    }

    private persistFreshness(): void {
        try {
            fs.mkdirSync(path.dirname(this.freshnessPath), { recursive: true });
            fs.writeFileSync(this.freshnessPath, JSON.stringify(this.freshnessData, null, 2), { encoding: 'utf-8', mode: 0o600 });
        } catch {}
    }

    /**
     * Checks if Supabase Cloud fallback has 0 products and automatically populates it.
     *
     * GUARD: Only executes when supabaseAdmin is available (privileged service-role key).
     * Client installations with only anonKey cannot upsert to Cloud due to RLS, so
     * attempting bootstrap would create an endless retry storm every 10 seconds.
     * Additionally throttled to at most once per BOOTSTRAP_THROTTLE_MS (1 hour).
     */
    public async checkAndBootstrapFallbackIfEmpty(): Promise<boolean> {
        if (!this.nasClient || !this.isNasReachable || this.isBootstrapping) {
            return false;
        }

        // CRITICAL: Only bootstrap when supabaseAdmin (service-role) client is configured.
        // Client workstations with only anonKey will have every upsert rejected by RLS,
        // causing productCount to remain 0 and triggering re-bootstrap every 10 seconds.
        if (!this.supabaseAdmin) {
            return false;
        }

        // Session/freshness throttle: prevent repeated bootstrap attempts
        const now = Date.now();
        if (this.lastBootstrapAttemptTime > 0 && (now - this.lastBootstrapAttemptTime) < this.BOOTSTRAP_THROTTLE_MS) {
            return false;
        }

        try {
            const { count, error } = await this.supabaseAdmin.from('make_products').select('id', { count: 'exact', head: true });
            if (!error && (count === 0 || count === null)) {
                console.log('[DB:BOOTSTRAP] Supabase Cloud fallback is empty. Initiating automatic bootstrap from authoritative NAS...');
                this.lastBootstrapAttemptTime = now;
                await this.bootstrapFallbackDataset();
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Populates the emergency fallback dataset from authoritative NAS master to Supabase Cloud.
     */
    public async bootstrapFallbackDataset(): Promise<{
        success: boolean;
        syncedTables: Record<string, number>;
        error?: string;
    }> {
        if (!this.nasClient || !this.isNasReachable) {
            return { success: false, syncedTables: {}, error: 'NAS is not reachable' };
        }

        const cloudClient = this.supabaseAdmin || this.supabaseClient;
        if (!cloudClient) {
            return { success: false, syncedTables: {}, error: 'Supabase Cloud client is not configured' };
        }

        this.isBootstrapping = true;
        this.isBackgroundBootstrap = true; // Prevent internal NAS reads from penalizing primary health
        const syncedTables: Record<string, number> = {};

        try {
            console.log('[DB:BOOTSTRAP] Starting full fallback dataset synchronization from NAS master...');

            // Master reference & catalog tables in foreign-key dependency order
            const tables = [
                'make_product_categories',
                'make_products',
                'make_product_specifications',
                'make_product_sizes',
                'make_product_colors',
                'make_product_specification_links',
                'make_product_size_links',
                'make_product_color_links',
                'make_orders',
                'make_order_items',
                'make_order_parts',
                'make_order_updates'
            ];

            for (const table of tables) {
                let query = this.nasClient.from(table).select('*');

                // Bound orders to active or within last 90 days to respect ~1 GB footprint
                if (table === 'make_orders') {
                    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
                    query = query.or(`status.neq.Delivered,created_at.gte.${ninetyDaysAgo}`);
                }

                const { data: rows, error: readErr } = await query;
                if (readErr) {
                    console.warn(`[DB:BOOTSTRAP] Warning reading ${table} from NAS:`, readErr.message);
                    continue;
                }

                if (rows && rows.length > 0) {
                    let tableSuccessCount = 0;
                    // Chunk into batches of 50 to avoid request size limits
                    for (let i = 0; i < rows.length; i += 50) {
                        const chunk = rows.slice(i, i + 50);
                        const { error: upsertErr } = await cloudClient.from(table).upsert(chunk);
                        if (upsertErr) {
                            console.warn(`[DB:BOOTSTRAP] Warning upserting to ${table}:`, upsertErr.message);
                        } else {
                            tableSuccessCount += chunk.length;
                        }
                    }
                    syncedTables[table] = tableSuccessCount;
                    console.log(`[DB:BOOTSTRAP] Synced ${tableSuccessCount}/${rows.length} rows to ${table}.`);
                } else {
                    syncedTables[table] = 0;
                }
            }

            // Update freshness metrics
            this.freshnessData.lastBootstrapTime = Date.now();
            if ((syncedTables['make_products'] || 0) > 0 || (syncedTables['make_product_categories'] || 0) > 0) {
                this.freshnessData.lastSuccessfulMirrorTime = Date.now();
            }
            this.freshnessData.categoryCount = syncedTables['make_product_categories'] || 0;
            this.freshnessData.productCount = syncedTables['make_products'] || 0;
            this.freshnessData.orderCount = syncedTables['make_orders'] || 0;

            const estBytes = (this.freshnessData.productCount * 5120) + (this.freshnessData.orderCount * 25600);
            this.freshnessData.storageUsageMb = Number((estBytes / (1024 * 1024)).toFixed(2));

            this.persistFreshness();
            this.isBootstrapping = false;
            this.isBackgroundBootstrap = false;
            this.broadcastStatus();

            this.logDiagnostic({
                event: 'BOOTSTRAP',
                activeDb: this.activeTarget,
                syncStatus: `Synced ${this.freshnessData.productCount} products, ${this.freshnessData.categoryCount} categories, ${this.freshnessData.orderCount} orders`
            });

            console.log('[DB:BOOTSTRAP] Bootstrap synchronization complete.');
            return { success: true, syncedTables };
        } catch (err: any) {
            console.error('[DB:BOOTSTRAP] Bootstrap synchronization failed:', err.message);
            this.isBootstrapping = false;
            this.isBackgroundBootstrap = false;
            return { success: false, syncedTables, error: err.message };
        }
    }

    // ── Fallback Write Journal & Reconciliation Engine (Supabase -> NAS) ─────────
    private loadJournal(): void {
        try {
            if (fs.existsSync(this.journalPath)) {
                this.journalEntries = JSON.parse(fs.readFileSync(this.journalPath, 'utf-8'));
            } else {
                this.journalEntries = [];
            }
        } catch (e: any) {
            this.journalEntries = [];
        }
    }

    private persistJournal(): void {
        try {
            fs.mkdirSync(path.dirname(this.journalPath), { recursive: true });
            fs.writeFileSync(this.journalPath, JSON.stringify(this.journalEntries, null, 2), { encoding: 'utf-8', mode: 0o600 });
        } catch (e: any) {
            console.error('[DB:JOURNAL] Failed to persist fallback write journal:', e.message);
        }
    }

    public journalWrite(entry: Omit<FallbackJournalEntry, 'id' | 'timestamp' | 'status' | 'retryCount'>): void {
        const newEntry: FallbackJournalEntry = {
            id: `fw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            status: 'pending',
            retryCount: 0,
            ...entry
        };
        this.journalEntries.push(newEntry);
        this.persistJournal();
        this.broadcastStatus();
        console.log(`[DB:JOURNAL] Recorded offline write for table "${entry.table}" (ID: ${newEntry.id}).`);
    }

    public getPendingJournalEntries(): FallbackJournalEntry[] {
        return this.journalEntries.filter(e => e.status === 'pending');
    }

    /**
     * Idempotently reconciles pending creates, updates, and deletes from the fallback journal to NAS.
     * Runs when NAS recovers from an outage.
     */
    public async reconcileFallbackWrites(): Promise<{ reconciled: number; failed: number }> {
        if (!this.nasClient || !this.isNasReachable) {
            console.warn('[DB:RECONCILE] NAS is not reachable. Reconciliation deferred.');
            return { reconciled: 0, failed: 0 };
        }

        if (this.isReconciling) {
            console.log('[DB:RECONCILE] Reconciliation already in progress. Skipping duplicate run.');
            return { reconciled: 0, failed: 0 };
        }

        this.isReconciling = true;
        const pending = this.getPendingJournalEntries();
        if (pending.length === 0) {
            console.log('[DB:RECONCILE] No pending fallback writes to reconcile.');
            this.circuitState = 'healthy';
            this.activeTarget = 'nas';
            this.isReconciling = false;
            this.broadcastStatus();
            return { reconciled: 0, failed: 0 };
        }

        console.log(`[DB:RECONCILE] Reconciling ${pending.length} offline fallback writes to NAS...`);
        let reconciledCount = 0;
        let failedCount = 0;

        // 1. Identify records that have subsequent deletions in the pending queue
        // Pre-cancels prior inserts/updates so deleted rows are never temporarily recreated on NAS
        const pendingDeletions = new Set<string>();
        for (let i = pending.length - 1; i >= 0; i--) {
            const e = pending[i];
            if (e.operation === 'delete') {
                const pkVal = e.primaryKey?.value || (e.filter?.[0]?.value);
                if (pkVal !== undefined && pkVal !== null) {
                    pendingDeletions.add(`${e.table}:${pkVal}`);
                }
            }
        }

        for (const entry of pending) {
            try {
                const { table, operation, data, primaryKey, filter } = entry;
                const pkField = primaryKey?.name || (data?.id ? 'id' : (data?.product_code ? 'product_code' : null));
                const pkValue = primaryKey?.value || (pkField && data ? data[pkField] : null);
                const recordKey = (pkValue !== null && pkValue !== undefined) ? `${table}:${pkValue}` : null;

                // If record was subsequently deleted during outage, mark prior insert/update superseded
                if (operation !== 'delete' && recordKey && pendingDeletions.has(recordKey)) {
                    entry.status = 'reconciled';
                    entry.reconciledAt = Date.now();
                    reconciledCount++;
                    continue;
                }

                if (operation === 'delete') {
                    // Safe delete reconciliation: Ensure deleted item is not resurrected on NAS
                    if (primaryKey) {
                        const { error: delErr } = await this.nasClient
                            .from(table)
                            .delete()
                            .eq(primaryKey.name, primaryKey.value);
                        if (delErr) throw delErr;
                    } else if (filter && filter.length > 0) {
                        let q = this.nasClient.from(table).delete();
                        for (const f of filter) {
                            q = q.eq(f.column, f.value);
                        }
                        const { error: delErr } = await q;
                        if (delErr) throw delErr;
                    }
                } else if (operation === 'update') {
                    if (data && pkField && pkValue !== null && pkValue !== undefined) {
                        // Check if row exists on NAS before updating (never recreate a row that was deleted on NAS)
                        const { data: existingOnNas } = await this.nasClient
                            .from(table)
                            .select('*')
                            .eq(pkField, pkValue)
                            .maybeSingle();

                        if (!existingOnNas) {
                            // Row was deleted on NAS — DO NOT RESURRECT
                            console.log(`[DB:RECONCILE] Row ${recordKey} does not exist on NAS (was deleted). Skipping update.`);
                        } else {
                            let shouldApply = true;
                            // Check version conflict
                            if (existingOnNas.version !== undefined && data.version !== undefined) {
                                if (Number(existingOnNas.version) >= Number(data.version)) {
                                    shouldApply = false;
                                }
                            }
                            // Check updated_at timestamp conflict
                            if (existingOnNas.updated_at && data.updated_at) {
                                const nasTime = new Date(existingOnNas.updated_at).getTime();
                                const fallbackTime = new Date(data.updated_at).getTime();
                                if (nasTime >= fallbackTime) {
                                    shouldApply = false;
                                }
                            }

                            if (shouldApply) {
                                const { error: updErr } = await this.nasClient
                                    .from(table)
                                    .update(data)
                                    .eq(pkField, pkValue);
                                if (updErr) throw updErr;
                            }
                        }
                    }
                } else if (operation === 'insert' || operation === 'upsert') {
                    if (data) {
                        let shouldApply = true;
                        if (pkField && pkValue !== null && pkValue !== undefined) {
                            const { data: existingOnNas } = await this.nasClient
                                .from(table)
                                .select('*')
                                .eq(pkField, pkValue)
                                .maybeSingle();

                            if (existingOnNas) {
                                if (existingOnNas.version !== undefined && data.version !== undefined) {
                                    if (Number(existingOnNas.version) >= Number(data.version)) {
                                        shouldApply = false;
                                    }
                                }
                                if (existingOnNas.updated_at && data.updated_at) {
                                    const nasTime = new Date(existingOnNas.updated_at).getTime();
                                    const fallbackTime = new Date(data.updated_at).getTime();
                                    if (nasTime >= fallbackTime) {
                                        shouldApply = false;
                                    }
                                }
                            }
                        }

                        if (shouldApply) {
                            const { error: upsertErr } = await this.nasClient.from(table).upsert(data);
                            if (upsertErr) throw upsertErr;
                        }
                    }
                }

                entry.status = 'reconciled';
                entry.reconciledAt = Date.now();
                reconciledCount++;
                this.metrics.reconciledWrites++;
            } catch (err: any) {
                console.error(`[DB:RECONCILE] Failed to reconcile entry ${entry.id} (${entry.table}):`, err.message);
                entry.retryCount++;
                entry.error = err.message;
                if (entry.retryCount >= 5) {
                    entry.status = 'failed';
                }
                failedCount++;
            }
        }

        // Clean up old reconciled entries (keep last 100 for audit)
        const reconciled = this.journalEntries.filter(e => e.status === 'reconciled');
        if (reconciled.length > 100) {
            const cutoff = Date.now() - 7 * 86400 * 1000;
            this.journalEntries = this.journalEntries.filter(e => e.status !== 'reconciled' || (e.reconciledAt && e.reconciledAt > cutoff));
        }

        this.persistJournal();
        this.isReconciling = false;

        this.circuitState = 'healthy';
        this.activeTarget = 'nas';
        this.broadcastStatus();

        this.logDiagnostic({
            event: 'RECONCILE',
            activeDb: 'nas',
            reconciliationResult: { reconciled: reconciledCount, failed: failedCount }
        });

        console.log(`[DB:RECONCILE] Reconciliation complete: ${reconciledCount} reconciled, ${failedCount} deferred/failed. Active DB restored to NAS.`);
        return { reconciled: reconciledCount, failed: failedCount };
    }

    // ── Supabase ~1 GB Bounded Retention Engine ──────────────────────────────────
    /**
     * Enforces the ~1 GB Supabase fallback dataset retention policy.
     * Retains active products, global attributes, and active orders.
     * Prunes completed orders older than 90 days from Supabase Cloud ONLY.
     * Emits warnings if storage approaches the 800 MB (80%) or 950 MB (95%) thresholds.
     * NEVER deletes data from the authoritative NAS master.
     */
    public async maintainSupabaseRetention(): Promise<{
        prunedOrders: number;
        estimatedFallbackSizeMb: number;
        warningState: 'ok' | 'warning' | 'critical';
    }> {
        const client = this.supabaseAdmin || this.supabaseClient;
        if (!client) {
            return { prunedOrders: 0, estimatedFallbackSizeMb: 0, warningState: 'ok' };
        }

        console.log('[DB:RETENTION] Running Supabase Cloud fallback retention audit (~1 GB boundary)...');
        let prunedOrders = 0;

        try {
            // Cutoff: Completed orders older than 90 days
            const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();

            const { data: oldCompletedOrders, error } = await client
                .from('make_orders')
                .select('id, order_number, status')
                .in('status', ['Delivered', 'Completed'])
                .lt('created_at', ninetyDaysAgo)
                .limit(200);

            if (error) {
                console.warn('[DB:RETENTION] Error querying old completed orders:', error.message);
            } else if (oldCompletedOrders && oldCompletedOrders.length > 0) {
                const orderIds = oldCompletedOrders.map(o => o.id);

                // Verify these orders exist on NAS before deleting from Supabase Cloud
                let safeToDeleteIds: number[] = [];
                if (this.nasClient && this.isNasReachable) {
                    const { data: onNas } = await this.nasClient
                        .from('make_orders')
                        .select('id')
                        .in('id', orderIds);
                    safeToDeleteIds = (onNas || []).map(o => o.id);
                }

                if (safeToDeleteIds.length > 0) {
                    await client.from('make_order_items').delete().in('order_id', safeToDeleteIds);
                    await client.from('make_order_updates').delete().in('order_id', safeToDeleteIds);
                    await client.from('make_orders').delete().in('id', safeToDeleteIds);
                    prunedOrders = safeToDeleteIds.length;
                    console.log(`[DB:RETENTION] Pruned ${prunedOrders} archived completed orders from Supabase Cloud fallback.`);
                }
            }

            // Estimate total fallback size
            const [prodRes, orderRes, catRes] = await Promise.all([
                client.from('make_products').select('id', { count: 'exact', head: true }),
                client.from('make_orders').select('id', { count: 'exact', head: true }),
                client.from('make_product_categories').select('id', { count: 'exact', head: true })
            ]);

            const prodCount = prodRes.count || 0;
            const orderCount = orderRes.count || 0;
            const catCount = catRes.count || 0;

            const estimatedBytes = (prodCount * 5120) + (orderCount * 25600) + (catCount * 2048);
            const estimatedMb = Number((estimatedBytes / (1024 * 1024)).toFixed(2));

            this.freshnessData.productCount = prodCount;
            this.freshnessData.orderCount = orderCount;
            this.freshnessData.categoryCount = catCount;
            this.freshnessData.storageUsageMb = estimatedMb;
            this.persistFreshness();

            let warningState: 'ok' | 'warning' | 'critical' = 'ok';
            if (estimatedMb >= 950) {
                warningState = 'critical';
                console.error(`[DB:RETENTION] CRITICAL ALERT: Supabase Cloud fallback dataset is ${estimatedMb} MB (>= 950 MB threshold)!`);
            } else if (estimatedMb >= 800) {
                warningState = 'warning';
                console.warn(`[DB:RETENTION] WARNING: Supabase Cloud fallback dataset is ${estimatedMb} MB (>= 800 MB threshold).`);
            } else {
                console.log(`[DB:RETENTION] Fallback dataset healthy: ${prodCount} products, ${orderCount} active/recent orders. Footprint: ${estimatedMb} MB / 1024 MB.`);
            }

            this.logDiagnostic({
                event: 'RETENTION',
                activeDb: this.activeTarget,
                syncStatus: `Retention audit complete. Pruned: ${prunedOrders}, Storage: ${estimatedMb} MB, Status: ${warningState}`
            });

            return { prunedOrders, estimatedFallbackSizeMb: estimatedMb, warningState };
        } catch (err: any) {
            console.error('[DB:RETENTION] Retention audit failed:', err.message);
            return { prunedOrders: 0, estimatedFallbackSizeMb: 0, warningState: 'ok' };
        }
    }
}
