import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ScanBarcode, ArrowRight, ArrowLeft, Trash2, ArrowLeftRight } from 'lucide-react';

import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface Product {
    id: number;
    name: string;
    sku: string;
    selling_price: number;
    category: string;
    quantity?: number;
}

interface ExchangeItem {
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    rate: number;
    amount: number;
}

interface Customer {
    id?: number;
    name: string;
    phone: string;
}

const ExchangeCreate: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    
    // Customer
    const [customer, setCustomer] = useState<Customer>({ name: '', phone: '' });
    const [savedCustomerId, setSavedCustomerId] = useState<number | null>(null);
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

    // Lists
    const [returnedItems, setReturnedItems] = useState<ExchangeItem[]>([]);
    const [newItems, setNewItems] = useState<ExchangeItem[]>([]);
    
    // Search
    const [searchReturned, setSearchReturned] = useState('');
    const [searchNew, setSearchNew] = useState('');
    const [showReturnDropdown, setShowReturnDropdown] = useState(false);
    const [showNewDropdown, setShowNewDropdown] = useState(false);

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadProducts = async () => {
            // @ts-ignore
            const data = await window.electron?.getProducts?.();
            setProducts(data || []);
        };
        loadProducts();
    }, []);

    // Customer phone search
    const searchCustomers = useCallback(async (query: string) => {
        if (query.length < 2) {
            setCustomerSuggestions([]);
            setShowCustomerSuggestions(false);
            return;
        }
        try {
            // @ts-ignore
            const results = await window.electron?.searchBillingCustomers?.(query);
            setCustomerSuggestions(results || []);
            setShowCustomerSuggestions(results && results.length > 0);
        } catch (e) { console.error(e); }
    }, []);

    const handleCustomerPhoneChange = (value: string) => {
        setCustomer(prev => ({ ...prev, phone: value }));
        setSavedCustomerId(null);
        searchCustomers(value);
    };

    const selectCustomer = (c: Customer) => {
        setCustomer({ name: c.name || '', phone: c.phone || '' });
        setSavedCustomerId(c.id || null);
        setShowCustomerSuggestions(false);
    };

    // Item handlers
    const addItem = (product: Product, list: 'RETURN' | 'NEW') => {
        const newItem = {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku || '',
            quantity: 1,
            rate: product.selling_price,
            amount: product.selling_price
        };
        
        if (list === 'RETURN') {
            setReturnedItems(prev => [...prev, newItem]);
            setSearchReturned('');
            setShowReturnDropdown(false);
        } else {
            setNewItems(prev => [...prev, newItem]);
            setSearchNew('');
            setShowNewDropdown(false);
        }
    };

    const updateItem = (index: number, field: string, value: number, list: 'RETURN' | 'NEW') => {
        const setter = list === 'RETURN' ? setReturnedItems : setNewItems;
        setter(prev => {
            const arr = [...prev];
            arr[index] = { ...arr[index], [field]: value };
            if (field === 'quantity' || field === 'rate') {
                arr[index].amount = arr[index].quantity * arr[index].rate;
            }
            return arr;
        });
    };

    const removeItem = (index: number, list: 'RETURN' | 'NEW') => {
        const setter = list === 'RETURN' ? setReturnedItems : setNewItems;
        setter(prev => prev.filter((_, i) => i !== index));
    };

    // Search filtration
    const getFilteredProducs = (term: string) => products.filter(p =>
        p.name.toLowerCase().includes(term.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(term.toLowerCase())
    ).slice(0, 15);

    const totalReturnValue = returnedItems.reduce((sum, item) => sum + item.amount, 0);
    const totalNewValue = newItems.reduce((sum, item) => sum + item.amount, 0);
    const differenceAmount = totalNewValue - totalReturnValue; // +ve means customer pays, -ve means we refund

    const handleSave = async () => {
        if (!customer.name) return alert('Customer Name is required');
        if (returnedItems.length === 0 && newItems.length === 0) return alert('Add items to exchange');

        setSaving(true);
        try {
            let custId = savedCustomerId;
            if (!custId) {
                // @ts-ignore
                const savedCustomer = await window.electron?.createBillingCustomer?.({
                    name: customer.name, phone: customer.phone, email: '', address: ''
                });
                custId = savedCustomer.id;
            }

            // @ts-ignore
            const res = await window.electron?.createExchangeOrder?.({
                customer_id: custId,
                original_bill_id: null, // Could add a field to link a previous invoice
                returned_items: returnedItems,
                new_items: newItems,
                total_return_value: totalReturnValue,
                total_new_value: totalNewValue,
                difference_amount: differenceAmount
            });

            if (res && res.success) {
                alert(`Exchange Saved! Number: ${res.exchange_number}`);
                navigate('/crm/exchanges');
            }
        } catch (e: any) {
            console.error(e);
            alert('Error: ' + e.message);
        }
        setSaving(false);
    };

    const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem' };

    return (
        <DashboardLayout title="Create Exchange Order">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: '1rem' }}>
                
                {/* Header & Customer */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.5rem', display: 'flex', gap: '2rem', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ArrowLeftRight /> Process Exchange & Return</h1>
                        <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Record returned items and replacement products.</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '500px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Customer Name *</label>
                            <input value={customer.name} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="Name" />
                        </div>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Phone Number</label>
                            <input value={customer.phone} onChange={e => handleCustomerPhoneChange(e.target.value)} onFocus={() => setShowCustomerSuggestions(customerSuggestions.length > 0)} style={inputStyle} placeholder="Phone" />
                            {showCustomerSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                    {customerSuggestions.map(c => (
                                        <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '0.6rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666' }}>{c.phone}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Items Sections */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
                    
                    {/* RETURNED ITEMS (LEFT) */}
                    <div style={{ flex: 1, background: '#fff', border: '2px dashed #ef4444', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#fef2f2', padding: '1rem', borderBottom: '1px solid #fee2e2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ArrowLeft size={18} color="#ef4444" />
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b91c1c' }}>Returned Items (Incoming)</h2>
                        </div>
                        
                        <div style={{ padding: '1rem', borderBottom: '1px solid #fee2e2', position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <ScanBarcode size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                <input placeholder="Search product to return..." value={searchReturned} onChange={e => { setSearchReturned(e.target.value); setShowReturnDropdown(true); }} onFocus={() => setShowReturnDropdown(true)} onBlur={() => setTimeout(() => setShowReturnDropdown(false), 200)} style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                                {showReturnDropdown && searchReturned && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {getFilteredProducs(searchReturned).map(p => (
                                            <div key={p.id} onMouseDown={() => addItem(p, 'RETURN')} style={{ padding: '0.6rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
                                                <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: '0.75rem', color: '#888' }}>{p.sku}</div></div>
                                                <div style={{ fontWeight: 600, color: '#ef4444' }}>৳{p.selling_price}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            {returnedItems.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#f87171', opacity: 0.6, marginTop: '2rem' }}>No items added to return</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {returnedItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#991b1b' }}>{item.product_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>SKU: {item.sku}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value)||1, 'RETURN')} min={1} style={{ width: '60px', padding: '0.4rem', border: '1px solid #fca5a5', borderRadius: '4px', textAlign: 'center' }} title="Qty" />
                                                <span style={{ color: '#b91c1c' }}>×</span>
                                                <input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value)||0, 'RETURN')} min={0} style={{ width: '80px', padding: '0.4rem', border: '1px solid #fca5a5', borderRadius: '4px', textAlign: 'right' }} title="Return Rate" />
                                                <div style={{ width: '80px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>৳{item.amount.toLocaleString()}</div>
                                                <button onClick={() => removeItem(idx, 'RETURN')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NEW ITEMS (RIGHT) */}
                    <div style={{ flex: 1, background: '#fff', border: '2px dashed #10b981', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#ecfdf5', padding: '1rem', borderBottom: '1px solid #d1fae5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#047857' }}>New Items (Outgoing)</h2>
                            <ArrowRight size={18} color="#10b981" />
                        </div>
                        
                        <div style={{ padding: '1rem', borderBottom: '1px solid #d1fae5', position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <ScanBarcode size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                <input placeholder="Search product to give..." value={searchNew} onChange={e => { setSearchNew(e.target.value); setShowNewDropdown(true); }} onFocus={() => setShowNewDropdown(true)} onBlur={() => setTimeout(() => setShowNewDropdown(false), 200)} style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                                {showNewDropdown && searchNew && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {getFilteredProducs(searchNew).map(p => (
                                            <div key={p.id} onMouseDown={() => addItem(p, 'NEW')} style={{ padding: '0.6rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
                                                <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: '0.75rem', color: '#888' }}>{p.sku}</div></div>
                                                <div style={{ fontWeight: 600, color: '#10b981' }}>৳{p.selling_price}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            {newItems.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#34d399', opacity: 0.6, marginTop: '2rem' }}>No new items added</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {newItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#065f46' }}>{item.product_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#047857' }}>SKU: {item.sku}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value)||1, 'NEW')} min={1} style={{ width: '60px', padding: '0.4rem', border: '1px solid #6ee7b7', borderRadius: '4px', textAlign: 'center' }} title="Qty" />
                                                <span style={{ color: '#047857' }}>×</span>
                                                <input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value)||0, 'NEW')} min={0} style={{ width: '80px', padding: '0.4rem', border: '1px solid #6ee7b7', borderRadius: '4px', textAlign: 'right' }} title="Selling Rate" />
                                                <div style={{ width: '80px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>৳{item.amount.toLocaleString()}</div>
                                                <button onClick={() => removeItem(idx, 'NEW')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Totals */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '3rem' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Return Value</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>৳{totalReturnValue.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total New Value</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>৳{totalNewValue.toLocaleString()}</div>
                        </div>
                        <div style={{ paddingLeft: '2rem', borderLeft: '2px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Net Difference</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: differenceAmount > 0 ? '#f59e0b' : differenceAmount < 0 ? '#ef4444' : '#64748b' }}>
                                {differenceAmount > 0 ? `Cust Pays ৳${differenceAmount.toLocaleString()}` : differenceAmount < 0 ? `We Refund ৳${Math.abs(differenceAmount).toLocaleString()}` : 'Even ৳0'}
                            </div>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleSave}
                        disabled={saving || (returnedItems.length === 0 && newItems.length === 0)}
                        style={{ padding: '0.8rem 2rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (returnedItems.length === 0 && newItems.length === 0) ? 0.5 : 1 }}
                    >
                        <Save size={18} /> {saving ? 'Saving...' : 'Complete Exchange'}
                    </button>
                </div>

            </div>
        </DashboardLayout>
    );
};

export default ExchangeCreate;
