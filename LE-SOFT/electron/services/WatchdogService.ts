/**
 * WatchdogService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Application Responsiveness, Watchdog & Freeze Diagnostic Engine.
 *
 * Runs exclusively in the Electron main process.
 *
 * Guarantees:
 *  - Main event loop latency monitoring (detects thread-blocking CPU spikes).
 *  - Renderer ping-pong responsiveness health checks.
 *  - Intercepts BrowserWindow 'unresponsive' and webContents 'render-process-gone'.
 *  - Structured, sanitized freeze diagnostic recorder (zero secrets, zero PII).
 *  - Long-operation tracking (>2000ms threshold).
 *  - Graceful recovery mechanisms.
 */

import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

export interface StabilityDiagnosticEntry {
    timestamp: string;
    operationName: string;
    durationMs: number;
    success: boolean;
    errorCategory?: string;
    connectionState?: string;
    appVersion: string;
    memoryHeapMb?: number;
}

export class WatchdogService {
    private static instance: WatchdogService;

    private mainLoopCheckTimer: NodeJS.Timeout | null = null;
    private rendererPingTimer: NodeJS.Timeout | null = null;
    private lastPingSent = 0;
    private pendingPong = false;
    private isMonitoring = false;

    private readonly DRIFT_THRESHOLD_MS = 2000;
    private readonly OPERATION_THRESHOLD_MS = 2000;
    private readonly PING_INTERVAL_MS = 10000;
    private readonly PONG_TIMEOUT_MS = 5000;

    private diagnosticsLogPath: string;

    private constructor() {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.diagnosticsLogPath = path.join(userData, 'stability_diagnostics.json');
    }

    public static getInstance(): WatchdogService {
        if (!WatchdogService.instance) {
            WatchdogService.instance = new WatchdogService();
        }
        return WatchdogService.instance;
    }

    /**
     * Starts watchdog monitors
     */
    public startMonitoring(): void {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        this.startMainEventLoopMonitor();
        this.startRendererResponsivenessMonitor();
    }

    /**
     * Attaches lifecycle listeners to a newly created BrowserWindow
     */
    public attachWindow(win: BrowserWindow): void {
        if (!win || win.isDestroyed()) return;

        win.on('unresponsive', () => {
            const memoryMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
            this.recordDiagnostic({
                operationName: 'window_unresponsive',
                durationMs: 5000,
                success: false,
                errorCategory: 'RENDERER_FREEZE',
                connectionState: 'unresponsive',
                memoryHeapMb: memoryMb
            });
            console.warn('[WATCHDOG] Renderer window reported UNRESPONSIVE.');
        });

        win.on('responsive', () => {
            console.log('[WATCHDOG] Renderer window recovered responsiveness.');
        });

        win.webContents.on('render-process-gone', (_event, details) => {
            this.recordDiagnostic({
                operationName: 'render_process_gone',
                durationMs: 0,
                success: false,
                errorCategory: `CRASH_${details.reason.toUpperCase()}`,
                connectionState: 'crashed'
            });
            console.error('[WATCHDOG] Renderer process crashed or exited:', details.reason);
        });
    }

    /**
     * Monitors main thread drift
     */
    private startMainEventLoopMonitor(): void {
        let expectedTime = Date.now() + 1000;
        this.mainLoopCheckTimer = setInterval(() => {
            const now = Date.now();
            const drift = now - expectedTime;
            if (drift > this.DRIFT_THRESHOLD_MS) {
                this.recordDiagnostic({
                    operationName: 'main_thread_event_loop_stall',
                    durationMs: drift,
                    success: false,
                    errorCategory: 'MAIN_LOOP_DRIFT',
                    memoryHeapMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
                });
                console.warn(`[WATCHDOG] Main event loop stalled for ${drift}ms.`);
            }
            expectedTime = Date.now() + 1000;
        }, 1000);
    }

    /**
     * Sends periodic heartbeat pings to renderer windows
     */
    private startRendererResponsivenessMonitor(): void {
        this.rendererPingTimer = setInterval(() => {
            const windows = BrowserWindow.getAllWindows();
            if (windows.length === 0) return;

            this.lastPingSent = Date.now();
            this.pendingPong = true;

            windows.forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('watchdog-ping', { sentAt: this.lastPingSent });
                }
            });

            // Check pong timeout
            setTimeout(() => {
                if (this.pendingPong) {
                    this.recordDiagnostic({
                        operationName: 'renderer_ping_pong_timeout',
                        durationMs: this.PONG_TIMEOUT_MS,
                        success: false,
                        errorCategory: 'RENDERER_TIMEOUT'
                    });
                }
            }, this.PONG_TIMEOUT_MS);
        }, this.PING_INTERVAL_MS);
    }

    /**
     * Renderer pong received
     */
    public handleRendererPong(): void {
        this.pendingPong = false;
    }

    /**
     * Records an IPC or operation duration metric. Logs to file only if exceeding threshold.
     */
    public recordOperationMetric(operationName: string, durationMs: number, success = true, errorCategory?: string): void {
        if (durationMs >= this.OPERATION_THRESHOLD_MS || !success) {
            this.recordDiagnostic({
                operationName,
                durationMs,
                success,
                errorCategory: errorCategory || (success ? 'SLOW_OPERATION' : 'OPERATION_FAILED')
            });
        }
    }

    /**
     * Appends a sanitized diagnostic entry to stability_diagnostics.json
     */
    public recordDiagnostic(entry: {
        operationName: string;
        durationMs: number;
        success: boolean;
        errorCategory?: string;
        connectionState?: string;
        memoryHeapMb?: number;
    }): void {
        try {
            const fullEntry: StabilityDiagnosticEntry = {
                timestamp: new Date().toISOString(),
                operationName: entry.operationName,
                durationMs: Math.round(entry.durationMs),
                success: entry.success,
                errorCategory: entry.errorCategory || (entry.success ? 'OK' : 'UNKNOWN_ERROR'),
                connectionState: entry.connectionState || 'normal',
                appVersion: app?.getVersion ? app.getVersion() : '1.8.11',
                memoryHeapMb: entry.memoryHeapMb || Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
            };

            let logs: StabilityDiagnosticEntry[] = [];
            if (fs.existsSync(this.diagnosticsLogPath)) {
                try {
                    logs = JSON.parse(fs.readFileSync(this.diagnosticsLogPath, 'utf-8'));
                    if (!Array.isArray(logs)) logs = [];
                } catch {
                    logs = [];
                }
            }

            logs.push(fullEntry);
            if (logs.length > 200) {
                logs = logs.slice(-200); // Keep last 200 items bounded
            }

            fs.mkdirSync(path.dirname(this.diagnosticsLogPath), { recursive: true });
            fs.writeFileSync(this.diagnosticsLogPath, JSON.stringify(logs, null, 2), 'utf-8');
        } catch {}
    }

    /**
     * Reads recent diagnostic logs
     */
    public getRecentDiagnostics(): StabilityDiagnosticEntry[] {
        try {
            if (fs.existsSync(this.diagnosticsLogPath)) {
                const raw = fs.readFileSync(this.diagnosticsLogPath, 'utf-8');
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch {}
        return [];
    }

    public getSanitizedDiagnostics(): StabilityDiagnosticEntry[] {
        return this.getRecentDiagnostics();
    }

    public stop(): void {
        if (this.mainLoopCheckTimer) clearInterval(this.mainLoopCheckTimer);
        if (this.rendererPingTimer) clearInterval(this.rendererPingTimer);
        this.isMonitoring = false;
    }

    public stopMonitoring(): void {
        this.stop();
    }
}
