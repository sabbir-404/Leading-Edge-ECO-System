import React, { useState, useEffect } from 'react';
import { Shield, Copy, CheckCircle, AlertTriangle, Key } from 'lucide-react';
import { motion } from 'framer-motion';

const LicenseGate: React.FC<{ onActivated: () => void }> = ({ onActivated }) => {
    const [machineId, setMachineId] = useState('Loading...');
    const [licenseKey, setLicenseKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // @ts-ignore
        window.electron.getMachineId?.().then((id: string) => setMachineId(id || 'Unknown'));
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for clipboard
            const el = document.createElement('textarea');
            el.value = machineId;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleActivate = async () => {
        if (!licenseKey.trim()) {
            setErrorMsg('Please enter a license key');
            return;
        }
        setStatus('validating');
        setErrorMsg('');
        try {
            // @ts-ignore
            const result = await window.electron.activateLicense(licenseKey.trim());
            if (result?.success) {
                setStatus('success');
                setTimeout(() => onActivated(), 1500);
            } else {
                setStatus('error');
                setErrorMsg(result?.error || 'Invalid license key for this machine');
            }
        } catch {
            setStatus('error');
            setErrorMsg('License validation failed');
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                    width: '480px',
                    padding: '2.5rem',
                    borderRadius: '20px',
                    background: 'linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98))',
                    border: '1px solid rgba(99,102,241,0.2)',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 60px rgba(99,102,241,0.1)',
                }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        style={{
                            display: 'inline-flex',
                            padding: '16px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            marginBottom: '1rem',
                        }}
                    >
                        <Shield size={32} color="white" />
                    </motion.div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>
                        Software Activation
                    </h1>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>
                        Please activate LE SOFT with your license key
                    </p>
                </div>

                {/* Machine ID */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Machine ID
                    </label>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(15,23,42,0.8)',
                        border: '1px solid rgba(99,102,241,0.3)',
                    }}>
                        <code style={{
                            flex: 1,
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            color: '#818cf8',
                            letterSpacing: '1px',
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        }}>
                            {machineId}
                        </code>
                        <button
                            onClick={handleCopy}
                            title="Copy Machine ID"
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                background: copied ? '#22c55e' : 'rgba(99,102,241,0.2)',
                                color: copied ? 'white' : '#818cf8',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                transition: 'all 0.2s',
                            }}
                        >
                            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                        Send this ID to your software provider to get a license key
                    </p>
                </div>

                {/* License Key Input */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <Key size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        License Key
                    </label>
                    <input
                        type="text"
                        value={licenseKey}
                        onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleActivate()}
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                        style={{
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: '12px',
                            border: `1px solid ${status === 'error' ? '#ef4444' : 'rgba(99,102,241,0.3)'}`,
                            background: 'rgba(15,23,42,0.8)',
                            color: '#f1f5f9',
                            fontSize: '0.95rem',
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            letterSpacing: '1px',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Error Message */}
                {errorMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            marginBottom: '1rem',
                            fontSize: '0.85rem',
                            color: '#fca5a5',
                        }}
                    >
                        <AlertTriangle size={16} />
                        {errorMsg}
                    </motion.div>
                )}

                {/* Success Message */}
                {status === 'success' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: 'rgba(34,197,94,0.1)',
                            border: '1px solid rgba(34,197,94,0.3)',
                            marginBottom: '1rem',
                            fontSize: '0.85rem',
                            color: '#86efac',
                        }}
                    >
                        <CheckCircle size={16} />
                        License activated successfully! Launching...
                    </motion.div>
                )}

                {/* Activate Button */}
                <button
                    onClick={handleActivate}
                    disabled={status === 'validating' || status === 'success'}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        border: 'none',
                        background: status === 'success'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: 700,
                        cursor: status === 'validating' || status === 'success' ? 'default' : 'pointer',
                        opacity: status === 'validating' ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                    }}
                >
                    {status === 'validating' && 'Validating...'}
                    {status === 'success' && <><CheckCircle size={18} /> Activated!</>}
                    {(status === 'idle' || status === 'error') && <><Shield size={18} /> Activate License</>}
                </button>

                {/* Footer */}
                <p style={{ margin: '1.5rem 0 0', textAlign: 'center', fontSize: '0.75rem', color: '#475569' }}>
                    LE SOFT — Accounting & Inventory Management<br />
                    © Leading Edge Software
                </p>
            </motion.div>
        </div>
    );
};

export default LicenseGate;
