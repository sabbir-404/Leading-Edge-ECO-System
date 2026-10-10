import { app, BrowserWindow, Menu, dialog, ipcMain, session } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { initDB } from './database';
import { initOfflineDB } from './offline-db';
import { registerDevice, startHeartbeat, startBroadcastListener } from './device-monitor';
import { registerHandlers } from './ipc-handlers';
import { initEncryptionKey, clearEncryptionKey } from './field-encryption';
import { startQueue, flush as flushQueue } from './write-queue';
import { clearAll as clearCache } from './cache-manager';
import { triggerSystemLockout, getLockFilePath } from './lockout';
import { getCfAccessHeaders } from './supabase';
import { MediaProtocolService } from './services/media/MediaProtocolService';
import { NASConnectionManager } from './services/make/NASConnectionManager';
import { WindowsNotificationService } from './services/WindowsNotificationService';
import { WatchdogService } from './services/WatchdogService';

// Register privileged custom scheme for secure media loading before app is ready
MediaProtocolService.registerSchemeAsPrivileged();

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-Updater
//  Only runs in production (app.isPackaged). Push status to renderer via IPC.
// ─────────────────────────────────────────────────────────────────────────────
// Sanitizer to guarantee no tokens, headers, or secrets leak to logs
function sanitizeUpdaterLog(msg: any): string {
    if (typeof msg !== 'string') {
        try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
    }
    return msg
        .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
        .replace(/(gh[pousr]_[a-zA-Z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]')
        .replace(/([?&](?:token|key|secret|password|access_token)=)[^&]+/gi, '$1[REDACTED]')
        .replace(/(authorization:\s*)[^\r\n]+/gi, '$1[REDACTED]');
}

function appendUpdaterLog(msg: string) {
    try {
        const logPath = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {}
}

function setupAutoUpdater() {
    const updaterLogger = {
        info: (msg: any) => {
            const clean = sanitizeUpdaterLog(msg);
            console.log(`[Updater] ${clean}`);
            appendUpdaterLog(`[Updater] ${clean}`);
        },
        warn: (msg: any) => {
            const clean = sanitizeUpdaterLog(msg);
            console.warn(`[Updater] ${clean}`);
            appendUpdaterLog(`[Updater WARN] ${clean}`);
        },
        error: (msg: any) => {
            const clean = sanitizeUpdaterLog(msg);
            console.error(`[Updater] ${clean}`);
            appendUpdaterLog(`[Updater ERROR] ${clean}`);
        },
        debug: (msg: any) => {
            if (!app.isPackaged) {
                console.log(`[Updater DEBUG] ${sanitizeUpdaterLog(msg)}`);
            }
        }
    };

    try {
        autoUpdater.logger = updaterLogger;
        autoUpdater.autoDownload = false;       // Let the user decide to download
        autoUpdater.autoInstallOnAppQuit = true; // Install silently on next quit
    } catch (e: any) {
        console.warn('Failed to configure autoUpdater:', e);
        appendUpdaterLog(`[Updater ERROR] Failed to configure autoUpdater: ${sanitizeUpdaterLog(e.message)}`);
    }

    const broadcast = (data: object) => {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) win.webContents.send('update-status', data);
        });
    };

    if (app.isPackaged) {
        autoUpdater.on('checking-for-update',  () => {
            updaterLogger.info('Checking for update at provider feed...');
            broadcast({ status: 'checking' });
        });
        autoUpdater.on('update-not-available', (info) => {
            updaterLogger.info(`Update check complete: application is up-to-date (v${app.getVersion()})`);
            broadcast({ status: 'up-to-date', info });
        });
        autoUpdater.on('update-available',  info => {
            updaterLogger.info(`Update available: v${info?.version} (current: v${app.getVersion()})`);
            broadcast({ status: 'available', info });
        });
        autoUpdater.on('error', err => {
            const cleanMsg = sanitizeUpdaterLog(err.message);
            updaterLogger.error(`Updater error: ${cleanMsg}`);
            broadcast({ status: 'error', message: cleanMsg });
        });
        autoUpdater.on('download-progress', prog => {
            broadcast({ status: 'downloading', progress: prog });
        });
        autoUpdater.on('update-downloaded',  info => {
            updaterLogger.info(`Update downloaded successfully: v${info?.version}. Ready for install.`);
            broadcast({ status: 'ready', info });
        });
    }

    // Helper: fallback update check for unsigned macOS builds
    const performManualMacCheck = async () => {
        try {
            const response = await fetch('https://api.github.com/repos/sabbir-404/Leading-Edge-ECO-System/releases/latest');
            if (!response.ok) return;
            const data = await response.json();
            if (data && data.tag_name) {
                const current = app.getVersion().replace('v', '').split('.').map(Number);
                const latest = data.tag_name.replace('v', '').split('.').map(Number);
                
                let isNewer = false;
                for (let i = 0; i < 3; i++) {
                    if ((latest[i] || 0) > (current[i] || 0)) { isNewer = true; break; }
                    if ((latest[i] || 0) < (current[i] || 0)) { break; }
                }

                if (isNewer) {
                    broadcast({ 
                        status: 'available', 
                        isManual: true,
                        info: { 
                            version: data.tag_name, 
                            releaseNotes: 'Automatic installation is unavailable because this Mac build is unsigned. Please download the latest version from the releases page manually.' 
                        } 
                    });
                } else {
                    broadcast({ status: 'up-to-date' });
                }
            }
        } catch (err: any) { updaterLogger.error(`Manual fallback fetch failed: ${sanitizeUpdaterLog(err?.message)}`); }
    };

    // IPC: renderer calls these
    ipcMain.handle('check-for-update', async () => {
        if (!app.isPackaged) {
            return { status: 'up-to-date' };
        }
        try { 
            updaterLogger.info('check-for-update requested via IPC');
            await autoUpdater.checkForUpdates(); 
            return { status: 'checking' }; 
        } catch (e: any) { 
            if (process.platform === 'darwin') {
                await performManualMacCheck();
                return { status: 'checking' };
            }
            const cleanMsg = sanitizeUpdaterLog(e.message);
            updaterLogger.error(`Check for update failed: ${cleanMsg}`);
            return { status: 'error', message: cleanMsg }; 
        }
    });

    ipcMain.handle('download-update', async () => {
        if (!app.isPackaged) return { status: 'idle' };
        try { 
            updaterLogger.info('download-update requested via IPC');
            await autoUpdater.downloadUpdate(); 
            return { status: 'downloading' }; 
        } catch (e: any) { 
            const cleanMsg = sanitizeUpdaterLog(e.message);
            updaterLogger.error(`Download update failed: ${cleanMsg}`);
            broadcast({ status: 'error', message: cleanMsg, phase: 'download' });
            return { status: 'error', message: cleanMsg, phase: 'download' }; 
        }
    });
    
    ipcMain.handle('install-update', async () => {
        if (!app.isPackaged) return { status: 'idle' };
        try {
            updaterLogger.info('install-update requested via IPC — calling quitAndInstall');
            autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
            return { status: 'installing' };
        } catch (e: any) { 
            const cleanMsg = sanitizeUpdaterLog(e.message);
            updaterLogger.error(`Install update failed: ${cleanMsg}`);
            broadcast({ status: 'error', message: cleanMsg, phase: 'install' });
            return { status: 'error', message: cleanMsg, phase: 'install' }; 
        }
    });
    
    ipcMain.handle('get-app-version', () => app.getVersion());

    // Check for updates 5 s after launch
    if (app.isPackaged) {
        setTimeout(() => {
            updaterLogger.info('Running automated 5s startup update check...');
            autoUpdater.checkForUpdates().catch((e: any) => {
                if (process.platform === 'darwin') {
                    performManualMacCheck();
                } else {
                    updaterLogger.error(`Startup update check error: ${sanitizeUpdaterLog(e?.message)}`);
                }
            });
        }, 5000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Window creation
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
    Menu.setApplicationMenu(null);
    
    // Check if the system is locked out
    const lockFilePath = getLockFilePath();
    if (fs.existsSync(lockFilePath)) {
        let lockReason = 'tampering detected';
        try {
            const content = fs.readFileSync(lockFilePath, 'utf-8');
            const data = JSON.parse(content);
            if (data.reason) lockReason = data.reason;
        } catch {}
        
        const win = new BrowserWindow({
            width: 600,
            height: 400,
            resizable: false,
            frame: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        
        win.loadURL(`data:text/html,
            <html>
            <head>
                <title>System Locked</title>
                <style>
                    body {
                        background: #0f172a;
                        color: #f8fafc;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        text-align: center;
                        padding: 2rem;
                        box-sizing: border-box;
                    }
                    .container {
                        max-width: 450px;
                        background: #1e293b;
                        border: 1px solid #334155;
                        border-radius: 16px;
                        padding: 2rem;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.45);
                    }
                    .icon {
                        font-size: 3.5rem;
                        margin-bottom: 0.75rem;
                    }
                    h1 {
                        font-size: 1.6rem;
                        margin: 0 0 0.75rem;
                        font-weight: 800;
                        color: #ef4444;
                        letter-spacing: -0.025em;
                    }
                    p {
                        color: #94a3b8;
                        font-size: 0.9rem;
                        line-height: 1.5;
                        margin: 0 0 1.5rem;
                    }
                    .reason {
                        background: #0f172a;
                        color: #f1f5f9;
                        font-family: monospace;
                        font-size: 0.8rem;
                        padding: 0.5rem;
                        border-radius: 6px;
                        margin-bottom: 1.5rem;
                        border: 1px solid #334155;
                    }
                    .footer {
                        font-size: 0.75rem;
                        color: #64748b;
                        border-top: 1px solid #334155;
                        padding-top: 1rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🛑</div>
                    <h1>SYSTEM DISABLED</h1>
                    <p>LESOFT has been disabled due to detected software tampering or unauthorized modification. Please contact the administrator/developer to restore access.</p>
                    <div class="reason">Reason: ${lockReason}</div>
                    <div class="footer">
                        Secure Lock State Active
                    </div>
                </div>
            </body>
            </html>
        `);
        win.show();
        return;
    }

    // Custom logging for debugging production
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const log = (msg: string) => {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(logPath, entry);
        console.log(msg);
    };

    log('Creating window...');

    // Resolve app icon cross-platform:
    //  - In packaged builds the icon is bundled alongside the binary
    //  - In dev mode we resolve relative to the project root via __dirname
    const isMac = process.platform === 'darwin';
    const iconFile = isMac
        ? path.join(__dirname, '../Logo/icon.icns')
        : path.join(path.dirname(path.dirname(__dirname)), 'icon.ico');

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        icon: iconFile,
        backgroundColor: '#f5f6fa',
        show: false,
        frame: true,
        // titleBarStyle and overlay are platform-specific:
        //   Windows: 'hidden' + titleBarOverlay gives a custom-coloured caption bar
        //   macOS:   'hiddenInset' keeps native traffic-light buttons in the correct position
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        ...(isMac ? {} : {
            titleBarOverlay: {
                color: '#c0c0c0',
                symbolColor: '#111111',
                height: 64
            }
        }),
    });

    // Initialize & attach services
    try {
        WatchdogService.getInstance().attachWindow(win);
        WatchdogService.getInstance().startMonitoring();
        NASConnectionManager.getInstance().start();
        WindowsNotificationService.getInstance();
    } catch (e: any) {
        log(`Failed to attach watchdog or background services to window: ${e.message}`);
    }

    // DevTools opened in production = tampering detected
    if (app.isPackaged) {
        win.webContents.on('devtools-opened', () => {
            triggerSystemLockout('DevTools opened in production');
        });
    }

    if (app.isPackaged) {
        win.loadFile(path.join(__dirname, '../resource/index.html'));
    } else {
        // In dev mode, retry if the Vite dev server is not yet ready
        const tryLoad = (retries = 10) => {
            win.loadURL('http://localhost:5173').catch(() => {
                if (retries > 0) {
                    console.log(`[Main] Dev server not ready, retrying in 1s... (${retries} left)`);
                    setTimeout(() => tryLoad(retries - 1), 1000);
                } else {
                    // Final fallback if dev server never started - load from built files
                    console.error('[Main] Dev server unavailable. Falling back to resource/index.html');
                    win.loadFile(path.join(__dirname, '../resource/index.html')).catch(console.error);
                }
            });
        };
        tryLoad();
    }

    win.once('ready-to-show', () => {
        win.show();
        // TEMP: Open DevTools to capture console errors
        if (!app.isPackaged) {
            win.webContents.openDevTools();
        }
    });

    // Always show the window after 3 seconds even if ready-to-show doesn't fire
    setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) {
            win.show();
        }
    }, 3000);

    // Log renderer errors and failed loads to the log file
    win.webContents.on('did-fail-load', (_: any, errorCode: number, errorDescription: string, validatedURL: string) => {
        const lp = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] LOAD FAILED: ${errorCode} ${errorDescription} @ ${validatedURL}\n`);
    });

    win.webContents.on('console-message', (_: any, level: number, message: string, line: number, sourceId: string) => {
        if (level >= 2) { // 2=warning, 3=error
            const lp = path.join(app.getPath('userData'), 'app.log');
            fs.appendFileSync(lp, `[${new Date().toISOString()}] RENDERER[${level}]: ${message} (${sourceId}:${line})\n`);
        }
    });

    // Renderer process crash & unresponsive recovery handlers
    win.webContents.on('render-process-gone', (_event, details) => {
        const lp = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] RENDER PROCESS GONE: ${details.reason} (exit: ${details.exitCode})\n`);
        try {
            const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
            TelemetryEngine.getInstance().reportError({
                error: new Error(`Renderer process terminated: ${details.reason} (exitCode: ${details.exitCode})`),
                source: 'renderer',
                severity: details.reason === 'clean-exit' ? 'info' : 'fatal',
                operation: 'RENDERER_PROCESS_GONE',
                metadata: { reason: details.reason, exitCode: details.exitCode }
            });
        } catch {}
    });

    win.webContents.on('unresponsive', () => {
        const lp = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] RENDERER UNRESPONSIVE\n`);
        try {
            const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
            TelemetryEngine.getInstance().reportError({
                error: new Error('Renderer window unresponsive'),
                source: 'renderer',
                severity: 'warning',
                operation: 'RENDERER_UNRESPONSIVE'
            });
        } catch {}
    });

    // Block reload / devtools shortcuts
    win.webContents.on('before-input-event', (event, input) => {
        const ctrl = input.control || input.meta;
        const shift = input.shift;
        const key = input.key.toLowerCase();
        if ((ctrl && key === 'r') || key === 'f5') { event.preventDefault(); return; }
        if (ctrl && shift && key === 'i') { event.preventDefault(); return; }
        if (ctrl && key === 'u') { event.preventDefault(); return; }
        if (ctrl && key === 'p') { event.preventDefault(); return; }
        if (key === 'f12') { event.preventDefault(); return; }
    });

    // Close confirmation dialog
    win.on('close', (e) => {
        e.preventDefault(); // block default close
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Yes, Close', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Confirm Exit',
            message: 'Are you sure you want to close LESOFT?',
            detail: 'Any unsaved changes may be lost.',
            // No hard-coded icon path — dialog inherits the app icon automatically
            noLink: true,
        });
        if (choice === 0) {
            win.destroy(); // confirmed — actually close
        }
        // choice === 1: Cancel → do nothing, window stays open
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
// Disable hardware acceleration to resolve GPU/Blank screen issues on some systems
app.disableHardwareAcceleration();

// ─────────────────────────────────────────────────────────────────────────────
//  Production-Safe Exception & Rejection Capture
// ─────────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
    console.error('[MAIN:FATAL] Uncaught Exception:', error);
    try {
        const lp = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error?.stack || error}\n`);
    } catch {}

    try {
        const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
        TelemetryEngine.getInstance().recordPendingCrash(error, 'Main process uncaughtException');
        TelemetryEngine.getInstance().reportError({
            error,
            source: 'main',
            severity: 'fatal',
            operation: 'PROCESS_UNCAUGHT_EXCEPTION'
        });
    } catch {}
});

