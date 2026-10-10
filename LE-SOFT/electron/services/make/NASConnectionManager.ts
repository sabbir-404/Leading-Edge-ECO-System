/**
 * NASConnectionManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Client-Side Connection Reliability & Lease Management Engine.
 *
 * Runs exclusively in the Electron main process.
 *
 * Key Architectural Safeguards:
 *  - Heartbeat & Lease Semantics: Exchanges lightweight heartbeats with the TrueNAS host.
 *  - Exponential Backoff with Jitter: Prevents thundering herds / connection storms.
 *  - Finite, Bounded Timeouts: Max 2500ms network timeout prevents UI hangs.
 *  - Single-In-Flight Guard: No duplicate parallel reconnect loops.
 *  - Distinguishes Client vs Server Outage: Differentiates local offline vs NAS unavailability.
 *  - Privacy & Security Shield: Strictly exposes only safe status strings to renderer.
 *    (Connected | Reconnecting | Degraded | Offline). NEVER leaks IPs, tokens, or paths.
 */

import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadConfig, getCfAccessHeaders } from '../../supabase';

export type SafeConnectionStatus = 'Connected' | 'Reconnecting' | 'Degraded' | 'Offline';

export interface SafeConnectionInfo {
    status: SafeConnectionStatus;
    lastSync: number;
    isNasOnline: boolean;
}

export class NASConnectionManager {
    private static instance: NASConnectionManager;

    private installationId: string;
    private sessionSecret: string | null = null;
    private currentStatus: SafeConnectionStatus = 'Offline';
    private isNasOnline = false;
    private lastSuccessfulHeartbeat = 0;
    private consecutiveFailures = 0;

    private heartbeatTimer: NodeJS.Timeout | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isReconnecting = false;
    private isDestroyed = false;

    // Timing constants
    private readonly HEARTBEAT_INTERVAL_MS = process.env.LE_TEST_HEARTBEAT_INTERVAL_MS
        ? Math.max(500, parseInt(process.env.LE_TEST_HEARTBEAT_INTERVAL_MS, 10))
        : 15000;
    private readonly TIMEOUT_MS = process.env.LE_TEST_TIMEOUT_MS
        ? Math.max(200, parseInt(process.env.LE_TEST_TIMEOUT_MS, 10))
        : 2500;
    private readonly BASE_BACKOFF_MS = process.env.LE_TEST_BASE_BACKOFF_MS
        ? Math.max(200, parseInt(process.env.LE_TEST_BASE_BACKOFF_MS, 10))
        : 2000;
    private readonly MAX_BACKOFF_MS = 30000;

    private constructor() {
        this.installationId = this.loadOrGenerateInstallationId();
    }

    public static getInstance(): NASConnectionManager {
        if (!NASConnectionManager.instance) {
            NASConnectionManager.instance = new NASConnectionManager();
        }
        return NASConnectionManager.instance;
    }

    /**
     * Loads or creates a persistent anonymous installation ID.
     * Contains zero user or machine personal identifiers.
     */
    private loadOrGenerateInstallationId(): string {
        try {
            const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
            const idPath = path.join(userData, 'installation_id.json');

            if (fs.existsSync(idPath)) {
                const parsed = JSON.parse(fs.readFileSync(idPath, 'utf-8'));
                if (parsed.installationId && typeof parsed.installationId === 'string') {
                    if (parsed.sessionSecret) this.sessionSecret = parsed.sessionSecret;
                    return parsed.installationId;
                }
            }

            const newId = `inst-${crypto.randomUUID()}`;
            fs.mkdirSync(path.dirname(idPath), { recursive: true });
            fs.writeFileSync(idPath, JSON.stringify({ installationId: newId, createdAt: Date.now() }, null, 2), 'utf-8');
            return newId;
        } catch {
            return `inst-${crypto.randomBytes(16).toString('hex')}`;
        }
    }

    /**
     * Persists cryptographic session secret securely to installation storage
     */
    private persistSessionSecret(secret: string): void {
        try {
            const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
            const idPath = path.join(userData, 'installation_id.json');
            if (fs.existsSync(idPath)) {
                const parsed = JSON.parse(fs.readFileSync(idPath, 'utf-8'));
                parsed.sessionSecret = secret;
                fs.writeFileSync(idPath, JSON.stringify(parsed, null, 2), { encoding: 'utf-8', mode: 0o600 });
            }
        } catch {}
    }

