import React, { createContext, useContext, useState, useEffect } from 'react';

interface NetworkContextType {
    isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({ isOnline: true });

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Treat as online initially, then correct. navigator.onLine is synchronous.
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => {
            console.log('[Network] Connection restored');
            setIsOnline(true);
            // Optionally, we could trigger a background sync here or let the WriteQueue handle it,
            // but WriteQueue already uses setInterval which will automatically push pending writes when online.
            // A cache refresh might be nice, but is handled via Settings or manual reload for now.
        };

        const handleOffline = () => {
            console.warn('[Network] Connection lost — switching to offline mode');
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Additionally ping Supabase occasionally? (Optional, WriteQueue handles its own retries)

    return (
        <NetworkContext.Provider value={{ isOnline }}>
            {children}
        </NetworkContext.Provider>
    );
};