process.on('unhandledRejection', (reason) => {
    console.error('[MAIN] Unhandled Promise Rejection:', reason);
    try {
        const lp = path.join(app.getPath('userData'), 'app.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason instanceof Error ? reason.stack : reason}\n`);
    } catch {}

    try {
        const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
        TelemetryEngine.getInstance().reportError({
            error: reason instanceof Error ? reason : new Error(String(reason)),
            source: 'main',
            severity: 'error',
            operation: 'PROCESS_UNHANDLED_REJECTION'
        });
    } catch {}
});

app.whenReady().then(() => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

    // Anti-Tamper: Check for debugger launch arguments in production
    if (app.isPackaged) {
        const args = process.argv || [];
        const hasDebugArgs = args.some(arg => 
            arg.startsWith('--inspect') || 
            arg.startsWith('--remote-debugging-port') || 
            arg.startsWith('--remote-debugging-pipe')
        );
        if (hasDebugArgs) {
            const lockFilePath = getLockFilePath();
            try {
                fs.writeFileSync(lockFilePath, JSON.stringify({
                    timestamp: new Date().toISOString(),
                    reason: 'unauthorized debugging command-line flags'
                }, null, 2), 'utf-8');
            } catch {}
        }
    }

    const lockFilePath = getLockFilePath();
    if (fs.existsSync(lockFilePath)) {
        log('App starting in LOCKED mode. Aborting initialization.');
        createWindow();
        return;
    }

    log('App starting...');
    
    // Register IPC handlers early to ensure renderer calls before background init succeed
    // This avoids a race where the renderer invokes `ipcRenderer.invoke(...)` before handlers
    // are registered, causing "No handler registered" errors in the renderer.
    try {
        registerHandlers();
        log('IPC handlers registered');
    } catch (err: any) {
        log(`Failed to register IPC handlers early: ${err.message}`);
    }

    try {
        MediaProtocolService.getInstance().initialize();
        log('Media protocol service initialized');
    } catch (err: any) {
        log(`Failed to initialize media protocol service: ${err.message}`);
    }

    // 1. Open main window immediately so the app is visibly running
    createWindow();
    log('Window created call done');

    // 2. Inject CF Access headers for all requests to storage.lenas.me so that
    //    <img> tags in the renderer can load product images through the Cloudflare Tunnel
    //    without needing Tailscale. We read credentials at call-time from the config file
    //    so they're always fresh even after a config update.
    try {
        session.defaultSession.webRequest.onBeforeSendHeaders(
            { urls: ['https://storage.lenas.me/*'] },
            (details, callback) => {
                const cfHeaders = getCfAccessHeaders();
                const headers = { ...details.requestHeaders, ...cfHeaders };
                callback({ requestHeaders: headers });
            }
        );
        log('CF Access webRequest interceptor registered for storage.lenas.me');
    } catch (e: any) {
        log(`CF Access interceptor setup failed: ${e.message}`);
    }

    // Explicitly enforce Content-Security-Policy with app-media: permitted for images
    try {
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = { ...details.responseHeaders };
            if (!responseHeaders['content-security-policy'] && !responseHeaders['Content-Security-Policy']) {
                responseHeaders['Content-Security-Policy'] = [
                    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: app-media:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://storage.lenas.me http://100.88.85.6:* ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*; media-src 'self' app-media: blob:; object-src 'none'; base-uri 'self';"
                ];
            }
            callback({ responseHeaders });
        });
        log('Content-Security-Policy onHeadersReceived interceptor registered');
    } catch (e: any) {
        log(`CSP interceptor setup failed: ${e.message}`);
    }


    (async () => {
        try {
            initEncryptionKey();
            log('Encryption key initialized');
        } catch (e: any) {
            log(`Encryption failed: ${e.message}`);
        }

        try {
            log('Initializing DB...');
            // Add a timeout fallback so it doesn't hang forever implicitly
            await Promise.race([
                initDB(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase init timed out')), 15000))
            ]);
            log('Cloud DB ready');

            await Promise.race([
                initOfflineDB(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Offline SQLite init timed out')), 15000))
            ]);
            log('Offline DB ready');
        } catch (e: any) {
            log(`DB Init error: ${e.message}`);
        }

        try {
            startQueue();
            registerDevice();
            startHeartbeat(60_000);
            startBroadcastListener();
            // registerHandlers() has already been called earlier to avoid IPC race.
            setupAutoUpdater(); // ← wire up electron-updater
            log('Background services registered');
        } catch (e: any) {
            log(`Service start error: ${e.message}`);
        }
    })();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Clean shutdown — flush queue, clear security-sensitive memory
// ─────────────────────────────────────────────────────────────────────────────
let isQuitting = false;
let cleanupDone = false;

app.on('before-quit', async (event) => {
    if (cleanupDone) {
        return; // Let the app quit normally
    }

    // Prevent immediate quit so we can perform async cleanup
    event.preventDefault();

    if (isQuitting) {
        return;
    }
    isQuitting = true;

    console.log('[App] Shutting down — flushing write queue...');
    try {
        // Wait for all pending Supabase writes to drain (max 15s timeout).
        // If flush() throws for any reason, we still proceed with exit
        // rather than hanging the app permanently.
        await flushQueue();
    } catch (e: any) {
        console.error('[App] Flush failed on quit:', e.message);
    }

    // Flush offline telemetry queue before exiting (bounded 1.5s timeout)
    try {
        const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
        await Promise.race([
            TelemetryEngine.getInstance().flushOfflineQueue(),
            new Promise(resolve => setTimeout(resolve, 1500))
        ]);
    } catch {}

    // Stop NAS connection manager and watchdog
    try {
        await Promise.race([
            NASConnectionManager.getInstance().stop(),
            new Promise(resolve => setTimeout(resolve, 1000))
        ]);
        WatchdogService.getInstance().stopMonitoring();
    } catch {}

    // Clear sensitive data from memory before exit
    clearCache();
    clearEncryptionKey();

    console.log('[App] Cleanup done. Re-triggering quit.');
    cleanupDone = true;
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