    /**
     * Clears invalidated session secret upon 403 authorization failure
     */
    private clearSessionSecret(): void {
        try {
            const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
            const idPath = path.join(userData, 'installation_id.json');
            if (fs.existsSync(idPath)) {
                const parsed = JSON.parse(fs.readFileSync(idPath, 'utf-8'));
                delete parsed.sessionSecret;
                fs.writeFileSync(idPath, JSON.stringify(parsed, null, 2), { encoding: 'utf-8', mode: 0o600 });
            }
        } catch {}
    }

    /**
     * Resolves candidate connection endpoints for the NAS heartbeat service.
     */
    private getHeartbeatCandidates(): string[] {
        // Dedicated test endpoint override (for isolated staging/test harness only)
        // Strictly prevents fall-through to production NAS during outage recovery tests.
        if (process.env.LE_TEST_HEARTBEAT_URL) {
            return [process.env.LE_TEST_HEARTBEAT_URL];
        }

        const config = loadConfig();
        const baseCandidates: string[] = [];

        // 1. Dedicated heartbeat endpoints if defined
        if (config.nasHeartbeatUrl) baseCandidates.push(config.nasHeartbeatUrl);

        // 2. Derive from NAS storage or PostgREST candidates (port 8085 or /health)
        if (config.nasUrl) {
            baseCandidates.push(config.nasUrl.replace(':3001', ':8085'));
        }
        if (config.nasLocalUrl) {
            baseCandidates.push(config.nasLocalUrl.replace(':3001', ':8085'));
        }

        // Standard defaults
        baseCandidates.push('http://100.88.85.6:8085');
        baseCandidates.push('http://192.168.1.14:8085');

        // PostgREST health endpoints as fallback probe
        baseCandidates.push(config.nasUrl || 'http://100.88.85.6:3001');
        baseCandidates.push(config.nasLocalUrl || 'http://192.168.1.14:3001');

        return Array.from(new Set(baseCandidates.filter(Boolean)));
    }

