import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Override global window.alert to use Toast system
    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (message?: any) => {
            if (!message) return;
            const strMsg = String(message);
            const lowerMsg = strMsg.toLowerCase();
            
            // Auto-detect Toast Type based on keywords
            let type: ToastType = 'info';
            if (lowerMsg.includes('success') || lowerMsg.includes('saved') || lowerMsg.includes('created') || lowerMsg.includes('updated')) {
                type = 'success';
            } else if (lowerMsg.includes('fail') || lowerMsg.includes('error') || lowerMsg.includes('invalid') || lowerMsg.includes('cannot')) {
                type = 'error';
            } else if (lowerMsg.includes('warn') || lowerMsg.includes('attention') || lowerMsg.includes('select')) {
                type = 'warning';
            }
            
            showToast(strMsg, type);
        };

        // Cleanup function to restore original alert if component unmounts
        return () => {
            window.alert = originalAlert;
        };
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.9 }}
                            style={{
                                pointerEvents: 'auto',
                                background: 'white',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                minWidth: '300px',
                                maxWidth: '450px',
                                borderLeft: `6px solid ${
                                    toast.type === 'success' ? '#22c55e' : 
                                    toast.type === 'error' ? '#ef4444' : 
                                    toast.type === 'warning' ? '#f59e0b' : '#3b82f6'
                                }`
                            }}
                        >
                            <div style={{ color: 
                                toast.type === 'success' ? '#22c55e' : 
                                toast.type === 'error' ? '#ef4444' : 
                                toast.type === 'warning' ? '#f59e0b' : '#3b82f6'
                            }}>
                                {toast.type === 'success' && <CheckCircle size={20} />}
                                {toast.type === 'error' && <AlertCircle size={20} />}
                                {toast.type === 'warning' && <AlertTriangle size={20} />}
                                {toast.type === 'info' && <Info size={20} />}
                            </div>
                            <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {toast.message}
                            </div>
                            <button 
                                onClick={() => removeToast(toast.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center' }}
                            >
                                <X size={16} />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
