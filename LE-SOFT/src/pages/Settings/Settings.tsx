// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
    Save, Download, RefreshCw, CheckCircle, AlertTriangle, User, Lock,
    Eye, EyeOff, DollarSign, Barcode, Printer, Database, Settings as SettingsIcon,
    Server, Sun, Moon, AtSign, Info, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import DashboardLayout from '../../components/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import '../Accounting/Masters/Masters.css';

type SettingsTab = 'profile' | 'system_hardware' | 'payment_methods' | 'database_api' | 'policy' | 'about';

const TAB_LIST: { id: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'profile',          label: 'Profile',             icon: <User size={18} />       },
    { id: 'system_hardware',  label: 'System & Hardware',    icon: <SettingsIcon size={18} />},
    { id: 'policy',           label: 'Policy',              icon: <Lock size={18} />, adminOnly: true },
    { id: 'payment_methods',  label: 'Payment Methods',      icon: <DollarSign size={18} />, adminOnly: true },
    { id: 'database_api',     label: 'Database & API',      icon: <Database size={18} />   },
    { id: 'about',            label: 'About',               icon: <Info size={18} />       },
];

const Settings: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

    // ── App version & updater ─────────────────────────────────────────────────
    const [updateStatus, setUpdateStatus] = useState<string>('idle');
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [appVersion, setAppVersion] = useState('1.0.0');

    // ── Barcode ───────────────────────────────────────────────────────────────
    const STICKER_SIZES = ['38x25', '50x30', '58x40', '100x50'];
    const [stickerSize, setStickerSize] = useState(localStorage.getItem('barcode_sticker_size') || '50x30');
    const [printers, setPrinters] = useState<{name: string; isDefault: boolean}[]>([]);
    const [selectedPrinter, setSelectedPrinter] = useState(localStorage.getItem('barcode_printer') || '');
    const [barcodeSaved, setBarcodeSaved] = useState(false);

    // ── Profile ───────────────────────────────────────────────────────────────
    const [profileName, setProfileName] = useState(localStorage.getItem('user_name') || '');
    const [profileUsername, setProfileUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);

    // ── System settings ───────────────────────────────────────────────────────
    const [settings, setSettings] = useState({
        name: '', mailingName: '', address: '', country: 'Bangladesh',
        state: '', phone: '', email: '', financialYearFrom: '', booksBeginFrom: '', currencySymbol: '৳',
        maxExchangesPerBill: 1,
    });
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsSaved, setSettingsSaved] = useState(false);

    // ── Auto Logout ──────────────────────────────────────────────────────────
    const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(localStorage.getItem('auto_logout_enabled') !== 'false');
    const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(localStorage.getItem('auto_logout_minutes') || '15');

    // ── License Key Reveal ──────────────────────────────────────────────────
    const [licenseKeyReveal, setLicenseKeyReveal] = useState(localStorage.getItem('app_license_key') || 'Not Activated');
    const [licenseClickCount, setLicenseClickCount] = useState(0);
    const [showFullLicense, setShowFullLicense] = useState(false);

    useEffect(() => {
        if (licenseClickCount === 0) return;
        
        const timer = setTimeout(() => {
            setLicenseClickCount(0);
            setShowFullLicense(false);
        }, 5000);

        if (licenseClickCount >= 3) {
            setShowFullLicense(true);
        }

        return () => clearTimeout(timer);
    }, [licenseClickCount]);

    const maskLicense = (key: string) => {
        if (key === 'Not Activated') return key;
        if (key.length <= 8) return '****-****';
        return `${key.substring(0, 4)}-****-****-${key.substring(key.length - 4)}`;
    };

    // ── Admin unlock ──────────────────────────────────────────────────────────
    const [adminKey, setAdminKey] = useState(localStorage.getItem('supabase_admin_key') || '');
    const [dbConnected, setDbConnected] = useState<boolean | null>(null);
    const [clickCount, setClickCount] = useState(0);
    const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);
    const [showAdminUnlock, setShowAdminUnlock] = useState(false);
    const [adminUnlocked, setAdminUnlocked] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [adminKeyMsg, setAdminKeyMsg] = useState('');

    // ── Payment Methods ───────────────────────────────────────────────────────
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);

    const fetchPaymentMethods = async () => {
        setLoadingMethods(true);
        try {
            const data = await window.electron.getPaymentMethods();
            setPaymentMethods(data || []);
        } catch (e) {
            showToast('Failed to load payment methods', 'error');
        }
        setLoadingMethods(false);
    };

    useEffect(() => {
        if (activeTab === 'payment_methods') {
            fetchPaymentMethods();
        }
    }, [activeTab]);

    useEffect(() => {
        window.electron.getAppVersion?.().then((v: string) => setAppVersion(v || '1.0.0')).catch(() => {});
        window.electron.getPrinters?.().then((list: any[]) => {
            setPrinters(list || []);
            if (!localStorage.getItem('barcode_printer') && list.length > 0) {
                const def = list.find(p => p.isDefault) || list[0];
                setSelectedPrinter(def.name);
            }
        }).catch(() => {});
        const cleanup = window.electron.onUpdateStatus?.((data: any) => {
            if (data.status === 'available') { setUpdateStatus('available'); setUpdateInfo(data.info); }
            else if (data.status === 'up-to-date') setUpdateStatus('up-to-date');
            else if (data.status === 'downloading') { setUpdateStatus('downloading'); setDownloadProgress(data.progress?.percent || 0); }
            else if (data.status === 'ready') setUpdateStatus('ready');
            else if (data.status === 'error') setUpdateStatus('error');
        });
        // Fetch system settings
        window.electron.getSettings?.().then((result: any) => {
            if (result) setSettings({
                name: result.name || '', mailingName: result.mailing_name || '',
                address: result.address || '', country: result.country || 'Bangladesh',
                state: result.state || '', phone: result.phone || '', email: result.email || '',
                financialYearFrom: result.financial_year_from || '', booksBeginFrom: result.books_begin_from || '',
                currencySymbol: result.base_currency_symbol || '৳',
                maxExchangesPerBill: result.max_exchanges_per_bill || 1,
            });
        }).catch(() => {}).finally(() => setSettingsLoading(false));
        checkDbConnection();
        return () => cleanup?.();
    }, []);

    const checkDbConnection = async () => {
        setDbConnected(null);
        try { const res = await window.electron.pingSupabase?.(); setDbConnected(res?.connected === true); }
        catch { setDbConnected(false); }
    };

    const handleHeaderClick = () => {
        setClickCount(prev => prev + 1);
        if (clickTimer) clearTimeout(clickTimer);
        const t = setTimeout(() => setClickCount(0), 1500);
        setClickTimer(t);
        if (clickCount + 1 === 11) { clearTimeout(t); setClickCount(0); if (!adminUnlocked) setShowAdminUnlock(true); }
    };

    const handleUnlockSubmit = async () => {
        setUnlockError('');
        try {
            const res = await window.electron.verifyAdminPassword?.({ password: unlockPassword });
            if (res?.success) { setAdminUnlocked(true); setShowAdminUnlock(false); setUnlockPassword(''); }
            else setUnlockError(res?.error || 'Incorrect Admin Password');
        } catch { setUnlockError('Error verifying password'); }
    };

    const handleSaveAdminKey = async () => {
        try {
            const result = await window.electron.saveSupabaseConfig?.({ serviceRoleKey: adminKey.trim() });
            if (result?.success) { localStorage.setItem('supabase_admin_key', adminKey.trim()); setAdminKeyMsg('Saved! Restart App to Apply.'); }
            else setAdminKeyMsg(result?.error || 'Failed to save');
        } catch { setAdminKeyMsg('Failed to save admin key'); }
        setTimeout(() => setAdminKeyMsg(''), 4000);
    };

    const handleProfileSave = async () => {
        setProfileSaving(true);
        try {
            const userId = parseInt(localStorage.getItem('user_id') || '0');
            await window.electron.updateUser?.({ id: userId, full_name: profileName });
            localStorage.setItem('user_name', profileName);
            showToast('Display name updated!', 'success');
        } catch { showToast('Failed to update name', 'error'); }
        setProfileSaving(false);
    };

    // ── AI Integration ────────────────────────────────────────────────────────
    const [geminiKey, setGeminiKey] = useState('');
    const [aiKeySaving, setAiKeySaving] = useState(false);

    useEffect(() => {
        if (activeTab === 'database_api') {
            window.electron.getAiKey?.().then((key: string) => setGeminiKey(key || ''));
        }
    }, [activeTab]);

    const handleSaveAiKey = async () => {
        setAiKeySaving(true);
        try {
            const res = await window.electron.saveAiKey?.(geminiKey);
            if (res?.success) showToast('AI API Key saved successfully!', 'success');
            else showToast(res?.error || 'Failed to save AI key', 'error');
        } catch { showToast('Failed to save AI key', 'error'); }
        setAiKeySaving(false);
    };

    const handlePasswordChange = async () => {
        if (!currentPassword || !newPassword) return showToast('Fill in all password fields', 'error');
        if (newPassword !== confirmPassword) return showToast('New passwords do not match', 'error');
        if (newPassword.length < 4) return showToast('Password must be at least 4 characters', 'error');
        try {
            const userId = parseInt(localStorage.getItem('user_id') || '0');
            const result = await window.electron.changePassword?.({ id: userId, currentPassword, newPassword });
            if (result?.success) {
                showToast('Password changed successfully!', 'success');
                setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            } else { showToast(result?.error || 'Incorrect current password', 'error'); }
        } catch { showToast('Failed to change password', 'error'); }
    };

    const handleSystemSave = async () => {
        try {
            await window.electron.updateSettings?.(settings);
            setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000);
            showToast('Settings saved!', 'success');
        } catch { showToast('Failed to save settings', 'error'); }
    };

    const handleBarcodeSave = () => {
        localStorage.setItem('barcode_sticker_size', stickerSize);
        localStorage.setItem('barcode_printer', selectedPrinter);
        localStorage.setItem('auto_logout_enabled', autoLogoutEnabled.toString());
        localStorage.setItem('auto_logout_minutes', autoLogoutMinutes);
        setBarcodeSaved(true); setTimeout(() => setBarcodeSaved(false), 2500);
        showToast('Settings saved!', 'success');
    };

    // ── Inline styles ─────────────────────────────────────────────────────────
    const card: React.CSSProperties = {
        background: 'var(--card-bg)', borderRadius: '14px',
        border: '1px solid var(--border-color)', padding: '1.75rem', marginBottom: '1.5rem',
    };
    const cardHeader: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem',
    };
    const iconBox = (color: string, bg: string): React.CSSProperties => ({
        width: '38px', height: '38px', borderRadius: '10px', background: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    });
    const label: React.CSSProperties = {
        display: 'block', fontSize: '0.82rem', fontWeight: 600,
        color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em',
    };
    const input: React.CSSProperties = {
        width: '100%', padding: '0.75rem 1rem', borderRadius: '8px',
        border: '1px solid var(--border-color)', background: 'var(--input-bg)',
        color: 'var(--text-primary)', fontSize: '0.92rem', boxSizing: 'border-box', outline: 'none',
    };
    const btn = (bg: string): React.CSSProperties => ({
        padding: '0.65rem 1.4rem', borderRadius: '8px', border: 'none',
        background: bg, color: '#fff', fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem',
    });

    return (
        <DashboardLayout title="Settings">
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                {/* Tab strip */}
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.5rem', padding: '4px', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    {TAB_LIST.filter(t => !t.adminOnly || (localStorage.getItem('user_role') === 'superadmin')).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.6rem 1.2rem', borderRadius: '9px', border: 'none',
                                fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                                whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.18s',
                                background: activeTab === tab.id ? 'var(--accent-color)' : 'transparent',
                                color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>




                        {/* ── PAYMENT METHODS TAB ─────────────────────────────── */}
                        {activeTab === 'payment_methods' && (
                            <>
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#10b981', 'rgba(16,185,129,0.12)')}><DollarSign size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Payment Options</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Manage available payment methods during billing</p>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px', gap: '1rem', alignItems: 'flex-end' }}>
                                            <div>
                                                <span style={label}>Method Name</span>
                                                <input style={input} placeholder="e.g. bKash Personal" 
                                                    id="new-method-name" />
                                            </div>
                                            <div>
                                                <span style={label}>Provider / Type</span>
                                                <select style={input} id="new-method-provider">
                                                    <option value="Cash">Cash</option>
                                                    <option value="bKash">bKash (Mobile Banking)</option>
                                                    <option value="Nagad">Nagad (Mobile Banking)</option>
                                                    <option value="Card">Card</option>
                                                    <option value="Bank">Bank Transfer</option>
                                                </select>
                                            </div>
                                            <button onClick={async () => {
                                                const name = document.getElementById('new-method-name').value;
                                                const provider = document.getElementById('new-method-provider').value;
                                                if(!name) return showToast('Enter a name', 'error');
                                                const res = await window.electron.createPaymentMethod({
                                                    name, provider, type: provider === 'Cash' ? 'manual' : 'automated', is_active: true
                                                });
                                                if(res.success) {
                                                    document.getElementById('new-method-name').value = '';
                                                    showToast('Method added!', 'success');
                                                    fetchPaymentMethods();
                                                }
                                            }} style={btn('var(--accent-color)')}>Add Method</button>
                                        </div>
                                    </div>

                                    <div style={{ overflow: 'hidden', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead style={{ background: 'var(--input-bg)' }}>
                                                <tr>
                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Name</th>
                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Type</th>
                                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paymentMethods.length === 0 ? (
                                                    <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No payment methods added yet.</td></tr>
                                                ) : (
                                                    paymentMethods.map(m => (
                                                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ fontWeight: 600 }}>{m.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.provider}</div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: m.type === 'automated' ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)', color: m.type === 'automated' ? '#3b82f6' : '#64748b' }}>
                                                                    {m.type.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                                <button onClick={async () => {
                                                                    if(confirm('Delete this method?')) {
                                                                        await window.electron.deletePaymentMethod(m.id);
                                                                        fetchPaymentMethods();
                                                                    }
                                                                }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><RefreshCw size={14} /></button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── PROFILE TAB ─────────────────────────────────────── */}
                        {activeTab === 'profile' && (
                            <>
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#f97316', 'rgba(249,115,22,0.12)')}><User size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Display Name</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>The name shown across the app</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <input style={input} value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your display name" />
                                        <button onClick={handleProfileSave} disabled={profileSaving} style={{ ...btn('var(--accent-color)'), whiteSpace: 'nowrap', opacity: profileSaving ? 0.7 : 1 }}>
                                            <Save size={15} /> {profileSaving ? 'Saving…' : 'Save Name'}
                                        </button>
                                    </div>
                                </div>

                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#3b82f6', 'rgba(59,130,246,0.12)')}><Lock size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Change Password</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Secure your account with a new password</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <span style={label}>Current Password</span>
                                            <div style={{ position: 'relative' }}>
                                                <input style={input} type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
                                                <span onClick={() => setShowCurrentPw(!showCurrentPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                                    {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <span style={label}>New Password</span>
                                            <div style={{ position: 'relative' }}>
                                                <input style={input} type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" />
                                                <span onClick={() => setShowNewPw(!showNewPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <span style={label}>Confirm New Password</span>
                                        <input style={{ ...input, borderColor: confirmPassword && confirmPassword !== newPassword ? '#ef4444' : undefined }} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                                        {confirmPassword && confirmPassword !== newPassword && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '4px 0 0' }}>Passwords don't match</p>}
                                    </div>
                                    <button onClick={handlePasswordChange} style={{ ...btn('var(--accent-color)'), marginTop: '1.25rem' }}>
                                        <Lock size={15} /> Change Password
                                    </button>
                                </div>

                                {/* Theme toggle */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#8b5cf6', 'rgba(139,92,246,0.12)')}>{theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}</div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Appearance</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Currently: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        {['light', 'dark'].map(t => (
                                            <button key={t} onClick={() => { if (theme !== t) toggleTheme(); }}
                                                style={{ flex: 1, padding: '1rem', borderRadius: '10px', border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', transition: 'all 0.15s',
                                                    borderColor: theme === t ? 'var(--accent-color)' : 'var(--border-color)',
                                                    background: theme === t ? 'rgba(249,115,22,0.08)' : 'var(--input-bg)',
                                                    color: theme === t ? 'var(--accent-color)' : 'var(--text-secondary)',
                                                }}>
                                                {t === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── SYSTEM & HARDWARE TAB ─────────────────────────────── */}
                        {activeTab === 'system_hardware' && (
                            <>
                                {/* Keyboard shortcuts - MOVED TO TOP */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#f59e0b', 'rgba(245,158,11,0.12)')}><Save size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Keyboard Shortcuts</h2>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                        {[
                                            { key: 'ESC',   desc: 'Close Modal / Go Back' },
                                            { key: 'Alt+D', desc: 'Dashboard' },
                                            { key: 'Alt+S', desc: 'Settings' },
                                            { key: 'Alt+B', desc: 'New Bill (Billing)' },
                                            { key: 'Alt+H', desc: 'Bill History' },
                                            { key: 'F2',    desc: 'Barcode Scan (Billing)' },
                                        ].map(s => (
                                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                                                <kbd style={{ background: theme === 'dark' ? '#334155' : '#f1f5f9', color: theme === 'dark' ? '#e2e8f0' : '#475569', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', fontWeight: 700, minWidth: '42px', textAlign: 'center', fontFamily: 'monospace' }}>{s.key}</kbd>
                                                <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{s.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Barcode & Printer Settings */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#f97316', 'rgba(249,115,22,0.12)')}><Barcode size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Barcode & Printer Settings</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Configure sticker size and target printer</p>
                                        </div>
                                    </div>

                                    <span style={label}>Sticker Size</span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                        {STICKER_SIZES.map(size => (
                                            <button key={size} onClick={() => setStickerSize(size)}
                                                style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.15s',
                                                    borderColor: stickerSize === size ? 'var(--accent-color)' : 'var(--border-color)',
                                                    background: stickerSize === size ? 'rgba(249,115,22,0.08)' : 'var(--input-bg)',
                                                    color: stickerSize === size ? 'var(--accent-color)' : 'var(--text-secondary)',
                                                }}>
                                                {size} mm
                                            </button>
                                        ))}
                                    </div>

                                    <span style={label}>Printer</span>
                                    {printers.length === 0 ? (
                                        <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                            No printers detected. Connect a printer and restart the app.
                                        </div>
                                    ) : (
                                        <select value={selectedPrinter} onChange={e => setSelectedPrinter(e.target.value)}
                                            style={{ ...input, padding: '0.75rem 1rem' }}>
                                            <option value="">Default Printer</option>
                                            {printers.map(p => (
                                                <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (Default)' : ''}</option>
                                            ))}
                                        </select>
                                    )}

                                    <button onClick={handleBarcodeSave} style={{ ...btn(barcodeSaved ? '#22c55e' : 'var(--accent-color)'), marginTop: '1.5rem', transition: 'background 0.3s' }}>
                                        <Save size={15} /> {barcodeSaved ? '✓ Saved!' : 'Save Barcode Settings'}
                                    </button>
                                </div>

                                {/* Auto Logout Settings */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#ef4444', 'rgba(239,68,68,0.12)')}><Clock size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Auto Logout</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Automatically logout after period of inactivity</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Enable Auto-Logout</div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Logout user if inactive</div>
                                        </div>
                                        <div 
                                            onClick={() => setAutoLogoutEnabled(!autoLogoutEnabled)}
                                            style={{
                                                width: '48px', height: '24px', borderRadius: '12px', background: autoLogoutEnabled ? 'var(--accent-color)' : '#475569',
                                                position: 'relative', cursor: 'pointer', transition: 'all 0.3s',
                                            }}
                                        >
                                            <div style={{
                                                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                position: 'absolute', top: '3px', left: autoLogoutEnabled ? '27px' : '3px',
                                                transition: 'all 0.3s',
                                            }} />
                                        </div>
                                    </div>

                                    {autoLogoutEnabled && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <span style={label}>Idle Timeout (Minutes)</span>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                                                {['5', '10', '15', '30', '60'].map(min => (
                                                    <button key={min} onClick={() => setAutoLogoutMinutes(min)}
                                                        style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.15s',
                                                            borderColor: autoLogoutMinutes === min ? 'var(--accent-color)' : 'var(--border-color)',
                                                            background: autoLogoutMinutes === min ? 'rgba(249,115,22,0.08)' : 'var(--input-bg)',
                                                            color: autoLogoutMinutes === min ? 'var(--accent-color)' : 'var(--text-secondary)',
                                                        }}>
                                                        {min}m
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}

                                    <button onClick={handleBarcodeSave} style={{ ...btn(barcodeSaved ? '#22c55e' : 'var(--accent-color)'), marginTop: '1.5rem', transition: 'background 0.3s' }}>
                                        <Save size={15} /> {barcodeSaved ? '✓ Saved!' : 'Save Auto-Logout Settings'}
                                    </button>
                                </div>
                            </>
                        )}



                        {/* ── DATABASE & API TAB ────────────────────────────────── */}
                        {activeTab === 'database_api' && (
                            <>
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#10b981', 'rgba(16,185,129,0.12)')}><Server size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Cloud Database Status</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Supabase connection health</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                                                background: dbConnected === null ? '#f59e0b' : dbConnected ? '#10b981' : '#ef4444',
                                                boxShadow: `0 0 8px ${dbConnected === null ? '#f59e0b' : dbConnected ? '#10b981' : '#ef4444'}`,
                                            }} />
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 600 }}>
                                                    {dbConnected === null ? 'Checking…' : dbConnected ? 'Connected' : 'Disconnected'}
                                                </p>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    {dbConnected ? 'Cloud sync is active' : 'App running in offline mode'}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={checkDbConnection} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            <RefreshCw size={14} /> Refresh
                                        </button>
                                    </div>

                                    {adminUnlocked && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '1.5rem' }}>
                                            <span style={{ ...label, color: '#f43f5e' }}>Service Role Key (Admin)</span>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                                Required to bypass Row Level Security when creating user accounts.
                                            </p>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} placeholder="eyJhbGci..." style={input} />
                                                <button onClick={handleSaveAdminKey} style={{ ...btn('#f43f5e'), whiteSpace: 'nowrap' }}>Save Key</button>
                                            </div>
                                            {adminKeyMsg && <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: adminKeyMsg.includes('Failed') ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{adminKeyMsg}</p>}
                                        </motion.div>
                                    )}
                                </div>

                                {/* AI Integration Section - MOVED TO DATABASE & API */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#8b5cf6', 'rgba(139,92,246,0.12)')}><AtSign size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>AI Integrations (Gemini API)</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Used for automated Market Price Analysis & Comparisons</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                                        <div>
                                            <span style={label}>Google Gemini API Key</span>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <input 
                                                    style={input} 
                                                    type="password" 
                                                    value={geminiKey} 
                                                    onChange={e => setGeminiKey(e.target.value)} 
                                                    placeholder="Paste your Gemini API Key here..." 
                                                />
                                                <button 
                                                    onClick={handleSaveAiKey} 
                                                    disabled={aiKeySaving}
                                                    style={{ ...btn('var(--accent-color)'), whiteSpace: 'nowrap', opacity: aiKeySaving ? 0.7 : 1 }}
                                                >
                                                    {aiKeySaving ? 'Saving...' : 'Save AI Key'}
                                                </button>
                                            </div>
                                            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                Don't have a key? Get one for free at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>Google AI Studio</a>.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── POLICY TAB ────────────────────────────────────────── */}
                        {activeTab === 'policy' && (
                            <>
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#ef4444', 'rgba(239,68,68,0.12)')}><Lock size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Business Policies</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Set guardrails for business operations</p>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <span style={label}>Max Exchanges per Bill</span>
                                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            Limit how many times an exchange can be processed against a single original invoice.
                                        </p>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <input 
                                                type="number" 
                                                style={{ ...input, width: '120px' }} 
                                                value={settings.maxExchangesPerBill} 
                                                onChange={e => setSettings(p => ({ ...p, maxExchangesPerBill: parseInt(e.target.value) || 1 }))}
                                                min={1} 
                                            />
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>times</span>
                                        </div>
                                    </div>

                                    <button onClick={handleSystemSave} style={btn('var(--accent-color)')}>
                                        <Save size={15} /> Save Policy Settings
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ── ABOUT TAB ───────────────────────────────────────── */}
                        {activeTab === 'about' && (
                            <>
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#eab308', 'rgba(234,179,8,0.12)')}><Info size={20} /></div>
                                        <h2 onClick={handleHeaderClick} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, cursor: 'default' }}>About LE SOFT</h2>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        {[
                                            { k: 'App Name', v: 'LE SOFT' },
                                            { k: 'Version', v: `v${appVersion} (Build 2026)` },
                                            { k: 'Developer', v: 'Leading Edge' },
                                            { k: 'License', v: 'Proprietary' },
                                            { k: 'License Key', v: showFullLicense ? licenseKeyReveal : maskLicense(licenseKeyReveal), isInteractive: true },
                                        ].map(r => (
                                            <div 
                                                key={r.k} 
                                                onClick={() => r.isInteractive && setLicenseClickCount(prev => prev + 1)}
                                                style={{ 
                                                    padding: '0.85rem 1rem', 
                                                    borderRadius: '10px', 
                                                    background: 'var(--input-bg)', 
                                                    border: '1px solid var(--border-color)',
                                                    cursor: r.isInteractive ? 'pointer' : 'default',
                                                    userSelect: r.isInteractive ? 'none' : 'text',
                                                    transition: 'all 0.2s',
                                                    ...(r.isInteractive && licenseClickCount > 0 && licenseClickCount < 3 ? { borderColor: 'var(--accent-color)', background: 'rgba(249,115,22,0.05)' } : {})
                                                }}
                                            >
                                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{r.k}</p>
                                                <p style={{ 
                                                    margin: '4px 0 0', 
                                                    fontSize: '1rem', 
                                                    fontWeight: 700,
                                                    fontFamily: r.isInteractive ? 'monospace' : 'inherit',
                                                    color: r.isInteractive && showFullLicense ? 'var(--accent-color)' : 'var(--text-primary)'
                                                }}>{r.v}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        LE SOFT — Accounting & Inventory Management System.<br />
                                        All rights reserved. Unauthorized use or distribution is strictly prohibited.
                                    </p>
                                </div>

                                {/* Software Update - MOVED TO ABOUT */}
                                <div style={card}>
                                    <div style={cardHeader}>
                                        <div style={iconBox('#3b82f6', 'rgba(59,130,246,0.12)')}><Download size={20} /></div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Software Update</h2>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Check for the latest features and fixes</p>
                                        </div>
                                    </div>
                                    <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        {updateStatus === 'idle' && 'Click to check for updates'}
                                        {updateStatus === 'checking' && 'Checking for updates…'}
                                        {updateStatus === 'up-to-date' && '✓ You are on the latest version'}
                                        {updateStatus === 'available' && `Update available: v${updateInfo?.version || 'new'}`}
                                        {updateStatus === 'downloading' && `Downloading… ${Math.round(downloadProgress)}%`}
                                        {updateStatus === 'ready' && 'Update downloaded — ready to install!'}
                                        {updateStatus === 'error' && 'Update check failed. Try again later.'}
                                    </p>
                                    {updateStatus === 'downloading' && (
                                        <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--border-color)', marginBottom: '1rem', overflow: 'hidden' }}>
                                            <div style={{ width: `${downloadProgress}%`, height: '100%', borderRadius: '3px', background: 'var(--accent-color)', transition: 'width 0.3s ease' }} />
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        {['idle', 'up-to-date', 'error', 'unavailable'].includes(updateStatus) && (
                                            <button onClick={async () => { setUpdateStatus('checking'); const r = await window.electron.checkForUpdate?.(); if (r?.status === 'unavailable') setUpdateStatus('unavailable'); else if (r?.status === 'error') setUpdateStatus('error'); }}
                                                style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <RefreshCw size={16} /> Check for Updates
                                            </button>
                                        )}
                                        {updateStatus === 'available' && (
                                            <button onClick={async () => { setUpdateStatus('downloading'); await window.electron.downloadUpdate?.(); }} style={btn('var(--accent-color)')}>
                                                <Download size={15} /> Download Update
                                            </button>
                                        )}
                                        {updateStatus === 'ready' && (
                                            <button onClick={async () => await window.electron.installUpdate?.()} style={btn('#22c55e')}>
                                                <CheckCircle size={15} /> Install & Restart
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Admin Unlock Modal */}
            {showAdminUnlock && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        style={{ background: 'var(--card-bg)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-color)', width: '90%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={iconBox('#f43f5e', 'rgba(244,63,94,0.12)')}><Lock size={22} /></div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Admin Verification</h2>
                        </div>
                        <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Enter your Admin password to unlock Service Key settings.
                        </p>
                        <input type="password" placeholder="Password" value={unlockPassword}
                            onChange={e => setUnlockPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlockSubmit()}
                            style={{ ...input, marginBottom: '0.75rem' }} autoFocus />
                        {unlockError && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            <AlertTriangle size={14} /> {unlockError}
                        </div>}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setShowAdminUnlock(false); setUnlockPassword(''); setUnlockError(''); }}
                                style={{ padding: '0.7rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button onClick={handleUnlockSubmit} style={btn('var(--accent-color)')}>Unlock</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default Settings;
