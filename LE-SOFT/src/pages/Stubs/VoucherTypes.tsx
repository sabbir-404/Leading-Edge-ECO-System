import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ArrowLeft, Plus, Search, Trash2, Edit2, ShieldAlert, X } from 'lucide-react';
import '../Accounting/Masters/Masters.css';

interface VoucherTypeData {
    id: number;
    name: string;
    description: string;
    is_active: boolean;
}

const VoucherTypes: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [voucherTypes, setVoucherTypes] = useState<VoucherTypeData[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingType, setEditingType] = useState<VoucherTypeData | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);

    // Permission Checking
    const userRole = localStorage.getItem('user_role') || '';
    const userPerms = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user_permissions') || '{}') as Record<string, boolean>;
        } catch {
            return {};
        }
    }, []);

    const isAdmin = userRole === 'superadmin' || userRole === 'admin';
    const canRead = isAdmin || !!userPerms['read_voucher_type'];
    const canWrite = isAdmin || !!userPerms['write_voucher_type'];

    const fetchVoucherTypes = async () => {
        try {
            setLoading(true);
            // @ts-ignore
            const result = await window.electron.getVoucherTypes();
            setVoucherTypes(result || []);
        } catch (error) {
            console.error('Failed to fetch voucher types:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canRead) {
            fetchVoucherTypes();
        }
    }, [canRead]);

    const handleOpenCreate = () => {
        setEditingType(null);
        setName('');
        setDescription('');
        setIsActive(true);
        setShowFormModal(true);
    };

    const handleOpenEdit = (vt: VoucherTypeData) => {
        setEditingType(vt);
        setName(vt.name);
        setDescription(vt.description || '');
        setIsActive(vt.is_active !== false);
        setShowFormModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        try {
            setSaving(true);
            if (editingType) {
                // @ts-ignore
                await window.electron.updateVoucherType(editingType.id, {
                    name: name.trim(),
                    description: description.trim(),
                    is_active: isActive
                });
            } else {
                // @ts-ignore
                await window.electron.createVoucherType({
                    name: name.trim(),
                    description: description.trim(),
                    is_active: isActive
                });
            }
            setShowFormModal(false);
            fetchVoucherTypes();
        } catch (error) {
            console.error('Failed to save voucher type:', error);
            alert('Failed to save voucher type. Make sure the name is unique.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this voucher type? Any existing vouchers using this type will remain unaffected but new entries will not be allowed for this type.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteVoucherType(id);
            fetchVoucherTypes();
        } catch (error) {
            console.error('Failed to delete voucher type:', error);
            alert('Failed to delete voucher type. It may be referenced by existing data.');
        }
    };

    const typeColors: Record<string, string> = {
        Payment: '#f97316', Receipt: '#22c55e', Sales: '#3b82f6',
        Purchase: '#dc2626', Journal: '#a855f7', Contra: '#6b7280',
    };

    const getColorForType = (typeName: string) => {
        if (typeColors[typeName]) return typeColors[typeName];
        let hash = 0;
        for (let i = 0; i < typeName.length; i++) {
            hash = typeName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 65%, 45%)`;
    };

    const filtered = voucherTypes.filter(vt =>
        vt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (vt.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!canRead) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="master-list-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
                <div style={{ padding: '2rem', borderRadius: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', maxWidth: '450px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <ShieldAlert size={48} style={{ color: 'var(--accent-color)', marginBottom: '1rem', opacity: 0.8 }} />
                    <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Access Denied</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                        You do not possess the required permission level (<code>read_voucher_type</code>) to view the voucher types configuration ledger.
                    </p>
                    <button onClick={() => navigate('/masters')} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        Return to Masters Hub
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="master-list-container" style={{ padding: '1rem 0', position: 'relative' }}>
            {/* Header */}
            <div className="list-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={() => navigate('/masters')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', padding: '6px', borderRadius: '50%', transition: 'background 0.2s' }} className="hover-bg-trigger">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 style={{ fontWeight: 700, margin: 0 }}>Voucher Types Catalog</h2>
                </div>
                {canWrite && (
                    <button className="create-btn" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '8px 16px', borderRadius: '8px', background: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={18} /> Create Type
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '8px 12px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <Search size={18} style={{ color: 'var(--text-secondary)' }} />
                <input
                    type="text"
                    placeholder="Search voucher types by name or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
            </div>

            {/* List Table / Card layout */}
            <div className="table-container" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                <table className="master-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--hover-bg)', borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ textAlign: 'left', padding: '12px 16px' }}>Voucher Type</th>
                            <th style={{ textAlign: 'left', padding: '12px 16px' }}>Description</th>
                            <th style={{ textAlign: 'center', padding: '12px 16px', width: '120px' }}>Status</th>
                            {canWrite && <th style={{ textAlign: 'right', padding: '12px 16px', width: '120px' }}>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={canWrite ? 4 : 3} className="empty-state" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    Loading voucher types...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={canWrite ? 4 : 3} className="empty-state" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No voucher types found.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((vt) => {
                                const color = getColorForType(vt.name);
                                return (
                                    <motion.tr key={vt.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="hover-row-trigger">
                                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FileText size={16} />
                                                </div>
                                                <span style={{ fontSize: '0.95rem' }}>{vt.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                            {vt.description || <em style={{ opacity: 0.5 }}>No description provided</em>}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '0.78rem',
                                                fontWeight: 600,
                                                background: vt.is_active !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                color: vt.is_active !== false ? '#22c55e' : '#ef4444',
                                                display: 'inline-block'
                                            }}>
                                                {vt.is_active !== false ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        {canWrite && (
                                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => handleOpenEdit(vt)} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }} className="action-btn-hover-blue">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(vt.id)} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }} className="action-btn-hover-red">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </motion.tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Sliding Slide-Out Drawer Modal */}
            <AnimatePresence>
                {showFormModal && (
                    <>
                        {/* Overlay backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#000', zIndex: 1000 }}
                            onClick={() => setShowFormModal(false)}
                        />

                        {/* Sliding drawer sheet */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            style={{
                                position: 'fixed',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: '100%',
                                maxWidth: '460px',
                                background: 'var(--card-bg)',
                                borderLeft: '1px solid var(--border-color)',
                                padding: '2rem',
                                zIndex: 1001,
                                boxShadow: '-8px 0 30px rgba(0,0,0,0.15)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                <h3 style={{ fontWeight: 700, fontSize: '1.25rem', margin: 0 }}>
                                    {editingType ? 'Modify Voucher Type' : 'Create Voucher Type'}
                                </h3>
                                <button
                                    onClick={() => setShowFormModal(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '6px', borderRadius: '50%' }}
                                    className="hover-bg-trigger"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                                        Voucher Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Sales Return, Expense"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', fontSize: '0.92rem' }}
                                    />
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                                        Description
                                    </label>
                                    <textarea
                                        placeholder="Optional description detailing when this voucher type is leveraged..."
                                        rows={4}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', fontSize: '0.92rem', resize: 'vertical' }}
                                    />
                                </div>

                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', gap: '1rem', marginTop: '0.5rem', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)' }}>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Active Status</span>
                                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Disable to prevent new voucher entries of this type.</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsActive(!isActive)}
                                        style={{
                                            width: '50px',
                                            height: '26px',
                                            borderRadius: '13px',
                                            background: isActive ? 'var(--accent-color)' : 'rgba(0,0,0,0.15)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <motion.div
                                            layout
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                position: 'absolute',
                                                top: '3px',
                                                left: isActive ? '27px' : '3px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                            }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        />
                                    </button>
                                </div>

                                <div style={{ marginTop: 'auto', display: 'flex', gap: '1rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowFormModal(false)}
                                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    >
                                        {saving ? 'Saving...' : 'Save Catalog'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VoucherTypes;
