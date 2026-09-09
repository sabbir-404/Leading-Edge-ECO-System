import { LocalEntityCache } from './local-cache';

/**
 * sync-engine.ts — Background Synchronization Engine (Tally-Style Silent Sync)
 * Syncs product master lists, customers, ledgers, and stock items in the background
 * every 30 seconds without blocking the desktop UI.
 */

export class BackgroundSyncEngine {
    private static timer: any = null;
    private static isSyncing = false;

    /**
     * Start background sync cycle
     */
    static start(supabaseClient: any, broadcastUpdateCallback?: (entityType: string) => void) {
        if (this.timer) return;

        const performSync = async () => {
            if (this.isSyncing || !supabaseClient) return;
            this.isSyncing = true;

            try {
                // 1. Sync Products
                const { data: products } = await supabaseClient.from('products').select('*');
                if (products) {
                    LocalEntityCache.setCache('products', products);
                    if (broadcastUpdateCallback) broadcastUpdateCallback('products');
                }

                // 2. Sync Customers
                const { data: customers } = await supabaseClient.from('billing_customers').select('*');
                if (customers) {
                    LocalEntityCache.setCache('billing_customers', customers);
                    if (broadcastUpdateCallback) broadcastUpdateCallback('customers');
                }

                // 3. Sync Stock Groups & Items
                const { data: stockItems } = await supabaseClient.from('stock_items').select('*');
                if (stockItems) {
                    LocalEntityCache.setCache('stock_items', stockItems);
                    if (broadcastUpdateCallback) broadcastUpdateCallback('stock_items');
                }
            } catch (err) {
                console.warn('[SyncEngine] Silent background sync exception:', err);
            } finally {
                this.isSyncing = false;
            }
        };

        // Run immediate initial sync, then cycle every 30s
        performSync();
        this.timer = setInterval(performSync, 30000);
        console.log('[SyncEngine] Background synchronization service started (30s cycle).');
    }

    static stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
