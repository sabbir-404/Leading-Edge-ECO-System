import { app, BrowserWindow, Menu, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { initDB } from './database';
import { initOfflineDB } from './offline-db';
import { registerDevice, startHeartbeat } from './device-monitor';
import { registerHandlers } from './ipc-handlers';
import { initEncryptionKey, clearEncryptionKey } from './field-encryption';
import { startQueue, flush as flushQueue } from './write-queue';
import { clearAll as clearCache } from './cache-manager';

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
        icon: 'D:\\Code\\Leading Edge\\icon.ico',
        backgroundColor: '#f5f6fa',
        show: false,
        frame: true,
        titleBarStyle: 'default',
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
            icon: 'D:\\Code\\Leading Edge\\icon.ico',
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

app.whenReady().then(async () => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

    log('App starting...');
    
    // 1. Initialise encryption key
    try {
        initEncryptionKey();
        log('Encryption key initialized');
    } catch (e: any) {
        log(`Encryption failed: ${e.message}`);
    }

    // 2. Verify Supabase connectivity and setup offline DB
    try {
        log('Initializing DB...');
        await initDB();
        log('Cloud DB ready');
        await initOfflineDB();
        log('Offline DB ready');
    } catch (e: any) {
        log(`DB Init error: ${e.message}`);
    }

    // 3. Start the universal async write queue
    startQueue();

    // 4. Register device heartbeat
    registerDevice();
    startHeartbeat(60_000);

    // 5. Register IPC handlers
    registerHandlers();

    // 6. Open main window
    createWindow();
    log('Window created call done');

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


