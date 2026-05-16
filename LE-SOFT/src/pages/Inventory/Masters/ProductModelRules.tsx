import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const blankRule = {
    id: null,
    name: '',
    originType: 'LOCAL',
    originCode: '',
    stockGroupId: '',
    groupCode: '',
    batchSequence: 1,
    serialPadding: 4,
    isActive: true,
};

const blankOrigin = {
    id: null,
    name: '',
    originKey: '',
    requiresSuperadmin: false,
    isActive: true,
};

const ProductModelRules: React.FC = () => {
    const [rules, setRules] = useState<any[]>([]);
    const [stockGroups, setStockGroups] = useState<any[]>([]);
    const [origins, setOrigins] = useState<any[]>([
        { name: 'Local', origin_key: 'LOCAL', requires_superadmin: false, is_active: true },
        { name: 'Imported', origin_key: 'IMPORTED', requires_superadmin: true, is_active: true },
    ]);
    const [form, setForm] = useState<any>(blankRule);
    const [originForm, setOriginForm] = useState<any>(blankOrigin);
    const [saving, setSaving] = useState(false);
    const [savingOrigin, setSavingOrigin] = useState(false);
    const userRole = localStorage.getItem('user_role') || '';
    let userPerms: any = {};
    try { userPerms = JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch {}
    const canManageOrigins = userRole === 'superadmin' || userRole === 'admin' || userPerms.manage_product_origins;

    const fetchData = async () => {
        // @ts-ignore
        const [ruleRows, groupRows, originRows] = await Promise.all([
            window.electron.getProductModelRules(),
            window.electron.getStockGroups(),
            window.electron.getProductOrigins?.(),
        ]);
        setRules(ruleRows || []);
        setStockGroups(groupRows || []);
        setOrigins(originRows || [
            { name: 'Local', origin_key: 'LOCAL', requires_superadmin: false, is_active: true },
            { name: 'Imported', origin_key: 'IMPORTED', requires_superadmin: true, is_active: true },
        ]);
    };

    useEffect(() => { fetchData().catch(console.error); }, []);

    const saveRule = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // @ts-ignore
            await window.electron.saveProductModelRule(form);
            setForm(blankRule);
            fetchData();
        } catch (error: any) {
            alert(error?.message || 'Failed to save model rule');
        } finally {
            setSaving(false);
        }
    };

    const deleteRule = async (id: number) => {
        if (!confirm('Delete this model rule?')) return;
        // @ts-ignore
        await window.electron.deleteProductModelRule(id);
        fetchData();
    };

    const saveOrigin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManageOrigins) {
            alert('You do not have permission to manage product origins.');
            return;
        }
        setSavingOrigin(true);
        try {
            // @ts-ignore
            await window.electron.saveProductOrigin(originForm);
            setOriginForm(blankOrigin);
            fetchData();
        } catch (error: any) {
            alert(error?.message || 'Failed to save product origin');
        } finally {
            setSavingOrigin(false);
        }
    };

    const deleteOrigin = async (id: number) => {
        if (!confirm('Delete this product origin?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteProductOrigin(id);
            fetchData();
        } catch (error: any) {
            alert(error?.message || 'Failed to delete product origin');
        }
    };

    return (
        <motion.div className="master-list-container" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="list-header">
                <h2>Product Model Rules</h2>
                <button className="create-btn" onClick={() => setForm(blankRule)}><Plus size={18} /> New Rule</button>
            </div>

            <div className="section-divider">Product Origins</div>
            <form className="create-form product-rule-form" onSubmit={saveOrigin}>
                <div className="form-row">
                    <div className="form-group">
                        <label>Origin Name</label>
                        <input value={originForm.name} onChange={e => setOriginForm({ ...originForm, name: e.target.value })} required placeholder="Factory / Assembly / Imported" disabled={!canManageOrigins} />
                    </div>
                    <div className="form-group">
                        <label>Origin Key</label>
                        <input value={originForm.originKey} onChange={e => setOriginForm({ ...originForm, originKey: e.target.value })} placeholder="Auto from name" disabled={!canManageOrigins} />
                    </div>
                    <div className="form-group">
                        <label>Restriction</label>
                        <label className="checkbox-label" style={{ minHeight: 42 }}>
                            <input type="checkbox" checked={!!originForm.requiresSuperadmin} onChange={e => setOriginForm({ ...originForm, requiresSuperadmin: e.target.checked })} disabled={!canManageOrigins} />
                            Super Admin only
                        </label>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                    <div className="origin-pill-list">
                        {origins.map(origin => (
                            <button
                                type="button"
                                key={origin.id || origin.origin_key}
                                className={`origin-pill ${origin.requires_superadmin ? 'restricted' : ''}`}
                                onClick={() => canManageOrigins && setOriginForm({
                                    id: origin.id,
                                    name: origin.name,
                                    originKey: origin.origin_key,
                                    requiresSuperadmin: !!origin.requires_superadmin,
                                    isActive: origin.is_active !== false,
                                })}
                                title={origin.requires_superadmin ? 'Super Admin only' : 'Available to permitted users'}
                            >
                                {origin.name}{origin.requires_superadmin ? ' · restricted' : ''}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {originForm.id && canManageOrigins ? (
                            <button type="button" className="delete-btn" onClick={() => deleteOrigin(originForm.id)}><Trash2 size={16} /></button>
                        ) : null}
                        <button className="save-btn" disabled={savingOrigin || !canManageOrigins}><Save size={18} /> {savingOrigin ? 'Saving...' : 'Save Origin'}</button>
                    </div>
                </div>
            </form>

            <div className="section-divider">Model Number Rules</div>
            <form className="create-form product-rule-form" onSubmit={saveRule}>
                <div className="form-row">
                    <div className="form-group"><label>Rule Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Imported Hardware" /></div>
                    <div className="form-group"><label>Origin</label><select value={form.originType} onChange={e => setForm({ ...form, originType: e.target.value })}>{origins.filter(origin => origin.is_active !== false).map(origin => <option key={origin.id || origin.origin_key} value={origin.origin_key}>{origin.name}</option>)}</select></div>
                    <div className="form-group"><label>Origin Code</label><input value={form.originCode} onChange={e => setForm({ ...form, originCode: e.target.value })} required placeholder="01" /></div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label>Stock Group</label><select value={form.stockGroupId} onChange={e => setForm({ ...form, stockGroupId: e.target.value })} required><option value="">Select group</option>{stockGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
                    <div className="form-group"><label>Group Code</label><input value={form.groupCode} onChange={e => setForm({ ...form, groupCode: e.target.value })} required placeholder="10" /></div>
                    <div className="form-group"><label>Batch Sequence</label><input type="number" value={form.batchSequence} onChange={e => setForm({ ...form, batchSequence: e.target.value })} min={1} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="save-btn" disabled={saving}><Save size={18} /> {saving ? 'Saving...' : 'Save Rule'}</button>
                </div>
            </form>

            <div className="table-container" style={{ marginTop: '1.5rem' }}>
                <table className="master-table">
                    <thead><tr><th>Rule</th><th>Origin</th><th>Stock Group</th><th>Pattern</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                        {rules.length === 0 ? <tr><td colSpan={5} className="empty-state">No product model rules created.</td></tr> : rules.map(rule => (
                            <tr key={rule.id}>
                                <td>{rule.name}</td>
                                <td>{origins.find(origin => origin.origin_key === rule.origin_type)?.name || rule.origin_type}</td>
                                <td>{rule.stock_group?.name || '—'}</td>
                                <td><code>{rule.origin_code}.{rule.group_code}.{String(rule.batch_sequence).padStart(2, '0')}.{''.padStart(rule.serial_padding || 4, '#')}</code></td>
                                <td><div className="action-buttons" style={{ justifyContent: 'flex-end' }}><button className="edit-btn" onClick={() => setForm({ id: rule.id, name: rule.name, originType: rule.origin_type, originCode: rule.origin_code, stockGroupId: rule.stock_group_id || '', groupCode: rule.group_code, batchSequence: rule.batch_sequence, serialPadding: rule.serial_padding, isActive: rule.is_active })}><Save size={16} /></button><button className="delete-btn" onClick={() => deleteRule(rule.id)}><Trash2 size={16} /></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

export default ProductModelRules;
