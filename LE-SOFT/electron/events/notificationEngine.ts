import { Notification } from 'electron';

/**
 * notificationEngine.ts — Real-Time Desktop Notification Engine
 * Dispatches OS native notifications when critical business events occur.
 */

export class NotificationEngine {
    /**
     * Dispatch an OS native notification popup on desktop
     */
    static notify(title: string, body: string, iconPath?: string) {
        if (!Notification.isSupported()) return;

        try {
            const notif = new Notification({
                title,
                body,
                icon: iconPath,
            });
            notif.show();
        } catch (err) {
            console.warn('[NotificationEngine] OS notification dispatch exception:', err);
        }
    }
}