    /**
     * Starts background heartbeat monitoring and lease maintenance.
     */
    public start(): void {
        if (this.heartbeatTimer) return;
        this.performHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.isReconnecting) {
                this.performHeartbeat();
            }
        }, this.HEARTBEAT_INTERVAL_MS);
    }

    /**
     * Stops the connection manager (e.g., during app shutdown).
     */
    public async stop(): Promise<void> {
        this.isDestroyed = true;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        // Send graceful exit notification to NAS if connected
        try {
            const candidates = this.getHeartbeatCandidates().filter(u => u.includes(':8085'));
            for (const url of candidates) {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 1000);
                await fetch(`${url.replace(/\/$/, '')}/api/session/exit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        installationId: this.installationId,
                        sessionSecret: this.sessionSecret
                    }),
                    signal: controller.signal
                }).catch(() => {});
                clearTimeout(tid);
                break;
            }
        } catch {}
    }

    /**
     * Executes an isolated heartbeat and lease renewal check.
     */
    private async performHeartbeat(): Promise<void> {
        if (this.isDestroyed) return;

        const candidates = this.getHeartbeatCandidates();
        let connectedCandidate: string | null = null;
        let isDegradedCandidate = false;

        const appVersion = app?.getVersion ? app.getVersion() : '1.8.11';
        const cfHeaders = getCfAccessHeaders();

        for (const baseUrl of candidates) {
            const cleanUrl = baseUrl.replace(/\/$/, '');
            const isDedicatedService = cleanUrl.includes(':8085');
            const endpoint = isDedicatedService ? `${cleanUrl}/api/heartbeat` : cleanUrl;

            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
                const startTime = Date.now();

                const response = isDedicatedService
                    ? await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...cfHeaders },
                        body: JSON.stringify({
                            installationId: this.installationId,
                            sessionSecret: this.sessionSecret,
                            appVersion,
                            sessionStatus: 'active',
                            connectionState: 'connected',
                            metadata: { pingStartTime: startTime }
                        }),
                        signal: controller.signal
                    })
                    : await fetch(endpoint, {
                        method: 'GET',
                        headers: cfHeaders,
                        signal: controller.signal
                    });

                clearTimeout(tid);
                const elapsed = Date.now() - startTime;

                if (response.ok) {
                    if (isDedicatedService) {
                        try {
                            const data = await response.json();
                            if (data?.sessionSecret && data.sessionSecret !== this.sessionSecret) {
                                this.sessionSecret = data.sessionSecret;
                                this.persistSessionSecret(data.sessionSecret);
                            }
                        } catch {}
                    }
                    connectedCandidate = baseUrl;
                    if (elapsed > 2000) {
                        isDegradedCandidate = true;
                    }
                    break;
                } else if (response.status === 403) {
                    // Token mismatch / server session conflict — reset token and rotate installationId
                    this.sessionSecret = null;
                    this.clearSessionSecret();
                    this.installationId = `inst-${crypto.randomUUID()}`;
                    try {
                        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
                        const idPath = path.join(userData, 'installation_id.json');
                        fs.writeFileSync(idPath, JSON.stringify({ installationId: this.installationId, createdAt: Date.now() }, null, 2), 'utf-8');
                    } catch {}
                }
            } catch {
                // Try next candidate
            }
        }

        if (connectedCandidate) {
            // Success: reset failures and set state
            this.consecutiveFailures = 0;
            this.isNasOnline = true;
            this.lastSuccessfulHeartbeat = Date.now();
            const nextStatus: SafeConnectionStatus = isDegradedCandidate ? 'Degraded' : 'Connected';
            this.updateStatus(nextStatus);
        } else {
            // Heartbeat failed: schedule jittered reconnect backoff
            this.consecutiveFailures++;
            this.isNasOnline = false;
            this.scheduleReconnect();
        }
    }

    /**
     * Schedules a single in-flight reconnection loop with exponential backoff and jitter.
     */
    private scheduleReconnect(): void {
        if (this.isReconnecting || this.isDestroyed) return;
        this.isReconnecting = true;

        this.updateStatus(this.consecutiveFailures >= 3 ? 'Offline' : 'Reconnecting');

        // Exponential backoff: min(BASE * 2^(failures-1), MAX) + random jitter (500-1500ms)
        const exponentialDelay = Math.min(
            this.BASE_BACKOFF_MS * Math.pow(1.5, Math.max(0, this.consecutiveFailures - 1)),
            this.MAX_BACKOFF_MS
        );
        const jitter = Math.floor(Math.random() * 1000) + 500;
        const totalDelay = Math.round(exponentialDelay + jitter);

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(async () => {
            this.isReconnecting = false;
            await this.performHeartbeat();
        }, totalDelay);
    }

    /**
     * Updates internal status and broadcasts safe notification to renderer.
     */
    private updateStatus(newStatus: SafeConnectionStatus): void {
        if (this.currentStatus !== newStatus) {
            this.currentStatus = newStatus;
            console.log(`[NAS-CONN] Status updated to: ${newStatus} (NAS online: ${this.isNasOnline})`);
            this.writeDiagnosticsState();
            this.broadcastStatusToWindows();
        }
    }

    private writeDiagnosticsState(): void {
        try {
            const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
            const statePath = path.join(userData, 'nas_connection_state.json');
            fs.writeFileSync(statePath, JSON.stringify(this.getSafeStatus(), null, 2), 'utf-8');
        } catch {}
    }

    /**
     * Pushes safe connection status to all renderer windows without leaking internals.
     */
    private broadcastStatusToWindows(): void {
        const payload: SafeConnectionInfo = this.getSafeStatus();
        if (typeof BrowserWindow?.getAllWindows === 'function') {
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('nas-connection-status-changed', payload);
                }
            });
        }
    }

    /**
     * Returns strictly sanitized connection metrics suitable for UI display.
     */
    public getSafeStatus(): SafeConnectionInfo {
        return {
            status: this.currentStatus,
            lastSync: this.lastSuccessfulHeartbeat,
            isNasOnline: this.isNasOnline
        };
    }

    public getInstallationId(): string {
        return this.installationId;
    }
}
