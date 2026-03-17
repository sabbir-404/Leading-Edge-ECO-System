import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Database, Key, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import logoBlack from '../../assets/logo-black.png';
import './Login.css';

const SetupScreen: React.FC = () => {
    const navigate = useNavigate();
    const [serviceKey, setServiceKey] = useState('');
    const [licenseKey, setLicenseKey] = useState('');
    
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [deviceId, setDeviceId] = useState('');

    useEffect(() => {
        // If keys already exist, redirect to login
        const existingToken = localStorage.getItem('supabase_admin_key');
        const existingLicense = localStorage.getItem('app_license_key');
        if (existingToken && existingLicense) {
            navigate('/login');
        }

        // Fetch Device ID
        // @ts-ignore
        window.electron?.getDeviceId?.().then((id: string) => setDeviceId(id)).catch(console.error);
    }, [navigate]);

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setValidating(true);

        try {
            // 1. Save Supabase Service Key securely
            // @ts-ignore
            const dbRes = await window.electron.saveSupabaseConfig({ serviceRoleKey: serviceKey.trim() });
            if (!dbRes?.success) {
                throw new Error('Failed to save Database Admin Key');
            }

            // 2. We could optionally validate the license here via an IPC call to Supabase.
            // But since the config is just saved, we assume it's stored and verify it later,
            // or we could enforce a license check. 
            // For now, let's just save it.
            // @ts-ignore
            const licRes = await window.electron.activateLicense(licenseKey.trim());
            
            if (!licRes?.success) {
                throw new Error(licRes?.error || 'Invalid License Key or Database connection failed');
            }

            // Success
            localStorage.setItem('supabase_admin_key', serviceKey.trim());
            localStorage.setItem('app_license_key', licenseKey.trim());
            setSuccess(true);
            
            setTimeout(() => {
                navigate('/login');
            }, 1500);

        } catch (err: any) {
            setError(err.message || 'Setup Failed');
        } finally {
            setValidating(false);
        }
    };

    return (
        <div className="login-container dark">
            <div className="login-backdrop">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
            </div>

            <motion.div 
                className="login-card"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ maxWidth: '500px', width: '90%' }}
            >
                <div className="login-header" style={{ marginBottom: '1rem' }}>
                    <img src={logoBlack} alt="LE-SOFT Logo" className="login-logo" style={{ filter: 'invert(1)' }} />
                    <h2 style={{ fontSize: '1.5rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <ShieldCheck size={24} color="#f59e0b" /> Required Setup
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Welcome to LE-SOFT! Please initialize your server connection.</p>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="login-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <XCircle size={16} /> {error}
                    </motion.div>
                )}

                {success && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '12px', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <CheckCircle size={18} /> Setup Complete! Redirecting...
                    </motion.div>
                )}

                <form onSubmit={handleSetup} className="login-form">
                    <div className="input-group">
                        <label>Service Key</label>
                        <div className="input-field">
                            <Database size={18} />
                            <input 
                                type="password" 
                                placeholder="Service Key" 
                                value={serviceKey}
                                onChange={(e) => setServiceKey(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>License Key</label>
                        <div className="input-field">
                            <Key size={18} />
                            <input 
                                type="text" 
                                placeholder="XXXXX-XXXXX-XXXXX-XXXXX" 
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {deviceId && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Device ID (for License Generation):</span>
                            <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem', marginTop: '0.25rem', color: 'var(--text-primary)', userSelect: 'all', letterSpacing: '1px' }}>
                                {deviceId}
                            </div>
                        </div>
                    )}

                    <button type="submit" className="login-button" disabled={validating || success} style={{ background: '#f59e0b', marginTop: '1rem' }}>
                        {validating ? <div className="spinner"></div> : 'Initialize System'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default SetupScreen;
