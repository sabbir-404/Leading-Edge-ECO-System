/**
 * TelemetryEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-Safe Remote Error & Diagnostics Reporting Engine for LE-SOFT.
 *
 * Invariants & Protections:
 *  - STRICTLY ZERO SECRETS / ZERO PII: All data passes through TelemetrySanitizer.
 *  - NON-BLOCKING & FIRE-AND-FORGET: Reporting never blocks UI or business logic.
 *  - ANONYMOUS DEVICE IDENTIFICATION: Uses an isolated, cryptographically random
 *    UUID (userData/.installation-id), strictly avoiding invasive hardware serials.
 *  - PERSISTENT BOUNDED OFFLINE QUEUE: Max 50 items, 7-day TTL, exponential backoff,
 *    bounded disk footprint (< 1 MB).
 *  - IN-MEMORY AGGREGATION & RATE LIMITING: Deduplicates identical errors and caps
 *    dispatches to 10 reports / 5 minutes (fatal crashes bypass throttling).
 *  - STARTUP CRASH RECOVERY: Catches early launch crashes, writes pending crash
 *    dump, and dispatches on the next successful startup.
 *  - FAIL-SAFE CLOSED: Disabling telemetry drops all dispatches; failures never throw.
 */

import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { TelemetrySanitizer } from './TelemetrySanitizer';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../../credentials';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';
export type ErrorSource = 'renderer' | 'main' | 'database' | 'startup' | 'ipc' | 'sync' | 'unknown';

export interface TelemetryReportPayload {
    id?: number;
    report_fingerprint: string;
    occurred_at: string;
    app_version: string;
    build_id?: string;
    os_name: string;
    os_version: string;
    architecture: string;
    installation_id: string;
    user_role: string;
    error_type: string;
    error_message_sanitized: string;
    stack_trace_sanitized?: string;
    source: ErrorSource | string;
    severity: ErrorSeverity;
    active_database?: 'nas' | 'supabase';
    database_state?: 'healthy' | 'degraded' | 'recovering';
    failover_reason?: string | null;
    operation?: string | null;
    duration_ms?: number | null;
    retry_count?: number;
    app_uptime_seconds: number;
    metadata?: Record<string, any>;
    occurrence_count: number;
}

export interface QueuedTelemetryItem {
    id: string;
    report: TelemetryReportPayload;
    retryCount: number;
    lastAttempt: number;
    enqueuedAt: number;
}

export interface TelemetryStatus {
    enabled: boolean;
    installationId: string;
    diagnosticDeviceId: string;
    queuedReportsCount: number;
    lastSuccessfulUpload: string | null;
    lastUploadError: string | null;
    totalReportedThisSession: number;
}

interface RateLimitTracker {
    timestamps: number[];
}

export class TelemetryEngine {
    private static instance: TelemetryEngine | null = null;

    private installationId = '';
    private diagnosticDeviceId = '';
    private isTelemetryEnabled = true;

    private supabaseClient: SupabaseClient | null = null;
    private supabaseAdmin: SupabaseClient | null = null;
    private fallbackAnonClient: SupabaseClient | null = null;

    // File paths
    private userDataDir: string;
    private installationIdPath: string;
    private settingsPath: string;
    private queuePath: string;
    private crashDumpPath: string;

    // Queue & Deduplication
    private offlineQueue: QueuedTelemetryItem[] = [];
    private readonly MAX_QUEUE_SIZE = 50;
    private readonly QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    private isFlushingQueue = false;
    private flushTimer: NodeJS.Timeout | null = null;

    // In-memory aggregation buffer (fingerprint -> report & timer)
    private aggregationBuffer: Map<string, {
        report: TelemetryReportPayload;
        flushTimeout: NodeJS.Timeout;
    }> = new Map();
    private readonly AGGREGATION_WINDOW_MS = 6000; // 6 seconds debounce aggregation

    // Rate Limiting (10 reports per 5 minutes per installation, except fatal)
    private rateLimiter: RateLimitTracker = { timestamps: [] };
    private readonly RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
    private readonly MAX_REPORTS_PER_WINDOW = 10;

    // Diagnostic metrics
    private lastSuccessfulUpload: string | null = null;
    private lastUploadError: string | null = null;
    private totalReportedThisSession = 0;

    private currentUserRole = 'unknown';

