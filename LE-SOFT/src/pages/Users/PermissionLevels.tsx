import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Save, Shield, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import '../Accounting/Masters/Masters.css';
import './Users.css';

const FEATURE_PRESETS = [
    { label: 'PR Store Head Approval', value: 'purchase_requisition_store_head', description: 'Store Head reviews and approves store-created purchase requisitions', workflowKey: 'purchase_requisition', workflowStep: 1 },
    { label: 'PR Accounts Estimate', value: 'purchase_requisition_accounts_estimate', description: 'Accounts adds supplier/vendor estimates and approximate purchase amount', workflowKey: 'purchase_requisition', workflowStep: 2 },
    { label: 'PR Audit Review', value: 'purchase_requisition_audit_review', description: 'Audit reviews supplier estimates and records justification', workflowKey: 'purchase_requisition', workflowStep: 3 },
    { label: 'PR Director Approval', value: 'purchase_requisition_director_approval', description: 'Director approves or rejects after audit justification', workflowKey: 'purchase_requisition', workflowStep: 4 },
    { label: 'PR Purchase Recording', value: 'purchase_requisition_purchase_recording', description: 'Purchase department records invoice, vendor, and purchase details', workflowKey: 'purchase_requisition', workflowStep: 5 },
    { label: 'PR Goods Receipt', value: 'purchase_requisition_goods_receipt', description: 'Receiving team confirms purchased goods were received', workflowKey: 'purchase_requisition', workflowStep: 6 },
    { label: 'PR Stock Completion', value: 'purchase_requisition_stock_completion', description: 'Inventory/store completes requisition and posts stock quantities', workflowKey: 'purchase_requisition', workflowStep: 7 },
    { label: 'Bill Alteration', value: 'bill_alteration', description: 'When a billing operator alters a final bill' },
    { label: 'MAKE Order Placement', value: 'make_order_placed', description: 'When a new manufacturing/make order is placed' },
    { label: 'MAKE Order Status Change', value: 'make_order_status', description: 'When the status of a make order is updated' },
    { label: 'Discount Override', value: 'discount_override', description: 'When a discount exceeds the standard limit' },
    { label: 'Customer Refund', value: 'customer_refund', description: 'When a refund or exchange is initiated' },
    { label: 'User Account Creation', value: 'user_creation', description: 'When a new user account is created' },
    { label: 'Payroll Generation', value: 'payroll_generation', description: 'When payroll is generated for a period' },
    { label: 'Leave Approval', value: 'leave_approval', description: 'When an employee requests leave' },
    { label: 'Custom Feature', value: '__custom__', description: '' },
];

interface PermissionLevel {
    id: number;
    feature_name: string;
    feature_key: string;
    description: string;
    approver_role: string;
    approver_user_id: number | null;
    approver_user_name?: string;
    is_active: boolean;
    workflow_key?: string | null;
    workflow_step?: number | null;
}

const ROLES = ['superadmin', 'admin', 'manager'];
const ROLE_LABELS: Record<string, string> = { superadmin: 'Super Admin', admin: 'Admin', manager: 'Manager' };

