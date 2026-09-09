import { BrowserWindow } from 'electron';
import { eventBus } from './eventBus';

/**
 * realtimeClient.ts — Supabase Realtime Sub-Second Event Listener Engine
 * Connects via WebSockets to PostgreSQL change streams and broadcasts changes
 * directly to Electron renderer processes for instant UI re-rendering (<1s).
 */

export class SupabaseRealtimeEngine {
    private static channel: any = null;

    static init(supabaseClient: any) {
        if (this.channel || !supabaseClient) return;

        try {
            this.channel = supabaseClient
                .channel('db-changes-realtime')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public' },
                    (payload: any) => {
                        const table = payload.table;
                        const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
                        console.log(`[RealtimeEngine] Instant Postgres event: ${eventType} on ${table}`);

                        // 1. Broadcast to EventBus
                        eventBus.publish(
                            `${table}_${eventType}` as any,
                            payload.new?.id || payload.old?.id || 0,
                            payload.new || payload.old
                        );

                        // 2. Broadcast via IPC to all open Electron windows
                        try {
                            BrowserWindow.getAllWindows().forEach((win) => {
                                if (!win.isDestroyed()) {
                                    win.webContents.send('data-updated', table);
                                    win.webContents.send('realtime-db-event', { table, eventType, record: payload.new || payload.old });
                                }
                            });
                        } catch (err) {
                            console.warn('[RealtimeEngine] Failed to broadcast to renderer window:', err);
                        }
                    }
                )
                .subscribe((status: string) => {
                    console.log(`[RealtimeEngine] Supabase Realtime channel status: ${status}`);
                });
        } catch (err) {
            console.error('[RealtimeEngine] Initialization exception:', err);
        }
    }
}
