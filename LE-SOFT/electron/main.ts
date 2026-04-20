import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
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

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-Updater
//  Checks GitHub Releases for latest.yml (Windows) / latest-mac.yml (macOS)
//  Only runs in production (app.isPackaged). Push status to renderer via IPC.
// ─────────────────────────────────────────────────────────────────────────────
function setupAutoUpdater() {
    if (!app.isPackaged) return; // skip in dev mode

    // Silence console noise — log to app.log instead
    autoUpdater.logger = null;
    autoUpdater.autoDownload = false;       // Let the user decide to download
    autoUpdater.autoInstallOnAppQuit = true; // Install silently on next quit

    const broadcast = (data: object) => {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) win.webContents.send('update-status', data);
        });
    };

    autoUpdater.on('checking-for-update',  () => broadcast({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => broadcast({ status: 'up-to-date' }));
    autoUpdater.on('update-available',  info => broadcast({ status: 'available', info }));
    autoUpdater.on('error', err => {
        console.error('[Updater] Error:', err.message);
        broadcast({ status: 'error', message: err.message });
    });
    autoUpdater.on('download-progress', prog => broadcast({ status: 'downloading', progress: prog }));
    autoUpdater.on('update-downloaded',  info => broadcast({ status: 'ready', info }));

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
        } catch (err) { console.error('Manual fallback fetch failed', err); }
    };

    // IPC: renderer calls these
    ipcMain.handle('check-for-update', async () => {
        try { 
            await autoUpdater.checkForUpdates(); 
            return { success: true }; 
        } catch (e: any) { 
            if (process.platform === 'darwin') {
                await performManualMacCheck();
                return { success: true };
            }
            return { success: false, error: e.message }; 
        }
    });

    ipcMain.handle('download-update', async () => {
        try { await autoUpdater.downloadUpdate(); return { success: true }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });
    
    ipcMain.handle('install-update', () => {
        autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
    });
    
    ipcMain.handle('get-app-version', () => app.getVersion());

    // Check for updates 5 s after launch
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e: any) => {
            if (process.platform === 'darwin') {
                performManualMacCheck();
            }
        });
    }, 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Window creation
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
    Menu.setApplicationMenu(null);
    
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

    // Block DevTools in production
    if (app.isPackaged) {
        win.webContents.on('devtools-opened', () => {
            win.webContents.closeDevTools();
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

app.whenReady().then(() => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

    log('App starting...');
    
    // 1. Open main window immediately so the app is visibly running
    createWindow();
    log('Window created call done');

    // 2. Initialize subsystems asynchronously without blocking UI
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
            registerHandlers();
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
app.on('before-quit', async (event) => {
    // Prevent immediate quit so we can flush
    event.preventDefault();

    console.log('[App] Shutting down — flushing write queue...');
    await flushQueue();

    // Clear sensitive data from memory
    clearCache();
    clearEncryptionKey();

    console.log('[App] Cleanup done. Quitting.');
    app.exit(0);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


