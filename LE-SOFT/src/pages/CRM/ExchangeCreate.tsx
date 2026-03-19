import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ScanBarcode, ArrowRight, ArrowLeft, Trash2, ArrowLeftRight, Link, Search, FileText, X, CheckCircle } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const safeDecrypt = (val: any): string => {
    if (!val || typeof val !== 'string') return String(val || '');
    if (val.startsWith('e1:') || val.startsWith('e2:')) return '🔒 [encrypted]';
    return val;
};

interface Product {
    id: number;
    name: string;
    sku: string;
    selling_price: number;
    category: string;
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

interface Bill {
    id: number;
    invoice_number: string;
    grand_total: number;
    created_at: string;
    customer_name?: string;
    items?: BillItem[];
}

interface BillItem {
    id: number;
    product_name: string;
    sku: string;
    quantity: number;
    mrp: number;
    price: number;
}

const ExchangeCreate: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);

    // Customer
    const [customer, setCustomer] = useState<Customer>({ name: '', phone: '' });
    const [savedCustomerId, setSavedCustomerId] = useState<number | null>(null);
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

    // ── Original Bill linking ──────────────────────────────────────────────────
    const [showBillSearch, setShowBillSearch] = useState(false);
    const [billSearchQuery, setBillSearchQuery] = useState('');
    const [billSearchResults, setBillSearchResults] = useState<Bill[]>([]);
    const [billSearchLoading, setBillSearchLoading] = useState(false);
    const [linkedBill, setLinkedBill] = useState<Bill | null>(null);
    const [linkedBillItems, setLinkedBillItems] = useState<BillItem[]>([]);

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
        if (query.length < 2) { setCustomerSuggestions([]); setShowCustomerSuggestions(false); return; }
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
        // Auto-search bills for this customer
        if (c.id) loadCustomerBills(c.id);
    };

    // ── Bill search / link ─────────────────────────────────────────────────────
    const loadCustomerBills = async (customerId?: number) => {
        setBillSearchLoading(true);
        try {
            // @ts-ignore
            const allBills: Bill[] = await window.electron?.getBills?.() || [];
            const q = billSearchQuery.toLowerCase().trim();
            const filtered = allBills.filter(b => {
                const invMatch = safeDecrypt(b.invoice_number).toLowerCase().includes(q);
                const custMatch = safeDecrypt(b.customer_name || '').toLowerCase().includes(q);
                if (customerId) return (b as any).customer_id === customerId || invMatch;
                return invMatch || custMatch || q === '';
            });
            setBillSearchResults(filtered.slice(0, 30));
        } catch (e) { console.error(e); }
        setBillSearchLoading(false);
    };

    const searchBills = useCallback(async (query: string) => {
        setBillSearchLoading(true);
        try {
            // @ts-ignore
            const allBills: Bill[] = await window.electron?.getBills?.() || [];
            const q = query.toLowerCase().trim();
            const filtered = q === '' ? allBills.slice(0, 30) : allBills.filter(b =>
                safeDecrypt(b.invoice_number).toLowerCase().includes(q) ||
                safeDecrypt(b.customer_name || '').toLowerCase().includes(q)
            ).slice(0, 30);
            setBillSearchResults(filtered);
        } catch (e) { console.error(e); }
        setBillSearchLoading(false);
    }, []);

    const openBillSearch = () => {
        setShowBillSearch(true);
        searchBills('');
    };

    const selectBill = async (bill: Bill) => {
        try {
            // @ts-ignore
            const detail = await window.electron?.getBillDetails?.(bill.id);
            setLinkedBill({ ...bill, items: detail?.items || [] });
            setLinkedBillItems(detail?.items || []);
            setShowBillSearch(false);
            setBillSearchQuery('');
            // Pre-fill customer from the bill if not already set
            if (!customer.name && detail?.customer_name) {
                setCustomer({ name: safeDecrypt(detail.customer_name), phone: safeDecrypt(detail.customer_phone || '') });
            }
        } catch (e) { console.error(e); }
    };

    const unlinkBill = () => {
        setLinkedBill(null);
        setLinkedBillItems([]);
    };

    const addItemFromBill = (item: BillItem) => {
        const exists = returnedItems.find(r => r.product_name === item.product_name);
        if (exists) return;
        setReturnedItems(prev => [...prev, {
            product_id: 0,
            product_name: safeDecrypt(item.product_name),
            sku: safeDecrypt(item.sku),
            quantity: item.quantity,
            rate: item.price / item.quantity,
            amount: item.price
        }]);
    };

    // Item handlers
    const addItem = (product: Product, list: 'RETURN' | 'NEW') => {
        const newItem = { product_id: product.id, product_name: product.name, sku: product.sku || '', quantity: 1, rate: product.selling_price, amount: product.selling_price };
        if (list === 'RETURN') { setReturnedItems(prev => [...prev, newItem]); setSearchReturned(''); setShowReturnDropdown(false); }
        else { setNewItems(prev => [...prev, newItem]); setSearchNew(''); setShowNewDropdown(false); }
    };

    const updateItem = (index: number, field: string, value: number, list: 'RETURN' | 'NEW') => {
        const setter = list === 'RETURN' ? setReturnedItems : setNewItems;
        setter(prev => {
            const arr = [...prev];
            arr[index] = { ...arr[index], [field]: value };
            if (field === 'quantity' || field === 'rate') arr[index].amount = arr[index].quantity * arr[index].rate;
            return arr;
        });
    };

    const removeItem = (index: number, list: 'RETURN' | 'NEW') => {
        const setter = list === 'RETURN' ? setReturnedItems : setNewItems;
        setter(prev => prev.filter((_, i) => i !== index));
    };

    const getFilteredProducts = (term: string) => products.filter(p =>
        p.name.toLowerCase().includes(term.toLowerCase()) || (p.sku || '').toLowerCase().includes(term.toLowerCase())
    ).slice(0, 15);

    const totalReturnValue = returnedItems.reduce((sum, item) => sum + item.amount, 0);
    const totalNewValue = newItems.reduce((sum, item) => sum + item.amount, 0);
    const differenceAmount = totalNewValue - totalReturnValue;

    const handleSave = async () => {
        if (!customer.name) return alert('Customer Name is required');
        if (returnedItems.length === 0 && newItems.length === 0) return alert('Add items to exchange');
        setSaving(true);
        try {
            let custId = savedCustomerId;
            if (!custId) {
                // @ts-ignore
                const savedCustomer = await window.electron?.createBillingCustomer?.({ name: customer.name, phone: customer.phone, email: '', address: '' });
                custId = savedCustomer.id;
            }
            // @ts-ignore
            const res = await window.electron?.createExchangeOrder?.({
                customer_id: custId,
                original_bill_id: linkedBill?.id || null,   // ← Linked bill
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
        } catch (e: any) { console.error(e); alert('Error: ' + e.message); }
        setSaving(false);
    };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', background: 'var(--input-bg)' };

    return (
        <DashboardLayout title="Create Exchange Order">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: '0.75rem' }}>

                {/* ── Header + Customer + Bill Link ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.5rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ArrowLeftRight size={20} /> Process Exchange / Return
                            </h1>
                            <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>Record returned items and replacement products. Link to original bill for tracking.</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Customer Name */}
                        <div style={{ flex: 1, minWidth: '160px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Customer Name *</label>
                            <input value={customer.name} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="Name" />
                        </div>
                        {/* Customer Phone */}
                        <div style={{ flex: 1, minWidth: '160px', position: 'relative' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Phone Number</label>
                            <input value={customer.phone} onChange={e => handleCustomerPhoneChange(e.target.value)} onFocus={() => setShowCustomerSuggestions(customerSuggestions.length > 0)} style={inputStyle} placeholder="Phone" />
                            {showCustomerSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                    {customerSuggestions.map(c => (
                                        <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '0.6rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                                            <div style={{ fontWeight: 600 }}>{safeDecrypt(c.name)}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666' }}>{safeDecrypt(c.phone)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Original Bill Link */}
                        <div style={{ flex: 2, minWidth: '240px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                <Link size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                Link Original Bill (Optional)
                            </label>
                            {linkedBill ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '6px' }}>
                                    <CheckCircle size={16} color="#10b981" />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', color: '#065f46' }}>{safeDecrypt(linkedBill.invoice_number)}</span>
                                        <span style={{ fontSize: '0.78rem', color: '#047857', marginLeft: '0.5rem' }}>৳{linkedBill.grand_total?.toLocaleString()}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>{new Date(linkedBill.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <button onClick={unlinkBill} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}><X size={14} /></button>
                                </div>
                            ) : (
                                <button onClick={openBillSearch} style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px dashed var(--border-color)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    <FileText size={15} /> Search & link original bill...
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Linked Bill Items Preview */}
                    {linkedBill && linkedBillItems.length > 0 && (
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem' }}>
                                📦 Items from linked bill — click to add to returns:
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {linkedBillItems.map((item, i) => (
                                    <button key={i} onClick={() => addItemFromBill(item)}
                                        disabled={returnedItems.some(r => r.product_name === safeDecrypt(item.product_name))}
                                        style={{ padding: '0.3rem 0.65rem', border: '1px solid #86efac', borderRadius: '20px', background: returnedItems.some(r => r.product_name === safeDecrypt(item.product_name)) ? '#d1fae5' : '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: returnedItems.some(r => r.product_name === safeDecrypt(item.product_name)) ? 0.5 : 1 }}>
                                        {returnedItems.some(r => r.product_name === safeDecrypt(item.product_name)) ? <CheckCircle size={11} /> : <ArrowLeft size={11} />}
                                        {safeDecrypt(item.product_name)} ×{item.quantity}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Bill Search Modal ── */}
                {showBillSearch && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setShowBillSearch(false)}>
                        <div style={{ background: '#fff', borderRadius: '16px', width: '640px', maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontWeight: 700 }}>Search Original Bill</h3>
                                <button onClick={() => setShowBillSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                            <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                    <input
                                        autoFocus
                                        value={billSearchQuery}
                                        onChange={e => { setBillSearchQuery(e.target.value); searchBills(e.target.value); }}
                                        placeholder="Search by invoice number or customer name..."
                                        style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {billSearchLoading ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Searching...</div>
                                ) : billSearchResults.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>No bills found</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                        <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Invoice</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700 }}>Total</th>
                                                <th style={{ padding: '0.6rem 1rem', width: '60px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {billSearchResults.map((bill, idx) => (
                                                <tr key={bill.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff', cursor: 'pointer' }}
                                                    onClick={() => selectBill(bill)}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fafbfc' : '#fff')}>
                                                    <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: 'var(--accent-color)', fontWeight: 600 }}>{safeDecrypt(bill.invoice_number)}</td>
                                                    <td style={{ padding: '0.65rem 1rem' }}>{safeDecrypt(bill.customer_name) || 'Walk-in'}</td>
                                                    <td style={{ padding: '0.65rem 1rem', color: '#666', fontSize: '0.82rem' }}>{new Date(bill.created_at).toLocaleDateString('en-GB')}</td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700 }}>৳{bill.grand_total?.toLocaleString()}</td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                        <button style={{ padding: '3px 8px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Select</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Items Sections ── */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* RETURNED ITEMS (LEFT) */}
                    <div style={{ flex: 1, background: '#fff', border: '2px dashed #ef4444', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#fef2f2', padding: '0.75rem 1rem', borderBottom: '1px solid #fee2e2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ArrowLeft size={18} color="#ef4444" />
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#b91c1c' }}>Returned Items (Incoming)</h2>
                        </div>
                        <div style={{ padding: '0.75rem', borderBottom: '1px solid #fee2e2', position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <ScanBarcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                <input placeholder="Search product to return..." value={searchReturned}
                                    onChange={e => { setSearchReturned(e.target.value); setShowReturnDropdown(true); }}
                                    onFocus={() => setShowReturnDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowReturnDropdown(false), 200)}
                                    style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                                {showReturnDropdown && searchReturned && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {getFilteredProducts(searchReturned).map(p => (
                                            <div key={p.id} onMouseDown={() => addItem(p, 'RETURN')} style={{ padding: '0.55rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
                                                <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: '0.75rem', color: '#888' }}>{p.sku}</div></div>
                                                <div style={{ fontWeight: 600, color: '#ef4444' }}>৳{p.selling_price}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                            {returnedItems.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#f87171', opacity: 0.6, marginTop: '2rem', fontSize: '0.85rem' }}>
                                    No items added.<br />Search above or click items from the linked bill.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {returnedItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '0.65rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#991b1b' }}>{item.product_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>SKU: {item.sku || 'N/A'}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1, 'RETURN')} min={1} style={{ width: '55px', padding: '0.35rem', border: '1px solid #fca5a5', borderRadius: '4px', textAlign: 'center' }} title="Qty" />
                                                <span style={{ color: '#b91c1c' }}>×</span>
                                                <input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0, 'RETURN')} min={0} style={{ width: '75px', padding: '0.35rem', border: '1px solid #fca5a5', borderRadius: '4px', textAlign: 'right' }} title="Rate" />
                                                <div style={{ width: '75px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>৳{item.amount.toLocaleString()}</div>
                                                <button onClick={() => removeItem(idx, 'RETURN')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NEW ITEMS (RIGHT) */}
                    <div style={{ flex: 1, background: '#fff', border: '2px dashed #10b981', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#ecfdf5', padding: '0.75rem 1rem', borderBottom: '1px solid #d1fae5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#047857' }}>New Items (Outgoing)</h2>
                            <ArrowRight size={18} color="#10b981" />
                        </div>
                        <div style={{ padding: '0.75rem', borderBottom: '1px solid #d1fae5', position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <ScanBarcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                <input placeholder="Search product to give..." value={searchNew}
                                    onChange={e => { setSearchNew(e.target.value); setShowNewDropdown(true); }}
                                    onFocus={() => setShowNewDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowNewDropdown(false), 200)}
                                    style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                                {showNewDropdown && searchNew && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {getFilteredProducts(searchNew).map(p => (
                                            <div key={p.id} onMouseDown={() => addItem(p, 'NEW')} style={{ padding: '0.55rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
                                                <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: '0.75rem', color: '#888' }}>{p.sku}</div></div>
                                                <div style={{ fontWeight: 600, color: '#10b981' }}>৳{p.selling_price}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                            {newItems.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#34d399', opacity: 0.6, marginTop: '2rem', fontSize: '0.85rem' }}>No new items added</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {newItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '0.65rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#065f46' }}>{item.product_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#047857' }}>SKU: {item.sku || 'N/A'}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1, 'NEW')} min={1} style={{ width: '55px', padding: '0.35rem', border: '1px solid #6ee7b7', borderRadius: '4px', textAlign: 'center' }} title="Qty" />
                                                <span style={{ color: '#047857' }}>×</span>
                                                <input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0, 'NEW')} min={0} style={{ width: '75px', padding: '0.35rem', border: '1px solid #6ee7b7', borderRadius: '4px', textAlign: 'right' }} title="Rate" />
                                                <div style={{ width: '75px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>৳{item.amount.toLocaleString()}</div>
                                                <button onClick={() => removeItem(idx, 'NEW')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Footer Totals ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '0.9rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                        {linkedBill && (
                            <div style={{ paddingRight: '1.5rem', borderRight: '2px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Linked Bill</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace', color: '#065f46' }}>{safeDecrypt(linkedBill.invoice_number)}</div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Return Value</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>৳{totalReturnValue.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total New Value</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>৳{totalNewValue.toLocaleString()}</div>
                        </div>
                        <div style={{ paddingLeft: '1.5rem', borderLeft: '2px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Net Difference</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: differenceAmount > 0 ? '#f59e0b' : differenceAmount < 0 ? '#ef4444' : '#64748b' }}>
                                {differenceAmount > 0 ? `Cust Pays ৳${differenceAmount.toLocaleString()}` : differenceAmount < 0 ? `We Refund ৳${Math.abs(differenceAmount).toLocaleString()}` : 'Even ৳0'}
                            </div>
                        </div>
                    </div>
                    <button onClick={handleSave} disabled={saving || (returnedItems.length === 0 && newItems.length === 0)}
                        style={{ padding: '0.8rem 2rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (returnedItems.length === 0 && newItems.length === 0) ? 0.5 : 1 }}>
                        <Save size={18} /> {saving ? 'Saving...' : 'Complete Exchange'}
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default ExchangeCreate;