    private constructor() {
        this.userDataDir = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.installationIdPath = path.join(this.userDataDir, '.installation-id');
        this.settingsPath = path.join(this.userDataDir, 'telemetry_settings.json');
        this.queuePath = path.join(this.userDataDir, 'diagnostic_error_queue.json');
        this.crashDumpPath = path.join(this.userDataDir, 'pending_crash_report.json');

        this.initInstallationId();
        this.loadSettings();
        this.loadQueue();
        this.checkStartupCrashRecovery();

        // Start background queue flusher (runs every 30 seconds)
        this.flushTimer = setInterval(() => {
            this.flushOfflineQueue().catch(() => {});
        }, 30000);
    }

    public static getInstance(): TelemetryEngine {
        if (!TelemetryEngine.instance) {
            TelemetryEngine.instance = new TelemetryEngine();
        }
        return TelemetryEngine.instance;
    }

    // ── Supabase Client Registration ─────────────────────────────────────────────
    public registerClients(clients: {
        supabase: SupabaseClient | null;
        supabaseAdmin: SupabaseClient | null;
    }): void {
        this.supabaseClient = clients.supabase;
        this.supabaseAdmin = clients.supabaseAdmin;
    }

    public setCurrentUserRole(role: string): void {
        if (role && typeof role === 'string') {
            this.currentUserRole = role.toLowerCase().trim();
        }
    }

