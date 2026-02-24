import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { initDB } from './database';
import { registerDevice, startHeartbeat } from './device-monitor';
import { registerHandlers } from './ipc-handlers';

// ─────────────────────────────────────────────────────────────────────────────
//  Window creation
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
    Menu.setApplicationMenu(null);

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
        icon: path.join(__dirname, '../build/icon.ico'),
        backgroundColor: '#0a0a0a',
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
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    } else {
        win.loadURL('http://localhost:5173');
    }

    win.once('ready-to-show', () => {
        win.show();
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
}

// ─────────────────────────────────────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    await initDB();          // Verify Supabase connectivity
    registerDevice();        // Register this device in device_sessions
    startHeartbeat(60_000);  // Keep session alive every 60 s
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Register all IPC handlers (Supabase-based, defined in ipc-handlers.ts)
// ─────────────────────────────────────────────────────────────────────────────
registerHandlers();
