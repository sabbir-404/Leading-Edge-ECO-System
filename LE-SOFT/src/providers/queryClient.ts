import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 3, // 3 minutes stale time
            gcTime: 1000 * 60 * 15,    // 15 minutes garbage collection time
            retry: 2,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: 1,
        },
    },
});

// Setup IPC listener to auto-invalidate query caches when backend signals data updates
if (typeof window !== 'undefined' && (window as any).electron?.onDataUpdated) {
    (window as any).electron.onDataUpdated((entityType: string) => {
        console.log(`[QueryClient] Received data update signal for: ${entityType}`);
        switch (entityType) {
            case 'products':
            case 'stock_items':
                queryClient.invalidateQueries({ queryKey: ['products'] });
                queryClient.invalidateQueries({ queryKey: ['stock'] });
                break;
            case 'bills':
            case 'bill_items':
                queryClient.invalidateQueries({ queryKey: ['bills'] });
                queryClient.invalidateQueries({ queryKey: ['billing_history'] });
                break;
            case 'vouchers':
            case 'ledgers':
                queryClient.invalidateQueries({ queryKey: ['vouchers'] });
                queryClient.invalidateQueries({ queryKey: ['ledgers'] });
                break;
            case 'customers':
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                break;
            default:
                queryClient.invalidateQueries();
                break;
        }
    });
}
