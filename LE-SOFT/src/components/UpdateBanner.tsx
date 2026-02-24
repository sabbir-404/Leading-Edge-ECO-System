import React, { useState, useEffect } from 'react';
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Floating notification banner that appears when a software update is available.
 * Renders at the top of every page inside DashboardLayout.
 */
const UpdateBanner: React.FC = () => {
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // @ts-ignore
        const cleanup = window.electron.onUpdateStatus?.((data: any) => {
            if (data.status === 'available') {
                setUpdateStatus('available');
                setUpdateInfo(data.info);
                setDismissed(false); // Show banner again for new update
            } else if (data.status === 'downloading') {
                setUpdateStatus('downloading');
                setDownloadProgress(data.progress?.percent || 0);
            } else if (data.status === 'ready') {
                setUpdateStatus('ready');
            } else if (data.status === 'error') {
                // Don't show error banner — too noisy
            }
        });
        return () => cleanup?.();
    }, []);

    if (dismissed || !updateStatus || updateStatus === 'up-to-date') return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -60, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                    position: 'fixed',
                    top: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    background: updateStatus === 'ready'
                        ? 'linear-gradient(135deg, #059669, #10b981)'
                        : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                }}
            >
                {updateStatus === 'available' && (
                    <>
                        <Download size={16} />
                        <span>Update v{updateInfo?.version || 'new'} available!</span>
                        <button
                            onClick={async () => {
                                setUpdateStatus('downloading');
                                setDownloadProgress(0);
                                // @ts-ignore
                                await window.electron.downloadUpdate();
                            }}
                            style={{
                                padding: '4px 14px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.3)',
                                background: 'rgba(255,255,255,0.15)',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                            }}
                        >
                            Download
                        </button>
                    </>
                )}

                {updateStatus === 'downloading' && (
                    <>
                        <RefreshCw size={16} className="spin" />
                        <span>Downloading... {Math.round(downloadProgress)}%</span>
                        <div style={{
                            width: '100px',
                            height: '4px',
                            borderRadius: '2px',
                            background: 'rgba(255,255,255,0.2)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                width: `${downloadProgress}%`,
                                height: '100%',
                                borderRadius: '2px',
                                background: 'white',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                    </>
                )}

                {updateStatus === 'ready' && (
                    <>
                        <CheckCircle size={16} />
                        <span>Update ready!</span>
                        <button
                            onClick={async () => {
                                // @ts-ignore
                                await window.electron.installUpdate();
                            }}
                            style={{
                                padding: '4px 14px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.3)',
                                background: 'rgba(255,255,255,0.2)',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                            }}
                        >
                            Install & Restart
                        </button>
                    </>
                )}

                <button
                    onClick={() => setDismissed(true)}
                    style={{
                        padding: '2px',
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        marginLeft: '4px',
                    }}
                >
                    <X size={14} />
                </button>
            </motion.div>
        </AnimatePresence>
    );
};

export default UpdateBanner;
