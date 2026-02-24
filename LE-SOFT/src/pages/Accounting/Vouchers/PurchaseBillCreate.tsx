import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import '../Masters/Masters.css';

interface BillItem {
    productId: number | '';
    productName: string;
    description: string;
    qty: number;
    rate: number;
    taxRate: number;
}

const PurchaseBillCreate: React.FC = () => {
    const navigate = useNavigate();
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [billNumber, setBillNumber] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [supplierLedgerId, setSupplierLedgerId] = useState<number | ''>('');
    const [narration, setNarration] = useState('');
    const [items, setItems] = useState<BillItem[]>([
        { productId: '', productName: '', description: '', qty: 1, rate: 0, taxRate: 0 }
    ]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // @ts-ignore
                const [l, p] = await Promise.all([window.electron.getLedgers(), window.electron.getProducts()]);
                setLedgers(l || []);
                setProducts(p || []);
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, []);

    const updateItem = (index: number, field: keyof BillItem, value: any) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            // Auto-fill rate from product
            if (field === 'productId' && value) {
                const product = products.find(p => p.id === Number(value));
                if (product) {
                    updated[index].productName = product.name;
                    updated[index].rate = product.purchase_price || 0;
                    updated[index].taxRate = product.tax_rate || 0;
                    updated[index].description = product.name;
                }
            }
            return updated;
        });
    };

    const addItem = () => {
        setItems(prev => [...prev, { productId: '', productName: '', description: '', qty: 1, rate: 0, taxRate: 0 }]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
    const taxTotal = items.reduce((sum, item) => {
        const lineAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
        return sum + lineAmount * ((Number(item.taxRate) || 0) / 100);
    }, 0);
    const grandTotal = subtotal + taxTotal;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!billNumber.trim()) { alert('Bill number is required'); return; }
        try {
            // @ts-ignore
            await window.electron.createPurchaseBill({
                billNumber, billDate, dueDate, supplierLedgerId: supplierLedgerId || null, narration, items
            });
            alert('Purchase Bill Created!');
            navigate('/vouchers/purchase-bill');
        } catch (error) {
            console.error(error);
            alert('Failed to create purchase bill');
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container" style={{ maxWidth: '1100px' }}>
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/vouchers/purchase-bill')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>New Purchase Bill</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                    <div className="form-group">
                        <label>Bill Number *</label>
                        <input value={billNumber} onChange={e => setBillNumber(e.target.value)} required placeholder="e.g., PUR-001" />
                    </div>
                    <div className="form-group">
                        <label>Bill Date *</label>
                        <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Due Date</label>
                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Supplier (Ledger)</label>
                        <select value={supplierLedgerId} onChange={e => setSupplierLedgerId(e.target.value ? Number(e.target.value) : '')}>
                            <option value="">— Select Supplier —</option>
                            {ledgers.filter(l => l.group_name === 'Sundry Creditors').map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                            {/* Show all ledgers if no creditors */}
                            {ledgers.filter(l => l.group_name !== 'Sundry Creditors').length === ledgers.length && ledgers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="section-divider">Line Items</div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="master-table" style={{ minWidth: '800px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '30%' }}>Product</th>
                                <th>Description</th>
                                <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Rate</th>
                                <th style={{ width: '8%', textAlign: 'right' }}>Tax %</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => {
                                const lineAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                const lineTax = lineAmount * ((Number(item.taxRate) || 0) / 100);
                                return (
                                    <tr key={index}>
                                        <td>
                                            <select value={item.productId} onChange={e => updateItem(index, 'productId', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                                                <option value="">— Select —</option>
                                                {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
                                            </select>
                                        </td>
                                        <td><input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></td>
                                        <td><input type="number" value={item.qty} onChange={e => updateItem(index, 'qty', Number(e.target.value))} min={0} style={{ width: '100%', padding: '0.5rem', textAlign: 'right', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></td>
                                        <td><input type="number" value={item.rate} onChange={e => updateItem(index, 'rate', Number(e.target.value))} min={0} step="0.01" style={{ width: '100%', padding: '0.5rem', textAlign: 'right', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></td>
                                        <td><input type="number" value={item.taxRate} onChange={e => updateItem(index, 'taxRate', Number(e.target.value))} min={0} max={100} style={{ width: '100%', padding: '0.5rem', textAlign: 'right', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>৳ {(lineAmount + lineTax).toLocaleString()}</td>
                                        <td>
                                            <button type="button" className="delete-btn" onClick={() => removeItem(index)}><Trash2 size={15} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <button type="button" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <Plus size={16} /> Add Line Item
                </button>

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: "'JetBrains Mono', monospace" }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                            <span>৳ {subtotal.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Tax</span>
                            <span>৳ {taxTotal.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontWeight: 700, fontSize: '1.1rem', borderTop: '2px solid var(--accent-color)' }}>
                            <span>Grand Total</span>
                            <span style={{ color: 'var(--accent-color)' }}>৳ {grandTotal.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="form-group">
                    <label>Narration / Notes</label>
                    <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Optional notes..." />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={18} /> Save Purchase Bill
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default PurchaseBillCreate;
