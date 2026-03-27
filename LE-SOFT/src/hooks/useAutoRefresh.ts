import { useEffect, useRef } from 'react';

/**
 * Automatically triggers a `fetch` or refresh callback when the Electron backend
 * broadcasts a `data-updated` event for the specified tables.
 * 
 * @param tables Array of table names to listen for (e.g. ['bills', 'products']). Use ['*'] to listen to everything.
 * @param onRefresh Callback function to execute when an update is detected.
 */
export function useAutoRefresh(tables: string[], onRefresh: () => void) {
    // Use a ref so that onRefresh can change without re-binding the IPC listener continuously
    const refreshRef = useRef(onRefresh);
    refreshRef.current = onRefresh;

    // Stable sort/join the tables array so the effect only reinstantiates if the list actually changes
    const tablesKey = [...tables].sort().join(',');

    useEffect(() => {
        const electron = (window as any).electron;
        if (!electron || !electron.onDataUpdated) return;

        // Capture current tables in a ref so the closure always reads the latest value
        const tablesRef = { current: tables };

        const unsubscribe = electron.onDataUpdated((table: string) => {
            if (tablesRef.current.includes(table) || tablesRef.current.includes('*')) {
                // Silently fire the refresh payload in the background
                refreshRef.current();
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [tablesKey]);
}
