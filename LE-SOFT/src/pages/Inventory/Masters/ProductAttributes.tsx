import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const blankAttribute = { id: null, name: '', inputType: 'text', optionsText: '', unit: '', isActive: true };

const ProductAttributes: React.FC = () => {
    const [attributes, setAttributes] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [form, setForm] = useState<any>(blankAttribute);
    const [saving, setSaving] = useState(false);

    const fetchAttributes = async () => {
        // @ts-ignore
        const rows = await window.electron.getProductAttributes();
        setAttributes(rows || []);
    };

    const fetchUnits = async () => {
        // @ts-ignore
        const rows = await window.electron.getUnits();
        setUnits(rows || []);
    };

    useEffect(() => { 
        fetchAttributes().catch(console.error); 
        fetchUnits().catch(console.error);
    }, []);

    const saveAttribute = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // @ts-ignore
            await window.electron.saveProductAttribute({
                id: form.id,
                name: form.name,
                inputType: form.inputType,
                options: form.optionsText.split(',').map((option: string) => option.trim()).filter(Boolean),
                unit: form.unit || null,
                isActive: form.isActive,
            });
            setForm(blankAttribute);
            fetchAttributes();
        } catch (error: any) {
            alert(error?.message || 'Failed to save product attribute');
        } finally {
            setSaving(false);
        }
    };

    const deleteAttribute = async (id: number) => {
        if (!confirm('Delete this product attribute? Existing product specs using it will also be removed.')) return;
        // @ts-ignore
        await window.electron.deleteProductAttribute(id);
        fetchAttributes();
    };

    return (
        <motion.div className="master-list-container" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="list-header">
                <h2>Product Attributes</h2>
                <button className="create-btn" onClick={() => setForm(blankAttribute)}><Plus size={18} /> New Attribute</button>
            </div>

            <form className="create-form" onSubmit={saveAttribute}>
                <div className="form-row">
                    <div className="form-group"><label>Attribute Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Size, Color, Finish" /></div>
                    <div className="form-group"><label>Input Type</label><select value={form.inputType} onChange={e => setForm({ ...form, inputType: e.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="select">Select</option><option value="color">Color</option></select></div>
                    <div className="form-group"><label>Options</label><input value={form.optionsText} onChange={e => setForm({ ...form, optionsText: e.target.value })} placeholder="Comma separated for select fields" /></div>
                    <div className="form-group">
                        <label>Unit of Measurement (Optional)</label>
                        <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                            <option value="">-- No Unit (e.g. Color) --</option>
                            {units.map(u => (
                                <option key={u.id} value={u.symbol}>{u.name} ({u.symbol})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="save-btn" disabled={saving}><Save size={18} /> {saving ? 'Saving...' : 'Save Attribute'}</button>
                </div>
            </form>

            <div className="table-container" style={{ marginTop: '1.5rem' }}>
                <table className="master-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Unit</th><th>Options</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                        {attributes.length === 0 ? <tr><td colSpan={6} className="empty-state">No product attributes created.</td></tr> : attributes.map(attribute => (
                            <tr key={attribute.id}>
                                <td>{attribute.name}</td>
                                <td>{attribute.input_type}</td>
                                <td>{attribute.unit ? <span className="badge" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{attribute.unit}</span> : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None</span>}</td>
                                <td>{Array.isArray(attribute.options) ? attribute.options.join(', ') : '—'}</td>
                                <td>{attribute.is_active ? 'Active' : 'Disabled'}</td>
                                <td><div className="action-buttons" style={{ justifyContent: 'flex-end' }}><button className="edit-btn" onClick={() => setForm({ id: attribute.id, name: attribute.name, inputType: attribute.input_type, optionsText: Array.isArray(attribute.options) ? attribute.options.join(', ') : '', unit: attribute.unit || '', isActive: attribute.is_active })}><Save size={16} /></button><button className="delete-btn" onClick={() => deleteAttribute(attribute.id)}><Trash2 size={16} /></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

export default ProductAttributes;