    // ── Installation Identification ──────────────────────────────────────────────
    private initInstallationId(): void {
        try {
            if (fs.existsSync(this.installationIdPath)) {
                const existing = fs.readFileSync(this.installationIdPath, 'utf8').trim();
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) {
                    this.installationId = existing;
                    this.diagnosticDeviceId = `LE-${existing.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
                    return;
                }
            }

            // Generate fresh anonymous cryptographic UUID
            const newId = crypto.randomUUID();
            fs.mkdirSync(this.userDataDir, { recursive: true });
            fs.writeFileSync(this.installationIdPath, newId, { encoding: 'utf8', mode: 0o600 });
            this.installationId = newId;
            this.diagnosticDeviceId = `LE-${newId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
            console.log(`[TELEMETRY] Generated anonymous Installation ID: ${this.diagnosticDeviceId}`);
        } catch (err: any) {
            this.installationId = crypto.randomUUID();
            this.diagnosticDeviceId = `LE-${this.installationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        }
    }

    public getInstallationId(): string {
        return this.installationId;
    }

    public getDiagnosticDeviceId(): string {
        return this.diagnosticDeviceId;
    }

    // ── Settings Management ──────────────────────────────────────────────────────
    private loadSettings(): void {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const raw = fs.readFileSync(this.settingsPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (typeof parsed.enabled === 'boolean') {
                    this.isTelemetryEnabled = parsed.enabled;
                }
            }
        } catch (e) {
            this.isTelemetryEnabled = true;
        }
    }

    public isEnabled(): boolean {
        return this.isTelemetryEnabled;
    }

    public setEnabled(enabled: boolean): void {
        this.isTelemetryEnabled = !!enabled;
        try {
            fs.mkdirSync(this.userDataDir, { recursive: true });
            fs.writeFileSync(this.settingsPath, JSON.stringify({ enabled: this.isTelemetryEnabled }, null, 2), {
                encoding: 'utf8',
                mode: 0o600
            });
            console.log(`[TELEMETRY] Reporting set to: ${this.isTelemetryEnabled ? 'ENABLED' : 'DISABLED'}`);
        } catch (e: any) {
            console.warn('[TELEMETRY] Failed to persist settings:', e.message);
        }
    }

    public getStatus(): TelemetryStatus {
        return {
            enabled: this.isTelemetryEnabled,
            installationId: this.installationId,
            diagnosticDeviceId: this.diagnosticDeviceId,
            queuedReportsCount: this.offlineQueue.length,
            lastSuccessfulUpload: this.lastSuccessfulUpload,
            lastUploadError: this.lastUploadError,
            totalReportedThisSession: this.totalReportedThisSession
        };
    }

    // ── Offline Queue Management ─────────────────────────────────────────────────
    private loadQueue(): void {
        try {
            if (fs.existsSync(this.queuePath)) {
                const raw = fs.readFileSync(this.queuePath, 'utf8');
                const items: QueuedTelemetryItem[] = JSON.parse(raw);
                const now = Date.now();
                // Filter out expired items (> 7 days) and bound size
                this.offlineQueue = items
                    .filter(item => (now - item.enqueuedAt) < this.QUEUE_TTL_MS && item.retryCount < 6)
                    .slice(0, this.MAX_QUEUE_SIZE);
            }
        } catch (e) {
            this.offlineQueue = [];
        }
    }

    private saveQueue(): void {
        try {
            fs.mkdirSync(this.userDataDir, { recursive: true });
            fs.writeFileSync(this.queuePath, JSON.stringify(this.offlineQueue, null, 2), {
                encoding: 'utf8',
                mode: 0o600
            });
        } catch (e: any) {
            console.warn('[TELEMETRY] Failed to persist offline queue:', e.message);
        }
    }

    private enqueueReport(report: TelemetryReportPayload): void {
        const now = Date.now();
        // Prune expired items first
        this.offlineQueue = this.offlineQueue.filter(i => (now - i.enqueuedAt) < this.QUEUE_TTL_MS);

        // Check if report fingerprint already in queue: if so, increment occurrence_count
        const existing = this.offlineQueue.find(i => i.report.report_fingerprint === report.report_fingerprint);
        if (existing) {
            existing.report.occurrence_count = (existing.report.occurrence_count || 1) + (report.occurrence_count || 1);
            existing.report.occurred_at = report.occurred_at;
            this.saveQueue();
            return;
        }

        // Bounded queue eviction: drop oldest non-fatal item if at capacity
        if (this.offlineQueue.length >= this.MAX_QUEUE_SIZE) {
            const nonFatalIdx = this.offlineQueue.findIndex(i => i.report.severity !== 'fatal');
            if (nonFatalIdx !== -1) {
                this.offlineQueue.splice(nonFatalIdx, 1);
            } else {
                this.offlineQueue.shift();
            }
        }

        this.offlineQueue.push({
            id: crypto.randomUUID(),
            report,
            retryCount: 0,
            lastAttempt: 0,
            enqueuedAt: now
        });

        this.saveQueue();
        console.log(`[TELEMETRY] Enqueued report to local offline queue (total queued: ${this.offlineQueue.length}).`);
    }

    public async flushOfflineQueue(): Promise<void> {
        if (this.isFlushingQueue || this.offlineQueue.length === 0 || !this.isTelemetryEnabled) {
            return;
        }

        this.isFlushingQueue = true;
        const now = Date.now();

        try {
            const client = this.getSubmitClient();
            if (!client) {
                this.isFlushingQueue = false;
                return;
            }

            const itemsToProcess = [...this.offlineQueue];
            for (const item of itemsToProcess) {
                // Exponential backoff check: delay = min(300s, 10s * 2^(retryCount-1))
                const backoffDelay = item.retryCount === 0 ? 0 : Math.min(300000, 10000 * Math.pow(2, item.retryCount - 1));
                if (now - item.lastAttempt < backoffDelay) {
                    continue;
                }

                item.lastAttempt = now;
                const success = await this.executeSubmit(client, item.report);
                if (success) {
                    // Remove from queue
                    this.offlineQueue = this.offlineQueue.filter(q => q.id !== item.id);
                    this.lastSuccessfulUpload = new Date().toISOString();
                    this.lastUploadError = null;
                } else {
                    item.retryCount++;
                    if (item.retryCount >= 6) {
                        // Drop after 6 failed attempts to prevent infinite retry loops
                        this.offlineQueue = this.offlineQueue.filter(q => q.id !== item.id);
                    }
                }
            }

            this.saveQueue();
        } catch (e: any) {
            this.lastUploadError = e.message || 'Queue flush error';
        } finally {
            this.isFlushingQueue = false;
        }
    }

    // ── Startup Crash Recovery ───────────────────────────────────────────────────
    public recordPendingCrash(error: any, details?: string): void {
        try {
            const rawMsg = error?.message || String(error);
            const rawStack = error?.stack || '';
            const sanitizedMsg = TelemetrySanitizer.sanitizeText(rawMsg);
            const sanitizedStack = TelemetrySanitizer.sanitizeStackTrace(rawStack);

            const fingerprint = TelemetrySanitizer.generateFingerprint({
                errorType: error?.name || 'StartupCrash',
                sanitizedMessage: sanitizedMsg,
                source: 'startup',
                operation: 'APP_BOOTSTRAP'
            });

            const crashDump: TelemetryReportPayload = {
                report_fingerprint: fingerprint,
                occurred_at: new Date().toISOString(),
                app_version: app?.getVersion ? app.getVersion() : '1.8.4',
                os_name: process.platform,
                os_version: os.release(),
                architecture: process.arch,
                installation_id: this.installationId || crypto.randomUUID(),
                user_role: this.currentUserRole,
                error_type: error?.name || 'StartupCrash',
                error_message_sanitized: sanitizedMsg,
                stack_trace_sanitized: sanitizedStack,
                source: 'startup',
                severity: 'fatal',
                active_database: 'nas',
                database_state: 'degraded',
                failover_reason: details ? TelemetrySanitizer.sanitizeText(details) : null,
                operation: 'APP_BOOTSTRAP',
                app_uptime_seconds: Math.floor(process.uptime()),
                metadata: { details: details ? TelemetrySanitizer.sanitizeText(details) : undefined },
                occurrence_count: 1
            };

            fs.mkdirSync(this.userDataDir, { recursive: true });
            fs.writeFileSync(this.crashDumpPath, JSON.stringify(crashDump, null, 2), {
                encoding: 'utf8',
                mode: 0o600
            });
            console.error('[TELEMETRY] Critical startup crash dump saved to disk.');
        } catch {}
    }

    private checkStartupCrashRecovery(): void {
        try {
            if (fs.existsSync(this.crashDumpPath)) {
                const raw = fs.readFileSync(this.crashDumpPath, 'utf8');
                const crashReport: TelemetryReportPayload = JSON.parse(raw);
                fs.unlinkSync(this.crashDumpPath);

                console.warn('[TELEMETRY] Recovered pending crash report from previous run. Submitting...');
                this.enqueueReport(crashReport);
                // Attempt immediate flush asynchronously
                setTimeout(() => {
                    this.flushOfflineQueue().catch(() => {});
                }, 1500);
            }
        } catch (e: any) {
            console.warn('[TELEMETRY] Failed to recover startup crash dump:', e.message);
        }
    }

    // ── Rate Limiting ────────────────────────────────────────────────────────────
    private checkRateLimit(severity: ErrorSeverity): boolean {
        // Fatal crashes always bypass throttling
        if (severity === 'fatal') {
            return true;
        }

        const now = Date.now();
        // Purge timestamps older than the rate limit window
        this.rateLimiter.timestamps = this.rateLimiter.timestamps.filter(ts => (now - ts) < this.RATE_LIMIT_WINDOW_MS);

        if (this.rateLimiter.timestamps.length >= this.MAX_REPORTS_PER_WINDOW) {
            console.warn('[TELEMETRY] Throttling active: per-installation limit reached (10 reports / 5m). Deduplicating.');
            return false;
        }

        this.rateLimiter.timestamps.push(now);
        return true;
    }

    // ── Public Reporting APIs ────────────────────────────────────────────────────

    /**
     * Reports an error from any application layer (Renderer, Main, IPC, etc.).
     * Strictly asynchronous and non-blocking (zero UI delays).
     */
    public reportError(params: {
        error: any;
        source?: ErrorSource | string;
        severity?: ErrorSeverity;
        operation?: string;
        userRole?: string;
        metadata?: Record<string, any>;
        durationMs?: number;
        activeDb?: 'nas' | 'supabase';
        databaseState?: 'healthy' | 'degraded' | 'recovering';
        failoverReason?: string;
        retryCount?: number;
    }): void {
        if (!this.isTelemetryEnabled) {
            return;
        }

        // Fire-and-forget: execute on next tick so calling thread never blocks
        setImmediate(() => {
            try {
                this.processErrorInternal(params);
            } catch (err: any) {
                console.warn('[TELEMETRY] Non-blocking internal error capture warning:', err.message);
            }
        });
    }

    /**
     * Specialized database correlation reporter for DatabaseFailoverEngine.
     */
    public reportDatabaseError(params: {
        event: string;
        activeDb: 'nas' | 'supabase';
        databaseState?: 'healthy' | 'degraded' | 'recovering';
        failoverReason?: string;
        operation?: string;
        durationMs?: number;
        retryCount?: number;
        error: any;
        metadata?: Record<string, any>;
        severity?: ErrorSeverity;
    }): void {
        this.reportError({
            error: params.error,
            source: 'database',
            severity: params.severity || 'error',
            operation: params.operation || params.event,
            activeDb: params.activeDb,
            databaseState: params.databaseState || 'healthy',
            failoverReason: params.failoverReason,
            durationMs: params.durationMs,
            retryCount: params.retryCount,
            metadata: {
                event: params.event,
                ...params.metadata
            }
        });
    }

    private processErrorInternal(params: {
        error: any;
        source?: ErrorSource | string;
        severity?: ErrorSeverity;
        operation?: string;
        userRole?: string;
        metadata?: Record<string, any>;
        durationMs?: number;
        activeDb?: 'nas' | 'supabase';
        databaseState?: 'healthy' | 'degraded' | 'recovering';
        failoverReason?: string;
        retryCount?: number;
    }): void {
        const err = params.error;
        const rawMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
        const rawStack = err?.stack || '';
        const errorType = err?.name || (err?.code ? `Error[${err.code}]` : 'Error');
        const source = params.source || 'main';
        const severity: ErrorSeverity = params.severity || 'error';
        const operation = params.operation || null;

        // 1. Rigorous Data Sanitization
        const sanitizedMsg = TelemetrySanitizer.sanitizeText(rawMsg);
        const sanitizedStack = TelemetrySanitizer.sanitizeStackTrace(rawStack);
        const sanitizedMeta = TelemetrySanitizer.sanitizeMetadata(params.metadata || {});

        // 2. Deterministic Fingerprint Generation
        const fingerprint = TelemetrySanitizer.generateFingerprint({
            errorType,
            sanitizedMessage: sanitizedMsg,
            source,
            operation: operation || undefined
        });

        // 3. Assemble Report Payload
        const report: TelemetryReportPayload = {
            report_fingerprint: fingerprint,
            occurred_at: new Date().toISOString(),
            app_version: app?.getVersion ? app.getVersion() : '1.8.4',
            os_name: process.platform,
            os_version: os.release(),
            architecture: process.arch,
            installation_id: this.installationId,
            user_role: params.userRole || this.currentUserRole,
            error_type: errorType,
            error_message_sanitized: sanitizedMsg,
            stack_trace_sanitized: sanitizedStack,
            source,
            severity,
            active_database: params.activeDb,
            database_state: params.databaseState,
            failover_reason: params.failoverReason ? TelemetrySanitizer.sanitizeText(params.failoverReason) : null,
            operation,
            duration_ms: params.durationMs !== undefined ? Math.round(params.durationMs) : null,
            retry_count: params.retryCount || 0,
            app_uptime_seconds: Math.floor(process.uptime()),
            metadata: sanitizedMeta,
            occurrence_count: 1
        };

        // 4. In-Memory Aggregation Buffer (6-second debounce window)
        const buffered = this.aggregationBuffer.get(fingerprint);
        if (buffered) {
            buffered.report.occurrence_count += 1;
            buffered.report.occurred_at = report.occurred_at;
            // Extend or preserve timer
            return;
        }

        // Fatal errors dispatch immediately without waiting for debounce
        if (severity === 'fatal') {
            this.dispatchReport(report);
            return;
        }

        // Buffer new error and schedule dispatch
        const flushTimeout = setTimeout(() => {
            const readyItem = this.aggregationBuffer.get(fingerprint);
            this.aggregationBuffer.delete(fingerprint);
            if (readyItem) {
                this.dispatchReport(readyItem.report);
            }
        }, this.AGGREGATION_WINDOW_MS);

        this.aggregationBuffer.set(fingerprint, { report, flushTimeout });
    }

    private dispatchReport(report: TelemetryReportPayload): void {
        this.totalReportedThisSession++;

        // Rate limiting check
        const allowed = this.checkRateLimit(report.severity);
        if (!allowed) {
            // Buffer into offline queue for later slow dispatch instead of dropping
            this.enqueueReport(report);
            return;
        }

        const client = this.getSubmitClient();
        if (!client) {
            this.enqueueReport(report);
            return;
        }

        this.executeSubmit(client, report).then(success => {
            if (success) {
                this.lastSuccessfulUpload = new Date().toISOString();
                this.lastUploadError = null;
            } else {
                this.enqueueReport(report);
            }
        }).catch(err => {
            this.lastUploadError = err.message || 'Dispatch error';
            this.enqueueReport(report);
        });
    }

    private getSubmitClient(): SupabaseClient | null {
        if (this.supabaseClient) {
            return this.supabaseClient;
        }
        // Lazily instantiate anonymous fallback client using public anon parameters
        if (!this.fallbackAnonClient && PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
            try {
                this.fallbackAnonClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
            } catch (err: any) {
                console.warn('[TELEMETRY] Failed to initialize fallback anon client:', err.message);
            }
        }
        return this.fallbackAnonClient;
    }

    private async executeSubmit(client: SupabaseClient, report: TelemetryReportPayload): Promise<boolean> {
        try {
            const { error } = await client
                .from('client_error_reports')
                .insert([report]);

            if (error) {
                console.warn('[TELEMETRY] Supabase submission error:', error.message || error.code);
                this.lastUploadError = error.message || 'Supabase error';
                return false;
            }

            return true;
        } catch (e: any) {
            this.lastUploadError = e.message || 'Network submission error';
            return false;
        }
    }

    // ── Diagnostic Testing & Support Log Export ───────────────────────────────────

    public async sendDiagnosticTest(): Promise<{ success: boolean; message: string; error?: string }> {
        if (!this.isTelemetryEnabled) {
            return {
                success: false,
                message: 'Telemetry is currently disabled by user setting.'
            };
        }

        try {
            const testPayload: TelemetryReportPayload = {
                report_fingerprint: TelemetrySanitizer.generateFingerprint({
                    errorType: 'DiagnosticTestVerification',
                    sanitizedMessage: 'Manual diagnostic connectivity test from client interface',
                    source: 'main',
                    operation: 'DIAGNOSTIC_TEST'
                }),
                occurred_at: new Date().toISOString(),
                app_version: app?.getVersion ? app.getVersion() : '1.8.4',
                os_name: process.platform,
                os_version: os.release(),
                architecture: process.arch,
                installation_id: this.installationId,
                user_role: this.currentUserRole,
                error_type: 'DiagnosticTestVerification',
                error_message_sanitized: 'Manual diagnostic connectivity test from client interface',
                source: 'main',
                severity: 'info',
                active_database: 'nas',
                database_state: 'healthy',
                operation: 'DIAGNOSTIC_TEST',
                app_uptime_seconds: Math.floor(process.uptime()),
                metadata: {
                    testRun: true,
                    triggeredAt: new Date().toISOString()
                },
                occurrence_count: 1
            };

            const client = this.getSubmitClient();
            if (!client) {
                this.enqueueReport(testPayload);
                return {
                    success: false,
                    message: 'Remote client not initialized. Test report was enqueued locally.'
                };
            }

            const success = await this.executeSubmit(client, testPayload);
            if (success) {
                this.lastSuccessfulUpload = new Date().toISOString();
                this.lastUploadError = null;
                return {
                    success: true,
                    message: `Diagnostic test report sent successfully! (Device ID: ${this.diagnosticDeviceId})`
                };
            } else {
                this.enqueueReport(testPayload);
                return {
                    success: false,
                    message: `Could not send live report (${this.lastUploadError || 'network error'}). Saved to offline queue.`
                };
            }
        } catch (e: any) {
            return {
                success: false,
                message: e.message || 'Unexpected test failure'
            };
        }
    }

    public async exportDiagnosticLog(): Promise<{ success: boolean; data?: any; filePath?: string; error?: string }> {
        try {
            const sanitizedLog = {
                exportedAt: new Date().toISOString(),
                installationId: this.installationId,
                diagnosticDeviceId: this.diagnosticDeviceId,
                appVersion: app?.getVersion ? app.getVersion() : '1.8.4',
                platform: process.platform,
                osRelease: os.release(),
                uptimeSeconds: Math.floor(process.uptime()),
                telemetryStatus: this.getStatus(),
                queuedReports: this.offlineQueue.map(item => ({
                    ...item,
                    report: {
                        ...item.report,
                        error_message_sanitized: TelemetrySanitizer.sanitizeText(item.report.error_message_sanitized),
                        metadata: TelemetrySanitizer.sanitizeMetadata(item.report.metadata)
                    }
                }))
            };

            const exportPath = path.join(this.userDataDir, `diagnostic_export_${this.diagnosticDeviceId}.json`);
            fs.writeFileSync(exportPath, JSON.stringify(sanitizedLog, null, 2), { encoding: 'utf8', mode: 0o600 });

            return {
                success: true,
                filePath: exportPath,
                data: sanitizedLog
            };
        } catch (e: any) {
            return {
                success: false,
                error: e.message || 'Export failed'
            };
        }
    }

    // ── Admin Dashboard Telemetry Query ──────────────────────────────────────────

    public async getAdminErrorReports(params: {
        page?: number;
        pageSize?: number;
        severity?: string;
        databaseState?: string;
        appVersion?: string;
        searchFingerprint?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<{
        success: boolean;
        data?: any[];
        total?: number;
        summary?: {
            totalErrors: number;
            uniqueFingerprints: number;
            affectedInstallations: number;
            failoverCount: number;
        };
        error?: string;
    }> {
        try {
            const client = this.supabaseAdmin || this.supabaseClient;
            if (!client) {
                return { success: false, error: 'Database client not available' };
            }

            const page = params.page || 1;
            const pageSize = params.pageSize || 25;
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = client
                .from('client_error_reports')
                .select('*', { count: 'exact' });

            if (params.severity && params.severity !== 'all') {
                query = query.eq('severity', params.severity);
            }
            if (params.databaseState && params.databaseState !== 'all') {
                query = query.eq('database_state', params.databaseState);
            }
            if (params.appVersion && params.appVersion !== 'all') {
                query = query.eq('app_version', params.appVersion);
            }
            if (params.searchFingerprint) {
                query = query.ilike('report_fingerprint', `%${params.searchFingerprint}%`);
            }
            if (params.startDate) {
                query = query.gte('occurred_at', params.startDate);
            }
            if (params.endDate) {
                query = query.lte('occurred_at', params.endDate);
            }

            query = query.order('occurred_at', { ascending: false }).range(from, to);

            const { data, count, error } = await query;

            if (error) {
                return { success: false, error: error.message };
            }

            // Summary metrics query (recent 200 items for aggregations)
            const summaryQuery = await client
                .from('client_error_reports')
                .select('report_fingerprint, installation_id, failover_reason')
                .limit(200);

            let uniqueFingerprints = 0;
            let affectedInstallations = 0;
            let failoverCount = 0;

            if (summaryQuery.data) {
                const fingerprints = new Set(summaryQuery.data.map((r: any) => r.report_fingerprint));
                const installations = new Set(summaryQuery.data.map((r: any) => r.installation_id));
                failoverCount = summaryQuery.data.filter((r: any) => !!r.failover_reason).length;

                uniqueFingerprints = fingerprints.size;
                affectedInstallations = installations.size;
            }

            return {
                success: true,
                data: data || [],
                total: count || 0,
                summary: {
                    totalErrors: count || 0,
                    uniqueFingerprints,
                    affectedInstallations,
                    failoverCount
                }
            };
        } catch (e: any) {
            return {
                success: false,
                error: e.message || 'Failed to fetch admin error reports'
            };
        }
    }

    // ── Remote Retention Policy Pruning ──────────────────────────────────────────

    /**
     * Executes server-side retention cleanup for telemetry reports.
     * Default: removes info logs older than 30d, standard errors older than 90d, fatal crashes older than 180d.
     * Guaranteed to NEVER touch operational tables (make orders, products, billing, etc.).
     */
    public async pruneRemoteReports(params?: {
        defaultRetentionDays?: number;
        fatalRetentionDays?: number;
        infoRetentionDays?: number;
    }): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
        try {
            const client = this.supabaseAdmin;
            if (!client) {
                return { success: false, error: 'Administrative client required for retention pruning' };
            }

            const { data, error } = await client.rpc('prune_old_client_error_reports', {
                default_retention_days: params?.defaultRetentionDays ?? 90,
                fatal_retention_days: params?.fatalRetentionDays ?? 180,
                info_retention_days: params?.infoRetentionDays ?? 30
            });

            if (error) {
                return { success: false, error: error.message };
            }

            const count = Array.isArray(data) && data[0]?.deleted_count !== undefined
                ? Number(data[0].deleted_count)
                : Number(data ?? 0);

            return { success: true, deletedCount: count };
        } catch (e: any) {
            return {
                success: false,
                error: e.message || 'Pruning execution failed'
            };
        }
    }
}
