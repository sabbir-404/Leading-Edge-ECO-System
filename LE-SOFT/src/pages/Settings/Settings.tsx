// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Save, Globe, Download, RefreshCw, CheckCircle, AlertTriangle, User, Lock, Eye, EyeOff, DollarSign, Barcode, Printer, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const Settings: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const [updateStatus, setUpdateStatus] = useState<string>('idle');
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [appVersion, setAppVersion] = useState('1.0.0');

    // Barcode sticker settings (saved to localStorage)
    const STICKER_SIZES = ['38x25', '50x30', '58x40', '100x50'];
    const [stickerSize, setStickerSize] = useState(localStorage.getItem('barcode_sticker_size') || '50x30');
    const [printers, setPrinters] = useState<{name: string; isDefault: boolean}[]>([]);
    const [selectedPrinter, setSelectedPrinter] = useState(localStorage.getItem('barcode_printer') || '');
    const [barcodeSaved, setBarcodeSaved] = useState(false);

    useEffect(() => {
        // @ts-ignore
        window.electron.getPrinters?.().then((list: any[]) => {
            setPrinters(list || []);
            if (!localStorage.getItem('barcode_printer') && list.length > 0) {
                const def = list.find(p => p.isDefault) || list[0];
                setSelectedPrinter(def.name);
            }
        }).catch(() => {});
    }, []);

    const handleBarcodeSave = () => {
        localStorage.setItem('barcode_sticker_size', stickerSize);
        localStorage.setItem('barcode_printer', selectedPrinter);
        setBarcodeSaved(true);
        setTimeout(() => setBarcodeSaved(false), 2500);
    };

    // Listen for update events from main process
    useEffect(() => {
        // @ts-ignore
        window.electron.getAppVersion?.().then((v: string) => setAppVersion(v || '1.0.0')).catch(() => {});

        // @ts-ignore
        const cleanup = window.electron.onUpdateStatus?.((data: any) => {
            if (data.status === 'available') {
                setUpdateStatus('available');
                setUpdateInfo(data.info);
            } else if (data.status === 'up-to-date') {
                setUpdateStatus('up-to-date');
            } else if (data.status === 'downloading') {
                setUpdateStatus('downloading');
                setDownloadProgress(data.progress?.percent || 0);
            } else if (data.status === 'ready') {
                setUpdateStatus('ready');
            } else if (data.status === 'error') {
                setUpdateStatus('error');
            }
        });
        return () => cleanup?.();
    }, []);

    // Profile state
    const [profileName, setProfileName] = useState(localStorage.getItem('user_name') || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');
    const [passwordMsg, setPasswordMsg] = useState('');

    const handleProfileNameSave = async () => {
        try {
            const userId = parseInt(localStorage.getItem('user_id') || '0');
            // @ts-ignore
            await window.electron.updateUser({ id: userId, full_name: profileName });
            localStorage.setItem('user_name', profileName);
            setProfileMsg('Display name updated!');
            setTimeout(() => setProfileMsg(''), 3000);
        } catch { setProfileMsg('Failed to update name'); }
    };

    const handlePasswordChange = async () => {
        if (!currentPassword || !newPassword) return setPasswordMsg('Fill in all fields');
        if (newPassword !== confirmPassword) return setPasswordMsg('New passwords do not match');
        if (newPassword.length < 4) return setPasswordMsg('Password must be at least 4 characters');
        try {
            const userId = parseInt(localStorage.getItem('user_id') || '0');
            // @ts-ignore
            const result = await window.electron.changePassword({ id: userId, currentPassword, newPassword });
            if (result?.success) {
                setPasswordMsg('Password changed successfully!');
                setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            } else {
                setPasswordMsg(result?.error || 'Incorrect current password');
            }
            setTimeout(() => setPasswordMsg(''), 3000);
        } catch { setPasswordMsg('Failed to change password'); }
    };

    const [settings, setSettings] = useState({
        name: '',
        mailingName: '',
        address: '',
        country: 'Bangladesh',
        state: '',
        phone: '',
        email: '',
        financialYearFrom: '',
        booksBeginFrom: '',
        currencySymbol: '৳',
    });
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    const [adminKey, setAdminKey] = useState(localStorage.getItem('supabase_admin_key') || '');
    const [adminKeyMsg, setAdminKeyMsg] = useState('');

    const handleSaveAdminKey = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.saveSupabaseConfig({ serviceRoleKey: adminKey.trim() });
            if (result?.success) {
                localStorage.setItem('supabase_admin_key', adminKey.trim());
                setAdminKeyMsg('Admin Key Saved! Restart App to Apply.');
            } else {
                setAdminKeyMsg(result?.error || 'Failed to save admin key');
            }
        } catch {
            setAdminKeyMsg('Failed to save admin key');
        }
        setTimeout(() => setAdminKeyMsg(''), 4000);
    };

    const [dbConnected, setDbConnected] = useState<boolean | null>(null);

    const checkDbConnection = async () => {
        setDbConnected(null);
        try {
            // @ts-ignore
            const res = await window.electron.pingSupabase();
            setDbConnected(res?.connected === true);
        } catch {
            setDbConnected(false);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getSettings();
                if (result) {
                    setSettings({
                        name: result.name || '',
                        mailingName: result.mailing_name || '',
                        address: result.address || '',
                        country: result.country || 'Bangladesh',
                        state: result.state || '',
                        phone: result.phone || '',
                        email: result.email || '',
                        financialYearFrom: result.financial_year_from || '',
                        booksBeginFrom: result.books_begin_from || '',
                        currencySymbol: result.base_currency_symbol || '৳',
                    });
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
        checkDbConnection();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
        setSaved(false);
    };

    const handleSave = async () => {
        try {
            // @ts-ignore
            await window.electron.updateSettings(settings);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings');
        }
    };

    if (loading) {
        return <DashboardLayout title="Settings"><div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading settings...</div></DashboardLayout>;
    }

    return (
        <DashboardLayout title="Settings">
            <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Profile */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <User size={22} style={{ color: 'var(--accent-color)' }} />
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Profile</h2>
                    </div>

                    {/* Display Name */}
                    <div className="create-form" style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <User size={16} style={{ color: 'var(--text-secondary)' }} />
                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Display Name</label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your display name" style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem' }} />
                            <button onClick={handleProfileNameSave} style={{ padding: '0.7rem 1.2rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save Name</button>
                        </div>
                        {profileMsg && <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: profileMsg.includes('Failed') ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{profileMsg}</p>}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1rem 0' }} />

                    {/* Change Password */}
                    <div className="create-form">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <Lock size={16} style={{ color: 'var(--text-secondary)' }} />
                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Change Password</label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                            <div style={{ position: 'relative' }}>
                                <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" style={{ width: '100%', padding: '0.7rem 2.5rem 0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                                <span onClick={() => setShowCurrentPw(!showCurrentPw)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-secondary)' }}>{showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" style={{ width: '100%', padding: '0.7rem 2.5rem 0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                                <span onClick={() => setShowNewPw(!showNewPw)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-secondary)' }}>{showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}</span>
                            </div>
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                        </div>
                        <button onClick={handlePasswordChange} style={{ marginTop: '0.75rem', padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                            <Lock size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Change Password
                        </button>
                        {passwordMsg && <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: passwordMsg.includes('success') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{passwordMsg}</p>}
                    </div>
                </motion.div>

                {/* Appearance */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <Globe size={22} style={{ color: '#14b8a6' }} />
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Appearance</h2>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Theme</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Current: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                        </div>
                        <button onClick={toggleTheme} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                        </button>
                    </div>
                </motion.div>

                {/* Database Connection */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <Database size={22} style={{ color: '#3b82f6' }} />
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Database Connection</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Supabase Status</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {dbConnected === null ? 'Checking connection...' : (dbConnected ? 'Connected to Cloud Database' : 'Disconnected')}
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: dbConnected === null ? '#f59e0b' : (dbConnected ? '#10b981' : '#ef4444'), boxShadow: `0 0 8px ${dbConnected === null ? '#f59e0b' : (dbConnected ? '#10b981' : '#ef4444')}` }}></div>
                            <button onClick={checkDbConnection} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem' }}>Refresh</button>
                        </div>
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1rem 0' }} />

                    <div className="create-form">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <Lock size={16} style={{ color: '#f43f5e' }} />
                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Database Admin Key (Service Role)</label>
                        </div>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Required to bypass Row Level Security when creating new user accounts.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} placeholder="eyJhbGci..." style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                            <button onClick={handleSaveAdminKey} style={{ padding: '0.7rem 1.2rem', borderRadius: '8px', border: 'none', background: '#f43f5e', color: 'white', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save Key</button>
                        </div>
                        {adminKeyMsg && <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: adminKeyMsg.includes('Failed') ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{adminKeyMsg}</p>}
                    </div>
                </motion.div>

                {/* Keyboard Shortcuts */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: '#fef3c7', color: '#d97706', padding: '8px', borderRadius: '8px' }}>
                            <Save size={20} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {[
                            { key: 'ESC', desc: 'Close Modal / Go Back' },
                            { key: 'Alt + D', desc: 'Dashboard' },
                            { key: 'Alt + S', desc: 'Settings' },
                            { key: 'Alt + B', desc: 'New Bill (Billing)' },
                            { key: 'Alt + H', desc: 'Bill History' },
                            { key: 'F2', desc: 'Barcode Scan (Billing)' },
                        ].map(s => (
                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                                <kbd style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 700, minWidth: '40px', textAlign: 'center' }}>{s.key}</kbd>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.desc}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Barcode Sticker Settings */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: '#fff7ed', color: '#f97316', padding: '8px', borderRadius: '8px' }}>
                            <Barcode size={20} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Barcode Sticker</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        {/* Sticker Size */}
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Sticker Size</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {STICKER_SIZES.map(size => (
                                    <button
                                        key={size}
                                        onClick={() => setStickerSize(size)}
                                        style={{
                                            padding: '10px', borderRadius: '8px', border: '2px solid',
                                            borderColor: stickerSize === size ? 'var(--accent-color)' : 'var(--border-color)',
                                            background: stickerSize === size ? 'rgba(249,115,22,0.08)' : 'var(--input-bg)',
                                            color: stickerSize === size ? 'var(--accent-color)' : 'var(--text-secondary)',
                                            fontWeight: stickerSize === size ? 700 : 500,
                                            cursor: 'pointer', fontSize: '0.9rem',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {size} mm
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Printer Selection */}
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                <Printer size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Printer
                            </label>
                            {printers.length === 0 ? (
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    No printers detected. Connect a printer and restart the app.
                                </div>
                            ) : (
                                <select
                                    value={selectedPrinter}
                                    onChange={e => setSelectedPrinter(e.target.value)}
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
                                >
                                    <option value="">Default Printer</option>
                                    {printers.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (Default)' : ''}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleBarcodeSave}
                        style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', background: barcodeSaved ? '#22c55e' : 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.3s' }}
                    >
                        <Save size={14} /> {barcodeSaved ? '✓ Saved!' : 'Save Barcode Settings'}
                    </button>
                </motion.div>

                {/* Software Update */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: '#dbeafe', color: '#3b82f6', padding: '8px', borderRadius: '8px' }}>
                            <Download size={20} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>Software Update</h2>
                    </div>

                    <div style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Current Version: v{appVersion}</h3>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {updateStatus === 'idle' && 'Click to check for updates'}
                                    {updateStatus === 'checking' && 'Checking for updates...'}
                                    {updateStatus === 'up-to-date' && '✓ You are on the latest version'}
                                    {updateStatus === 'available' && `Update available: v${updateInfo?.version || 'new'}`}
                                    {updateStatus === 'downloading' && `Downloading update... ${Math.round(downloadProgress)}%`}
                                    {updateStatus === 'ready' && 'Update downloaded — ready to install!'}
                                    {updateStatus === 'error' && 'Update check failed. Try again later.'}
                                    {updateStatus === 'unavailable' && 'Auto-updater not configured for this build'}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {updateStatus === 'up-to-date' && <CheckCircle size={20} style={{ color: '#22c55e' }} />}
                                {updateStatus === 'error' && <AlertTriangle size={20} style={{ color: '#ef4444' }} />}
                            </div>
                        </div>

                        {/* Progress bar */}
                        {updateStatus === 'downloading' && (
                            <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--border-color)', marginBottom: '0.75rem', overflow: 'hidden' }}>
                                <div style={{ width: `${downloadProgress}%`, height: '100%', borderRadius: '3px', background: 'var(--accent-color)', transition: 'width 0.3s ease' }} />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {(updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error' || updateStatus === 'unavailable') && (
                                <button
                                    onClick={async () => {
                                        setUpdateStatus('checking');
                                        // @ts-ignore
                                        const result = await window.electron.checkForUpdate();
                                        if (result?.status === 'unavailable') setUpdateStatus('unavailable');
                                        else if (result?.status === 'error') setUpdateStatus('error');
                                    }}
                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <RefreshCw size={16} /> Check for Updates
                                </button>
                            )}
                            {updateStatus === 'checking' && (
                                <button disabled style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7, cursor: 'default' }}>
                                    <RefreshCw size={16} className="spin" /> Checking...
                                </button>
                            )}
                            {updateStatus === 'available' && (
                                <button
                                    onClick={async () => {
                                        setUpdateStatus('downloading');
                                        setDownloadProgress(0);
                                        // @ts-ignore
                                        await window.electron.downloadUpdate();
                                    }}
                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <Download size={16} /> Download Update
                                </button>
                            )}
                            {updateStatus === 'ready' && (
                                <button
                                    onClick={async () => {
                                        // @ts-ignore
                                        await window.electron.installUpdate();
                                    }}
                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <CheckCircle size={16} /> Install & Restart
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* About */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="master-create-container" style={{ maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <DollarSign size={22} style={{ color: '#eab308' }} />
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>About LE SOFT</h2>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <p><strong style={{ color: 'var(--text-primary)' }}>LE SOFT</strong> — Accounting & Inventory Management</p>
                        <p>Version 1.0.0 (Build 2026) | © Leading Edge Software</p>
                        <p>Powered by Electron + React + SQLite</p>
                    </div>
                </motion.div>

                {/* Save Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'sticky', bottom: '1rem', zIndex: 10 }}>
                    <button onClick={handleSave} className="save-btn" style={{ boxShadow: '0 4px 12px rgba(249,115,22,0.3)', padding: '0.75rem 2rem', fontSize: '1rem' }}>
                        <Save size={18} /> {saved ? '✓ Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default Settings;

