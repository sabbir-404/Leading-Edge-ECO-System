import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const blankAttribute = { id: null, name: '', inputType: 'text', optionsText: '', isActive: true };

const ProductAttributes: React.FC = () => {
    const [attributes, setAttributes] = useState<any[]>([]);
    const [form, setForm] = useState<any>(blankAttribute);
    const [saving, setSaving] = useState(false);

    const fetchAttributes = async () => {
        // @ts-ignore
        const rows = await window.electron.getProductAttributes();
        setAttributes(rows || []);
    };

    useEffect(() => { fetchAttributes().catch(console.error); }, []);

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
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="save-btn" disabled={saving}><Save size={18} /> {saving ? 'Saving...' : 'Save Attribute'}</button>
                </div>
            </form>

            <div className="table-container" style={{ marginTop: '1.5rem' }}>
                <table className="master-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Options</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                        {attributes.length === 0 ? <tr><td colSpan={5} className="empty-state">No product attributes created.</td></tr> : attributes.map(attribute => (
                            <tr key={attribute.id}>
                                <td>{attribute.name}</td>
                                <td>{attribute.input_type}</td>
                                <td>{Array.isArray(attribute.options) ? attribute.options.join(', ') : '—'}</td>
                                <td>{attribute.is_active ? 'Active' : 'Disabled'}</td>
                                <td><div className="action-buttons" style={{ justifyContent: 'flex-end' }}><button className="edit-btn" onClick={() => setForm({ id: attribute.id, name: attribute.name, inputType: attribute.input_type, optionsText: Array.isArray(attribute.options) ? attribute.options.join(', ') : '', isActive: attribute.is_active })}><Save size={16} /></button><button className="delete-btn" onClick={() => deleteAttribute(attribute.id)}><Trash2 size={16} /></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

export default ProductAttributes;
