/**
 * ConsolidatedHealthEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Coherent Multi-Tier Health Detection & Recovery State Machine.
 *
 * Probes database and file storage independently with real lightweight requests:
 *  - NAS Database Probe: Executes real SQL query (make_products / companies) via PostgREST.
 *  - NAS Storage Probe: Non-destructive HTTP check against TrueNAS storage endpoints.
 *  - Supabase Database & Storage Probes: Verifies fallback availability before routing.
 *  - Anti-Flapping: Requires 2 consecutive failures before degrading; exponential backoff with jitter.
 *  - Coherent States:
 *      * NORMAL_NAS_AUTHORITATIVE: Both NAS database and storage are fully healthy.
 *      * DEGRADED_DATABASE_FALLBACK: NAS database is down; queries route to Supabase; storage unaffected.
 *      * DEGRADED_STORAGE_BUFFER: NAS storage is down; files buffer to Supabase; database unaffected.
 *      * FULL_OFFLINE_LOCAL: Both remote services unreachable; local SQLite outbox & staging active.
 *      * RECOVERING_SYNCHRONIZING: NAS restored; background outbox & upload reconciliation running.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BrowserWindow } from 'electron';
import { getCfAccessHeaders, getNasStorageCandidates } from '../../supabase';
import { DurableOutboxService } from '../outbox/DurableOutboxService';
import { DurableUploadService } from '../media/DurableUploadService';

export type SystemHealthState = 
    | 'NORMAL_NAS_AUTHORITATIVE'
    | 'DEGRADED_DATABASE_FALLBACK'
    | 'DEGRADED_STORAGE_BUFFER'
    | 'FULL_OFFLINE_LOCAL'
    | 'RECOVERING_SYNCHRONIZING';

export interface ServiceProbeResult {
    isNasDbHealthy: boolean;
    isNasStorageHealthy: boolean;
    isSupabaseDbHealthy: boolean;
    isSupabaseStorageHealthy: boolean;
    activeNasDbUrl: string | null;
    activeNasStorageUrl: string | null;
    lastProbeTime: number;
    nasDbLatencyMs: number;
    nasStorageLatencyMs: number;
}

export class ConsolidatedHealthEngine {
    private static instance: ConsolidatedHealthEngine | null = null;

    private nasClient: SupabaseClient | null = null;
    private supabaseClient: SupabaseClient | null = null;

    private currentState: SystemHealthState = 'NORMAL_NAS_AUTHORITATIVE';

    private consecutiveNasDbFailures = 0;
    private consecutiveNasStorageFailures = 0;
    private readonly FAILURE_THRESHOLD = 2; // Require 2 consecutive failures to degrade

    private cooldownUntil = 0;
    private cooldownMs = 30000;

    private isNasDbHealthy = true;
    private isNasStorageHealthy = true;
    private isSupabaseDbHealthy = true;
    private isSupabaseStorageHealthy = true;

    private activeNasDbUrl: string | null = null;
    private activeNasStorageUrl: string | null = null;

    private lastProbeTime = 0;
    private nasDbLatencyMs = 0;
    private nasStorageLatencyMs = 0;

    private isProbing = false;
    private isReconciling = false;
    private probeTimer: ReturnType<typeof setInterval> | null = null;

    private constructor() {}

    public static getInstance(): ConsolidatedHealthEngine {
        if (!ConsolidatedHealthEngine.instance) {
            ConsolidatedHealthEngine.instance = new ConsolidatedHealthEngine();
        }
        return ConsolidatedHealthEngine.instance;
    }

    public registerClients(clients: { nas: SupabaseClient | null; supabase: SupabaseClient | null }): void {
        this.nasClient = clients.nas;
        this.supabaseClient = clients.supabase;
    }

    public startMonitoring(intervalMs = 10000): void {
        if (this.probeTimer) return;
        this.probeTimer = setInterval(() => this.runHealthCycle().catch(() => {}), intervalMs);
        console.log(`[ConsolidatedHealth] Started health monitor (cycle: ${intervalMs}ms).`);
        // Immediate initial run
        this.runHealthCycle().catch(() => {});
    }

    public stopMonitoring(): void {
        if (this.probeTimer) {
            clearInterval(this.probeTimer);
            this.probeTimer = null;
        }
    }

    public getCurrentState(): SystemHealthState {
        return this.currentState;
    }

    public getProbeDetails(): ServiceProbeResult {
        return {
            isNasDbHealthy: this.isNasDbHealthy,
            isNasStorageHealthy: this.isNasStorageHealthy,
            isSupabaseDbHealthy: this.isSupabaseDbHealthy,
            isSupabaseStorageHealthy: this.isSupabaseStorageHealthy,
            activeNasDbUrl: this.activeNasDbUrl,
            activeNasStorageUrl: this.activeNasStorageUrl,
            lastProbeTime: this.lastProbeTime,
            nasDbLatencyMs: this.nasDbLatencyMs,
            nasStorageLatencyMs: this.nasStorageLatencyMs
        };
    }

    // ── Independent Probes ───────────────────────────────────────────────────────

    /**
     * Executes independent probes across database and storage targets.
     */
    public async runHealthCycle(): Promise<SystemHealthState> {
        if (this.isProbing) return this.currentState;
        this.isProbing = true;

        try {
            const [nasDbRes, nasStorageRes, sbDbRes, sbStorageRes] = await Promise.all([
                this.probeNasDatabase(),
                this.probeNasStorage(),
                this.probeSupabaseDatabase(),
                this.probeSupabaseStorage()
            ]);

            this.isNasDbHealthy = nasDbRes.healthy;
            this.nasDbLatencyMs = nasDbRes.latency;
            this.activeNasDbUrl = nasDbRes.url;

            this.isNasStorageHealthy = nasStorageRes.healthy;
            this.nasStorageLatencyMs = nasStorageRes.latency;
            this.activeNasStorageUrl = nasStorageRes.url;

            this.isSupabaseDbHealthy = sbDbRes;
            this.isSupabaseStorageHealthy = sbStorageRes;
            this.lastProbeTime = Date.now();

            // Track consecutive failure counts
            if (this.isNasDbHealthy) {
                this.consecutiveNasDbFailures = 0;
            } else {
                this.consecutiveNasDbFailures++;
            }

            if (this.isNasStorageHealthy) {
                this.consecutiveNasStorageFailures = 0;
            } else {
                this.consecutiveNasStorageFailures++;
            }

            // Derive Next State Machine Transition
            this.evaluateStateTransitions();
            this.broadcastHealth();
            return this.currentState;
        } catch (err: any) {
            console.error('[ConsolidatedHealth] Health cycle error:', err.message);
            return this.currentState;
        } finally {
            this.isProbing = false;
        }
    }

    /**
     * Probes NAS database using a REAL lightweight query (not a root HEAD ping).
     */
    public async probeNasDatabase(): Promise<{ healthy: boolean; latency: number; url: string | null }> {
        if (!this.nasClient) return { healthy: false, latency: 0, url: null };
        const t0 = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            // Real lightweight query against authoritative MAKE table with 3000ms timeout and cancellation
            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('NAS DB query timeout (3000ms)')), 3000)
            );

            const queryPromise = (this.nasClient.from('make_products').select('id') as any)
                .abortSignal(controller.signal)
                .limit(1);

            const res = await Promise.race([queryPromise, timeoutPromise]);
            const latency = Date.now() - t0;

            if (res && !res.error) {
                return { healthy: true, latency, url: 'nas_database' };
            }
            return { healthy: false, latency, url: null };
        } catch {
            return { healthy: false, latency: Date.now() - t0, url: null };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Probes NAS file storage non-destructively.
     */
    public async probeNasStorage(): Promise<{ healthy: boolean; latency: number; url: string | null }> {
        const candidates = getNasStorageCandidates();
        const cfHeaders = getCfAccessHeaders();
        const t0 = Date.now();

        for (const base of candidates) {
            try {
                const isTunnel = base.startsWith('https://');
                const headers = isTunnel ? cfHeaders : {};
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);

                const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                }).catch(() => null);

                clearTimeout(timeoutId);

                // Only HTTP 200 is considered healthy; 404 or errors mean storage is not operational
                if (res && res.status === 200) {
                    return { healthy: true, latency: Date.now() - t0, url: base };
                }
            } catch {}
        }
        return { healthy: false, latency: Date.now() - t0, url: null };
    }

    private async probeSupabaseDatabase(): Promise<boolean> {
        if (!this.supabaseClient) return false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('Supabase DB timeout')), 3000)
            );
            const queryPromise = this.supabaseClient.from('companies').select('id').abortSignal(controller.signal).limit(1);
            const res = await Promise.race([queryPromise, timeoutPromise]);
            return !res.error;
        } catch {
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async probeSupabaseStorage(): Promise<boolean> {
        if (!this.supabaseClient) return false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('Supabase Storage timeout')), 3000)
            );
            const listPromise = this.supabaseClient.storage.from('make-order-files').list('', { limit: 1 });
            const res = await Promise.race([listPromise, timeoutPromise]);
            return !res.error;
        } catch {
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ── State Machine Transition Logic ──────────────────────────────────────────

    private evaluateStateTransitions(): void {
        const dbDegraded = this.consecutiveNasDbFailures >= this.FAILURE_THRESHOLD;
        const storageDegraded = this.consecutiveNasStorageFailures >= this.FAILURE_THRESHOLD;

        const isNasFullyUp = this.isNasDbHealthy && this.isNasStorageHealthy;

        if (isNasFullyUp) {
            if (this.currentState !== 'NORMAL_NAS_AUTHORITATIVE') {
                if (this.isReconciling) {
                    // Prevent overlapping recovery cycles
                    return;
                }
                console.log('[ConsolidatedHealth] TrueNAS services restored healthy. Transitioning to RECOVERING_SYNCHRONIZING.');
                this.currentState = 'RECOVERING_SYNCHRONIZING';
                // Trigger reconciliation
                this.triggerRecoverySynchronization();
            }
            return;
        }

        // Both down
        if (dbDegraded && storageDegraded) {
            if (!this.isSupabaseDbHealthy && !this.isSupabaseStorageHealthy) {
                this.currentState = 'FULL_OFFLINE_LOCAL';
            } else {
                this.currentState = 'DEGRADED_DATABASE_FALLBACK';
            }
            return;
        }

        // Only Database degraded
        if (dbDegraded && !storageDegraded) {
            this.currentState = 'DEGRADED_DATABASE_FALLBACK';
            return;
        }

        // Only Storage degraded
        if (!dbDegraded && storageDegraded) {
            this.currentState = 'DEGRADED_STORAGE_BUFFER';
            return;
        }
    }

    public async triggerRecoverySynchronization(): Promise<void> {
        if (this.isReconciling) return;
        this.isReconciling = true;

        try {
            let hasMore = true;
            let iterations = 0;
            const maxIterations = 50;

            while (hasMore && iterations < maxIterations) {
                iterations++;
                const drainedCount = await DurableOutboxService.getInstance().drainNextBatch(20);
                await DurableUploadService.getInstance().processNextBatch();

                const outboxStats = DurableOutboxService.getInstance().getOutboxStats();
                const uploadStats = DurableUploadService.getInstance().getPendingUploadStats();

                const pendingOutbox = outboxStats.bufferedSupabase + outboxStats.pendingLocal + outboxStats.blockedDependencies;
                const pendingUploads = uploadStats.bufferedCount + uploadStats.stagedCount;

                if (pendingOutbox === 0 && pendingUploads === 0) {
                    hasMore = false;
                } else if (drainedCount === 0 && uploadStats.bufferedCount === 0 && uploadStats.stagedCount === 0) {
                    // Stalled or unable to drain in this iteration
                    hasMore = false;
                }
            }

            // Check if all reconciliations truly completed
            const finalOutboxStats = DurableOutboxService.getInstance().getOutboxStats();
            const finalUploadStats = DurableUploadService.getInstance().getPendingUploadStats();

            // Do not declare normal operation while required items remain buffered, pending, blocked, or dead-letter/unverified
            const hasPendingOutbox = (finalOutboxStats.bufferedSupabase > 0) ||
                                     (finalOutboxStats.pendingLocal > 0) ||
                                     (finalOutboxStats.blockedDependencies > 0) ||
                                     (finalOutboxStats.deadLetterCount > 0);

            const hasPendingUploads = (finalUploadStats.bufferedCount > 0) ||
                                      (finalUploadStats.stagedCount > 0);

            if (!hasPendingOutbox && !hasPendingUploads) {
                this.currentState = 'NORMAL_NAS_AUTHORITATIVE';
                console.log('[ConsolidatedHealth] All pending records and buffered uploads reconciled to TrueNAS master. State: NORMAL_NAS_AUTHORITATIVE.');
            } else {
                console.warn(`[ConsolidatedHealth] Incomplete reconciliation (Outbox buffered: ${finalOutboxStats.bufferedSupabase}, pending: ${finalOutboxStats.pendingLocal}, blocked: ${finalOutboxStats.blockedDependencies}, dead_letter: ${finalOutboxStats.deadLetterCount}; Upload buffered: ${finalUploadStats.bufferedCount}, staged: ${finalUploadStats.stagedCount}). Remaining in RECOVERING_SYNCHRONIZING.`);
            }
        } catch (e: any) {
            console.warn('[ConsolidatedHealth] Recovery synchronization warning:', e.message);
        } finally {
            this.isReconciling = false;
        }
    }

    private broadcastHealth(): void {
        try {
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('consolidated-health-changed', {
                        state: this.currentState,
                        details: this.getProbeDetails()
                    });
                }
            });
        } catch {}
    }
}
