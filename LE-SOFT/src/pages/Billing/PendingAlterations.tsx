import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const userRole = localStorage.getItem('user_role') || 'admin';
const userName = localStorage.getItem('user_name') || 'Admin';

const PendingAlterations: React.FC = () => {
    const [alterations, setAlterations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [msg, setMsg] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const rows = await window.electron.getPendingAlterations();
            setAlterations(rows || []);
        } catch(e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleApprove = async (auditId: number) => {
        if (!confirm('Approve this alteration? The bill will be updated immediately.')) return;
        try {
            // @ts-ignore
            await window.electron.approveAlteration({ auditId, reviewedBy: userName });
            setMsg('✓ Alteration approved and applied.');
            load();
        } catch(e) { setMsg('Failed to approve.'); }
        setTimeout(() => setMsg(''), 3000);
    };

    const handleReject = async (auditId: number) => {
        if (!rejectReason.trim()) { setMsg('Please enter a rejection reason.'); return; }
        try {
            // @ts-ignore
            await window.electron.rejectAlteration({ auditId, reviewedBy: userName, rejectReason });
            setMsg('Alteration rejected.');
            setRejectingId(null);
            setRejectReason('');
            load();
        } catch(e) { setMsg('Failed to reject.'); }
        setTimeout(() => setMsg(''), 3000);
    };

    if (userRole !== 'admin') {
        return (
            <DashboardLayout title="Pending Approvals">
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <XCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
                    <h3>Access Denied</h3>
                    <p>Only administrators can approve bill alterations.</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Pending Bill Approvals">
            <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ background: '#fef3c7', color: '#d97706', padding: '10px', borderRadius: '10px' }}>
                        <ClipboardCheck size={22} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Bill Alteration Requests</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {alterations.length} pending approval{alterations.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                {msg && (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: msg.includes('✓') ? '#dcfce7' : '#fef2f2', color: msg.includes('✓') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {msg}
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading...</div>
                ) : alterations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                        <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
                        <h3>All Clear!</h3>
                        <p>No pending bill alterations.</p>
                    </div>
                ) : (
                    alterations.map(alt => {
                        const isExpanded = expanded === alt.id;
                        const staged = alt.staged_data ? (() => { try { return JSON.parse(alt.staged_data); } catch { return {}; } })() : {};
                        const original = alt.old_value ? (() => { try { return JSON.parse(alt.old_value); } catch { return {}; } })() : {};
                        return (
                            <motion.div key={alt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="master-create-container" style={{ maxWidth: '100%', padding: '1.25rem' }}>
                                {/* Row header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Invoice: {alt.invoice_number}</span>
                                            <span style={{ padding: '2px 8px', borderRadius: '100px', background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700 }}>
                                                <Clock size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />PENDING
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            Customer: <strong>{alt.customer_name || '—'}</strong> &nbsp;|&nbsp;
                                            Requested by: <strong>{alt.changed_by}</strong> &nbsp;|&nbsp;
                                            {new Date(alt.changed_at).toLocaleString()}
                                        </div>
                                        {alt.alter_reason && (
                                            <div style={{ marginTop: '4px', fontSize: '0.82rem', color: '#6366f1', fontStyle: 'italic' }}>
                                                Reason: "{alt.alter_reason}"
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <button onClick={() => setExpanded(isExpanded ? null : alt.id)}
                                            style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                                            <Eye size={14} /> {isExpanded ? 'Hide' : 'Review'}
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        <button onClick={() => handleApprove(alt.id)}
                                            style={{ padding: '7px 14px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <CheckCircle size={14} /> Approve
                                        </button>
                                        <button onClick={() => setRejectingId(rejectingId === alt.id ? null : alt.id)}
                                            style={{ padding: '7px 14px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <XCircle size={14} /> Reject
                                        </button>
                                    </div>
                                </div>

                                {/* Reject form */}
                                <AnimatePresence>
                                    {rejectingId === alt.id && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            style={{ overflow: 'hidden', marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                                placeholder="Enter rejection reason..."
                                                style={{ flex: 1, padding: '8px 12px', borderRadius: '7px', border: '1px solid #ef4444', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                                            <button onClick={() => handleReject(alt.id)}
                                                style={{ padding: '8px 16px', borderRadius: '7px', border: 'none', background: '#ef4444', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                                                Confirm Reject
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Diff view */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            style={{ overflow: 'hidden', marginTop: '1rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Original Bill</h4>
                                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', fontSize: '0.82rem' }}>
                                                        <div>Total: ৳{parseFloat(original.grand_total || '0').toLocaleString()}</div>
                                                        {original.items && <pre style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(JSON.parse(original.items || '[]'), null, 2)}</pre>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Proposed Changes</h4>
                                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.82rem' }}>
                                                        <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(staged, null, 2)}</pre>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </DashboardLayout>
    );
};

export default PendingAlterations;
