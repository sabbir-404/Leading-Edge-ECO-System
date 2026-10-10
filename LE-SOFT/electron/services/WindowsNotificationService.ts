/**
 * WindowsNotificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Windows Notification Center Service for LE-SOFT Packaged App.
 *
 * Runs exclusively in the Electron main process.
 *
 * Architectural Features:
 *  - Native Windows Action Center integration via Electron's Notification API.
 *  - Sets authoritative AppUserModelID ('com.leadingedge.lesoft') on Windows launch.
 *  - Throttling & De-duplication: Prevents toast storms and duplicate spam.
 *  - User-configurable persistent preferences saved to userData/notification_settings.json.
 *  - Click handling: focuses BrowserWindow and directs renderer to appropriate route.
 *  - Strictly zero PowerShell hacks or insecure spawned scripts.
 */

import { app, BrowserWindow, Notification } from 'electron';
import fs from 'fs';
import path from 'path';

export interface NotificationSettings {
    enabled: boolean;
    orderNotifications: boolean;
    updateNotifications: boolean;
    systemNotifications: boolean;
    connectionNotifications: boolean;
}

export interface ShowNotificationOptions {
    title: string;
    body: string;
    category?: 'new_order' | 'app_update' | 'system_status' | 'connection_recovery';
    actionRoute?: string;
    dedupKey?: string;
}

export class WindowsNotificationService {
    private static instance: WindowsNotificationService;

    private settingsPath: string;
    private settings: NotificationSettings = {
        enabled: true,
        orderNotifications: true,
        updateNotifications: true,
        systemNotifications: true,
        connectionNotifications: true
    };

    // Deduplication tracking: Map<dedupKey, lastTimestamp>
    private recentNotifications = new Map<string, number>();
    private readonly DEDUP_COOLDOWN_MS = 10000; // 10s cooldown for identical events

    private constructor() {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.settingsPath = path.join(userData, 'notification_settings.json');
        this.loadSettings();

        // Register Windows Application User Model ID for Action Center binding
        if (process.platform === 'win32') {
            app.setAppUserModelId('com.leadingedge.lesoft');
        }
    }

    public static getInstance(): WindowsNotificationService {
        if (!WindowsNotificationService.instance) {
            WindowsNotificationService.instance = new WindowsNotificationService();
        }
        return WindowsNotificationService.instance;
    }

    private loadSettings(): void {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const raw = fs.readFileSync(this.settingsPath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.settings = { ...this.settings, ...parsed };
            }
        } catch {}
    }

    public getSettings(): NotificationSettings {
        return { ...this.settings };
    }

    public updateSettings(newSettings: Partial<NotificationSettings>): NotificationSettings {
        this.settings = { ...this.settings, ...newSettings };
        try {
            fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
        } catch {}
        return this.getSettings();
    }

    /**
     * Dispatches a native notification to the Windows Action Center
     */
    public showNotification(options: ShowNotificationOptions): boolean {
        if (!this.settings.enabled) return false;
        if (!Notification.isSupported()) return false;

        const category = options.category || 'system_status';

        // Check category-specific user toggles
        if (category === 'new_order' && !this.settings.orderNotifications) return false;
        if (category === 'app_update' && !this.settings.updateNotifications) return false;
        if (category === 'system_status' && !this.settings.systemNotifications) return false;
        if (category === 'connection_recovery' && !this.settings.connectionNotifications) return false;

        // Deduplication check
        const dedupKey = options.dedupKey || `${category}:${options.title}:${options.body}`;
        const now = Date.now();
        const lastSent = this.recentNotifications.get(dedupKey);
        if (lastSent && now - lastSent < this.DEDUP_COOLDOWN_MS) {
            return false; // Throttled duplicate
        }
        this.recentNotifications.set(dedupKey, now);

        try {
            let iconPath: string | undefined;
            try {
                const resourceDir = path.join(__dirname, '../../resource');
                const candidate = path.join(resourceDir, 'icon.png');
                if (fs.existsSync(candidate)) iconPath = candidate;
            } catch {}

            const notification = new Notification({
                title: options.title,
                body: options.body,
                icon: iconPath,
                silent: false
            });

            notification.on('click', () => {
                const win = BrowserWindow.getAllWindows()[0];
                if (win && !win.isDestroyed()) {
                    if (win.isMinimized()) win.restore();
                    win.focus();
                    if (options.actionRoute) {
                        win.webContents.send('navigate-to-page', options.actionRoute);
                    }
                }
            });

            notification.show();
            return true;
        } catch (err: any) {
            console.warn('[WindowsNotificationService] Failed to show notification:', err.message);
            return false;
        }
    }
}