const PermissionLevels: React.FC = () => {
    const { showToast } = useToast();
    const [levels, setLevels] = useState<PermissionLevel[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<PermissionLevel | null>(null);

    // Form state
    const [featureKey, setFeatureKey] = useState(FEATURE_PRESETS[0].value);
    const [customFeatureName, setCustomFeatureName] = useState('');
    const [customFeatureKey, setCustomFeatureKey] = useState('');
    const [description, setDescription] = useState('');
    const [approverRole, setApproverRole] = useState('admin');
    const [approverUserId, setApproverUserId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    const selectedPreset = FEATURE_PRESETS.find(p => p.value === featureKey);

    const fetchData = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const [lvls, usrs] = await Promise.all([
                // @ts-ignore
                window.electron.getPermissionLevels?.() || [],
                // @ts-ignore
                window.electron.getUsers?.({ requestingUserId: parseInt(localStorage.getItem('user_id') || '0') }) || [],
            ]);
            setLevels(lvls || []);
            setUsers((usrs || []).filter((u: any) => ['superadmin', 'admin', 'manager'].includes(u.role)));
        } catch (e) {
            showToast('Failed to load permission levels', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const openCreate = () => {
        setEditing(null);
        setFeatureKey(FEATURE_PRESETS[0].value);
        setCustomFeatureName('');
        setCustomFeatureKey('');
        setDescription(FEATURE_PRESETS[0].description);
        setApproverRole('admin');
        setApproverUserId(null);
        setShowModal(true);
    };

    const openEdit = (level: PermissionLevel) => {
        setEditing(level);
        // Detect if it's a preset or custom
        const preset = FEATURE_PRESETS.find(p => p.value === level.feature_key);
        if (preset && preset.value !== '__custom__') {
            setFeatureKey(level.feature_key);
            setCustomFeatureName('');
            setCustomFeatureKey('');
        } else {
            setFeatureKey('__custom__');
            setCustomFeatureName(level.feature_name);
            setCustomFeatureKey(level.feature_key);
        }
        setDescription(level.description);
        setApproverRole(level.approver_role || 'admin');
        setApproverUserId(level.approver_user_id || null);
        setShowModal(true);
    };

    const handlePresetChange = (val: string) => {
        setFeatureKey(val);
        const preset = FEATURE_PRESETS.find(p => p.value === val);
        if (preset && val !== '__custom__') {
            setDescription(preset.description);
            if ((preset as any).workflowKey === 'purchase_requisition') {
                setApproverRole((preset as any).workflowStep === 4 ? 'admin' : 'manager');
            }
        } else {
            setDescription('');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const isCustom = featureKey === '__custom__';
        const resolvedKey = isCustom ? (customFeatureKey.trim().toLowerCase().replace(/\s+/g, '_') || 'custom_' + Date.now()) : featureKey;
        const resolvedName = isCustom ? customFeatureName.trim() : (FEATURE_PRESETS.find(p => p.value === featureKey)?.label || featureKey);

        if (!resolvedName) { showToast('Feature name is required', 'error'); return; }

        setSaving(true);
        try {
            const payload = {
                id: editing?.id,
                feature_name: resolvedName,
                feature_key: resolvedKey,
                description: description.trim(),
                approver_role: approverUserId ? null : approverRole,
                approver_user_id: approverUserId || null,
                workflow_key: (FEATURE_PRESETS.find(p => p.value === resolvedKey) as any)?.workflowKey || null,
                workflow_step: (FEATURE_PRESETS.find(p => p.value === resolvedKey) as any)?.workflowStep || null,
            };
            if (editing) {
                // @ts-ignore
                await window.electron.updatePermissionLevel?.(payload);
                showToast('Permission level updated', 'success');
            } else {
                // @ts-ignore
                await window.electron.createPermissionLevel?.(payload);
                showToast('Permission level created', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch {
            showToast('Failed to save permission level', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Delete permission level for "${name}"? This cannot be undone.`)) return;
        try {
            // @ts-ignore
            await window.electron.deletePermissionLevel?.(id);
            showToast('Deleted successfully', 'success');
            fetchData();
        } catch {
            showToast('Failed to delete', 'error');
        }
    };

    const toggleActive = async (level: PermissionLevel) => {
        try {
            // @ts-ignore
            await window.electron.updatePermissionLevel?.({ id: level.id, is_active: !level.is_active });
            showToast(level.is_active ? 'Permission level disabled' : 'Permission level enabled', 'success');
            fetchData();
        } catch {
            showToast('Failed to update status', 'error');
        }
    };

    return (
        <DashboardLayout title="Permission Levels">
            <div className="users-page">
                {/* Header */}
                <div className="list-header">
                    <div>
                        <h2>Permission Levels</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.88rem', opacity: 0.6 }}>
                            Define which features require approval and who must approve them.
                        </p>
                    </div>
                    <button className="create-btn" onClick={openCreate}>
                        <Plus size={18} /> Add Permission Level
                    </button>
                </div>

                {/* Table */}
                <div className="table-container">
                    {loading ? (
                        <div className="empty-state">Loading...</div>
                    ) : levels.length === 0 ? (
                        <div className="empty-state" style={{ padding: '3rem' }}>
                            <Shield size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>No permission levels defined yet.</p>
                            <p style={{ fontSize: '0.85rem' }}>Click "Add Permission Level" to set up your first approval workflow.</p>
                        </div>
                    ) : (
                        <table className="master-table">
                            <thead>
                                <tr>
                                    <th>Feature</th>
                                    <th>Description</th>
                                    <th>Approver</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {levels.map((level) => (
                                    <motion.tr key={level.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                        <td>
                                            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{level.feature_name}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.5, fontFamily: 'monospace' }}>{level.feature_key}</div>
                                        </td>
                                        <td style={{ maxWidth: '260px', fontSize: '0.85rem', opacity: 0.8 }}>
                                            {level.description || '—'}
                                        </td>
                                        <td>
                                            {level.approver_user_name ? (
                                                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                                    👤 {level.approver_user_name}
                                                </span>
                                            ) : level.approver_role ? (
                                                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(249,115,22,0.1)', color: 'var(--accent-color)', textTransform: 'capitalize' }}>
                                                    🎭 {ROLE_LABELS[level.approver_role] || level.approver_role}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => toggleActive(level)}
                                                style={{
                                                    padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                    fontSize: '0.8rem', fontWeight: 600,
                                                    background: level.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                    color: level.is_active ? '#22c55e' : '#ef4444'
                                                }}
                                            >
                                                {level.is_active ? 'Active' : 'Disabled'}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="user-row-actions">
                                                <button className="icon-btn" onClick={() => openEdit(level)} title="Edit">
                                                    <Edit2 size={15} />
                                                </button>
                                                <button className="icon-btn danger" onClick={() => handleDelete(level.id, level.feature_name)} title="Delete">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '540px' }}>
                            <div className="modal-header">
                                <h3>{editing ? 'Edit Permission Level' : 'New Permission Level'}</h3>
                                <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleSave} className="create-form" style={{ padding: '1.5rem' }}>
                                {/* Feature Selection */}
                                <div className="form-group">
                                    <label>Feature / Action Type</label>
                                    <div style={{ position: 'relative' }}>
                                        <select
                                            value={featureKey}
                                            onChange={e => handlePresetChange(e.target.value)}
                                            style={{ width: '100%', appearance: 'none', paddingRight: '2.5rem' }}
                                        >
                                            {FEATURE_PRESETS.map(p => (
                                                <option key={p.value} value={p.value}>{p.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }} />
                                    </div>
                                    {(selectedPreset as any)?.workflowKey === 'purchase_requisition' && (
                                        <div className="selected-workflow-step">
                                            <span>Purchase Requisition Step {(selectedPreset as any).workflowStep}</span>
                                            <strong>{selectedPreset?.label.replace('PR ', '')}</strong>
                                        </div>
                                    )}
                                </div>

                                {/* Custom Feature Fields */}
                                {featureKey === '__custom__' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Feature Name</label>
                                            <input value={customFeatureName} onChange={e => setCustomFeatureName(e.target.value)} placeholder="e.g. Stock Write-off" required />
                                        </div>
                                        <div className="form-group">
                                            <label>Feature Key <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6 }}>(auto from name)</span></label>
                                            <input
                                                value={customFeatureKey || customFeatureName.toLowerCase().replace(/\s+/g, '_')}
                                                onChange={e => setCustomFeatureKey(e.target.value)}
                                                placeholder="e.g. stock_write_off"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Description */}
                                <div className="form-group">
                                    <label>Description <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6 }}>(when is approval required?)</span></label>
                                    <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. When operator modifies a finalized invoice" />
                                </div>

                                {/* Approver Configuration */}
                                <div style={{ background: 'var(--input-bg)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                                    <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.88rem' }}>Who must approve?</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label>By Role</label>
                                            <select value={approverRole} onChange={e => { setApproverRole(e.target.value); setApproverUserId(null); }}>
                                                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label>Or Specific User <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6 }}>(overrides role)</span></label>
                                            <select value={approverUserId ?? ''} onChange={e => setApproverUserId(e.target.value ? Number(e.target.value) : null)}>
                                                <option value="">— Use role above —</option>
                                                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.role})</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', opacity: 0.6 }}>
                                        {approverUserId
                                            ? `✓ Specific user selected — only that person can approve requests for this feature.`
                                            : `✓ Any user with the "${ROLE_LABELS[approverRole]}" role can approve requests for this feature.`}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
                                    <button type="submit" className="create-btn" disabled={saving}>
                                        <Save size={16} /> {saving ? 'Saving...' : 'Save Permission Level'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default PermissionLevels;
